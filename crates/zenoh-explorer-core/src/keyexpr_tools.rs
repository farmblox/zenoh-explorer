//! Key-expression analysis, exposed so the UI can answer "does this match?"
//! without guessing at Zenoh's semantics.
//!
//! Every judgement here comes from `zenoh-keyexpr` itself, not a reimplemented
//! glob matcher. That matters: the rules have corners (`**` matching zero
//! chunks, `$*` matching within a chunk, canonicalisation rewriting `**/*` to
//! `*/**`) and a second implementation would eventually disagree with the
//! router — which is precisely the bug this view exists to prevent.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::key_expr::{OwnedKeyExpr, SetIntersectionLevel};

/// How two key expressions relate as sets of keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Relation {
    /// No key matches both.
    Disjoint,
    /// Some keys match both, neither contains the other.
    Intersects,
    /// The left expression matches every key the right one does, and more.
    Includes,
    /// The two expressions denote exactly the same set of keys.
    Equals,
}

impl From<SetIntersectionLevel> for Relation {
    fn from(value: SetIntersectionLevel) -> Self {
        match value {
            SetIntersectionLevel::Disjoint => Self::Disjoint,
            SetIntersectionLevel::Intersects => Self::Intersects,
            SetIntersectionLevel::Includes => Self::Includes,
            SetIntersectionLevel::Equals => Self::Equals,
        }
    }
}

/// The result of analysing one expression on its own.
///
/// Several independent booleans, which `clippy::struct_excessive_bools` would
/// normally flag. They stay flat because this is a wire type: the frontend
/// reads each flag on its own, and grouping them into an enum would only move
/// the branching into TypeScript.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct KeyExprAnalysis {
    /// The input, unchanged.
    pub input: String,
    /// `true` when the input parses as a key expression at all.
    pub valid: bool,
    /// Why it does not parse, when it does not.
    pub error: Option<String>,
    /// The canonical form. Equal to `input` when it was already canonical.
    pub canonical: Option<String>,
    /// `true` when the input was already in canonical form.
    pub is_canonical: bool,
    /// `true` when the expression contains any wildcard.
    pub has_wildcards: bool,
    /// `true` when it uses `$*`, which is matched more slowly than `*`.
    pub uses_sub_chunk_wildcard: bool,
    /// Number of `/`-separated chunks.
    pub chunk_count: usize,
}

/// One row of the match tester: how a candidate key relates to the expression.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MatchResult {
    /// The candidate that was tested.
    pub candidate: String,
    /// Whether the expression matches it.
    pub matches: bool,
    /// The precise set relation, when the candidate is itself a valid expression.
    pub relation: Option<Relation>,
    /// Why the candidate could not be tested, when it could not.
    pub error: Option<String>,
}

/// Analyses one key expression.
#[must_use]
pub fn analyse(input: &str) -> KeyExprAnalysis {
    let mut analysis = KeyExprAnalysis {
        input: input.to_owned(),
        valid: false,
        error: None,
        canonical: None,
        is_canonical: false,
        has_wildcards: input.contains('*'),
        uses_sub_chunk_wildcard: input.contains("$*"),
        chunk_count: input.split('/').filter(|c| !c.is_empty()).count(),
    };

    match OwnedKeyExpr::new(input.to_owned()) {
        Ok(_) => {
            analysis.valid = true;
            analysis.is_canonical = true;
            analysis.canonical = Some(input.to_owned());
        }
        Err(err) => {
            // A non-canonical expression is still meaningful; report the
            // canonical rewrite rather than treating it as garbage.
            match OwnedKeyExpr::autocanonize(input.to_owned()) {
                Ok(canonical) => {
                    analysis.valid = true;
                    analysis.is_canonical = false;
                    analysis.canonical = Some(canonical.as_str().to_owned());
                }
                Err(_) => analysis.error = Some(err.to_string()),
            }
        }
    }

    analysis
}

