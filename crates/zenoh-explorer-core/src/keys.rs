//! An incremental index of every key the explorer has observed.
//!
//! The key space of a real deployment is far too large to ship to the frontend
//! whole — the mockup's reference network has 48 000 resources. So the index is
//! a trie, and the UI expands one level at a time.

use ahash::AHashMap;

use crate::model::{KeyKind, KeyNode, KeySpaceSnapshot};

/// What kind of interest a node declared on a key expression.
///
/// Not a transfer type: the frontend sees the COUNTS, in `KeyNode`, and never
/// an individual declaration. Keeping it out of `model` keeps `model` honest
/// about what actually crosses the IPC boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeclarationKind {
    /// The node wants data published here delivered to it.
    Subscriber,
    /// The node answers queries on this expression.
    Queryable,
}

/// One level of the trie.
#[derive(Debug, Default)]
struct Entry {
    children: AHashMap<String, Entry>,
    /// Samples seen on exactly this key.
    own_samples: u64,
    /// Samples seen at or below this key.
    subtree_samples: u64,
    /// Distinct keys at or below this node that have carried data.
    subtree_keys: usize,
    /// Whether data has landed on exactly this key.
    is_key: bool,
    /// Subscribers declared at or below this node.
    subtree_subscribers: usize,
    /// Queryables declared at or below this node.
    subtree_queryables: usize,
    last_seen_ms: Option<u64>,
}

/// Trie of observed keys with per-subtree counters.
///
/// Two things live in the same tree, deliberately. `observe` records a concrete
/// key that carried data; `declare` records a key EXPRESSION some node
/// subscribes to or answers on, wildcards and all. Keeping them together is
/// what lets the UI answer the question that actually matters — "is anyone
/// listening to this?" — instead of showing two trees that have to be compared
/// by eye. The counters stay separate so the two are never confused.
#[derive(Debug, Default)]
pub struct KeyIndex {
    root: Entry,
    total_keys: usize,
    declarations: usize,
}

impl KeyIndex {
    /// An index with nothing in it.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Records one observation of `key`.
    ///
    /// `key` must be a concrete key, not an expression with wildcards — the
    /// index describes what exists, not what was asked for.
    pub fn observe(&mut self, key: &str, at_ms: u64) {
        let is_new = self.insert(key, at_ms);
        if is_new {
            self.total_keys += 1;
        }
    }

    /// Records that a node declared an interest in `key_expr`.
    ///
    /// Unlike `observe`, the expression may contain wildcards — `fleet/**` is
    /// stored as written, because that is what the far node actually declared
    /// and collapsing it to something concrete would invent detail.
    pub fn declare(&mut self, key_expr: &str, kind: DeclarationKind) {
        self.declarations += 1;

        let mut node = &mut self.root;
        bump_declaration(node, kind);
        for segment in key_expr.split('/').filter(|s| !s.is_empty()) {
            node = node.children.entry(segment.to_owned()).or_default();
            bump_declaration(node, kind);
        }
    }

    /// Total declarations recorded, across every node.
    #[must_use]
    pub fn declaration_count(&self) -> usize {
        self.declarations
    }

    /// Walks the trie creating nodes as needed. Returns `true` when this call
    /// turned a prefix into a key for the first time.
    fn insert(&mut self, key: &str, at_ms: u64) -> bool {
        // Bump the root's aggregate counters, then descend.
        self.root.subtree_samples += 1;
        self.root.last_seen_ms = Some(at_ms);

        let mut node = &mut self.root;
        for segment in key.split('/').filter(|s| !s.is_empty()) {
            node = node.children.entry(segment.to_owned()).or_default();
            node.subtree_samples += 1;
            node.last_seen_ms = Some(at_ms);
        }

        node.own_samples += 1;
        let is_new = !node.is_key;
        node.is_key = true;

        if is_new {
            // Credit the new distinct key to every ancestor, including the root.
            self.root.subtree_keys += 1;
            let mut node = &mut self.root;
            for segment in key.split('/').filter(|s| !s.is_empty()) {
                node = node
                    .children
                    .get_mut(segment)
                    .expect("segment was just inserted");
                node.subtree_keys += 1;
            }
        }

        is_new
    }

    /// Total distinct keys in the index.
    #[must_use]
    pub fn total_keys(&self) -> usize {
        self.total_keys
    }

    /// Drops everything. Used when the user clears a session's history.
    pub fn clear(&mut self) {
        self.root = Entry::default();
        self.total_keys = 0;
        self.declarations = 0;
    }

