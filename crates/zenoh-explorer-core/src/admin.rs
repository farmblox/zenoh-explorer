//! Reading the network out of Zenoh's admin space.
//!
//! Zenoh 1.10 exposes each router's view of the world under
//! `@/<router-zid>/router/…`. The subtrees this module reads are:
//!
//! | key                                            | payload                        |
//! |------------------------------------------------|--------------------------------|
//! | `@/<zid>/router`                               | JSON: locators, sessions, ...   |
//! | `@/<zid>/router/linkstate/<region>`            | Graphviz DOT of the link graph  |
//! | `@/<zid>/router/route/successor/src/<a>/dst/<b>` | JSON: next hop               |
//!
//! The router JSON `sessions` array is the primary topology source: it is
//! stable, machine-readable, and describes the peers and clients attached to
//! that router. Link-state DOT is a secondary source that reveals routers we
//! cannot reach directly.
//!
//! # How much one connection can see
//!
//! All of it. `@/*/router` is a wildcard query with [`QueryTarget::All`], so it
//! routes across the whole mesh and every router with `adminspace.enabled`
//! answers with its live transport table. One TCP connection to one router can
//! therefore reveal the other routers plus the peers and clients attached to
//! them; the union of those session tables is the real link graph.
//!
//! The limit is participation, not reach: a router with `adminspace.enabled`
//! left at its Zenoh 1.x default of **false** answers nothing. Direct transport
//! information still provides the explorer's first hop, so [`probe`] reports
//! missing router coverage as a diagnostic rather than presenting a sparse graph
//! as complete.
//!
//! # Two things the admin space does not mean
//!
//! The answering node is a router because the status key is
//! `@/<zid>/router`; the role of each attached node comes from
//! `sessions[].whatami`. And `sessions[].region` is a property of the LINK —
//! which of Zenoh's routing trees it belongs to (`north` for the router
//! backbone, `south:<n>:<mode>` for a tree below a router) — not a place the
//! node is in. Both are easy to get wrong in ways that produce a plausible,
//! incorrect graph.

use std::collections::BTreeMap;
use std::time::Duration;

use ahash::AHashMap;
use serde::Deserialize;
use zenoh::Session;
use zenoh::query::{ConsolidationMode, QueryTarget};

use crate::acl::AclSummary;
use crate::discovery::{DiscoverySource, count_unreadable_routers};
use crate::error::{Error, Result};
use crate::model::{LinkSummary, NodeKind, NodeSummary, RegionSource, TopologySnapshot};
use crate::storage::StorageSummary;
use crate::time::now_ms;

/// Selector matching every router's status entry: `@/<router-zid>/router`.
///
/// `_stats=true` asks routers built with the `stats` feature to fold throughput
/// counters into the reply. Routers without it ignore the parameter, so this is
/// free everywhere and answers "is this link actually carrying anything" on the
/// nodes that can.
const NODES_SELECTOR: &str = "@/*/router?_stats=true";

/// Selector for every router's effective configuration.
///
/// One query rather than three targeted ones. `region_name`, `gateway.south`
/// and `access_control` all live here, and a wildcard admin query costs its
/// full timeout however narrow the key is — so asking once for the whole
/// document is strictly cheaper than asking three times for parts of it.
const CONFIG_SELECTOR: &str = "@/*/router/config";

/// Selector matching every link-state region graph.
const LINKSTATE_SELECTOR: &str = "@/*/router/linkstate/*";

/// How long to wait for admin replies. Generous enough for a WAN hop, short
/// enough that a wedged node cannot stall a refresh.
const QUERY_TIMEOUT: Duration = Duration::from_millis(2_500);

/// The shape of a `@/<router-zid>/router` reply.
#[derive(Debug, Deserialize)]
struct RouterReply {
    zid: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
    #[serde(default)]
    locators: Vec<String>,
    #[serde(default)]
    sessions: Vec<SessionReply>,
    /// Plugins the node has loaded, as `{ id: { name, path } }`.
    ///
    /// Null on a node built without the `plugins` feature, which is why this is
    /// a `Value` rather than a map: the field is present either way.
    #[serde(default)]
    plugins: Option<serde_json::Value>,
    /// Throughput counters, present only on nodes built with the `stats`
    /// feature and only because the selector asks for them.
    #[serde(default)]
    stats: Option<serde_json::Value>,
}

