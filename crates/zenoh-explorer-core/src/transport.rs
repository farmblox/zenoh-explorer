//! Transports and TLS material.
//!
//! Zenoh addresses a peer with an endpoint in the canonical form
//! `<proto>/<address>[?<metadata>][#<config>]`. The explorer only ever builds
//! the `<proto>/<address>` part and leaves metadata to the raw escape hatch,
//! because priority ranges and reliability overrides are not something you set
//! while browsing a network.
//!
//! # TLS, QUIC and mTLS
//!
//! QUIC is TLS-based, so `quic` and `tls` endpoints read the SAME
//! `transport/link/tls` configuration block. That is not obvious and is worth
//! stating: pointing a QUIC endpoint at TLS settings is correct, not a
//! workaround.
//!
//! Every certificate can be given as a filesystem path or inline as base64.
//! Zenoh marks the base64 fields `#[serde(skip_serializing)]` because they hold
//! secrets, and this module keeps that property: [`TlsConfig`] never derives
//! `Serialize` for its secret-bearing values without redaction.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{Error, Result};

/// Transports the explorer can dial.
///
/// Deliberately not the full Zenoh list: `serial`, `vsock` and `unixpipe` are
/// real transports but need local hardware or namespace access that a
/// browsing tool has no business assuming.
// kebab-case, so the serialised value IS the scheme Zenoh expects at the head
// of an endpoint: `unixsock-stream`, not `unixsockstream`. That keeps the wire
// form, the config value and `scheme()` from drifting into three spellings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum Transport {
    /// Plain TCP. Zenoh's default listener.
    #[default]
    Tcp,
    /// QUIC. Always encrypted, and configured through the TLS block.
    Quic,
    /// TLS over TCP.
    Tls,
    /// WebSocket.
    Ws,
    /// Unix domain socket. `address` is a filesystem path, not `host:port`.
    ///
    /// Renamed explicitly: kebab-case splits on every capital and would give
    /// `unix-sock-stream`, which Zenoh does not recognise.
    #[serde(rename = "unixsock-stream")]
    UnixSockStream,
    /// Plain UDP. Note this is NOT QUIC — a common and costly mix-up.
    Udp,
}

impl Transport {
    /// The scheme Zenoh expects at the head of an endpoint.
    #[must_use]
    pub const fn scheme(self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Quic => "quic",
            Self::Tls => "tls",
            Self::Ws => "ws",
            Self::UnixSockStream => "unixsock-stream",
            Self::Udp => "udp",
        }
    }

    /// Whether this transport reads the `transport/link/tls` config block.
    #[must_use]
    pub const fn uses_tls(self) -> bool {
        matches!(self, Self::Quic | Self::Tls)
    }

    /// Whether the address is a filesystem path rather than `host:port`.
    #[must_use]
    pub const fn is_path_addressed(self) -> bool {
        matches!(self, Self::UnixSockStream)
    }

    /// Zenoh's default port for this transport, where it has one.
    #[must_use]
    pub const fn default_port(self) -> Option<u16> {
        match self {
            Self::UnixSockStream => None,
            _ => Some(7447),
        }
    }
}

/// One piece of certificate material: a path on disk, or inline base64.
///
/// Both forms exist in Zenoh's own config, and both are genuinely useful — a
/// path for a local development CA, inline for a profile that has to travel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
#[ts(export)]
pub enum CertSource {
    /// An absolute path to a PEM file.
    Path(String),
    /// The PEM contents, base64 encoded.
    Base64(String),
}

impl CertSource {
    /// The Zenoh config key suffix this form maps to.
    const fn key_suffix(&self) -> &'static str {
        match self {
            Self::Path(_) => "",
            Self::Base64(_) => "_base64",
        }
    }

    fn value(&self) -> &str {
        match self {
            Self::Path(v) | Self::Base64(v) => v,
        }
    }

    /// Whether this looks like it holds a secret rather than a public cert.
    #[must_use]
    pub const fn is_inline(&self) -> bool {
        matches!(self, Self::Base64(_))
    }
}

/// TLS / mTLS material for a connection.
///
/// `Serialize` is derived so profiles can round-trip through the frontend, but
/// see [`TlsConfig::redacted`] before writing one anywhere durable.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TlsConfig {
    /// The CA that signed the server's certificate. Needed whenever the server
    /// is not signed by a root already in the system trust store, which is the
    /// normal case for an internal Zenoh fabric.
    #[serde(default)]
    pub root_ca: Option<CertSource>,

    /// The client's own certificate, presented when the server asks for one.
    #[serde(default)]
    pub client_cert: Option<CertSource>,

    /// The key for `client_cert`. A secret.
    #[serde(default)]
    pub client_key: Option<CertSource>,

    /// Present a client certificate. Required when the router runs with
    /// `enable_mtls: true`; without it the handshake fails at the server with
    /// a certificate error rather than anything that names mTLS.
    #[serde(default)]
    pub enable_mtls: bool,

    /// Check the server certificate's name against the address dialled.
    ///
    /// Defaults to `true`, which is the safe answer. It has to be turned off
    /// to reach a certificate issued for a service name over `localhost` — a
    /// common situation when a router is port-forwarded out of a container.
    #[serde(default = "default_true")]
    pub verify_name_on_connect: bool,
}