    /// Returns the immediate children of `prefix`, sorted by segment.
    ///
    /// An empty `prefix` expands the root.
    #[must_use]
    pub fn expand(&self, prefix: &str) -> KeySpaceSnapshot {
        let mut children = self
            .resolve(prefix)
            .map(|entry| {
                entry
                    .children
                    .iter()
                    .map(|(segment, child)| {
                        let key = if prefix.is_empty() {
                            segment.clone()
                        } else {
                            format!("{prefix}/{segment}")
                        };
                        KeyNode {
                            segment: segment.clone(),
                            key,
                            kind: child.kind(),
                            child_count: child.children.len(),
                            descendant_keys: child.subtree_keys,
                            sample_count: child.subtree_samples,
                            subscribers: child.subtree_subscribers,
                            queryables: child.subtree_queryables,
                            last_seen_ms: child.last_seen_ms,
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        children.sort_by(|a, b| a.segment.cmp(&b.segment));

        KeySpaceSnapshot {
            prefix: prefix.to_owned(),
            children,
            total_keys: self.total_keys,
        }
    }

    /// Finds the entry for a concrete prefix.
    fn resolve(&self, prefix: &str) -> Option<&Entry> {
        let mut node = &self.root;
        for segment in prefix.split('/').filter(|s| !s.is_empty()) {
            node = node.children.get(segment)?;
        }
        Some(node)
    }
}

impl Entry {
    fn kind(&self) -> KeyKind {
        match (self.is_key, self.children.is_empty()) {
            (true, true) => KeyKind::Leaf,
            (true, false) => KeyKind::Both,
            (false, _) => KeyKind::Branch,
        }
    }
}

/// Credits one declaration to a trie entry.
fn bump_declaration(entry: &mut Entry, kind: DeclarationKind) {
    match kind {
        DeclarationKind::Subscriber => entry.subtree_subscribers += 1,
        DeclarationKind::Queryable => entry.subtree_queryables += 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index_of(keys: &[&str]) -> KeyIndex {
        let mut index = KeyIndex::new();
        for (i, key) in keys.iter().enumerate() {
            index.observe(key, 1_000 + i as u64);
        }
        index
    }

    #[test]
    fn root_expansion_lists_first_segments() {
        let index = index_of(&["fleet/agv/07/pose", "infra/router/a", "fleet/agv/11/pose"]);
        let snapshot = index.expand("");
        let segments: Vec<_> = snapshot
            .children
            .iter()
            .map(|c| c.segment.as_str())
            .collect();
        assert_eq!(segments, vec!["fleet", "infra"]);
    }

    #[test]
    fn counters_aggregate_up_the_tree() {
        let index = index_of(&[
            "fleet/agv/07/pose",
            "fleet/agv/11/pose",
            "fleet/agv/07/pose",
        ]);
        let root = index.expand("");
        let fleet = &root.children[0];
        assert_eq!(fleet.sample_count, 3, "three observations under fleet");
        assert_eq!(fleet.descendant_keys, 2, "two distinct keys under fleet");
        assert_eq!(index.total_keys(), 2);
    }

    #[test]
    fn a_prefix_that_is_also_a_key_reports_both() {
        let index = index_of(&["a/b", "a/b/c"]);
        let level = index.expand("a");
        assert_eq!(level.children.len(), 1);
        assert_eq!(level.children[0].kind, KeyKind::Both);
        assert_eq!(level.children[0].child_count, 1);
    }

    #[test]
    fn pure_prefixes_are_branches_and_ends_are_leaves() {
        let index = index_of(&["a/b/c"]);
        assert_eq!(index.expand("").children[0].kind, KeyKind::Branch);
        assert_eq!(index.expand("a").children[0].kind, KeyKind::Branch);
        assert_eq!(index.expand("a/b").children[0].kind, KeyKind::Leaf);
    }

    #[test]
    fn expanding_an_unknown_prefix_is_empty_not_an_error() {
        let index = index_of(&["a/b"]);
        let snapshot = index.expand("nope/nothing");
        assert!(snapshot.children.is_empty());
        assert_eq!(
            snapshot.total_keys, 1,
            "total still reflects the whole index"
        );
    }

    #[test]
    fn leading_and_repeated_slashes_do_not_create_empty_segments() {
        let index = index_of(&["/a//b/"]);
        let root = index.expand("");
        assert_eq!(root.children.len(), 1);
        assert_eq!(root.children[0].segment, "a");
        assert_eq!(index.expand("a").children[0].segment, "b");
    }

    #[test]
    fn clear_resets_every_counter() {
        let mut index = index_of(&["a/b", "c/d"]);
        index.clear();
        assert_eq!(index.total_keys(), 0);
        assert!(index.expand("").children.is_empty());
    }
}
