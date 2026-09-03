//! Learning what is on the network, from every source Zenoh offers.
//!
//! There are four independent ways to find out who else is out there, and they
//! need different things from the far end. Ranked by how little cooperation
//! they require:
//!
//! | Source | Needs | Reach | Live? |
//! |---|---|---|---|
//! | [`Session::info`] transports and links | nothing | direct neighbours | yes, via event listeners |
//! | Liveliness tokens | applications to declare them | whole network | yes |
//! | Scouting | UDP multicast, or gossip | link-local | polled |
//! | Router status | `adminspace.enabled` on routers | whole network | polled |
//!
//! The explorer uses all four and records which one produced each node, because
//! "I can see it but only as a neighbour" and "it told me about itself" are
//! genuinely different facts about a network, and collapsing them produces a
//! graph that lies about its own confidence.
//!
//! # Why this exists
//!
//! Zenoh 1.x defaults `adminspace.enabled` to **false**. A great many real
//! deployments therefore expose no router status at all, and a topology view
//! built only on `@/*/router` shows such a network as empty. The transport and link
//! event listeners below need nothing from anyone: they report the local
//! session's own connections, with history, and then stream changes.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::Session;
use zenoh::sample::SampleKind;

use std::collections::BTreeMap;

use crate::admin;
use crate::error::{Error, Result};
use crate::model::{
    LinkLocators, LinkSummary, NodeKind, NodeSummary, TopologySnapshot, TransportSummary,
};
use crate::time::now_ms;

/// How the explorer came to know about a node.
///
/// Carried on every node so the UI can be honest about confidence: a node seen
/// only by scouting may not be reachable, and one seen only as a transport is
/// a neighbour whose own view we cannot read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum DiscoverySource {
    /// A transport this session holds open. Always available.
    Transport,
    /// A liveliness token an application declared.
    Liveliness,
    /// Answered a scout on multicast or gossip.
    Scouting,
    /// A router described itself in its status record.
    AdminSpace,
    /// Named by another node's link-state graph.
    LinkState,
}

impl DiscoverySource {
    /// How much the source tells us, most informative first. Used to pick the
    /// winner when several sources describe one node.
    #[must_use]
    pub const fn rank(self) -> u8 {
        match self {
            Self::AdminSpace => 0,
            Self::Transport => 1,
            Self::LinkState => 2,
            Self::Liveliness => 3,
            Self::Scouting => 4,
        }
    }
}

/// A change to the local session's connectivity.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectivityEvent {
    /// Zid of the node on the far end.
    pub zid: String,
    /// Its role.
    pub kind: NodeKind,
    /// `true` when the transport came up, `false` when it went away.
    pub up: bool,
    /// Links carrying the transport, when the event carries them.
    pub links: Vec<LinkLocators>,
    /// When we observed it.
    pub at_ms: u64,
}

/// Receives connectivity changes. Implemented by the Tauri layer.
pub trait ConnectivitySink: Send + Sync + 'static {
    /// Delivers one change. Must not block the Zenoh runtime.
    fn send(&self, event: ConnectivityEvent);
}

impl<F> ConnectivitySink for F
where
    F: Fn(ConnectivityEvent) + Send + Sync + 'static,
{
    fn send(&self, event: ConnectivityEvent) {
        self(event);
    }
}

/// A live subscription to the session's transport lifecycle.
///
/// Dropping this stops the notifications.
pub struct ConnectivityWatch {
    // Held to keep the listener declared; dropping it undeclares. The unit
    // handler is what `.callback(..)` resolves to — events go to the closure,
    // not to a channel we would have to drain.
    _transports: zenoh::session::TransportEventsListener<()>,
}

impl std::fmt::Debug for ConnectivityWatch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnectivityWatch").finish_non_exhaustive()
    }
}

/// Starts reporting transport open/close for this session.
///
/// `history(true)` replays the transports that are already up before streaming
/// changes, so a caller gets the current state and every subsequent change from
/// one subscription — no separate "fetch then subscribe" race to get wrong.
pub async fn watch_connectivity(
    session: &Session,
    sink: Arc<dyn ConnectivitySink>,
) -> Result<ConnectivityWatch> {
    let listener = session
        .info()
        .transport_events_listener()
        .history(true)
        .callback(move |event| {
            let transport = event.transport();
            sink.send(ConnectivityEvent {
                zid: transport.zid().to_string(),
                kind: NodeKind::from(transport.whatami()),
                up: event.kind() == SampleKind::Put,
                links: Vec::new(),
                at_ms: now_ms(),
            });
        })
        .await
        .map_err(Error::zenoh)?;

    Ok(ConnectivityWatch {
        _transports: listener,
    })
}