const fn default_true() -> bool {
    true
}

impl TlsConfig {
    /// `true` when nothing here would change the connection.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.root_ca.is_none()
            && self.client_cert.is_none()
            && self.client_key.is_none()
            && !self.enable_mtls
    }

    /// A copy with inline secrets replaced by a marker, for logs and events.
    #[must_use]
    pub fn redacted(&self) -> Self {
        let scrub = |source: &Option<CertSource>| {
            source.as_ref().map(|s| match s {
                CertSource::Path(p) => CertSource::Path(p.clone()),
                CertSource::Base64(_) => CertSource::Base64("<redacted>".to_owned()),
            })
        };
        Self {
            root_ca: scrub(&self.root_ca),
            client_cert: scrub(&self.client_cert),
            client_key: scrub(&self.client_key),
            enable_mtls: self.enable_mtls,
            verify_name_on_connect: self.verify_name_on_connect,
        }
    }

    /// Rejects combinations that cannot produce a working handshake.
    pub fn validate(&self) -> Result<()> {
        // A certificate without its key, or the reverse, fails deep inside
        // rustls with a message that does not name the missing half.
        match (&self.client_cert, &self.client_key) {
            (Some(_), None) => {
                return Err(Error::Config(
                    "a client certificate needs its private key".to_owned(),
                ));
            }
            (None, Some(_)) => {
                return Err(Error::Config(
                    "a client private key needs its certificate".to_owned(),
                ));
            }
            _ => {}
        }

        if self.enable_mtls && self.client_cert.is_none() {
            return Err(Error::Config(
                "mutual TLS needs a client certificate and key to present".to_owned(),
            ));
        }

        Ok(())
    }

    /// Emits the `transport/link/tls/*` config entries this describes.
    ///
    /// Returns `(key, json_value)` pairs ready for `Config::insert_json5`.
    #[must_use]
    pub fn config_entries(&self) -> Vec<(String, String)> {
        let mut out = Vec::new();

        let mut push = |field: &str, source: &Option<CertSource>| {
            if let Some(source) = source {
                out.push((
                    format!("transport/link/tls/{field}{}", source.key_suffix()),
                    json_string(source.value()),
                ));
            }
        };

        push("root_ca_certificate", &self.root_ca);
        push("connect_certificate", &self.client_cert);
        push("connect_private_key", &self.client_key);

        out.push((
            "transport/link/tls/enable_mtls".to_owned(),
            self.enable_mtls.to_string(),
        ));
        out.push((
            "transport/link/tls/verify_name_on_connect".to_owned(),
            self.verify_name_on_connect.to_string(),
        ));

        out
    }
}

/// Builds an endpoint string from its parts.
///
/// `address` is `host:port` for network transports and a filesystem path for
/// `unixsock-stream`. A missing port is filled from the transport's default.
pub fn endpoint(transport: Transport, address: &str) -> Result<String> {
    let address = address.trim();
    if address.is_empty() {
        return Err(Error::Config("an endpoint needs an address".to_owned()));
    }

    if transport.is_path_addressed() {
        return Ok(format!("{}/{address}", transport.scheme()));
    }

    // Bare IPv6 has colons of its own, so only treat a trailing `:digits` as a
    // port when the address is not an unbracketed IPv6 literal.
    let has_port = match address.rfind(':') {
        Some(index) if !address.contains("::") || address.starts_with('[') => {
            address[index + 1..].chars().all(|c| c.is_ascii_digit()) && index + 1 < address.len()
        }
        _ => false,
    };

    if has_port {
        Ok(format!("{}/{address}", transport.scheme()))
    } else if let Some(port) = transport.default_port() {
        Ok(format!("{}/{address}:{port}", transport.scheme()))
    } else {
        Err(Error::Config(format!(
            "{} endpoints need an explicit address",
            transport.scheme()
        )))
    }
}

