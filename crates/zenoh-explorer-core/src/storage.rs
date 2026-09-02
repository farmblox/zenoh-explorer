//! Storages: where the network keeps data, and whether a key lands in one.
//!
//! A storage is a queryable and a subscriber at once. It subscribes to a key
//! expression, keeps what arrives, and answers queries for it later. That makes
//! it the difference between a key whose value can be read back and one that
//! existed only while somebody was listening — and nothing else on the network
//! tells you which of those you are looking at.
//!
//! Read from each node's configuration rather than from
//! `status/plugins/storage_manager/**`. Both describe the same storages, but the
//! configuration schema is documented and the status one is explicitly not
//! ("TODO: this part hasn't been redocumented yet"), and the topology probe
//! already fetches the configuration — so this costs no extra query on a
//! network where every wildcard admin query runs to its full timeout.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::keyexpr_tools::{self, Relation};

/// One storage configured on one node.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorageSummary {
    /// The node holding the storage.
    pub zid: String,
    /// Its name in that node's configuration. Unique per node, not per network.
    pub name: String,
    /// What it stores.
    pub key_expr: String,
    /// A prefix stripped from keys before they are written to the volume.
    pub strip_prefix: Option<String>,
    /// The volume it stores into.
    pub volume: String,
    /// `true` when that volume is Zenoh's built-in in-RAM one.
    ///
    /// Worth saying out loud: the memory volume is not persistent across a
    /// restart of the node, so a key covered only by one is durable exactly
    /// until somebody restarts something.
    pub in_memory: bool,
}

/// How a storage relates to a key expression somebody asked about.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorageCoverage {
    pub storage: StorageSummary,
    /// How the storage's expression relates to the one asked about.
    ///
    /// The distinction matters: `Includes` means everything asked about is
    /// stored, while `Intersects` means only part of it is — which reads as
    /// "this data is durable" right up until the half that is not goes missing.
    pub relation: Option<Relation>,
}

/// Every storage that would catch any part of `key_expr`.
///
/// Ordered widest first, so the storage that covers the most appears at the top.
///
/// The relation is measured from the STORAGE to the question, not the other way
/// round. That direction is the whole point: `Includes` then means the storage
/// keeps everything that was asked about, and `Intersects` means it keeps only
/// part — which is the difference between "this is durable" and "half of this
/// is durable and you will find out which half later".
#[must_use]
pub fn coverage(storages: &[StorageSummary], key_expr: &str) -> Vec<StorageCoverage> {
    let question = vec![key_expr.to_owned()];

    let mut out: Vec<StorageCoverage> = storages
        .iter()
        .filter_map(|storage| {
            let result = keyexpr_tools::test_matches(&storage.key_expr, &question)
                .into_iter()
                .next()?;
            if !result.matches {
                return None;
            }
            Some(StorageCoverage {
                storage: storage.clone(),
                relation: result.relation,
            })
        })
        .collect();

    out.sort_by_key(|found| match found.relation {
        Some(Relation::Includes) => 0,
        Some(Relation::Equals) => 1,
        Some(Relation::Intersects) => 2,
        _ => 3,
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn storage(name: &str, key_expr: &str, volume: &str) -> StorageSummary {
        StorageSummary {
            zid: "aaaa".to_owned(),
            name: name.to_owned(),
            key_expr: key_expr.to_owned(),
            strip_prefix: None,
            volume: volume.to_owned(),
            in_memory: volume == "memory",
        }
    }

    #[test]
    fn finds_a_storage_that_covers_the_key() {
        let storages = vec![storage("demo", "demo/example/**", "memory")];
        let found = coverage(&storages, "demo/example/temperature");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].relation, Some(Relation::Includes));
        assert!(found[0].storage.in_memory);
    }

    #[test]
    fn ignores_a_storage_that_covers_nothing_asked_about() {
        let storages = vec![storage("demo", "demo/**", "memory")];
        assert!(coverage(&storages, "fleet/agv/07").is_empty());
    }

    #[test]
    fn reports_partial_coverage_as_intersecting() {
        // The storage keeps `fleet/*/battery`; the question is `fleet/**`. Some
        // of what was asked about is stored and most of it is not.
        let storages = vec![storage("part", "fleet/*/battery", "rocksdb")];
        let found = coverage(&storages, "fleet/**");
        assert_eq!(found[0].relation, Some(Relation::Intersects));
        assert!(!found[0].storage.in_memory);
    }

    #[test]
    fn the_widest_storage_comes_first() {
        let storages = vec![
            storage("narrow", "fleet/agv/07/battery", "memory"),
            storage("wide", "fleet/**", "memory"),
        ];
        let found = coverage(&storages, "fleet/agv/07/battery");
        assert_eq!(found[0].storage.name, "wide");
        assert_eq!(found[0].relation, Some(Relation::Includes));
    }

    #[test]
    fn an_exactly_equal_storage_is_reported_as_equal() {
        let storages = vec![storage("demo", "demo/**", "memory")];
        let found = coverage(&storages, "demo/**");
        assert_eq!(found[0].relation, Some(Relation::Equals));
    }
}
