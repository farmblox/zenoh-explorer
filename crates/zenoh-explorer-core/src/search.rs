//! Ranking what a session knows against what the user typed.
//!
//! One matcher, in one place. The palette searches two things that have nothing
//! in common — nodes the explorer discovered and key expressions the network
//! declared — and a second implementation in the frontend would eventually rank
//! them differently from this one. That failure is quiet and nasty: the rows
//! come back in an order the highlighted characters do not justify.
//!
//! The positions a match consumed travel with it for the same reason. A UI that
//! re-derives its highlights with a substring search will disagree with the
//! ranking the moment a query matches non-contiguously, which is most of the
//! time — `agv7` against `fleet/agv/07/telemetry` is the normal case, not the
//! corner.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::model::{NodeKind, NodeSummary};

/// Longest query worth scoring.
///
/// Past this the query is longer than anything it could sensibly match, and the
/// dynamic program below is quadratic in it.
const MAX_QUERY: usize = 64;

/// Longest haystack worth scoring, in characters.
///
/// Key expressions have no length limit and a pathological one would otherwise
/// set the cost of every keystroke.
const MAX_HAYSTACK: usize = 256;

/// Credit for a character matching at all.
const MATCHED: i32 = 16;

/// Credit for matching the first character of a segment.
///
/// This is what makes `fat` find `fleet/agv/telemetry` — initials of the parts
/// are how people abbreviate a path they already know.
const SEGMENT_START: i32 = 30;

/// Credit for matching immediately after the previous match.
const CONSECUTIVE: i32 = 20;

/// Credit for matching at the very start of the haystack.
const LEADING: i32 = 25;

/// Charged per character skipped between matches.
const GAP: i32 = 2;

/// Credit, scaled by how much of the haystack the query accounted for.
///
/// This is what makes an exact match win. Without it a hyphenated string beats
/// the thing itself — every hyphen starts a segment, so `a-g-v` collects three
/// boundary bonuses for the query `agv` while plain `agv` collects one boundary
/// and two run bonuses. Rewarding coverage says the obvious thing instead: a
/// candidate the query explains entirely is a better answer than one it
/// explains a fifth of.
const COVERAGE: i32 = 60;

/// Stands in for "no path reaches this cell".
const UNREACHABLE: i32 = i32::MIN / 4;

/// What kind of thing a hit points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SearchHitKind {
    /// A node in the topology. `target` is its zid.
    Node,
    /// A key expression in the observed key space. `target` is the full key.
    Key,
    /// Something the app can do. `target` is the id the frontend sent.
    Command,
}

/// A candidate whose text only the frontend knows.
///
/// Commands are named in the UI, not here — "Collapse the sidebar" is not a
/// fact about a Zenoh network. They are still scored here, because a palette
/// that ranked its commands by one rule and its keys by another would order the
/// combined list by nothing at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchCandidate {
    /// Opaque to this crate; returned as the hit's `target`.
    pub id: String,
    pub label: String,
    pub detail: String,
}

/// One ranked result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub kind: SearchHitKind,
    /// The primary text, and the string `highlights` indexes into.
    pub label: String,
    /// Secondary text: what this is, in the vocabulary of the view it opens.
    pub detail: String,
    /// What the frontend should select — a zid, or a full key expression.
    pub target: String,
    /// Character offsets into `label` that the query matched.
    ///
    /// Character, not byte: the frontend splits the label into a `string[]` of
    /// code points, and a byte offset would land mid-sequence on any non-ASCII
    /// name.
    pub highlights: Vec<u32>,
    pub score: i32,
}

/// Everything one query found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchResults {
    pub nodes: Vec<SearchHit>,
    /// How many nodes matched in total, which is not how many were returned.
    pub node_total: usize,
    pub keys: Vec<SearchHit>,
    /// How many key expressions matched in total.
    pub key_total: usize,
    pub commands: Vec<SearchHit>,
    pub command_total: usize,
}

impl SearchResults {
    /// Nothing found — what a query against no open session returns.
    #[must_use]
    pub fn empty() -> Self {
        Self {
            nodes: Vec::new(),
            node_total: 0,
            keys: Vec::new(),
            key_total: 0,
            commands: Vec::new(),
            command_total: 0,
        }
    }
}

/// A scored match and the positions it consumed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Match {
    pub score: i32,
    /// Character offsets into the haystack, ascending.
    pub positions: Vec<u32>,
}

