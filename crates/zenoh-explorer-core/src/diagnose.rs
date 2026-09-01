//! Turning connection failures into something a person can act on.
//!
//! Zenoh reports transport failures faithfully, but the message you get is the
//! one rustls or quinn produced several layers down. `invalid peer certificate:
//! UnknownIssuer` is precise and tells an operator nothing about which of the
//! four plausible mistakes they made.
//!
//! Every entry below was derived from a real failure against a real router.
//! When you add one, add the log line that produced it too — a guess here is
//! worse than no guidance, because it sends someone down the wrong path with
//! confidence.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A failure, explained.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Diagnosis {
    /// One line naming what went wrong, in the user's terms.
    pub summary: String,
    /// What to do about it. Empty when we genuinely do not know.
    pub remedies: Vec<String>,
    /// The underlying error, kept so nothing is hidden.
    pub detail: String,
}

impl Diagnosis {
    /// Wraps an error we have no specific guidance for.
    fn unknown(detail: String) -> Self {
        Self {
            summary: "Could not open the session".to_owned(),
            remedies: Vec::new(),
            detail,
        }
    }
}

/// Explains why a connection failed.
///
/// Matches on the error text because that is what Zenoh gives us: the transport
/// layers below it erase their types by the time the error surfaces.
#[must_use]
pub fn diagnose_connect_failure(error: &str) -> Diagnosis {
    let lower = error.to_lowercase();

    // --- TLS trust ----------------------------------------------------------
    if lower.contains("unknownissuer") {
        return Diagnosis {
            summary: "The router's certificate is signed by a CA this machine does not trust"
                .to_owned(),
            remedies: vec![
                "Add the CA certificate that signed the router, under TLS & certificates."
                    .to_owned(),
                "If the router also asks for a client certificate, it needs mutual TLS turned \
                 on with a certificate and key signed by the same CA."
                    .to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("certificaterequired") || lower.contains("no cert/sigscheme") {
        return Diagnosis {
            summary: "The router asked for a client certificate and none was configured".to_owned(),
            remedies: vec![
                "Turn on Mutual TLS and supply a client certificate and its private key."
                    .to_owned(),
                "Both must be signed by the CA the router trusts.".to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("notvalidforname") || lower.contains("certnotvalidforname") {
        return Diagnosis {
            summary: "The router's certificate was issued for a different name".to_owned(),
            remedies: vec![
                "Dial the router by the name on its certificate.".to_owned(),
                "Or turn off \"Verify the certificate name\" — expected when a router is \
                 port-forwarded and reached over localhost."
                    .to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("expired") && lower.contains("certificate") {
        return Diagnosis {
            summary: "The router's certificate has expired".to_owned(),
            remedies: vec!["Renew it on the router; nothing can be done from here.".to_owned()],
            detail: error.to_owned(),
        };
    }

    // --- reachability -------------------------------------------------------
    if lower.contains("connection refused") {
        return Diagnosis {
            summary: "Nothing is listening at that address".to_owned(),
            remedies: vec![
                "Check the transport. A router listening on QUIC will refuse a TCP dial, and \
                 both use port 7447."
                    .to_owned(),
                "Confirm the port is published if the router runs in a container.".to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("deadline has elapsed") || lower.contains("timed out") {
        return Diagnosis {
            summary: "The router did not answer in time".to_owned(),
            remedies: vec![
                "A silent timeout on a published port usually means the wrong transport — UDP \
                 and QUIC share port 7447 and are not interchangeable."
                    .to_owned(),
                "Check for a firewall between here and the router.".to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("no such file") || lower.contains("nosuchfile") {
        return Diagnosis {
            summary: "A certificate file could not be read".to_owned(),
            remedies: vec![
                "Check the paths under TLS & certificates.".to_owned(),
                "Files inside a Docker volume are not on this filesystem — copy them out with \
                 `docker cp` first."
                    .to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    if lower.contains("invalid peer certificate") {
        return Diagnosis {
            summary: "The router's certificate was rejected".to_owned(),
            remedies: vec![
                "Check the CA certificate matches the one that signed the router.".to_owned(),
            ],
            detail: error.to_owned(),
        };
    }

    Diagnosis::unknown(error.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact line a real router produced when no CA was configured.
    const UNKNOWN_ISSUER: &str = "Can not create a new QUIC link bound to localhost: the \
        cryptographic handshake failed: error 48: invalid peer certificate: UnknownIssuer";

    #[test]
    fn an_untrusted_router_certificate_names_the_ca_as_the_fix() {
        let d = diagnose_connect_failure(UNKNOWN_ISSUER);
        assert!(d.summary.contains("does not trust"));
        assert!(d.remedies.iter().any(|r| r.contains("CA certificate")));
        // The original is never dropped.
        assert_eq!(d.detail, UNKNOWN_ISSUER);
    }

    #[test]
    fn a_missing_client_certificate_is_distinguished_from_a_missing_ca() {
        let d = diagnose_connect_failure("Client auth requested but no cert/sigscheme available");
        assert!(d.summary.contains("client certificate"));
        assert!(d.remedies.iter().any(|r| r.contains("Mutual TLS")));
    }

    #[test]
    fn connection_refused_points_at_the_transport() {
        let d = diagnose_connect_failure("Connection refused (os error 61)");
        assert!(d.summary.contains("Nothing is listening"));
        // The QUIC/TCP port collision is the actual cause most of the time.
        assert!(d.remedies.iter().any(|r| r.contains("QUIC")));
    }

    #[test]
    fn a_timeout_points_at_udp_versus_quic() {
        let d = diagnose_connect_failure("deadline has elapsed");
        assert!(d.remedies.iter().any(|r| r.contains("UDP")));
    }

    #[test]
    fn a_name_mismatch_offers_the_verification_switch() {
        let d = diagnose_connect_failure("invalid peer certificate: NotValidForName");
        assert!(
            d.remedies
                .iter()
                .any(|r| r.contains("Verify the certificate name"))
        );
    }

    #[test]
    fn an_unrecognised_error_is_passed_through_rather_than_guessed_at() {
        let d = diagnose_connect_failure("something entirely new");
        assert!(d.remedies.is_empty(), "never invent guidance");
        assert_eq!(d.detail, "something entirely new");
    }

    #[test]
    fn the_more_specific_certificate_rule_wins_over_the_generic_one() {
        // Both patterns match this string; the useful one must come first.
        let d = diagnose_connect_failure(UNKNOWN_ISSUER);
        assert_ne!(d.summary, "The router's certificate was rejected");
    }
}