/// The ids of the plugins a node reports, sorted.
fn plugin_ids(plugins: Option<&serde_json::Value>) -> Vec<String> {
    let mut ids: Vec<String> = plugins
        .and_then(serde_json::Value::as_object)
        .map(|map| map.keys().cloned().collect())
        .unwrap_or_default();
    ids.sort();
    ids
}

/// The parts of a `@/<zid>/router/config` reply the topology cares about.
#[derive(Debug, Default, Deserialize)]
struct ConfigReply {
    /// The node's own region, added in Zenoh 1.9. `None` is the default.
    #[serde(default)]
    region_name: Option<String>,
    #[serde(default)]
    gateway: Option<GatewayReply>,
    #[serde(default)]
    access_control: Option<AclSummary>,
    #[serde(default)]
    plugins: Option<PluginsReply>,
}

/// The `plugins` block of a configuration.
#[derive(Debug, Default, Deserialize)]
struct PluginsReply {
    #[serde(default)]
    storage_manager: Option<StorageManagerReply>,
}

/// The storage manager's configuration.
#[derive(Debug, Default, Deserialize)]
struct StorageManagerReply {
    #[serde(default)]
    storages: BTreeMap<String, StorageEntry>,
}

/// One entry of the storage manager's `storages` map.
#[derive(Debug, Deserialize)]
struct StorageEntry {
    key_expr: String,
    #[serde(default)]
    strip_prefix: Option<String>,
    /// `"memory"` or `{ id: "memory", … }` — the schema allows either.
    #[serde(default)]
    volume: serde_json::Value,
}

impl StorageEntry {
    /// The volume's name, whichever of the two shapes was used.
    fn volume_name(&self) -> String {
        self.volume
            .as_str()
            .or_else(|| self.volume.get("id").and_then(serde_json::Value::as_str))
            .unwrap_or("unknown")
            .to_owned()
    }
}

/// Every storage described by one node's configuration.
fn storages_of(zid: &str, config: &ConfigReply) -> Vec<StorageSummary> {
    let Some(manager) = config
        .plugins
        .as_ref()
        .and_then(|plugins| plugins.storage_manager.as_ref())
    else {
        return Vec::new();
    };

    // A `BTreeMap`, so the storages come out named in order without a sort.
    let out: Vec<StorageSummary> = manager
        .storages
        .iter()
        .map(|(name, entry)| {
            let volume = entry.volume_name();
            StorageSummary {
                zid: zid.to_owned(),
                name: name.clone(),
                key_expr: entry.key_expr.clone(),
                strip_prefix: entry.strip_prefix.clone(),
                in_memory: volume == "memory",
                volume,
            }
        })
        .collect();

    out
}

/// The `gateway` block. `south` is either a preset string or a list of regions.
#[derive(Debug, Default, Deserialize)]
struct GatewayReply {
    #[serde(default)]
    south: Option<serde_json::Value>,
}

impl GatewayReply {
    /// How many south regions are explicitly configured.
    ///
    /// `"auto"` is a preset, not a region: it tells Zenoh to sort remotes by
    /// mode the way it always did. Only an array names regions the operator
    /// chose, and only those hide anything on purpose.
    fn south_regions(&self) -> usize {
        self.south
            .as_ref()
            .and_then(serde_json::Value::as_array)
            .map_or(0, Vec::len)
    }
}

/// One entry of the `sessions` array: a transport to another node.
#[derive(Debug, Deserialize)]
struct SessionReply {
    peer: String,
    #[serde(default)]
    whatami: String,
    /// Which of Zenoh's routing trees this link belongs to. A property of the
    /// link, not of either node: one node's links span several trees.
    #[serde(default)]
    region: Option<String>,
    #[serde(default)]
    group: Option<String>,
    /// The links carrying this transport. Present on every entry, which is what
    /// lets an admin-derived edge name its own protocol.
    #[serde(default)]
    links: Vec<SessionLink>,
}