/// Scores `needle` against `haystack`, or `None` when it does not match.
///
/// Case-insensitive subsequence matching: every character of the needle must
/// appear in order, but not adjacently. The score rewards matches that land on
/// segment boundaries and runs that stay together, so `fa` ranks
/// `fleet/agv` above `default/manifest` even though both contain an f and an a.
///
/// A full dynamic program rather than a greedy walk, because greedy takes the
/// first `a` it sees and then has to live with it: against `fleet/agv/07` the
/// query `fa` would consume the `f` of `fleet` and the `a` of `agv` only by
/// luck of ordering, and against `manifest/agv` it would fail outright despite
/// an obvious match. The cost is bounded by the two caps above.
#[must_use]
pub fn score(haystack: &str, needle: &str) -> Option<Match> {
    let query: Vec<char> = needle
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(MAX_QUERY)
        .flat_map(char::to_lowercase)
        .collect();
    if query.is_empty() {
        return None;
    }

    let hay: Vec<char> = haystack.chars().take(MAX_HAYSTACK).collect();
    let folded: Vec<char> = hay.iter().flat_map(|c| c.to_lowercase()).collect();
    // Folding can change length for a handful of code points; when it does,
    // positions would no longer index the original label, so fall back to the
    // unfolded characters rather than report offsets that are subtly wrong.
    let folded = if folded.len() == hay.len() {
        folded
    } else {
        hay.clone()
    };

    if !is_subsequence(&folded, &query) {
        return None;
    }

    solve(&hay, &folded, &query)
}

/// Cheap reject before the quadratic pass.
///
/// Most candidates fail, and failing them in one linear scan is the difference
/// between a palette that keeps up with typing on a large key space and one
/// that does not.
fn is_subsequence(hay: &[char], query: &[char]) -> bool {
    let mut wanted = query.iter();
    let mut next = wanted.next();
    for candidate in hay {
        if Some(candidate) == next {
            next = wanted.next();
            if next.is_none() {
                return true;
            }
        }
    }
    next.is_none()
}

/// True when `hay[index]` begins a segment.
fn starts_segment(hay: &[char], index: usize) -> bool {
    if index == 0 {
        return true;
    }
    let previous = hay[index - 1];
    matches!(previous, '/' | '-' | '_' | '.' | ':' | '@' | ' ')
        || (previous.is_lowercase() && hay[index].is_uppercase())
}

/// Best alignment of `query` within `hay`, with the path that produced it.
///
/// `dp[i][j]` is the best score for matching `query[..=i]` with `query[i]`
/// landing exactly on `hay[j]`. The running maximum is what keeps this linear
/// in the haystack rather than quadratic: the gap charge is linear in the
/// distance skipped, so `best - GAP * j` can be carried forward instead of
/// re-scanning every earlier column.
fn solve(hay: &[char], folded: &[char], query: &[char]) -> Option<Match> {
    let width = folded.len();
    let height = query.len();
    let mut cells = vec![(UNREACHABLE, 0usize); width * height];

    for i in 0..height {
        let mut running = UNREACHABLE;
        let mut running_at = 0usize;

        for j in 0..width {
            if i > 0 && j > 0 {
                let (previous, _) = cells[(i - 1) * width + (j - 1)];
                if previous > UNREACHABLE {
                    let carried = previous + GAP * i32::try_from(j - 1).unwrap_or(0);
                    if carried > running {
                        running = carried;
                        running_at = j - 1;
                    }
                }
            }

            if folded[j] != query[i] {
                continue;
            }

            let bonus = MATCHED
                + if starts_segment(hay, j) {
                    SEGMENT_START
                } else {
                    0
                }
                + if j == 0 { LEADING } else { 0 };

            if i == 0 {
                cells[j] = (bonus - GAP * i32::try_from(j).unwrap_or(0), 0);
                continue;
            }

            if running <= UNREACHABLE {
                continue;
            }

            // The running maximum already prices the gap; an adjacent match
            // pays no gap and earns the run bonus on top.
            let mut best = running - GAP * i32::try_from(j).unwrap_or(0) + GAP + bonus;
            let mut from = running_at;
            if j > 0 {
                let (previous, _) = cells[(i - 1) * width + (j - 1)];
                if previous > UNREACHABLE {
                    let adjacent = previous + bonus + CONSECUTIVE;
                    if adjacent > best {
                        best = adjacent;
                        from = j - 1;
                    }
                }
            }
            cells[i * width + j] = (best, from);
        }
    }

    let last = (height - 1) * width;
    let (end, &(total, _)) = cells[last..last + width]
        .iter()
        .enumerate()
        .filter(|(_, (value, _))| *value > UNREACHABLE)
        .max_by_key(|(_, (value, _))| *value)?;

    let mut positions = vec![0u32; height];
    let mut column = end;
    for i in (0..height).rev() {
        positions[i] = u32::try_from(column).unwrap_or(0);
        if i > 0 {
            column = cells[i * width + column].1;
        }
    }

    // Also settles the shorter of two otherwise equal matches: `fleet/agv` is a
    // better answer for `fa` than `fleet/agv/07/telemetry/battery`.
    let coverage =
        COVERAGE * i32::try_from(height).unwrap_or(0) / i32::try_from(width).unwrap_or(1);

    Some(Match {
        score: total + coverage,
        positions,
    })
}

