//! An incremental index of every key the explorer has observed.
//!
//! The key space of a real deployment is far too large to ship to the frontend
//! whole — the mockup's reference network has 48 000 resources. So the index is
//! a trie, and the UI expands one level at a time.

use ahash::{AHashMap, AHashSet};

use crate::model::{DeclarationKind, KeyKind, KeyNode, KeySpaceSnapshot, NodeDeclaration};
use crate::search::{SearchHit, SearchHitKind};

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
    /// Declarations at or below this node, indexed by
    /// [`DeclarationKind::index`].
    ///
    /// An array rather than a field per kind: Zenoh publishes five kinds and
    /// may publish a sixth, and five parallel counters would need the same
    /// edit in five places every time one was added.
    subtree_declarations: [usize; DeclarationKind::ALL.len()],
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
            DeclarationKind::index(a.kind)
                .cmp(&DeclarationKind::index(b.kind))
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
                            subscribers: child.count(DeclarationKind::Subscriber),
                            publishers: child.count(DeclarationKind::Publisher),
                            queryables: child.count(DeclarationKind::Queryable),
                            queriers: child.count(DeclarationKind::Querier),
                            tokens: child.count(DeclarationKind::LivelinessToken),
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

    /// Ranks every key in the index against `query`, best first.
    ///
    /// Branches are offered alongside leaves. `fleet/agv` is a useful place to
    /// jump to even when nothing published on it directly, because the key
    /// space is navigated by prefix — offering only leaves would hide every
    /// level a person actually types.
    ///
    /// Returns at most `limit` hits and the total number that matched.
    #[must_use]
    pub fn search(&self, query: &str, limit: usize) -> (Vec<SearchHit>, usize) {
        let mut scored: Vec<(i32, SearchHit)> = Vec::new();
        let mut path = String::new();
        collect_matches(&self.root, &mut path, query, &mut scored);

        let total = scored.len();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.label.cmp(&b.1.label)));
        (
            scored.into_iter().take(limit).map(|(_, hit)| hit).collect(),
            total,
        )
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
    /// Declarations of one kind at or below this node.
    fn count(&self, kind: DeclarationKind) -> usize {
        self.subtree_declarations[kind.index()]
    }

    fn kind(&self) -> KeyKind {
        match (self.is_key, self.children.is_empty()) {
            (true, true) => KeyKind::Leaf,
            (true, false) => KeyKind::Both,
            (false, _) => KeyKind::Branch,
        }
    }
}

/// Moves a subtree counter one step, up when a declaration arrives and down when
/// it is withdrawn.
///
/// Saturating on the way down: a counter can never be driven below zero by a
/// withdrawal whose matching addition we somehow never saw.
fn bump_declaration(entry: &mut Entry, kind: DeclarationKind, added: bool) {
    let counter = &mut entry.subtree_declarations[kind.index()];
    *counter = if added {
        *counter + 1
    } else {
        counter.saturating_sub(1)
    };
}

/// Walks the trie, scoring every key it holds against `query`.
///
/// One `String` carries the path down and is truncated on the way back up, so
/// a deep tree costs one allocation rather than one per node.
fn collect_matches(entry: &Entry, path: &mut String, query: &str, out: &mut Vec<(i32, SearchHit)>) {
    for (segment, child) in &entry.children {
        let mark = path.len();
        if !path.is_empty() {
            path.push('/');
        }
        path.push_str(segment);

        if let Some(found) = crate::search::score(path, query) {
            out.push((
                found.score,
                SearchHit {
                    kind: SearchHitKind::Key,
                    label: path.clone(),
                    detail: key_detail(child),
                    target: path.clone(),
                    highlights: found.positions,
                    score: found.score,
                },
            ));
        }

        collect_matches(child, path, query, out);
        path.truncate(mark);
    }
}

