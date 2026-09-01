//! Nodes as the explorer presents them: one entry per Zenoh entity on the network.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::config::WhatAmI;

use crate::discovery::DiscoverySource;

/// What role a node plays in the Zenoh graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum NodeKind {
    /// Routes for others and participates in link-state.
    Router,
    /// Meshes directly with other peers.
    Peer,
    /// Attaches to a single router or peer.
    Client,
}

impl From<WhatAmI> for NodeKind {
    fn from(value: WhatAmI) -> Self {
        match value {
            WhatAmI::Router => Self::Router,
            WhatAmI::Peer => Self::Peer,
            WhatAmI::Client => Self::Client,
        }
    }
}

/// One transport the local session holds open to a remote node.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TransportSummary {
    /// Zenoh id of the node on the far end.
    pub zid: String,
    /// Role of the far end.
    pub kind: NodeKind,
    /// Whether `QoS` (priority classes) is negotiated on this transport.
    pub qos: bool,
    /// Whether shared memory is negotiated on this transport.
    pub shm: bool,
    /// Whether this is a multicast transport rather than unicast.
    pub multicast: bool,
    /// Every link carrying this transport, as `src`/`dst` locator pairs.
    pub links: Vec<LinkLocators>,
}

/// The endpoints of a single link inside a transport.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkLocators {
    /// Local end of the link.
    pub src: String,
    /// Remote end of the link.
    pub dst: String,
    /// Negotiated maximum transmission unit.
    pub mtu: u16,
    /// Network interfaces the link is bound to.
    pub interfaces: Vec<String>,
}

/// A node in the topology graph.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NodeSummary {
    /// Zenoh id, hex encoded. Stable for the lifetime of the remote process.
    pub zid: String,
    /// Human label from the node's metadata, when it advertises one.
    pub name: Option<String>,
    /// Role in the graph.
    pub kind: NodeKind,
    /// Locators the node listens on.
    pub locators: Vec<String>,
    /// `true` when this entry is the session the explorer itself opened.
    pub is_local: bool,
    /// Region derived from the node's metadata or locator, used to group the graph.
    pub region: Option<String>,
    /// Free-form metadata the node advertises in its admin space.
    #[ts(type = "unknown | null")]
    pub metadata: Option<serde_json::Value>,
    /// How we learned this node exists. The UI shows it because a node seen
    /// only by scouting is a weaker claim than one that described itself.
    pub source: DiscoverySource,
}

impl NodeSummary {
    /// Builds a bare node record with only the fields we can always determine.
    pub fn new(zid: impl Into<String>, kind: NodeKind) -> Self {
        Self {
            zid: zid.into(),
            name: None,
            kind,
            locators: Vec::new(),
            is_local: false,
            region: None,
            metadata: None,
            source: DiscoverySource::AdminSpace,
        }
    }

    /// Short form of the zid, as shown in dense tables.
    #[must_use]
    pub fn short_zid(&self) -> &str {
        let len = self.zid.len().min(8);
        &self.zid[..len]
    }
}