/// Ranks nodes against `query`, best first.
///
/// Returns at most `limit` hits and the total number that matched, so the UI
/// can say it is showing eight of forty rather than implying there were eight.
#[must_use]
pub fn search_nodes(nodes: &[NodeSummary], query: &str, limit: usize) -> (Vec<SearchHit>, usize) {
    let mut scored: Vec<(i32, SearchHit)> = nodes
        .iter()
        .filter_map(|node| {
            let label = node.name.clone().unwrap_or_else(|| node.zid.clone());

            // The label is the only string highlights can index into, so a hit
            // that only the zid or the region justified carries none. Silence
            // is the honest answer there; inventing spans would highlight
            // characters this ranking never looked at.
            let on_label = score(&label, query);
            let elsewhere = [Some(node.zid.as_str()), node.region.as_deref()]
                .into_iter()
                .flatten()
                .filter_map(|candidate| score(candidate, query))
                .map(|found| found.score)
                .max();

            let best = on_label
                .as_ref()
                .map(|found| found.score)
                .into_iter()
                .chain(elsewhere)
                .max()?;

            Some((
                best,
                SearchHit {
                    kind: SearchHitKind::Node,
                    detail: node_detail(node),
                    target: node.zid.clone(),
                    highlights: on_label.map(|found| found.positions).unwrap_or_default(),
                    score: best,
                    label,
                },
            ))
        })
        .collect();

    let total = scored.len();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.label.cmp(&b.1.label)));
    (
        scored.into_iter().take(limit).map(|(_, hit)| hit).collect(),
        total,
    )
}

/// Ranks frontend-supplied candidates against `query`, best first.
#[must_use]
pub fn search_candidates(
    candidates: &[SearchCandidate],
    query: &str,
    limit: usize,
) -> (Vec<SearchHit>, usize) {
    let mut scored: Vec<(i32, SearchHit)> = candidates
        .iter()
        .filter_map(|candidate| {
            let found = score(&candidate.label, query)?;
            Some((
                found.score,
                SearchHit {
                    kind: SearchHitKind::Command,
                    label: candidate.label.clone(),
                    detail: candidate.detail.clone(),
                    target: candidate.id.clone(),
                    highlights: found.positions,
                    score: found.score,
                },
            ))
        })
        .collect();

    let total = scored.len();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.label.cmp(&b.1.label)));
    (
        scored.into_iter().take(limit).map(|(_, hit)| hit).collect(),
        total,
    )
}

/// The secondary line for a node: role, region and zid.
fn node_detail(node: &NodeSummary) -> String {
    let kind = match node.kind {
        NodeKind::Router => "router",
        NodeKind::Peer => "peer",
        NodeKind::Client => "client",
    };

    let mut parts = vec![kind.to_owned()];
    if let Some(region) = &node.region {
        parts.push(region.clone());
    }
    // The zid is what makes two identically named nodes tellable apart, so it
    // is always present even when the label already showed it.
    parts.push(short_zid(&node.zid));
    parts.join(" · ")
}

/// A zid abbreviated to something a person can compare at a glance.
fn short_zid(zid: &str) -> String {
    let mut prefix: String = zid.chars().take(8).collect();
    if zid.chars().count() > 8 {
        prefix.push('…');
    }
    prefix
}

#[cfg(test)]
mod tests {
    use super::*;

    fn positions(haystack: &str, needle: &str) -> Vec<u32> {
        score(haystack, needle).expect("expected a match").positions
    }

    #[test]
    fn matches_a_plain_prefix() {
        assert_eq!(positions("fleet", "fle"), vec![0, 1, 2]);
    }

    #[test]
    fn matches_across_segments() {
        // f-a-g are the initials of fleet / agv, which is how the path is read.
        assert_eq!(positions("fleet/agv/07", "fa"), vec![0, 6]);
    }

    #[test]
    fn rejects_out_of_order() {
        assert!(score("fleet/agv", "vga").is_none());
    }

    #[test]
    fn rejects_absent_characters() {
        assert!(score("fleet/agv", "fleetz").is_none());
    }

    #[test]
    fn is_case_insensitive() {
        assert!(score("Fleet/AGV", "fleetagv").is_some());
    }

    #[test]
    fn ignores_whitespace_in_the_query() {
        assert!(score("fleet/agv", "fl agv").is_some());
    }

    #[test]
    fn empty_query_matches_nothing() {
        assert!(score("fleet", "").is_none());
    }

    #[test]
    fn prefers_segment_starts_over_earlier_characters() {
        // Both contain f then a. The one where both land on segment starts wins.
        let boundary = score("fleet/agv", "fa").expect("match").score;
        let buried = score("default/manifest", "fa").expect("match").score;
        assert!(
            boundary > buried,
            "segment starts should outrank buried characters: {boundary} vs {buried}"
        );
    }

