//! A point-in-time view of the network graph.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::node::NodeSummary;
use crate::storage::StorageSummary;

/// One deduplicated, undirected link between two nodes.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkSummary {
    /// One endpoint. Orientation is retained from the first report but carries
    /// no routing direction.
    pub from: String,
    /// The other endpoint.
    pub to: String,
    /// Transport protocol, parsed out of the locator (`tcp`, `quic`, `tls`, ...).
    pub protocol: Option<String>,
    /// Which of Zenoh's routing trees the link belongs to.
    ///
    /// `north` is the router backbone and Zenoh's default; `south:<n>:<mode>` is
    /// a tree a router serves below it. This is a fact about the LINK: a node's
    /// links routinely sit in different trees, so there is no such thing as the
    /// region a node is in.
    pub region: Option<String>,
    /// `true` when both ends independently reported this link.
    pub bidirectional: bool,
    /// Whether the link is multicast.
    pub multicast: bool,
    /// Whether Zenoh included this edge in a link-state routing graph.
    pub in_routing_map: bool,
    /// Link-state cost. Lower-cost edges are preferred by Zenoh's router graph.
    ///
    /// Absent on session-only access links and when a future Zenoh DOT format
    /// omits or changes the edge label.
    pub routing_cost: Option<f64>,
}

impl LinkSummary {
    /// Orientation-independent key, so the two directions of one link collapse.
    #[must_use]
    pub fn undirected_key(&self) -> (&str, &str) {
        if self.from <= self.to {
            (&self.from, &self.to)
        } else {
            (&self.to, &self.from)
        }
    }
}

/// Everything the topology view renders from.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TopologySnapshot {
    /// Every node we could see, including the local session.
    pub nodes: Vec<NodeSummary>,
    /// Deduplicated links between those nodes.
    pub links: Vec<LinkSummary>,
    /// Zid of the session the explorer opened, so the UI can anchor the view.
    pub local_zid: String,
    /// Every storage the network's routers have configured.
    ///
    /// Read from each router's configuration during the same probe, so it arrives
    /// pushed like everything else rather than being fetched when a view opens.
    pub storages: Vec<StorageSummary>,
    /// Wall-clock capture time in milliseconds since the Unix epoch.
    pub captured_at_ms: u64,
    /// How many known routers did not answer their own status record.
    ///
    /// Peers and clients are expected to come from a router's session table and
    /// do not count here. A router that appears only through another router's
    /// sessions or link-state graph cannot reveal the peers behind it, so a
    /// non-zero value means the view may stop at that router.
    ///
    /// The explorer's own session never counts: in client mode it has no admin
    /// entry of its own to find, so including it would mark every snapshot
    /// partial however well the rest of the network answered.
    pub unverified_nodes: usize,
    /// How many routers answered their `@/<zid>/router` status record.
    ///
    /// Zero means the graph stops at the first hop: either no node has
    /// `adminspace.enabled` (Zenoh leaves it off by default) or none is
    /// reachable. The UI says so plainly rather than showing a sparse graph
    /// and letting the user conclude the network is small.
    pub admin_responses: usize,
}

impl TopologySnapshot {
    /// Number of nodes of each kind, for the status bar.
    #[must_use]
    pub fn counts(&self) -> (usize, usize, usize) {
        use super::node::NodeKind;
        let mut counts = (0, 0, 0);
        for node in &self.nodes {
            match node.kind {
                NodeKind::Router => counts.0 += 1,
                NodeKind::Peer => counts.1 += 1,
                NodeKind::Client => counts.2 += 1,
            }
        }
        counts
    }
}
