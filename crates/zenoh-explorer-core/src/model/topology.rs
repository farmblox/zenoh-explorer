//! A point-in-time view of the network graph.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::node::NodeSummary;

/// A directed edge between two nodes, as reported by one of them.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkSummary {
    /// Zid of the node reporting the link.
    pub from: String,
    /// Zid of the node on the other end.
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
    /// Wall-clock capture time in milliseconds since the Unix epoch.
    pub captured_at_ms: u64,
    /// How many nodes are in the graph on another node's word.
    ///
    /// A node that answered `@/<zid>/<whatami>` described itself. One that did
    /// not is here because something else reported a session to it, so its role,
    /// its name and its other links are all unknown. Non-zero means the view is
    /// partial, and by how much.
    ///
    /// The explorer's own session never counts: in client mode it has no admin
    /// entry of its own to find, so including it would mark every snapshot
    /// partial however well the rest of the network answered.
    pub unverified_nodes: usize,
    /// How many nodes described themselves through the admin space.
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