    #[test]
    fn prefers_contiguous_runs() {
        let together = score("agv", "agv").expect("match").score;
        let apart = score("a-g-v", "agv").expect("match").score;
        assert!(
            together > apart,
            "a contiguous run should win: {together} vs {apart}"
        );
    }

    #[test]
    fn prefers_the_shorter_of_two_equal_matches() {
        let short = score("fleet/agv", "fa").expect("match").score;
        let long = score("fleet/agv/07/telemetry/battery", "fa")
            .expect("match")
            .score;
        assert!(
            short > long,
            "the shorter key should win: {short} vs {long}"
        );
    }

    #[test]
    fn chooses_the_alignment_a_greedy_walk_would_miss() {
        // A greedy matcher takes the 'a' in "manifest" and then cannot find a
        // 'g' after it. The best alignment uses the later, better 'a'.
        assert_eq!(positions("manifest/agv", "ag"), vec![9, 10]);
    }

    #[test]
    fn positions_index_the_original_string() {
        let label = "Fleet/AGV";
        let found = positions(label, "fagv");
        let characters: Vec<char> = label.chars().collect();
        let matched: String = found
            .iter()
            .map(|index| characters[*index as usize])
            .collect();
        assert_eq!(matched, "FAGV");
    }

    #[test]
    fn caps_a_pathological_query() {
        let query = "a".repeat(MAX_QUERY * 4);
        let haystack = "a".repeat(MAX_HAYSTACK * 4);
        assert!(score(&haystack, &query).is_some());
    }

    fn node(zid: &str, name: Option<&str>, region: Option<&str>) -> NodeSummary {
        NodeSummary {
            zid: zid.to_owned(),
            name: name.map(ToOwned::to_owned),
            kind: NodeKind::Peer,
            locators: Vec::new(),
            is_local: false,
            region: region.map(ToOwned::to_owned),
            metadata: None,
            region_source: None,
            south_regions: 0,
            plugins: Vec::new(),
            stats: None,
            acl: None,
            source: crate::discovery::DiscoverySource::AdminSpace,
        }
    }

    #[test]
    fn ranks_nodes_by_name() {
        let nodes = vec![
            node("aaaa1111", Some("agv-11"), Some("edge")),
            node("bbbb2222", Some("agv-07"), Some("edge")),
        ];
        let (hits, total) = search_nodes(&nodes, "agv07", 10);
        assert_eq!(total, 1);
        assert_eq!(hits[0].label, "agv-07");
        assert_eq!(hits[0].target, "bbbb2222");
    }

    #[test]
    fn finds_a_node_by_zid_without_inventing_highlights() {
        let nodes = vec![node("690fd749abc", Some("agv-07"), None)];
        let (hits, _) = search_nodes(&nodes, "690fd", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].label, "agv-07");
        assert!(
            hits[0].highlights.is_empty(),
            "the zid matched, not the label, so nothing in the label may be marked"
        );
    }

    #[test]
    fn finds_a_node_by_region() {
        let nodes = vec![node("aaaa1111", Some("agv-11"), Some("edge-fleet"))];
        let (hits, _) = search_nodes(&nodes, "edgefleet", 10);
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn reports_the_total_rather_than_the_returned_count() {
        let nodes: Vec<NodeSummary> = (0..40)
            .map(|index| {
                node(
                    &format!("zid{index:04}"),
                    Some(&format!("agv-{index:02}")),
                    None,
                )
            })
            .collect();
        let (hits, total) = search_nodes(&nodes, "agv", 8);
        assert_eq!(hits.len(), 8);
        assert_eq!(total, 40);
    }

    #[test]
    fn ranks_commands_and_returns_their_ids() {
        let candidates = vec![
            SearchCandidate {
                id: "view:topology".to_owned(),
                label: "Go to Topology".to_owned(),
                detail: String::new(),
            },
            SearchCandidate {
                id: "connect".to_owned(),
                label: "Connect to a network".to_owned(),
                detail: String::new(),
            },
        ];

        let (hits, total) = search_candidates(&candidates, "conn", 10);
        assert_eq!(total, 1);
        assert_eq!(hits[0].target, "connect");
        assert_eq!(hits[0].kind, SearchHitKind::Command);
    }

    #[test]
    fn node_detail_names_the_role_and_shortens_the_zid() {
        let detail = node_detail(&node("690fd749deadbeef", Some("agv-07"), Some("edge")));
        assert_eq!(detail, "peer · edge · 690fd749…");
    }

    #[test]
    fn node_detail_omits_an_unknown_region() {
        let detail = node_detail(&node("690fd749deadbeef", Some("agv-07"), None));
        assert_eq!(detail, "peer · 690fd749…");
    }
}
