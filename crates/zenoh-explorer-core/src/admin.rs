//! Reading the network out of Zenoh's admin space.
//!
//! Zenoh 1.10 exposes each node's own view of the world under
//! `@/<zid>/<whatami>/…`. The subtrees this module reads are:
//!
//! | key                                            | payload                        |
//! |------------------------------------------------|--------------------------------|
//! | `@/<zid>/<router\|peer\|client>`               | JSON: locators, sessions, ...   |
//! | `@/<zid>/<whatami>/linkstate/<region>`         | Graphviz DOT of the link graph  |
//! | `@/<zid>/<whatami>/route/successor/src/<a>/dst/<b>` | JSON: next hop             |
//!
//! The JSON `sessions` array is the primary topology source: it is stable,
//! machine-readable, and every node publishes it. Link-state DOT is a secondary
//! source that reveals routers we cannot reach directly.
//!
//! Note that `adminspace.enabled` defaults to **false** in Zenoh 1.x. A network
//! of nodes that never opted in will answer none of these queries, so
//! [`probe`] reports that case as a diagnostic rather than an empty network.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::Deserialize;
use zenoh::Session;
use zenoh::query::{ConsolidationMode, QueryTarget};

use crate::error::{Error, Result};
use crate::model::{LinkSummary, NodeKind, NodeSummary, TopologySnapshot};
use crate::time::now_ms;

/// Selector matching every node's top-level admin entry: `@/<zid>/<whatami>`.
const NODES_SELECTOR: &str = "@/*/*";

/// Selector matching every link-state region graph.
const LINKSTATE_SELECTOR: &str = "@/*/*/linkstate/*";

/// How long to wait for admin replies. Generous enough for a WAN hop, short
/// enough that a wedged node cannot stall a refresh.
const QUERY_TIMEOUT: Duration = Duration::from_millis(2_500);

/// The shape of a `@/<zid>/<whatami>` reply.
#[derive(Debug, Deserialize)]
struct NodeReply {
    zid: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
    #[serde(default)]
    locators: Vec<String>,
    #[serde(default)]
    sessions: Vec<SessionReply>,
}

/// One entry of the `sessions` array: a transport to another node.
#[derive(Debug, Deserialize)]
struct SessionReply {
    peer: String,
    #[serde(default)]
    whatami: String,
    #[serde(default)]
    region: Option<String>,
    #[serde(default)]
    group: Option<String>,
}

/// Outcome of one topology probe, including why it might be incomplete.
#[derive(Debug)]
pub struct Probe {
    /// The snapshot to render.
    pub snapshot: TopologySnapshot,
    /// Human-readable notes about coverage, for the events log.
    pub notes: Vec<String>,
}

