//! Key-space tree as the UI consumes it: one lazily expanded level at a time.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Whether a tree entry is an addressable key, a grouping prefix, or both.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum KeyKind {
    /// Data has been observed on exactly this key.
    Leaf,
    /// Only a prefix — data lives further down.
    Branch,
    /// Data on this key *and* deeper keys below it.
    Both,
}

/// One row in the key tree.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KeyNode {
    /// Just this level's chunk, e.g. `telemetry`.
    pub segment: String,
    /// Full key from the root, e.g. `fleet/agv/07/telemetry`.
    pub key: String,
    /// Leaf, branch, or both.
    pub kind: KeyKind,
    /// Immediate children count, so the UI can render a disclosure caret
    /// without fetching the next level.
    pub child_count: usize,
    /// Keys at or below this node that have carried data.
    pub descendant_keys: usize,
    /// Samples observed at or below this node.
    pub sample_count: u64,
    /// Subscribers declared at or below this node.
    pub subscribers: usize,
    /// Queryables declared at or below this node.
    pub queryables: usize,
    /// Last time data was seen at or below this node.
    pub last_seen_ms: Option<u64>,
}

/// One expanded level of the key tree.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KeySpaceSnapshot {
    /// The prefix that was expanded — empty string for the root.
    pub prefix: String,
    /// Children of that prefix, sorted by segment.
    pub children: Vec<KeyNode>,
    /// Total distinct keys the index holds, across the whole tree.
    pub total_keys: usize,
}

/// What kind of interest a node declared on a key expression.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DeclarationKind {
    /// The node wants data published here delivered to it.
    Subscriber,
    /// The node answers queries on this expression.
    Queryable,
}

/// One declaration, as the node that made it described it.
///
/// The key expression is stored exactly as declared, wildcards and all:
/// `fleet/**` is what the far node asked for, and resolving it to something
/// concrete would invent detail it never claimed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NodeDeclaration {
    pub key_expr: String,
    pub kind: DeclarationKind,
}
