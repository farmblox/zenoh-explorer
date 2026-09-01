//! Connection behaviour: timeouts, retry, and what `open` waits for.
//!
//! These map one-for-one onto Zenoh's `connect`, `scouting` and `open` config
//! blocks. Every field here exists in `zenoh-config`; nothing is invented, and
//! the defaults match Zenoh's own so a profile that sets nothing behaves
//! exactly as a default session would.
//!
//! One deliberate difference: `exit_on_failure` is forced to `false` and is not
//! offered. It terminates the process when a connection times out, which is
//! reasonable for a daemon and catastrophic for a GUI — the explorer must show
//! a failed connection, not vanish.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How Zenoh should retry a connection that will not come up.
///
/// The period grows geometrically from `period_init_ms` towards
/// `period_max_ms`, multiplied by `period_increase_factor` each attempt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RetryConfig {
    /// Delay before the first retry.
    pub period_init_ms: u64,
    /// Ceiling the delay grows to.
    pub period_max_ms: u64,
    /// Multiplier applied to the delay after each failed attempt.
    pub period_increase_factor: f64,
}

impl Default for RetryConfig {
    /// Zenoh's own defaults: start at 1s, back off to 5s, doubling.
    fn default() -> Self {
        Self {
            period_init_ms: 1_000,
            period_max_ms: 5_000,
            period_increase_factor: 2.0,
        }
    }
}

/// What `zenoh::open` waits for before it returns.
///
/// Both default to `true` in Zenoh. Turning them off makes `open` return sooner
/// at the cost of possibly missing the first publications — which for an
/// explorer is the wrong trade, so the defaults stand unless asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OpenConditions {
    /// Wait to connect to scouted peers and routers before returning.
    pub connect_scouted: bool,
    /// Wait for initial declarations from connected peers before returning.
    pub declares: bool,
}

impl Default for OpenConditions {
    fn default() -> Self {
        Self {
            connect_scouted: true,
            declares: true,
        }
    }
}

/// Everything about *how* the explorer connects, as opposed to where.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionOptions {
    /// Budget for the whole connect cycle. `None` leaves Zenoh's default.
    #[serde(default)]
    pub connect_timeout_ms: Option<u64>,

    /// Retry policy. `None` leaves Zenoh's default backoff.
    #[serde(default)]
    pub retry: Option<RetryConfig>,

    /// In client mode, how long to scout for a router before giving up.
    #[serde(default)]
    pub scouting_timeout_ms: Option<u64>,

    /// In peer mode, how long to scout for peers before doing anything else.
    #[serde(default)]
    pub scouting_delay_ms: Option<u64>,

    /// Multicast scouting address. Zenoh uses `224.0.0.224:7446` by default.
    #[serde(default)]
    pub multicast_address: Option<String>,

    /// Network interface to scout on. Zenoh picks one when unset.
    #[serde(default)]
    pub multicast_interface: Option<String>,

    /// TTL on scout packets. 1 keeps them on the local segment.
    #[serde(default)]
    pub multicast_ttl: Option<u32>,

    /// Answer other nodes' scouts. Off makes the explorer invisible to
    /// discovery, which is often what you want from an observer.
    #[serde(default)]
    pub multicast_listen: Option<bool>,

    /// What `open` blocks on.
    #[serde(default)]
    pub open: OpenConditions,
}

impl Default for ConnectionOptions {
    fn default() -> Self {
        Self {
            connect_timeout_ms: None,
            retry: None,
            scouting_timeout_ms: None,
            scouting_delay_ms: None,
            multicast_address: None,
            multicast_interface: None,
            multicast_ttl: None,
            // An explorer should not advertise itself to everything on the
            // segment. It is here to watch, and answering scouts makes it a
            // discovery target for every other node.
            multicast_listen: Some(false),
            open: OpenConditions::default(),
        }
    }
}

impl ConnectionOptions {
    /// Emits the config entries these describe, as `(key, json_value)` pairs.
    ///
    /// Only fields that were actually set are emitted, so an untouched profile
    /// produces a session identical to Zenoh's default.
    #[must_use]
    pub fn config_entries(&self) -> Vec<(String, String)> {
        let mut out: Vec<(String, String)> = Vec::new();

        let mut push = |key: &str, value: String| out.push((key.to_owned(), value));

        if let Some(ms) = self.connect_timeout_ms {
            push("connect/timeout_ms", ms.to_string());
        }

        // Never true. It calls `std::process::exit` on a failed connect, which
        // in a GUI means the window disappears while the user is reading the
        // error that caused it.
        push("connect/exit_on_failure", "false".to_owned());

        if let Some(retry) = &self.retry {
            // A backoff is inert without a non-zero global connect timeout.
            //
            // Zenoh reads `connect/timeout_ms` before it reads the backoff, and
            // takes a "connect once, do not retry" path when it is zero. That
            // default is MODE-DEPENDENT: -1 for a router or peer, but 0 for a
            // client — which is how this explorer connects by default. So
            // asking for a backoff in client mode configured something Zenoh
            // then declined to consult.
            //
            // -1 is "keep trying", the same value a peer gets. An explicit
            // timeout wins: it is set below and this leaves it alone.
            if self.connect_timeout_ms.is_none() {
                push("connect/timeout_ms", "-1".to_owned());
            }

            // The whole object in one write, not three nested keys.
            // `connect.retry` is `Option` in Zenoh's schema, and `insert_json5`
            // resolves a path against what already exists rather than creating
            // it — so writing `connect/retry/period_init_ms` into a config
            // where `retry` is unset is rejected with "unknown key". Every
            // other nested block we touch (`scouting/multicast`,
            // `transport/link/tls`) derives Default and is always present,
            // which is why this is the only one that needs it.
            push(
                "connect/retry",
                format!(
                    "{{ period_init_ms: {}, period_max_ms: {}, period_increase_factor: {} }}",
                    retry.period_init_ms, retry.period_max_ms, retry.period_increase_factor
                ),
            );
        }

        if let Some(ms) = self.scouting_timeout_ms {
            push("scouting/timeout", ms.to_string());
        }
        if let Some(ms) = self.scouting_delay_ms {
            push("scouting/delay", ms.to_string());
        }
        if let Some(address) = &self.multicast_address {
            push("scouting/multicast/address", json_string(address));
        }
        if let Some(interface) = &self.multicast_interface {
            push("scouting/multicast/interface", json_string(interface));
        }
        if let Some(ttl) = self.multicast_ttl {
            push("scouting/multicast/ttl", ttl.to_string());
        }
        if let Some(listen) = self.multicast_listen {
            push("scouting/multicast/listen", listen.to_string());
        }

        push(
            "open/return_conditions/connect_scouted",
            self.open.connect_scouted.to_string(),
        );
        push(
            "open/return_conditions/declares",
            self.open.declares.to_string(),
        );

        out
    }
}