/// Tests `expr` against each candidate.
///
/// Candidates are usually concrete keys, but expressions are accepted too — the
/// `relation` field then describes the full set relationship.
#[must_use]
pub fn test_matches(expr: &str, candidates: &[String]) -> Vec<MatchResult> {
    let parsed = parse_lenient(expr);

    candidates
        .iter()
        .map(|candidate| match (&parsed, parse_lenient(candidate)) {
            (Some(left), Some(right)) => MatchResult {
                candidate: candidate.clone(),
                matches: left.intersects(&right),
                relation: Some(left.relation_to(&right).into()),
                error: None,
            },
            (None, _) => MatchResult {
                candidate: candidate.clone(),
                matches: false,
                relation: None,
                error: Some("the key expression is not valid".to_owned()),
            },
            (_, None) => MatchResult {
                candidate: candidate.clone(),
                matches: false,
                relation: None,
                error: Some("this candidate is not a valid key expression".to_owned()),
            },
        })
        .collect()
}

/// Parses an expression, canonicalising it first if needed.
fn parse_lenient(input: &str) -> Option<OwnedKeyExpr> {
    OwnedKeyExpr::new(input.to_owned())
        .or_else(|_| OwnedKeyExpr::autocanonize(input.to_owned()))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidates(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn a_single_star_matches_exactly_one_chunk() {
        let results = test_matches(
            "fleet/*/telemetry",
            &candidates(&[
                "fleet/agv/telemetry",
                "fleet/telemetry",
                "fleet/a/b/telemetry",
            ]),
        );
        assert!(results[0].matches, "one chunk must match");
        assert!(!results[1].matches, "zero chunks must not match");
        assert!(!results[2].matches, "two chunks must not match");
    }

    #[test]
    fn double_star_matches_zero_or_more_chunks() {
        let results = test_matches(
            "fleet/**/telemetry",
            &candidates(&[
                "fleet/telemetry",
                "fleet/a/telemetry",
                "fleet/a/b/telemetry",
            ]),
        );
        assert!(results.iter().all(|r| r.matches), "{results:?}");
    }

    #[test]
    fn sub_chunk_wildcard_matches_within_a_chunk() {
        let results = test_matches(
            "thermo$*/temp",
            &candidates(&["thermo_1/temp", "thermo/temp"]),
        );
        assert!(results[0].matches);
        assert!(results[1].matches);
    }

    #[test]
    fn relations_are_reported_precisely() {
        let inclusive = test_matches("fleet/**", &candidates(&["fleet/agv/07"]));
        assert_eq!(inclusive[0].relation, Some(Relation::Includes));

        let equal = test_matches("fleet/agv", &candidates(&["fleet/agv"]));
        assert_eq!(equal[0].relation, Some(Relation::Equals));

        let disjoint = test_matches("fleet/**", &candidates(&["infra/router"]));
        assert_eq!(disjoint[0].relation, Some(Relation::Disjoint));
        assert!(!disjoint[0].matches);

        let overlapping = test_matches("*/agv", &candidates(&["fleet/*"]));
        assert_eq!(overlapping[0].relation, Some(Relation::Intersects));
    }

    #[test]
    fn non_canonical_input_is_accepted_and_rewritten() {
        // Zenoh canonicalises `**/*` to `*/**`; the tester should say so
        // rather than rejecting the expression.
        let analysis = analyse("fleet/**/*");
        assert!(analysis.valid);
        assert!(!analysis.is_canonical);
        assert_eq!(analysis.canonical.as_deref(), Some("fleet/*/**"));
    }

    #[test]
    fn canonical_input_is_reported_as_canonical() {
        let analysis = analyse("fleet/*/**");
        assert!(analysis.valid);
        assert!(analysis.is_canonical);
        assert_eq!(analysis.canonical.as_deref(), Some("fleet/*/**"));
    }

    #[test]
    fn analysis_flags_the_slow_wildcard() {
        assert!(analyse("thermo$*/temp").uses_sub_chunk_wildcard);
        assert!(!analyse("thermo/*/temp").uses_sub_chunk_wildcard);
    }

    #[test]
    fn genuinely_invalid_input_is_rejected_with_a_reason() {
        // `?` is not permitted in a key expression.
        let analysis = analyse("fleet/?");
        assert!(!analysis.valid);
        assert!(analysis.error.is_some());
        assert!(analysis.canonical.is_none());
    }

    #[test]
    fn chunk_counting_ignores_empty_segments() {
        assert_eq!(analyse("a/b/c").chunk_count, 3);
        assert_eq!(analyse("/a//b/").chunk_count, 2);
    }

    #[test]
    fn an_invalid_expression_fails_every_candidate_without_panicking() {
        let results = test_matches("fleet/?", &candidates(&["fleet/a", "fleet/b"]));
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| !r.matches && r.error.is_some()));
    }
}