/// The endpoints of one link under a session entry.
#[derive(Debug, Deserialize)]
struct SessionLink {
    #[serde(default)]
    dst: String,
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
    let mut storages: Vec<StorageSummary> = Vec::new();
    let mut diagnostics = Vec::new();

    // The three queries are independent and each costs its full timeout, so
    // running them together makes a probe as slow as the slowest rather than as
    // slow as all three.
    let (router_replies, linkstate, configs) = tokio::join!(
        collect_router_statuses(session),
        collect_linkstate(session),
        collect_node_configs(session),
    );

    let router_replies = router_replies?;
    let configs = configs.unwrap_or_else(|err| {
        diagnostics.push(format!("router configuration unavailable: {err}"));
        AHashMap::new()
    });

    if router_replies.is_empty() {
        diagnostics.push(
            "No router answered at `@/*/router`. Routers must be started with \
             `adminspace.enabled: true` (the default is false) for the explorer \
             to read their session tables."
                .to_owned(),
        );
    }

    for reply in &router_replies {
        let config = configs.get(&reply.zid);
        if let Some(config) = config {
            storages.extend(storages_of(&reply.zid, config));
        }
        let summary = summarise_router(reply, config, &local_zid);
        // Overwrites rather than inserts: another router's session list may
        // have put a placeholder here already, and the router's own reply outranks
        // anything said about it.
        nodes.insert(reply.zid.clone(), summary);

        for entry in &reply.sessions {
            // Make sure the far end exists as a node even if it never answered.
            nodes.entry(entry.peer.clone()).or_insert_with(|| {
                let mut node = NodeSummary::new(entry.peer.clone(), parse_whatami(&entry.whatami));
                // Named by a router that did answer. Its role is authoritative,
                // but the rest of its own state is not available here.
                node.source = DiscoverySource::LinkState;
                node
            });
            add_link(&mut links, &reply.zid, entry);
        }
    }

    // Link-state fills in routers that exist in the graph but did not reply.
    match linkstate {
        Ok(graphs) => merge_linkstate(graphs, &mut nodes, &mut links, &mut diagnostics),
        Err(err) => diagnostics.push(format!("link-state unavailable: {err}")),
    }

    // The explorer's own session is always in the graph, even in client mode
    // where it has no admin entry of its own to find.
    nodes
        .entry(local_zid.clone())
        .or_insert_with(|| NodeSummary::new(local_zid.clone(), NodeKind::Client))
        .is_local = true;

    // Peers and clients are expected to come from router session tables. Only
    // a router that appears in the graph without answering its own status
    // record represents a coverage gap.
    let unverified_nodes = count_unreadable_routers(nodes.values());

    // A gateway hides its south region on purpose. Zenoh's deployment model is
    // explicit that it "will hide non needed details of the sub region(s) to the
    // upper region (number of nodes, topology, individual subscribers and
    // queryables)" — so a graph can be both complete and small, and calling that
    // partial without saying why sends someone hunting a fault that is not there.
    let gateways = nodes.values().filter(|node| node.south_regions > 0).count();
    let hidden_regions: usize = nodes.values().map(|node| node.south_regions).sum();
    if gateways > 0 {
        diagnostics.push(format!(
            "{gateways} node{} configured as a Zenoh gateway, serving \
             {hidden_regions} south region{}. What is inside a south region — its \
             nodes, its topology, its subscribers and queryables — is hidden from \
             this side by design. Connect inside the region to see it.",
            if gateways == 1 { " is" } else { "s are" },
            if hidden_regions == 1 { "" } else { "s" },
        ));
    }

    Ok(Probe {
        snapshot: TopologySnapshot {
            nodes: nodes.into_values().collect(),
            links: links.into_values().collect(),
            local_zid,
            captured_at_ms: now_ms(),
            storages,
            unverified_nodes,
            admin_responses: router_replies.len(),
        },
        notes: diagnostics,
    })
}

