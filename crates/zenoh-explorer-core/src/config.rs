//! Connection profiles: the user-facing description of "how to reach a network",
//! and its translation into a [`zenoh::Config`].

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::Config;

use crate::connection::ConnectionOptions;
use crate::error::{Error, Result};
use crate::transport::{TlsConfig, Transport, endpoint};

/// How the explorer joins the network.
///
/// `Client` attaches to a single router and is the safe default: it adds no
/// routing load and cannot perturb the topology being inspected. `Peer` meshes
/// with the network and sees more, at the cost of participating in it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SessionMode {
    /// Attach to a router. Observes without joining the mesh.
    #[default]
    Client,
    /// Join the mesh as a peer.
    Peer,
}

impl SessionMode {
    /// The string Zenoh's config expects.
    const fn as_config_str(self) -> &'static str {
        match self {
            Self::Client => "client",
            Self::Peer => "peer",
        }
    }
}

/// A saved way of reaching a Zenoh network.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionProfile {
    /// Label shown on the session tab.
    pub name: String,
    /// Client or peer.
    #[serde(default)]
    pub mode: SessionMode,
    /// Which transport to dial. QUIC and TLS both read the TLS block below.
    #[serde(default)]
    pub transport: Transport,

    /// Where to dial: `host:port`, or a filesystem path for a unix socket.
    /// The port is filled from the transport's default when omitted.
    #[serde(default)]
    pub address: String,

    /// Fully-formed endpoints, used verbatim.
    ///
    /// Populated from `transport` + `address` when those are set. Kept as a
    /// list because a profile may legitimately dial several endpoints, and
    /// because an operator with an exotic endpoint (metadata, `#config`
    /// suffixes) needs a way to pass it through untouched.
    #[serde(default)]
    pub endpoints: Vec<String>,

    /// Certificates and mutual-TLS settings. Ignored by transports that do not
    /// use TLS.
    #[serde(default)]
    pub tls: TlsConfig,
    /// Endpoints to listen on. Only meaningful in peer mode.
    #[serde(default)]
    pub listen: Vec<String>,
    /// Whether to discover nodes by UDP multicast.
    #[serde(default = "default_true")]
    pub multicast_scouting: bool,
    /// Whether to discover nodes by gossip from connected nodes.
    #[serde(default = "default_true")]
    pub gossip_scouting: bool,
    /// Timeouts, retry backoff and scouting behaviour.
    #[serde(default)]
    pub options: ConnectionOptions,

    /// Raw `JSON5` merged last, for anything the fields above do not cover.
    /// This is the escape hatch for auth, `TLS` material and `QoS` overrides.
    #[serde(default)]
    pub advanced_json5: Option<String>,
}

const fn default_true() -> bool {
    true
}

impl Default for ConnectionProfile {
    fn default() -> Self {
        Self {
            name: "localhost".to_owned(),
            mode: SessionMode::Client,
            transport: Transport::Tcp,
            address: "localhost:7447".to_owned(),
            endpoints: Vec::new(),
            tls: TlsConfig::default(),
            listen: Vec::new(),
            multicast_scouting: true,
            gossip_scouting: true,
            options: ConnectionOptions::default(),
            advanced_json5: None,
        }
    }
}

impl ConnectionProfile {
    /// Every endpoint this profile dials.
    ///
    /// `endpoints` verbatim if given, otherwise one built from `transport` and
    /// `address`. The explicit list wins so an operator can always hand-write
    /// an endpoint the builder cannot express.
    pub fn resolved_endpoints(&self) -> Result<Vec<String>> {
        if !self.endpoints.is_empty() {
            return Ok(self.endpoints.clone());
        }
        if self.address.trim().is_empty() {
            return Ok(Vec::new());
        }
        Ok(vec![endpoint(self.transport, &self.address)?])
    }

    /// Builds the `zenoh::Config` this profile describes.
    ///
    /// The explorer always enables its own admin space so that it is as
    /// inspectable as the nodes it inspects.
    pub fn to_zenoh_config(&self) -> Result<Config> {
        // Start from the raw override, if any, so the explicit fields below win.
        let mut config = match self.advanced_json5.as_deref() {
            Some(json5) if !json5.trim().is_empty() => {
                Config::from_json5(json5).map_err(|e| Error::Config(e.to_string()))?
            }
            _ => Config::default(),
        };

        let mut set = |key: &str, value: String| -> Result<()> {
            config
                .insert_json5(key, &value)
                .map_err(|e| Error::Config(format!("{key}: {e}")))
        };

        set("mode", json_string(self.mode.as_config_str()))?;
        set("connect/endpoints", json_array(&self.resolved_endpoints()?))?;

        // QUIC and TLS both read `transport/link/tls`. Writing those keys for a
        // plain TCP endpoint is harmless but misleading, so they only go in
        // when the transport will actually consult them.
        if self.transport.uses_tls() && !self.tls.is_empty() {
            for (key, value) in self.tls.config_entries() {
                set(key.as_str(), value)?;
            }
        }
        if !self.listen.is_empty() {
            set("listen/endpoints", json_array(&self.listen))?;
        }
        set(
            "scouting/multicast/enabled",
            self.multicast_scouting.to_string(),
        )?;
        set("scouting/gossip/enabled", self.gossip_scouting.to_string())?;
        for (key, value) in self.options.config_entries() {
            set(key.as_str(), value)?;
        }

        set("adminspace/enabled", "true".to_owned())?;
        set("adminspace/permissions/read", "true".to_owned())?;

        Ok(config)
    }