/// The session's directly connected transports, with their links.
///
/// The one topology source that always works: it reads the local session's own
/// state and asks nothing of the far end.
pub async fn local_transports(session: &Session) -> Vec<TransportSummary> {
    use std::collections::HashMap;

    // `links()` resolves to a plain iterator, so collect once and group rather
    // than re-querying per transport.
    let mut links_by_zid: HashMap<String, Vec<LinkLocators>> = HashMap::new();
    for link in session.info().links().await {
        links_by_zid
            .entry(link.zid().to_string())
            .or_default()
            .push(LinkLocators {
                src: link.src().to_string(),
                dst: link.dst().to_string(),
                mtu: link.mtu(),
                interfaces: link.interfaces().to_vec(),
            });
    }

    session
        .info()
        .transports()
        .await
        .map(|transport| {
            let zid = transport.zid().to_string();
            TransportSummary {
                links: links_by_zid.get(&zid).cloned().unwrap_or_default(),
                zid,
                kind: NodeKind::from(transport.whatami()),
                qos: transport.is_qos(),
                shm: transport.is_shm(),
                multicast: transport.is_multicast(),
            }
        })
        .collect()
}

/// Turns the local transports into graph nodes.
///
/// These are always `DiscoverySource::Transport`: we know they exist because we
/// are talking to them, which is the strongest evidence available and also the
/// least informative — it says nothing about what lies beyond them.
pub fn nodes_from_transports(transports: &[TransportSummary]) -> Vec<NodeSummary> {
    transports
        .iter()
        .map(|transport| {
            let mut node = NodeSummary::new(transport.zid.clone(), transport.kind);
            node.locators = transport
                .links
                .iter()
                .map(|link| link.dst.clone())
                .collect();
            node.source = DiscoverySource::Transport;
            node
        })
        .collect()
}

/// Orientation-independent key, so both directions collapse to one link.
fn undirected(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_owned(), b.to_owned())
    } else {
        (b.to_owned(), a.to_owned())
    }
}

/// Pulls the scheme out of a locator: `quic/10.0.0.1:7447` -> `quic`.
fn protocol_of(locator: &str) -> Option<String> {
    locator
        .split('/')
        .next()
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

/// Counts routers whose own `@/<zid>/router` status record did not answer.
pub(crate) fn count_unreadable_routers<'a>(
    nodes: impl IntoIterator<Item = &'a NodeSummary>,
) -> usize {
    nodes
        .into_iter()
        .filter(|node| {
            !node.is_local
                && node.kind == NodeKind::Router
                && node.source != DiscoverySource::AdminSpace
        })
        .count()
}