/// Builds one router's summary from its status reply and configuration.
///
/// Split out of `probe` because it is the one part that reads from two
/// different queries at once, and because everything it decides is about a
/// single router rather than about the graph.
fn summarise_router(
    reply: &RouterReply,
    config: Option<&ConfigReply>,
    local_zid: &str,
) -> NodeSummary {
    let mut summary = NodeSummary::new(reply.zid.clone(), NodeKind::Router);
    summary.locators.clone_from(&reply.locators);
    summary.is_local = reply.zid == local_zid;
    summary.name = name_from_metadata(reply.metadata.as_ref());
    summary.plugins = plugin_ids(reply.plugins.as_ref());
    summary.source = DiscoverySource::AdminSpace;

    // Zenoh's own `region_name` first. It is the name gateway filters match on,
    // so it is the only one that means anything to the network itself;
    // `metadata.location` is an operator convention that fills the gap when
    // nobody has set a region, which is the default.
    let configured = config.and_then(|config| config.region_name.clone());
    let (region, region_source) = match configured {
        Some(name) => (Some(name), Some(RegionSource::Configured)),
        None => match location_from_metadata(reply.metadata.as_ref()) {
            Some(name) => (Some(name), Some(RegionSource::Metadata)),
            None => (None, None),
        },
    };
    summary.region = region;
    summary.region_source = region_source;
    summary.south_regions = config
        .and_then(|config| config.gateway.as_ref())
        .map_or(0, GatewayReply::south_regions);
    summary.acl = config.and_then(|config| config.access_control.clone());
    summary.stats.clone_from(&reply.stats);
    summary.metadata = reply.metadata.clone().map(|mut meta| {
        // Fold the version in so the inspector has it without a second query.
        if let (Some(map), Some(version)) = (meta.as_object_mut(), reply.version.as_ref()) {
            map.insert("version".to_owned(), serde_json::json!(version));
        }
        meta
    });

    summary
}

/// Folds the link-state graphs into the node and link maps.
///
/// A separate step because reading a DOT graph and reading a JSON reply are two
/// different jobs with two different pitfalls, and because only one of them has
/// to reason about which graphs mean anything.
fn merge_linkstate(
    graphs: Vec<(String, String)>,
    nodes: &mut BTreeMap<String, NodeSummary>,
    links: &mut BTreeMap<(String, String), LinkSummary>,
    diagnostics: &mut Vec<String>,
) {
    for (region, dot) in graphs {
        let graph = parse_dot(&dot);

        // A graph with no edges is a membership list, not a topology. Reading
        // those names as links draws a mesh that does not exist.
        if graph.edges.is_empty() {
            continue;
        }

        // A router publishes several HAT graphs. `north` and `south:*:router`
        // are router backbones; `south:*:peer` is a peer-routing mesh. Keeping
        // that distinction is essential: the edge still participates in
        // Zenoh routing, but a peer must not acquire router status in the UI.
        let kind = linkstate_region_kind(&region);
        for zid in &graph.nodes {
            if let Some(node) = nodes.get_mut(zid) {
                // A zid can occur in more than one regional graph. Never let
                // reply order downgrade a router to a peer (or a peer to a
                // client) when the stronger role appears later.
                if node_kind_rank(kind) > node_kind_rank(node.kind) {
                    node.kind = kind;
                }
            } else {
                let mut node = NodeSummary::new(zid.clone(), kind);
                node.source = DiscoverySource::LinkState;
                nodes.insert(zid.clone(), node);
            }
        }

        for (from, to, routing_cost) in &graph.edges {
            let key = undirected(from, to);
            links
                .entry(key)
                .and_modify(|link| {
                    link.in_routing_map = true;
                    link.routing_cost = *routing_cost;
                    if link.region.is_none() {
                        link.region = Some(region.clone());
                    }
                })
                .or_insert_with(|| LinkSummary {
                    from: from.clone(),
                    to: to.clone(),
                    protocol: None,
                    region: Some(region.clone()),
                    bidirectional: false,
                    multicast: false,
                    in_routing_map: true,
                    routing_cost: *routing_cost,
                });
        }

        diagnostics.push(format!(
            "link-state region {region}: {} nodes, {} links",
            graph.nodes.len(),
            graph.edges.len()
        ));
    }
}

/// Role of nodes represented by one router link-state region.
fn linkstate_region_kind(region: &str) -> NodeKind {
    match region.rsplit(':').next() {
        Some("peer") => NodeKind::Peer,
        Some("client") => NodeKind::Client,
        _ => NodeKind::Router,
    }
}