/// Queries the admin space and assembles a topology snapshot.
pub async fn probe(session: &Session) -> Result<Probe> {
    let local_zid = session.info().zid().await.to_string();

    let mut nodes: BTreeMap<String, NodeSummary> = BTreeMap::new();
    let mut links: BTreeMap<(String, String), LinkSummary> = BTreeMap::new();
    let mut diagnostics = Vec::new();

    let replies = collect_node_replies(session).await?;
    if replies.is_empty() {
        diagnostics.push(
            "No node answered on the admin space. Nodes must be started with \
             `adminspace.enabled: true` (the default is false) for the explorer \
             to read their topology."
                .to_owned(),
        );
    }

    for reply in &replies {
        let kind = whatami_of(reply);
        let mut summary = NodeSummary::new(reply.zid.clone(), kind);
        summary.locators.clone_from(&reply.locators);
        summary.is_local = reply.zid == local_zid;
        summary.name = name_from_metadata(reply.metadata.as_ref());
        summary.region = region_from_sessions(&reply.sessions);
        summary.metadata = reply.metadata.clone().map(|mut meta| {
            // Fold the version in so the inspector has it without a second query.
            if let (Some(map), Some(version)) = (meta.as_object_mut(), reply.version.as_ref()) {
                map.insert("version".to_owned(), serde_json::json!(version));
            }
            meta
        });
        nodes.insert(reply.zid.clone(), summary);

        for entry in &reply.sessions {
            // Make sure the far end exists as a node even if it never answered.
            nodes.entry(entry.peer.clone()).or_insert_with(|| {
                NodeSummary::new(entry.peer.clone(), parse_whatami(&entry.whatami))
            });
            add_link(&mut links, &reply.zid, entry);
        }
    }

    // Link-state fills in routers that exist in the graph but did not reply.
    match collect_linkstate(session).await {
        Ok(graphs) => {
            for (region, dot) in graphs {
                let graph = parse_dot(&dot);
                for zid in &graph.nodes {
                    nodes
                        .entry(zid.clone())
                        .or_insert_with(|| NodeSummary::new(zid.clone(), NodeKind::Router));
                }
                for (from, to) in &graph.edges {
                    let key = undirected(from, to);
                    links
                        .entry(key)
                        .and_modify(|link| link.bidirectional = true)
                        .or_insert_with(|| LinkSummary {
                            from: from.clone(),
                            to: to.clone(),
                            protocol: None,
                            bidirectional: false,
                            multicast: false,
                        });
                }
                if !graph.nodes.is_empty() {
                    diagnostics.push(format!(
                        "link-state region {region}: {} nodes, {} links",
                        graph.nodes.len(),
                        graph.edges.len()
                    ));
                }
            }
        }
        Err(err) => diagnostics.push(format!("link-state unavailable: {err}")),
    }

    // The explorer's own session is always in the graph, even in client mode
    // where it has no admin entry of its own to find.
    nodes
        .entry(local_zid.clone())
        .or_insert_with(|| NodeSummary::new(local_zid.clone(), NodeKind::Client))
        .is_local = true;

    let partial = nodes.values().any(|n| n.locators.is_empty() && !n.is_local);

    Ok(Probe {
        snapshot: TopologySnapshot {
            nodes: nodes.into_values().collect(),
            links: links.into_values().collect(),
            local_zid,
            captured_at_ms: now_ms(),
            partial,
            admin_responses: replies.len(),
        },
        notes: diagnostics,
    })
}

/// Runs the `@/*/*` query and decodes every JSON reply.
async fn collect_node_replies(session: &Session) -> Result<Vec<NodeReply>> {
    let replies = session
        .get(NODES_SELECTOR)
        // `_stats=true` asks nodes built with the `stats` feature to fold
        // throughput counters into the reply. Nodes without it just ignore it.
        .target(QueryTarget::All)
        .consolidation(ConsolidationMode::None)
        .timeout(QUERY_TIMEOUT)
        .await
        .map_err(Error::zenoh)?;

    let mut out = Vec::new();
    while let Ok(reply) = replies.recv_async().await {
        let Ok(sample) = reply.result() else { continue };
        // `@/<zid>/session…` is a client session's own admin space and has a
        // different shape; skip anything that does not decode as a node.
        let bytes = sample.payload().to_bytes();
        match serde_json::from_slice::<NodeReply>(&bytes) {
            Ok(node) => out.push(node),
            Err(err) => tracing::debug!(
                key = %sample.key_expr(),
                error = %err,
                "skipping admin reply that is not a node entry"
            ),
        }
    }
    Ok(out)
}

/// Runs the link-state query, returning `(region, dot)` pairs.
async fn collect_linkstate(session: &Session) -> Result<Vec<(String, String)>> {
    let replies = session
        .get(LINKSTATE_SELECTOR)
        .target(QueryTarget::All)
        .consolidation(ConsolidationMode::None)
        .timeout(QUERY_TIMEOUT)
        .await
        .map_err(Error::zenoh)?;

    let mut out = Vec::new();
    while let Ok(reply) = replies.recv_async().await {
        let Ok(sample) = reply.result() else { continue };
        let key = sample.key_expr().as_str().to_owned();
        let region = key.rsplit('/').next().unwrap_or("default").to_owned();
        let bytes = sample.payload().to_bytes();
        match std::str::from_utf8(&bytes) {
            Ok(dot) => out.push((region, dot.to_owned())),
            Err(err) => {
                return Err(Error::AdminReply {
                    key,
                    reason: err.to_string(),
                });
            }
        }
    }
    Ok(out)
}

