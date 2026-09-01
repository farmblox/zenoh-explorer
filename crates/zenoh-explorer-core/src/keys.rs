//! An incremental index of every key the explorer has observed.
//!
//! The key space of a real deployment is far too large to ship to the frontend
//! whole — the mockup's reference network has 48 000 resources. So the index is
//! a trie, and the UI expands one level at a time.

use ahash::{AHashMap, AHashSet};

use crate::model::{DeclarationKind, KeyKind, KeyNode, KeySpaceSnapshot, NodeDeclaration};

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
    /// Every declaration, keyed by the node that made it.
    ///
    /// This is what makes a declaration ATTRIBUTABLE. Without it the trie knows
    /// that eleven subscribers exist under `fleet/**` and nothing about who
    /// holds them — so a node could not be asked what it is doing, and a
    /// withdrawn declaration could not be unwound, because there was no record
    /// of whose it was. A set rather than a list: the admin space is read in
    /// full on connect and on every resync, and the same declaration arriving
    /// twice is one declaration.
    by_zid: AHashMap<String, AHashSet<(String, DeclarationKind)>>,
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

    /// Records that `zid` declared an interest in `key_expr`.
    ///
    /// Unlike `observe`, the expression may contain wildcards — `fleet/**` is
    /// stored as written, because that is what the far node actually declared
    /// and collapsing it to something concrete would invent detail.
    ///
    /// Idempotent per node: re-reading the admin space re-reports every existing
    /// declaration, and counting those again would inflate every total on screen
    /// each time anything triggered a resync.
    pub fn declare(&mut self, zid: &str, key_expr: &str, kind: DeclarationKind) {
        let inserted = self
            .by_zid
            .entry(zid.to_owned())
            .or_default()
            .insert((key_expr.to_owned(), kind));
        if !inserted {
            return;
        }

        let mut node = &mut self.root;
        bump_declaration(node, kind, true);
        for segment in key_expr.split('/').filter(|s| !s.is_empty()) {
            node = node.children.entry(segment.to_owned()).or_default();
            bump_declaration(node, kind, true);
        }
    }

    /// Records that `zid` withdrew its declaration on `key_expr`.
    ///
    /// The counters come back down because the entry says whose it was. Another
    /// node's declaration on the same expression is untouched — it has its own
    /// record and its own contribution to the counts.
    pub fn undeclare(&mut self, zid: &str, key_expr: &str, kind: DeclarationKind) {
        let held = self
            .by_zid
            .get_mut(zid)
            .is_some_and(|held| held.remove(&(key_expr.to_owned(), kind)));
        if !held {
            return;
        }

        let mut node = &mut self.root;
        bump_declaration(node, kind, false);
        for segment in key_expr.split('/').filter(|s| !s.is_empty()) {
            let Some(next) = node.children.get_mut(segment) else {
                return;
            };
            node = next;
            bump_declaration(node, kind, false);
        }
    }

    /// Everything one node has declared, subscribers first then queryables,
    /// each group by key expression.
    #[must_use]
    pub fn declarations_for(&self, zid: &str) -> Vec<NodeDeclaration> {
        let mut out: Vec<NodeDeclaration> = self
            .by_zid
            .get(zid)
            .into_iter()
            .flatten()
            .map(|(key_expr, kind)| NodeDeclaration {
                key_expr: key_expr.clone(),
                kind: *kind,
            })
            .collect();

        // Sorted so the list is stable between calls: an `AHashSet` is not.
        out.sort_by(|a, b| {
            declaration_rank(a.kind)
                .cmp(&declaration_rank(b.kind))
                .then_with(|| a.key_expr.cmp(&b.key_expr))
        });
        out
    }

    /// Total declarations recorded, across every node.
    #[must_use]
    pub fn declaration_count(&self) -> usize {
        self.by_zid.values().map(|held| held.len()).sum()
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
        self.by_zid.clear();
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
/// Subscribers before queryables, so a node's list reads consumers then providers.
const fn declaration_rank(kind: DeclarationKind) -> u8 {
    match kind {
        DeclarationKind::Subscriber => 0,
        DeclarationKind::Queryable => 1,
    }
}

/// Moves a subtree counter one step, up when a declaration arrives and down when
/// it is withdrawn.
///
/// Saturating on the way down: a counter can never be driven below zero by a
/// withdrawal whose matching addition we somehow never saw.
fn bump_declaration(entry: &mut Entry, kind: DeclarationKind, added: bool) {
    let counter = match kind {
        DeclarationKind::Subscriber => &mut entry.subtree_subscribers,
        DeclarationKind::Queryable => &mut entry.subtree_queryables,
    };
    *counter = if added {
        *counter + 1
    } else {
        counter.saturating_sub(1)
    };
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_declaration_is_attributed_to_the_node_that_made_it() {
        let mut index = KeyIndex::new();
        index.declare("nodeA", "fleet/**", DeclarationKind::Subscriber);
        index.declare("nodeB", "fleet/**", DeclarationKind::Subscriber);
        index.declare("nodeA", "fleet/agv/*", DeclarationKind::Queryable);

        let a = index.declarations_for("nodeA");
        assert_eq!(a.len(), 2);
        // Subscribers before queryables, then by expression.
        assert_eq!(a[0].kind, DeclarationKind::Subscriber);
        assert_eq!(a[0].key_expr, "fleet/**");
        assert_eq!(a[1].kind, DeclarationKind::Queryable);

        assert_eq!(index.declarations_for("nodeB").len(), 1);
        assert_eq!(index.declarations_for("nobody"), Vec::new());
        assert_eq!(index.declaration_count(), 3);
    }

    #[test]
    fn re_reading_the_admin_space_does_not_inflate_the_counts() {
        // The admin space is read in full on connect and again on every resync,
        // so the same declaration arrives repeatedly. Counting it each time
        // doubled every total on screen.
        let mut index = KeyIndex::new();
        for _ in 0..3 {
            index.declare("nodeA", "fleet/**", DeclarationKind::Subscriber);
        }
        assert_eq!(index.declaration_count(), 1);
        assert_eq!(index.declarations_for("nodeA").len(), 1);
    }

    #[test]
    fn withdrawing_unwinds_only_that_nodes_declaration() {
        let mut index = KeyIndex::new();
        index.declare("nodeA", "fleet/**", DeclarationKind::Subscriber);
        index.declare("nodeB", "fleet/**", DeclarationKind::Subscriber);

        index.undeclare("nodeA", "fleet/**", DeclarationKind::Subscriber);

        assert_eq!(index.declarations_for("nodeA"), Vec::new());
        assert_eq!(index.declarations_for("nodeB").len(), 1);
        // nodeB still holds one, so the subtree still has exactly one.
        assert_eq!(index.declaration_count(), 1);
    }

    #[test]
    fn withdrawing_something_never_declared_changes_nothing() {
        let mut index = KeyIndex::new();
        index.declare("nodeA", "fleet/**", DeclarationKind::Subscriber);
        index.undeclare("nodeA", "vision/**", DeclarationKind::Subscriber);
        index.undeclare("ghost", "fleet/**", DeclarationKind::Subscriber);
        assert_eq!(index.declaration_count(), 1);
    }

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
