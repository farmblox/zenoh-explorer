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

/// Where a node's region label came from.
///
/// Two different things can name a region, and which one answered matters. Zenoh
/// 1.9 added a real `region_name` to the configuration, so a node can state its
/// own; before that the only signal was whatever an operator chose to advertise
/// in `metadata`. The configured name is authoritative — it is the one the
/// gateway filters in `gateway.south[].filters[].region_names` actually match —
/// and the metadata one is a convention that happens to be useful.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum RegionSource {
    /// The node's own `region_name`, read from its configuration.
    Configured,
    /// `metadata.location`, which an operator sets by convention.
    Metadata,
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
    /// Which part of the deployment this node belongs to, used to group the graph.
    ///
    /// Zenoh's own `region_name` when the node sets one, and `metadata.location`
    /// otherwise. Not to be confused with a LINK's region (`north`,
    /// `south:0:peer`), which says which routing tree the link is in and belongs
    /// to the link rather than to either end.
    pub region: Option<String>,
    /// Which of the two named the region, or `None` when neither did.
    pub region_source: Option<RegionSource>,
    /// How many south regions this node is configured to serve as a gateway.
    ///
    /// Zero for the overwhelming majority: `gateway.south` defaults to `"auto"`,
    /// which is not an explicit region. Non-zero means the node deliberately
    /// hides what is beneath it, which is why a graph can be complete and still
    /// look small.
    pub south_regions: usize,
    /// Plugins the node reports as loaded, e.g. `rest`, `storage_manager`.
    pub plugins: Vec<String>,
    /// Throughput counters, on nodes built with Zenoh's `stats` feature.
    ///
    /// Shape varies with what that node was built with, so it travels as it
    /// arrived rather than being flattened into a schema that would be wrong
    /// for half the network.
    #[ts(type = "unknown | null")]
    pub stats: Option<serde_json::Value>,
    /// The node's access-control policy, when it publishes one.
    ///
    /// Carried on the node rather than diagnosed here: whether a policy affects
    /// you depends on the key you are asking about, and that is a question the
    /// UI asks later.
    pub acl: Option<crate::acl::AclSummary>,
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
            region_source: None,
            south_regions: 0,
            plugins: Vec::new(),
            stats: None,
            acl: None,
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