/// Adds or upgrades a link between `from` and the peer described by `entry`.
fn add_link(links: &mut BTreeMap<(String, String), LinkSummary>, from: &str, entry: &SessionReply) {
    let key = undirected(from, &entry.peer);
    let multicast = entry.group.is_some();

    links
        .entry(key)
        .and_modify(|link| {
            // Seeing the same link reported from the other side confirms it.
            if link.from != from {
                link.bidirectional = true;
            }
        })
        .or_insert_with(|| LinkSummary {
            from: from.to_owned(),
            to: entry.peer.clone(),
            protocol: None,
            bidirectional: false,
            multicast,
        });
}

/// Orientation-independent map key so both directions collapse to one entry.
fn undirected(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_owned(), b.to_owned())
    } else {
        (b.to_owned(), a.to_owned())
    }
}

/// A node's own role is not in its JSON body, only in its admin key. Infer it
/// from whether anything reports it as a router, defaulting to peer.
fn whatami_of(reply: &NodeReply) -> NodeKind {
    // A node that reports sessions to clients is routing for them.
    if reply
        .sessions
        .iter()
        .any(|s| parse_whatami(&s.whatami) == NodeKind::Client)
    {
        NodeKind::Router
    } else {
        NodeKind::Peer
    }
}

/// Parses the `whatami` string Zenoh writes into admin replies.
fn parse_whatami(value: &str) -> NodeKind {
    match value {
        "router" => NodeKind::Router,
        "client" => NodeKind::Client,
        _ => NodeKind::Peer,
    }
}

/// Nodes can advertise a display name in `metadata.name`.
fn name_from_metadata(metadata: Option<&serde_json::Value>) -> Option<String> {
    metadata?
        .get("name")?
        .as_str()
        .map(std::borrow::ToOwned::to_owned)
}

/// Uses the region reported on the node's transports, when they agree.
fn region_from_sessions(sessions: &[SessionReply]) -> Option<String> {
    sessions
        .iter()
        .filter_map(|s| s.region.as_deref())
        .find(|r| *r != "unknown")
        .map(std::borrow::ToOwned::to_owned)
}

/// A link-state graph decoded from Graphviz DOT.
#[derive(Debug, Default, PartialEq, Eq)]
struct DotGraph {
    nodes: Vec<String>,
    edges: Vec<(String, String)>,
}

/// Parses the DOT that `linkstate/<region>` returns.
///
/// Zenoh emits it with `petgraph`'s `Dot` formatter, so nodes are numeric
/// indices carrying the zid as their label and edges reference those indices:
///
/// ```text
/// digraph {
///     0 [ label = "ab12…" ]
///     1 [ label = "cd34…" ]
///     0 -> 1 [ label = "1.0" ]
/// }
/// ```
///
/// The parser is deliberately tolerant: a format change should degrade the
/// link-state overlay, not fail the whole topology refresh.
fn parse_dot(dot: &str) -> DotGraph {
    let mut labels: BTreeMap<String, String> = BTreeMap::new();
    let mut edges_by_index: Vec<(String, String)> = Vec::new();

    for line in dot.lines().map(str::trim) {
        if let Some((left, right)) = line.split_once("->") {
            let from = left.trim().to_owned();
            let to = right
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim_end_matches(&['[', ';'][..])
                .to_owned();
            if !from.is_empty() && !to.is_empty() {
                edges_by_index.push((from, to));
            }
        } else if let Some(label) = extract_label(line) {
            let index = line
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .to_owned();
            if !index.is_empty() {
                labels.insert(index, label);
            }
        }
    }

    // Resolve indices to zids, dropping edges whose endpoints we never saw.
    let edges = edges_by_index
        .into_iter()
        .filter_map(|(from, to)| Some((labels.get(&from)?.clone(), labels.get(&to)?.clone())))
        .collect();

    let mut nodes: Vec<String> = labels.into_values().collect();
    nodes.sort();
    nodes.dedup();

    DotGraph { nodes, edges }
}