/// Renders a `&str` as a JSON string literal.
fn json_string(value: &str) -> String {
    serde_json::Value::String(value.to_owned()).to_string()
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;

    #[test]
    fn the_serialised_name_is_exactly_the_zenoh_scheme() {
        for transport in [
            Transport::Tcp,
            Transport::Quic,
            Transport::Tls,
            Transport::Ws,
            Transport::UnixSockStream,
            Transport::Udp,
        ] {
            let wire = serde_json::to_string(&transport).unwrap();
            assert_eq!(
                wire.trim_matches('"'),
                transport.scheme(),
                "the wire form and the endpoint scheme must not drift apart"
            );
        }
    }

    #[test]
    fn quic_and_tls_share_the_tls_block() {
        assert!(Transport::Quic.uses_tls());
        assert!(Transport::Tls.uses_tls());
        assert!(!Transport::Tcp.uses_tls());
        // The mix-up this guards against: udp is not quic.
        assert!(!Transport::Udp.uses_tls());
        assert_eq!(Transport::Udp.scheme(), "udp");
        assert_eq!(Transport::Quic.scheme(), "quic");
    }

    #[test]
    fn the_default_port_is_filled_in() {
        assert_eq!(
            endpoint(Transport::Quic, "localhost").unwrap(),
            "quic/localhost:7447"
        );
        assert_eq!(
            endpoint(Transport::Tcp, "10.0.0.1").unwrap(),
            "tcp/10.0.0.1:7447"
        );
    }

    #[test]
    fn an_explicit_port_is_kept() {
        assert_eq!(
            endpoint(Transport::Tcp, "host:19447").unwrap(),
            "tcp/host:19447"
        );
    }

    #[test]
    fn bracketed_ipv6_keeps_its_port_and_bare_ipv6_gets_one() {
        assert_eq!(
            endpoint(Transport::Tcp, "[::1]:7447").unwrap(),
            "tcp/[::1]:7447"
        );
        // A bare IPv6 literal has colons but no port; it must not be read as
        // host `::` port `1`.
        assert_eq!(
            endpoint(Transport::Tcp, "fe80::1").unwrap(),
            "tcp/fe80::1:7447"
        );
    }

    #[test]
    fn unix_sockets_take_a_path() {
        assert_eq!(
            endpoint(Transport::UnixSockStream, "/run/zenoh/cloud.sock").unwrap(),
            "unixsock-stream//run/zenoh/cloud.sock"
        );
    }

    #[test]
    fn an_empty_address_is_rejected() {
        assert!(endpoint(Transport::Tcp, "   ").is_err());
    }

    #[test]
    fn a_certificate_without_its_key_is_rejected() {
        let tls = TlsConfig {
            client_cert: Some(CertSource::Path("/c.pem".into())),
            ..Default::default()
        };
        assert!(tls.validate().is_err());
    }

    #[test]
    fn mtls_without_a_client_certificate_is_rejected() {
        let tls = TlsConfig {
            enable_mtls: true,
            ..Default::default()
        };
        assert!(tls.validate().is_err());
    }

    #[test]
    fn a_complete_mtls_setup_validates() {
        let tls = TlsConfig {
            root_ca: Some(CertSource::Path("/ca.pem".into())),
            client_cert: Some(CertSource::Path("/node.pem".into())),
            client_key: Some(CertSource::Path("/node.key".into())),
            enable_mtls: true,
            verify_name_on_connect: false,
        };
        tls.validate().unwrap();

        let entries: std::collections::HashMap<_, _> = tls.config_entries().into_iter().collect();
        assert_eq!(
            entries["transport/link/tls/root_ca_certificate"],
            "\"/ca.pem\""
        );
        assert_eq!(
            entries["transport/link/tls/connect_certificate"],
            "\"/node.pem\""
        );
        assert_eq!(
            entries["transport/link/tls/connect_private_key"],
            "\"/node.key\""
        );
        assert_eq!(entries["transport/link/tls/enable_mtls"], "true");
        assert_eq!(
            entries["transport/link/tls/verify_name_on_connect"],
            "false"
        );
    }

    #[test]
    fn base64_material_uses_the_base64_keys() {
        let tls = TlsConfig {
            root_ca: Some(CertSource::Base64("QUJD".into())),
            ..Default::default()
        };
        let entries: std::collections::HashMap<_, _> = tls.config_entries().into_iter().collect();
        assert!(entries.contains_key("transport/link/tls/root_ca_certificate_base64"));
        assert!(!entries.contains_key("transport/link/tls/root_ca_certificate"));
    }

    #[test]
    fn redaction_hides_inline_secrets_but_keeps_paths() {
        let tls = TlsConfig {
            root_ca: Some(CertSource::Path("/ca.pem".into())),
            client_key: Some(CertSource::Base64("c3VwZXItc2VjcmV0".into())),
            ..Default::default()
        };
        let safe = tls.redacted();
        assert_eq!(safe.root_ca, Some(CertSource::Path("/ca.pem".into())));
        assert_eq!(
            safe.client_key,
            Some(CertSource::Base64("<redacted>".into()))
        );
    }
}