    /// Rejects profiles that cannot possibly connect, before we try.
    pub fn validate(&self) -> Result<()> {
        if self.name.trim().is_empty() {
            return Err(Error::Config("profile needs a name".to_owned()));
        }

        let endpoints = self.resolved_endpoints()?;

        // A client has to be told where to go; a peer can find the network by
        // scouting alone.
        if self.mode == SessionMode::Client && endpoints.is_empty() && !self.multicast_scouting {
            return Err(Error::Config(
                "a client session needs an endpoint or multicast scouting".to_owned(),
            ));
        }

        self.tls.validate()?;

        // Certificates on a transport that will never read them is a mistake
        // worth naming: the profile looks secured and is not.
        if !self.transport.uses_tls() && !self.tls.is_empty() {
            return Err(Error::Config(format!(
                "{} does not use TLS - choose quic or tls to use these certificates",
                self.transport.scheme()
            )));
        }

        Ok(())
    }
}

/// Renders a `&str` as a JSON string literal.
fn json_string(value: &str) -> String {
    serde_json::Value::String(value.to_owned()).to_string()
}

/// Renders a slice of strings as a JSON array literal.
fn json_array(values: &[String]) -> String {
    serde_json::Value::Array(
        values
            .iter()
            .cloned()
            .map(serde_json::Value::String)
            .collect(),
    )
    .to_string()
}

#[cfg(test)]
mod tests {
    // Tests assert on values that must be present; `unwrap` failing *is* the
    // assertion, and a panic message points at the right line either way.
    #![allow(clippy::unwrap_used)]

    use super::*;
    use crate::transport::CertSource;

    #[test]
    fn default_profile_builds_a_client_config() {
        let profile = ConnectionProfile::default();
        profile.validate().expect("default profile must be valid");
        let config = profile.to_zenoh_config().expect("config must build");
        assert_eq!(config.get_json("mode").unwrap(), "\"client\"");
    }

    #[test]
    fn endpoints_reach_the_config() {
        let profile = ConnectionProfile {
            endpoints: vec![
                "tcp/10.0.0.1:7447".to_owned(),
                "quic/10.0.0.2:7447".to_owned(),
            ],
            ..Default::default()
        };
        let config = profile.to_zenoh_config().unwrap();
        let json = config.get_json("connect/endpoints").unwrap();
        assert!(json.contains("10.0.0.1"), "got {json}");
        assert!(json.contains("10.0.0.2"), "got {json}");
    }

    #[test]
    fn explicit_fields_override_the_raw_escape_hatch() {
        let profile = ConnectionProfile {
            mode: SessionMode::Peer,
            advanced_json5: Some(r#"{ mode: "client" }"#.to_owned()),
            ..Default::default()
        };
        let config = profile.to_zenoh_config().unwrap();
        assert_eq!(config.get_json("mode").unwrap(), "\"peer\"");
    }

    #[test]
    fn a_client_with_no_way_to_find_anything_is_rejected() {
        let profile = ConnectionProfile {
            address: String::new(),
            endpoints: Vec::new(),
            multicast_scouting: false,
            ..Default::default()
        };
        assert!(profile.validate().is_err());
    }

    #[test]
    fn transport_and_address_build_the_endpoint() {
        let profile = ConnectionProfile {
            transport: Transport::Quic,
            address: "router.internal".to_owned(),
            ..Default::default()
        };
        assert_eq!(
            profile.resolved_endpoints().unwrap(),
            vec!["quic/router.internal:7447"]
        );
    }

    #[test]
    fn an_explicit_endpoint_list_wins_over_the_builder() {
        let profile = ConnectionProfile {
            transport: Transport::Quic,
            address: "ignored".to_owned(),
            endpoints: vec!["tcp/hand-written:1234?prio=1-3".to_owned()],
            ..Default::default()
        };
        assert_eq!(
            profile.resolved_endpoints().unwrap(),
            vec!["tcp/hand-written:1234?prio=1-3"]
        );
    }

    #[test]
    fn tls_material_reaches_the_config_for_quic() {
        let profile = ConnectionProfile {
            transport: Transport::Quic,
            address: "localhost".to_owned(),
            tls: TlsConfig {
                root_ca: Some(CertSource::Path("/ca.pem".into())),
                client_cert: Some(CertSource::Path("/n.pem".into())),
                client_key: Some(CertSource::Path("/n.key".into())),
                enable_mtls: true,
                verify_name_on_connect: false,
            },
            ..Default::default()
        };
        profile.validate().unwrap();
        let config = profile.to_zenoh_config().unwrap();
        assert_eq!(
            config
                .get_json("transport/link/tls/root_ca_certificate")
                .unwrap(),
            "\"/ca.pem\""
        );
        assert_eq!(
            config.get_json("transport/link/tls/enable_mtls").unwrap(),
            "true"
        );
    }

    #[test]
    fn certificates_on_a_plain_tcp_profile_are_rejected() {
        // Silently ignoring them is worse: the profile looks secured and is not.
        let profile = ConnectionProfile {
            transport: Transport::Tcp,
            tls: TlsConfig {
                root_ca: Some(CertSource::Path("/ca.pem".into())),
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(profile.validate().is_err());
    }

    #[test]
    fn the_explorer_always_enables_its_own_admin_space() {
        // Zenoh 1.x defaults `adminspace.enabled` to false; we opt in so the
        // explorer is introspectable by other tools, including itself.
        let config = ConnectionProfile::default().to_zenoh_config().unwrap();
        assert_eq!(config.get_json("adminspace/enabled").unwrap(), "true");
    }
}