/// The secondary line for a key: what the index knows sits at or below it.
fn key_detail(entry: &Entry) -> String {
    let mut parts = Vec::new();
    if entry.subtree_keys > 0 {
        parts.push(counted(entry.subtree_keys, "key", "keys"));
    }
    for (kind, one, many) in [
        (DeclarationKind::Subscriber, "subscriber", "subscribers"),
        (DeclarationKind::Publisher, "publisher", "publishers"),
        (DeclarationKind::Queryable, "queryable", "queryables"),
        (DeclarationKind::Querier, "querier", "queriers"),
        (DeclarationKind::LivelinessToken, "token", "tokens"),
    ] {
        let count = entry.count(kind);
        if count > 0 {
            parts.push(counted(count, one, many));
        }
    }

    // A node with nothing under it is still worth describing: it is either a
    // key nothing has published on yet or a level of somebody's declaration.
    if parts.is_empty() {
        parts.push(
            match entry.kind() {
                KeyKind::Leaf => "leaf",
                KeyKind::Branch => "branch",
                KeyKind::Both => "key and branch",
            }
            .to_owned(),
        );
    }

    parts.join(" · ")
}

fn counted(count: usize, one: &str, many: &str) -> String {
    if count == 1 {
        format!("{count} {one}")
    } else {
        format!("{count} {many}")
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn each_declaration_kind_is_counted_separately() {
        let mut index = KeyIndex::new();
        index.declare("a", "fleet/**", DeclarationKind::Subscriber);
        index.declare("b", "fleet/**", DeclarationKind::Publisher);
        index.declare("c", "fleet/**", DeclarationKind::Queryable);
        index.declare("d", "fleet/**", DeclarationKind::Querier);
        index.declare("e", "fleet/**", DeclarationKind::LivelinessToken);

        let root = index.expand("");
        let fleet = root
            .children
            .iter()
            .find(|node| node.segment == "fleet")
            .expect("fleet should exist");

        assert_eq!(fleet.subscribers, 1);
        assert_eq!(fleet.publishers, 1);
        assert_eq!(fleet.queryables, 1);
        assert_eq!(fleet.queriers, 1);
        assert_eq!(fleet.tokens, 1);
    }

    #[test]
    fn withdrawing_one_kind_leaves_the_others() {
        let mut index = KeyIndex::new();
        index.declare("a", "fleet/**", DeclarationKind::Publisher);
        index.declare("a", "fleet/**", DeclarationKind::LivelinessToken);
        index.undeclare("a", "fleet/**", DeclarationKind::LivelinessToken);

        let root = index.expand("");
        let fleet = root
            .children
            .iter()
            .find(|n| n.segment == "fleet")
            .expect("fleet");
        assert_eq!(fleet.publishers, 1);
        assert_eq!(fleet.tokens, 0);
    }

    #[test]
    fn search_finds_branches_as_well_as_leaves() {
        let mut index = KeyIndex::new();
        index.observe("fleet/agv/07/telemetry", 1);

        let (hits, total) = index.search("fleetagv", 10);
        assert!(total >= 2, "the branch and its leaf should both match");
        let labels: Vec<&str> = hits.iter().map(|hit| hit.label.as_str()).collect();
        assert!(labels.contains(&"fleet/agv"), "got {labels:?}");
    }

    #[test]
    fn search_highlights_index_the_full_key() {
        let mut index = KeyIndex::new();
        index.observe("fleet/agv/07", 1);

        let hit = index
            .search("agv", 10)
            .0
            .into_iter()
            .find(|hit| hit.label == "fleet/agv")
            .expect("fleet/agv should match");

        let characters: Vec<char> = hit.label.chars().collect();
        let matched: String = hit
            .highlights
            .iter()
            .map(|index| characters[*index as usize])
            .collect();
        assert_eq!(matched, "agv");
    }

    #[test]
    fn search_describes_a_declared_expression() {
        let mut index = KeyIndex::new();
        index.declare("zid-a", "fleet/**", DeclarationKind::Subscriber);

        let hit = index
            .search("fleet", 10)
            .0
            .into_iter()
            .find(|hit| hit.label == "fleet")
            .expect("fleet should match");
        assert_eq!(hit.detail, "1 subscriber");
    }

    #[test]
    fn search_returns_nothing_for_an_empty_query() {
        let mut index = KeyIndex::new();
        index.observe("fleet/agv", 1);
        assert_eq!(index.search("", 10).1, 0);
    }

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
