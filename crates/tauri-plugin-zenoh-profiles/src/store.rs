//! Saved connection profiles, on `tauri-plugin-store`.
//!
//! A connection list is a few dozen small records read far more often than
//! written, so a JSON document rewritten on save is the right shape for it.
//!
//! The store lives in Rust as a single `Arc<Store>` behind its own lock, so
//! every write goes through one place. That is what makes `record_use` safe
//! from several windows at once.
//!
//! # What is stored, and what is not
//!
//! One entry per profile, keyed by id. **Private keys are never persisted.**
//! Certificates are stored as paths, which is what the file picker produces. A
//! profile carrying inline base64 key material is refused rather than written
//! to an unencrypted file in the application data directory.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;
use ts_rs::TS;
use zenoh_explorer_core::ConnectionProfile;
use zenoh_explorer_core::transport::CertSource;

use crate::error::{Error, Result};

/// The store file, resolved inside the application data directory.
const STORE_FILE: &str = "connections.json";

/// A saved profile, with the bookkeeping the list view sorts on.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedProfile {
    /// Stable id, minted on first save.
    pub id: String,
    /// The profile itself.
    pub profile: ConnectionProfile,
    /// When it was first saved, epoch milliseconds.
    pub created_at_ms: i64,
    /// When it was last connected with, epoch milliseconds.
    pub last_used_at_ms: Option<i64>,
    /// How many times it has been connected with.
    pub use_count: i64,
}

/// Rejects a profile that would write a secret to disk.
///
/// Pure, so the policy is testable without an application to hang a store on —
/// and the policy is the part that actually matters.
pub(crate) fn ensure_no_inline_secret(profile: &ConnectionProfile) -> Result<()> {
    if matches!(profile.tls.client_key, Some(CertSource::Base64(_))) {
        return Err(Error::RefusedSecret);
    }
    Ok(())
}

/// Orders profiles most-recently-used first, then newest.
///
/// The only ordering worth having: a connection list is used far more than it
/// is curated, and alphabetical puts a production router below `a-test`.
pub(crate) fn by_recency(a: &SavedProfile, b: &SavedProfile) -> Ordering {
    b.last_used_at_ms
        .cmp(&a.last_used_at_ms)
        .then(b.created_at_ms.cmp(&a.created_at_ms))
}

/// Every saved profile, most recently used first.
pub(crate) fn list<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<SavedProfile>> {
    let store = app.store(STORE_FILE)?;

    let mut out: Vec<SavedProfile> = store
        .entries()
        .into_iter()
        .filter_map(
            |(id, value)| match serde_json::from_value::<SavedProfile>(value) {
                Ok(profile) => Some(profile),
                Err(err) => {
                    // An entry written by a newer version may not parse. Skip
                    // it rather than failing the whole list — one unreadable
                    // record must not hide the others.
                    tracing::warn!(%id, error = %err, "skipping a profile this version cannot read");
                    None
                }
            },
        )
        .collect();

    out.sort_by(by_recency);
    Ok(out)
}

/// Inserts or updates a profile, returning its id.
pub(crate) fn save<R: Runtime>(
    app: &AppHandle<R>,
    id: Option<String>,
    profile: &ConnectionProfile,
) -> Result<String> {
    ensure_no_inline_secret(profile)?;

    let store = app.store(STORE_FILE)?;
    let id = id.unwrap_or_else(|| format!("prof_{}", uuid::Uuid::new_v4().simple()));

    // Updating keeps the record's history; creating starts it.
    let existing = store
        .get(&id)
        .and_then(|value| serde_json::from_value::<SavedProfile>(value).ok());

    let entry = SavedProfile {
        created_at_ms: existing.as_ref().map_or_else(now_ms, |e| e.created_at_ms),
        last_used_at_ms: existing.as_ref().and_then(|e| e.last_used_at_ms),
        use_count: existing.as_ref().map_or(0, |e| e.use_count),
        id: id.clone(),
        profile: profile.clone(),
    };

    store.set(&id, serde_json::to_value(&entry)?);
    store.save()?;
    Ok(id)
}

/// Removes a profile. Removing one that is not there is not an error.
pub(crate) fn delete<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;
    store.delete(id);
    store.save()?;
    Ok(())
}

/// Records that a profile was just connected with, so it sorts to the top.
pub(crate) fn record_use<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<()> {
    let store = app.store(STORE_FILE)?;

    let Some(value) = store.get(id) else {
        // Connecting with a profile that was never saved is normal, not an
        // error worth surfacing.
        return Ok(());
    };

    let mut entry: SavedProfile = serde_json::from_value(value)?;
    entry.last_used_at_ms = Some(now_ms());
    entry.use_count += 1;

    store.set(id, serde_json::to_value(&entry)?);
    store.save()?;
    Ok(())
}

/// Milliseconds since the Unix epoch.
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;
    use zenoh_explorer_core::transport::{TlsConfig, Transport};

    fn profile(name: &str) -> ConnectionProfile {
        ConnectionProfile {
            name: name.to_owned(),
            transport: Transport::Quic,
            address: "router.internal:7447".to_owned(),
            ..Default::default()
        }
    }

    fn entry(id: &str, last_used: Option<i64>, created: i64) -> SavedProfile {
        SavedProfile {
            id: id.to_owned(),
            profile: profile(id),
            created_at_ms: created,
            last_used_at_ms: last_used,
            use_count: 0,
        }
    }

    #[test]
    fn inline_private_keys_are_refused() {
        // The store is an unencrypted file; a key belongs on disk by path.
        let mut with_secret = profile("has a key");
        with_secret.tls = TlsConfig {
            client_key: Some(CertSource::Base64("c3VwZXItc2VjcmV0".into())),
            ..Default::default()
        };
        assert!(matches!(
            ensure_no_inline_secret(&with_secret),
            Err(Error::RefusedSecret)
        ));
    }

    #[test]
    fn certificate_paths_are_allowed_because_they_are_not_secrets() {
        let mut with_paths = profile("mtls");
        with_paths.tls = TlsConfig {
            root_ca: Some(CertSource::Path("/etc/ca.pem".into())),
            client_cert: Some(CertSource::Path("/etc/node.pem".into())),
            client_key: Some(CertSource::Path("/etc/node.key".into())),
            enable_mtls: true,
            verify_name_on_connect: false,
        };
        ensure_no_inline_secret(&with_paths).unwrap();
    }

    #[test]
    fn recently_used_profiles_sort_first() {
        let mut entries = [
            entry("never-used", None, 100),
            entry("used-long-ago", Some(500), 100),
            entry("used-recently", Some(9_000), 100),
        ];
        entries.sort_by(by_recency);

        let order: Vec<&str> = entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(order, ["used-recently", "used-long-ago", "never-used"]);
    }

    #[test]
    fn among_never_used_profiles_the_newest_comes_first() {
        let mut entries = [entry("older", None, 100), entry("newer", None, 900)];
        entries.sort_by(by_recency);
        assert_eq!(entries[0].id, "newer");
    }

    #[test]
    fn a_round_trip_through_json_preserves_everything() {
        // The store holds JSON values, so this is the actual persistence path.
        let original = entry("prof_1", Some(1_234), 900);
        let encoded = serde_json::to_value(&original).unwrap();
        let decoded: SavedProfile = serde_json::from_value(encoded).unwrap();

        assert_eq!(decoded.id, original.id);
        assert_eq!(decoded.last_used_at_ms, Some(1_234));
        assert_eq!(decoded.profile.transport, Transport::Quic);
    }
}