/// Assembles a topology snapshot from every source available.
///
/// Local transports come first and always work: they describe the session's own
/// connections and ask nothing of the far end. The admin space is then merged
/// over the top where nodes answer it, contributing locators, regions,
/// metadata and links between nodes the explorer never talks to directly.
///
/// This ordering is what makes the view useful against a network with
/// `adminspace.enabled` left at its default of false. Such a network answers no
/// router-status query at all, and a snapshot built only from `@/*/router` would be a single
/// node with no edges.
pub async fn snapshot(session: &Session) -> Result<(TopologySnapshot, Vec<String>)> {
    let local_zid = session.info().zid().await.to_string();
    let mut diagnostics = Vec::new();

    let mut nodes: BTreeMap<String, NodeSummary> = BTreeMap::new();
    let mut links: BTreeMap<(String, String), LinkSummary> = BTreeMap::new();

    // --- always available ---------------------------------------------------
    let transports = local_transports(session).await;

    let mut explorer = NodeSummary::new(local_zid.clone(), NodeKind::Client);
    explorer.is_local = true;
    explorer.name = Some("this explorer".to_owned());
    explorer.source = DiscoverySource::Transport;
    nodes.insert(local_zid.clone(), explorer);

    for node in nodes_from_transports(&transports) {
        // Every transport is, by definition, a link from us to it.
        let key = undirected(&local_zid, &node.zid);
        links.insert(
            key,
            LinkSummary {
                from: local_zid.clone(),
                to: node.zid.clone(),
                protocol: transports
                    .iter()
                    .find(|t| t.zid == node.zid)
                    .and_then(|t| t.links.first())
                    .and_then(|link| protocol_of(&link.dst)),
                // The local session knows it holds the transport, not which
                // routing tree the far end filed it under.
                region: None,
                // We are one end and we are reporting it; the far end has not
                // independently confirmed it.
                bidirectional: false,
                multicast: transports.iter().any(|t| t.zid == node.zid && t.multicast),
                in_routing_map: false,
                routing_cost: None,
            },
        );
        nodes.insert(node.zid.clone(), node);
    }

    // --- richer, when the far end cooperates --------------------------------
    let mut admin_responses = 0;
    match admin::probe(session).await {
        Ok(probe) => {
            diagnostics.extend(probe.notes);
            admin_responses = probe.snapshot.admin_responses;

            for node in probe.snapshot.nodes {
                match nodes.get_mut(&node.zid) {
                    // The admin space knows more than a transport does, so it
                    // wins on everything except which node is ours.
                    Some(existing) if node.source.rank() < existing.source.rank() => {
                        let is_local = existing.is_local;
                        *existing = node;
                        existing.is_local = is_local;
                    }
                    Some(_) => {}
                    None => {
                        nodes.insert(node.zid.clone(), node);
                    }
                }
            }

            for link in probe.snapshot.links {
                let key = undirected(&link.from, &link.to);
                links
                    .entry(key)
                    .and_modify(|existing| {
                        if existing.from != link.from {
                            existing.bidirectional = true;
                        }
                        if existing.protocol.is_none() {
                            existing.protocol.clone_from(&link.protocol);
                        }
                        if existing.region.is_none() {
                            existing.region.clone_from(&link.region);
                        }
                        if link.in_routing_map {
                            existing.in_routing_map = true;
                            existing.routing_cost = link.routing_cost;
                        }
                    })
                    .or_insert(link);
            }
        }
        Err(err) => diagnostics.push(format!("admin space unavailable: {err}")),
    }

    // Peers and clients are expected to be reported by router session tables.
    // A coverage gap is specifically a router we know exists whose own status
    // record did not answer.
    let unverified_nodes = count_unreadable_routers(nodes.values());

    Ok((
        TopologySnapshot {
            // Scouting sees nodes, never configuration, so it can say nothing
            // about storages.
            storages: Vec::new(),
            nodes: nodes.into_values().collect(),
            links: links.into_values().collect(),
            local_zid,
            captured_at_ms: now_ms(),
            unverified_nodes,
            admin_responses,
        },
        diagnostics,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_space_outranks_every_weaker_source() {
        let mut sources = [
            DiscoverySource::Scouting,
            DiscoverySource::AdminSpace,
            DiscoverySource::Liveliness,
            DiscoverySource::Transport,
            DiscoverySource::LinkState,
        ];
        sources.sort_by_key(|s| s.rank());
        assert_eq!(
            sources,
            [
                DiscoverySource::AdminSpace,
                DiscoverySource::Transport,
                DiscoverySource::LinkState,
                DiscoverySource::Liveliness,
                DiscoverySource::Scouting,
            ]
        );
    }

    #[test]
    fn transports_become_nodes_carrying_their_locators() {
        let transports = vec![TransportSummary {
            zid: "abc".into(),
            kind: NodeKind::Router,
            qos: true,
            shm: false,
            multicast: false,
            links: vec![LinkLocators {
                src: "quic/1.2.3.4:5".into(),
                dst: "quic/10.0.0.1:7447".into(),
                mtu: 1400,
                interfaces: vec![],
            }],
        }];

        let nodes = nodes_from_transports(&transports);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].kind, NodeKind::Router);
        assert_eq!(nodes[0].locators, vec!["quic/10.0.0.1:7447"]);
        assert_eq!(nodes[0].source, DiscoverySource::Transport);
    }

    #[test]
    fn only_routers_without_a_status_reply_are_coverage_gaps() {
        let mut unreadable_router = NodeSummary::new("router-a", NodeKind::Router);
        unreadable_router.source = DiscoverySource::LinkState;

        let mut readable_router = NodeSummary::new("router-b", NodeKind::Router);
        readable_router.source = DiscoverySource::AdminSpace;

        let mut reported_peer = NodeSummary::new("peer-a", NodeKind::Peer);
        reported_peer.source = DiscoverySource::LinkState;

        let mut reported_client = NodeSummary::new("client-a", NodeKind::Client);
        reported_client.source = DiscoverySource::LinkState;

        let nodes = [
            unreadable_router,
            readable_router,
            reported_peer,
            reported_client,
        ];
        assert_eq!(count_unreadable_routers(&nodes), 1);
    }
}