const fn node_kind_rank(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::Router => 2,
        NodeKind::Peer => 1,
        NodeKind::Client => 0,
    }
}

/// Runs the `@/*/router` query and decodes every router status reply.
async fn collect_router_statuses(session: &Session) -> Result<Vec<RouterReply>> {
    let replies = session
        .get(NODES_SELECTOR)
        .target(QueryTarget::All)
        .consolidation(ConsolidationMode::None)
        .timeout(QUERY_TIMEOUT)
        .await
        .map_err(Error::zenoh)?;

    let mut out = Vec::new();
    while let Ok(reply) = replies.recv_async().await {
        let Ok(sample) = reply.result() else { continue };
        let key = sample.key_expr().as_str();

        // Be defensive even though the selector is narrow: plugin queryables
        // can reply with intersecting keys, and only this exact root is a
        // router's transport table.
        if !is_router_status_key(key) {
            tracing::debug!(key = %key, "skipping reply that is not a router status record");
            continue;
        }

        let bytes = sample.payload().to_bytes();
        match serde_json::from_slice::<RouterReply>(&bytes) {
            Ok(node) => out.push(node),
            Err(err) => tracing::debug!(
                key = %key,
                error = %err,
                "skipping admin reply that is not a node entry"
            ),
        }
    }
    Ok(out)
}

/// Reads every router's configuration, keyed by zid.
///
/// Separate from the node query because the two answer different keys, and
/// because a router with `adminspace.permissions.read` off will serve one and
/// not the other — a missing config is a gap in what we can say about a router,
/// not a reason to fail the whole probe.
async fn collect_node_configs(session: &Session) -> Result<AHashMap<String, ConfigReply>> {
    let replies = session
        .get(CONFIG_SELECTOR)
        .target(QueryTarget::All)
        .consolidation(ConsolidationMode::None)
        .timeout(QUERY_TIMEOUT)
        .await
        .map_err(Error::zenoh)?;

    let mut out = AHashMap::new();
    while let Ok(reply) = replies.recv_async().await {
        let Ok(sample) = reply.result() else { continue };
        let key = sample.key_expr().as_str();
        let Some(zid) = zid_from_admin_key(key) else {
            continue;
        };

        let bytes = sample.payload().to_bytes();
        match serde_json::from_slice::<ConfigReply>(&bytes) {
            Ok(config) => {
                out.insert(zid, config);
            }
            Err(err) => tracing::debug!(
                key = %key,
                error = %err,
                "skipping a config reply that did not decode"
            ),
        }
    }
    Ok(out)
}

/// Asks every router where it would forward a message from `from` to `to`.
///
/// One query for the whole path. Each router answers for itself, and
/// [`crate::trace::assemble`] chains the replies — walking hop by hop would
/// cost a full query timeout per hop, because every wildcard admin query runs
/// to its timeout whether or not anyone is left to answer.
pub async fn route_successors(
    session: &Session,
    from: &str,
    to: &str,
) -> Result<AHashMap<String, String>> {
    let selector = format!("@/*/router/route/successor/src/{from}/dst/{to}");
    let replies = session
        .get(&selector)
        .target(QueryTarget::All)
        .consolidation(ConsolidationMode::None)
        .timeout(QUERY_TIMEOUT)
        .await
        .map_err(Error::zenoh)?;

    let mut out = AHashMap::new();
    while let Ok(reply) = replies.recv_async().await {
        let Ok(sample) = reply.result() else { continue };
        let Some(zid) = zid_from_admin_key(sample.key_expr().as_str()) else {
            continue;
        };

        // The payload is the successor's zid as a JSON string.
        let bytes = sample.payload().to_bytes();
        match serde_json::from_slice::<String>(&bytes) {
            Ok(successor) => {
                out.insert(zid, successor);
            }
            Err(err) => tracing::debug!(
                error = %err,
                "skipping a route successor reply that did not decode"
            ),
        }
    }
    Ok(out)
}

/// The zid in `@/<zid>/…`.
fn zid_from_admin_key(key: &str) -> Option<String> {
    key.strip_prefix("@/")?
        .split('/')
        .next()
        .map(std::borrow::ToOwned::to_owned)
}