/// Pulls `…label = "value"…` out of a DOT line.
fn extract_label(line: &str) -> Option<String> {
    let after = line.split_once("label")?.1;
    let after = after.trim_start().strip_prefix('=')?.trim_start();
    let inner = after.strip_prefix('"')?;
    let end = inner.find('"')?;
    Some(inner[..end].to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_DOT: &str = r#"
digraph {
    0 [ label = "aaaa1111" ]
    1 [ label = "bbbb2222" ]
    2 [ label = "cccc3333" ]
    0 -> 1 [ label = "1.0" ]
    1 -> 2 [ label = "1.0" ]
}
"#;

    #[test]
    fn dot_nodes_and_edges_resolve_to_zids() {
        let graph = parse_dot(SAMPLE_DOT);
        assert_eq!(graph.nodes, vec!["aaaa1111", "bbbb2222", "cccc3333"]);
        assert_eq!(
            graph.edges,
            vec![
                ("aaaa1111".to_owned(), "bbbb2222".to_owned()),
                ("bbbb2222".to_owned(), "cccc3333".to_owned()),
            ]
        );
    }

    #[test]
    fn an_empty_graph_parses_to_nothing() {
        assert_eq!(parse_dot("graph {}"), DotGraph::default());
    }

    #[test]
    fn edges_referencing_unknown_nodes_are_dropped() {
        let graph = parse_dot("digraph {\n 0 [ label = \"a\" ]\n 0 -> 9 [ label = \"1\" ]\n}");
        assert_eq!(graph.nodes, vec!["a"]);
        assert!(graph.edges.is_empty(), "dangling edge must not survive");
    }

    #[test]
    fn garbage_does_not_panic() {
        // Tolerance is the point: a format change must degrade, not crash.
        for input in ["", "{", "label =", "0 -> ", "0 [ label = ]", "-> 1"] {
            let _ = parse_dot(input);
        }
    }

    #[test]
    fn undirected_keys_collapse_both_orientations() {
        assert_eq!(undirected("b", "a"), undirected("a", "b"));
    }

    #[test]
    fn a_node_serving_clients_is_classified_as_a_router() {
        let reply = NodeReply {
            zid: "a".into(),
            version: None,
            metadata: None,
            locators: vec![],
            sessions: vec![SessionReply {
                peer: "b".into(),
                whatami: "client".into(),
                region: None,
                group: None,
            }],
        };
        assert_eq!(whatami_of(&reply), NodeKind::Router);
    }

    #[test]
    fn unknown_regions_are_not_reported_as_a_region() {
        let sessions = vec![
            SessionReply {
                peer: "b".into(),
                whatami: "peer".into(),
                region: Some("unknown".into()),
                group: None,
            },
            SessionReply {
                peer: "c".into(),
                whatami: "peer".into(),
                region: Some("core-dc".into()),
                group: None,
            },
        ];
        assert_eq!(region_from_sessions(&sessions).as_deref(), Some("core-dc"));
    }

    #[test]
    fn a_name_in_metadata_becomes_the_node_label() {
        let meta = serde_json::json!({ "name": "rtr-core-a" });
        assert_eq!(
            name_from_metadata(Some(&meta)).as_deref(),
            Some("rtr-core-a")
        );
        assert_eq!(name_from_metadata(None), None);
        assert_eq!(name_from_metadata(Some(&serde_json::json!({}))), None);
    }
}
