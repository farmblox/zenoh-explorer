//! Wall-clock helpers. Isolated so the rest of the crate never reaches for
//! `SystemTime` directly.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch.
///
/// Saturates at zero rather than panicking if the system clock is set before
/// 1970 — a wrong timestamp on a table row is not worth taking the app down.
#[must_use]
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}