/// Whether this is exactly a router's `@/<router-zid>/router` status record.
fn is_router_status_key(key: &str) -> bool {
    let Some(rest) = key.strip_prefix("@/") else {
        return false;
    };
    let mut chunks = rest.split('/');
    matches!(
        (chunks.next(), chunks.next(), chunks.next()),
        (Some(zid), Some("router"), None) if !zid.is_empty()
    )
}

/// Runs the router link-state query, returning `(region, dot)` pairs.
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

    // Every session entry carries the links beneath it, so an admin-derived
    // edge knows the protocol actually in use. Reading it off the far node's
    // listening locators instead would name a protocol it merely offers.
    let protocol = entry.links.first().and_then(|link| protocol_of(&link.dst));

    // Zenoh reports `unknown` for a link it has not placed in a routing tree,
    // which is an absence rather than a tree named "unknown".
    let region = entry.region.clone().filter(|value| value != "unknown");

    links
        .entry(key)
        .and_modify(|link| {
            // Seeing the same link reported from the other side confirms it.
            if link.from != from {
                link.bidirectional = true;
            }
            // Either end may be the one that knows.
            if link.protocol.is_none() {
                link.protocol.clone_from(&protocol);
            }
            if link.region.is_none() {
                link.region.clone_from(&region);
            }
        })
        .or_insert_with(|| LinkSummary {
            from: from.to_owned(),
            to: entry.peer.clone(),
            protocol,
            region,
            bidirectional: false,
            multicast,
            in_routing_map: false,
            routing_cost: None,
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

/// Where the node says it is, from `metadata.location`.
///
/// The only grouping signal on a Zenoh network that means what an operator means
/// by a region, because an operator sets it. Zenoh's own `region` belongs to a
/// LINK — which routing tree it is in — so a node whose links span `north` and
/// `south:0:peer` has no single region, and taking one of them produced groups
/// named after routing directions rather than parts of the deployment.
fn location_from_metadata(metadata: Option<&serde_json::Value>) -> Option<String> {
    metadata?
        .get("location")?
        .as_str()
        .map(std::borrow::ToOwned::to_owned)
}

/// Pulls the scheme out of a locator: `tcp/10.0.0.1:7447` -> `tcp`.
fn protocol_of(locator: &str) -> Option<String> {
    locator
        .split('/')
        .next()
        .filter(|scheme| !scheme.is_empty())
        .map(std::borrow::ToOwned::to_owned)
}

/// A link-state graph decoded from Graphviz DOT.
#[derive(Debug, Default, PartialEq)]
struct DotGraph {
    nodes: Vec<String>,
    edges: Vec<(String, String, Option<f64>)>,
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
    let mut edges_by_index: Vec<(String, String, Option<f64>)> = Vec::new();

    for line in dot.lines().map(str::trim) {
        let edge = line.split_once("->").or_else(|| line.split_once("--"));
        if let Some((left, right)) = edge {
            let from = left.trim().to_owned();
            let to = right
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim_end_matches(&['[', ';'][..])
                .to_owned();
            if !from.is_empty() && !to.is_empty() {
                let weight = extract_label(line)
                    .and_then(|label| label.parse::<f64>().ok())
                    .filter(|weight| weight.is_finite());
                edges_by_index.push((from, to, weight));
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
        .filter_map(|(from, to, weight)| {
            Some((labels.get(&from)?.clone(), labels.get(&to)?.clone(), weight))
        })
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
    #[test]
    fn storages_are_read_out_of_a_node_configuration() {
        // Both volume shapes the schema allows, in one config.
        let config = config_of(
            r#"{"plugins":{"storage_manager":{"storages":{
                 "demo":{"key_expr":"demo/example/**","volume":"memory"},
                 "influx":{"key_expr":"fleet/**","strip_prefix":"fleet",
                           "volume":{"id":"my-volume","db":"Fleet"}}
               }}}}"#,
        );

        let found = storages_of("aaaa", &config);
        assert_eq!(found.len(), 2);

        assert_eq!(found[0].name, "demo");
        assert_eq!(found[0].key_expr, "demo/example/**");
        assert_eq!(found[0].volume, "memory");
        assert!(found[0].in_memory, "the built-in volume is not persistent");

        assert_eq!(found[1].name, "influx");
        assert_eq!(found[1].volume, "my-volume");
        assert_eq!(found[1].strip_prefix.as_deref(), Some("fleet"));
        assert!(!found[1].in_memory);
    }

    #[test]
    fn a_node_with_no_storage_manager_has_no_storages() {
        assert!(storages_of("aaaa", &config_of(r#"{"plugins":{}}"#)).is_empty());
        assert!(storages_of("aaaa", &config_of("{}")).is_empty());
    }

    fn config_of(json: &str) -> ConfigReply {
        serde_json::from_str(json).expect("config should decode")
    }

    #[test]
    fn a_configured_region_name_is_read() {
        let config = config_of(r#"{"region_name":"region_1"}"#);
        assert_eq!(config.region_name.as_deref(), Some("region_1"));
    }

    #[test]
    fn an_unset_region_name_is_none() {
        // Zenoh's default. Most deployments never set one, which is why
        // `metadata.location` still has to be a fallback.
        let config = config_of(r#"{"region_name":null}"#);
        assert!(config.region_name.is_none());
    }

    #[test]
    fn the_auto_gateway_preset_names_no_south_region() {
        let config = config_of(r#"{"gateway":{"south":"auto"}}"#);
        let gateway = config.gateway.expect("gateway present");
        assert_eq!(gateway.south_regions(), 0);
    }

    #[test]
    fn configured_south_regions_are_counted() {
        let config = config_of(
            r#"{"gateway":{"south":[
                 {"filters":[{"region_names":["region_1"]}]},
                 {"filters":[{"region_names":["region_2"]}]}
               ]}}"#,
        );
        let gateway = config.gateway.expect("gateway present");
        assert_eq!(gateway.south_regions(), 2);
    }

    #[test]
    fn a_config_without_a_gateway_block_is_fine() {
        let config = config_of(r#"{"region_name":"main"}"#);
        assert!(config.gateway.is_none());
    }

    #[test]
    fn the_access_control_block_decodes() {
        let config = config_of(
            r#"{"access_control":{"enabled":true,"default_permission":"allow",
                 "rules":[{"id":"r","permission":"deny","flows":["ingress"],
                           "messages":["put"],"key_exprs":["demo/**"]}],
                 "policies":[{"rules":["r"],"subjects":["s"]}]}}"#,
        );
        let acl = config.access_control.expect("acl present");
        assert!(acl.enabled);
        assert_eq!(acl.active_rules().len(), 1);
    }

    #[test]
    fn plugin_ids_come_out_sorted() {
        let plugins = serde_json::json!({
            "storage_manager": {"name":"storage_manager","path":"/x"},
            "rest": {"name":"rest","path":"/y"}
        });
        assert_eq!(plugin_ids(Some(&plugins)), vec!["rest", "storage_manager"]);
    }

    #[test]
    fn a_node_without_the_plugins_feature_reports_none() {
        assert!(plugin_ids(Some(&serde_json::Value::Null)).is_empty());
        assert!(plugin_ids(None).is_empty());
    }

    #[test]
    fn a_zid_is_read_out_of_an_admin_key() {
        assert_eq!(
            zid_from_admin_key("@/abc/router/config").as_deref(),
            Some("abc")
        );
        assert!(zid_from_admin_key("nonsense").is_none());
    }

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
                ("aaaa1111".to_owned(), "bbbb2222".to_owned(), Some(1.0)),
                ("bbbb2222".to_owned(), "cccc3333".to_owned(), Some(1.0)),
            ]
        );
    }

    #[test]
    fn undirected_dot_edges_resolve_to_zids() {
        let graph = parse_dot(&SAMPLE_DOT.replace("digraph", "graph").replace("->", "--"));
        assert_eq!(graph.edges.len(), 2);
        assert_eq!(graph.edges[0].2, Some(1.0));
    }

    #[test]
    fn linkstate_regions_preserve_router_and_peer_roles() {
        assert_eq!(linkstate_region_kind("north"), NodeKind::Router);
        assert_eq!(linkstate_region_kind("south:0:router"), NodeKind::Router);
        assert_eq!(linkstate_region_kind("south:1:peer"), NodeKind::Peer);
    }

    #[test]
    fn stronger_linkstate_roles_win_regardless_of_reply_order() {
        let mut nodes = BTreeMap::new();
        let mut links = BTreeMap::new();
        let mut diagnostics = Vec::new();

        merge_linkstate(
            vec![("south:0:peer".to_owned(), SAMPLE_DOT.to_owned())],
            &mut nodes,
            &mut links,
            &mut diagnostics,
        );
        assert!(nodes.values().all(|node| node.kind == NodeKind::Peer));

        merge_linkstate(
            vec![("north".to_owned(), SAMPLE_DOT.to_owned())],
            &mut nodes,
            &mut links,
            &mut diagnostics,
        );
        assert!(nodes.values().all(|node| node.kind == NodeKind::Router));
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
    fn topology_queries_router_admin_records() {
        assert_eq!(NODES_SELECTOR, "@/*/router?_stats=true");
        assert_eq!(CONFIG_SELECTOR, "@/*/router/config");
        assert_eq!(LINKSTATE_SELECTOR, "@/*/router/linkstate/*");
    }

    #[test]
    fn only_an_exact_router_status_key_is_a_router_record() {
        assert!(is_router_status_key(
            "@/21300f7774a87677b3bde854d771d22b/router"
        ));
        for key in [
            "@/abc/peer",
            "@/abc/client",
            "@/abc/router/config",
            "@/abc/router/linkstate/north",
            "@//router",
            "fleet/telemetry",
        ] {
            assert!(!is_router_status_key(key), "accepted {key}");
        }
    }

    #[test]
    fn a_link_takes_its_protocol_and_region_from_the_session_entry() {
        let mut links = BTreeMap::new();
        add_link(
            &mut links,
            "a",
            &SessionReply {
                peer: "b".into(),
                whatami: "router".into(),
                region: Some("north".into()),
                group: None,
                links: vec![SessionLink {
                    dst: "tcp/172.24.0.2:7447".into(),
                }],
            },
        );

        let link = links.values().next().expect("one link");
        assert_eq!(link.protocol.as_deref(), Some("tcp"));
        assert_eq!(link.region.as_deref(), Some("north"));
        assert!(!link.bidirectional);
        assert!(!link.in_routing_map);
        assert_eq!(link.routing_cost, None);
    }

    #[test]
    fn an_unknown_routing_region_is_an_absence() {
        let mut links = BTreeMap::new();
        add_link(
            &mut links,
            "a",
            &SessionReply {
                peer: "b".into(),
                whatami: "peer".into(),
                region: Some("unknown".into()),
                group: None,
                links: vec![],
            },
        );
        assert_eq!(links.values().next().expect("one link").region, None);
    }

    #[test]
    fn a_membership_graph_contributes_nothing() {
        // What a peer publishes for a tree it belongs to: every member named,
        // no edges. Nine nodes and no links is not a nine-node mesh.
        let dot = r#"graph {
            0 [ label = "aaa" ]
            1 [ label = "bbb" ]
            2 [ label = "ccc" ]
        }"#;
        let graph = parse_dot(dot);
        assert_eq!(graph.nodes.len(), 3);
        assert!(graph.edges.is_empty(), "membership lists carry no edges");
    }

    #[test]
    fn a_location_in_metadata_becomes_the_group() {
        let meta = serde_json::json!({ "name": "agv-07", "location": "edge-fleet" });
        assert_eq!(
            location_from_metadata(Some(&meta)).as_deref(),
            Some("edge-fleet")
        );
        // Zenoh's routing region is deliberately not consulted here.
        assert_eq!(location_from_metadata(Some(&serde_json::json!({}))), None);
    }

    #[test]
    fn protocols_come_off_the_front_of_a_locator() {
        assert_eq!(protocol_of("tcp/172.24.0.2:7447").as_deref(), Some("tcp"));
        assert_eq!(protocol_of("quic/[::1]:7447").as_deref(), Some("quic"));
        assert_eq!(protocol_of(""), None);
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