/// Renders a `&str` as a JSON string literal.
fn json_string(value: &str) -> String {
    serde_json::Value::String(value.to_owned()).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(options: &ConnectionOptions) -> std::collections::HashMap<String, String> {
        options.config_entries().into_iter().collect()
    }

    #[test]
    fn an_untouched_profile_sets_only_the_safety_rails() {
        let map = entries(&ConnectionOptions::default());
        // Never exits the process on a failed connect.
        assert_eq!(map["connect/exit_on_failure"], "false");
        // Does not advertise itself to other nodes' scouts.
        assert_eq!(map["scouting/multicast/listen"], "false");
        // Leaves Zenoh's own timing alone.
        assert!(!map.contains_key("connect/timeout_ms"));
        assert!(!map.contains_key("connect/retry"));
    }

    /// Asking for a backoff also opens the window Zenoh needs to use it.
    ///
    /// `connect/timeout_ms` defaults to 0 in client mode, and Zenoh treats a
    /// zero global timeout as "connect once, do not retry" — so the backoff
    /// would be configured and then ignored, which is exactly how it behaved.
    #[test]
    fn retry_sets_a_connect_timeout_so_the_backoff_is_used() {
        let options = ConnectionOptions {
            retry: Some(RetryConfig::default()),
            ..Default::default()
        };
        assert_eq!(entries(&options)["connect/timeout_ms"], "-1");
    }

    /// An explicit timeout is the user's, and outranks the one retry implies.
    #[test]
    fn an_explicit_connect_timeout_wins_over_the_retry_default() {
        let options = ConnectionOptions {
            retry: Some(RetryConfig::default()),
            connect_timeout_ms: Some(2_500),
            ..Default::default()
        };
        assert_eq!(entries(&options)["connect/timeout_ms"], "2500");
    }

    /// The backoff goes in as ONE object.
    ///
    /// `connect.retry` is `Option` in Zenoh's schema and `insert_json5`
    /// resolves against what exists, so the three keys written separately are
    /// rejected with "unknown key". `config.rs` has the test that proves Zenoh
    /// accepts what this produces; this one pins the shape.
    #[test]
    fn retry_emits_the_backoff_as_a_single_object() {
        let options = ConnectionOptions {
            retry: Some(RetryConfig::default()),
            ..Default::default()
        };
        let map = entries(&options);
        assert_eq!(
            map["connect/retry"],
            "{ period_init_ms: 1000, period_max_ms: 5000, period_increase_factor: 2 }"
        );
        assert!(!map.contains_key("connect/retry/period_init_ms"));
    }

    #[test]
    fn timeouts_reach_their_zenoh_keys() {
        let options = ConnectionOptions {
            connect_timeout_ms: Some(3_000),
            scouting_timeout_ms: Some(1_500),
            scouting_delay_ms: Some(250),
            ..Default::default()
        };
        let map = entries(&options);
        assert_eq!(map["connect/timeout_ms"], "3000");
        assert_eq!(map["scouting/timeout"], "1500");
        assert_eq!(map["scouting/delay"], "250");
    }

    #[test]
    fn open_conditions_are_always_stated() {
        // Explicit rather than implied: someone reading the generated config
        // should be able to see what open will block on.
        let map = entries(&ConnectionOptions::default());
        assert_eq!(map["open/return_conditions/connect_scouted"], "true");
        assert_eq!(map["open/return_conditions/declares"], "true");
    }

    #[test]
    fn multicast_details_are_quoted_as_json_strings() {
        let options = ConnectionOptions {
            multicast_address: Some("224.0.0.224:7446".into()),
            multicast_interface: Some("en0".into()),
            multicast_ttl: Some(4),
            ..Default::default()
        };
        let map = entries(&options);
        assert_eq!(map["scouting/multicast/address"], "\"224.0.0.224:7446\"");
        assert_eq!(map["scouting/multicast/interface"], "\"en0\"");
        assert_eq!(map["scouting/multicast/ttl"], "4");
    }
}
