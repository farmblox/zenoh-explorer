//! Reading the key space out of the admin space.
//!
//! Zenoh publishes every declaration a node makes under its own admin key:
//!
//! | Key                                          | Meaning                    |
//! |----------------------------------------------|----------------------------|
//! | `@/<zid>/<whatami>/subscriber/<keyexpr>`     | that node subscribes here  |
//! | `@/<zid>/<whatami>/publisher/<keyexpr>`      | that node publishes here   |
//! | `@/<zid>/<whatami>/queryable/<keyexpr>`      | that node answers here     |
//! | `@/<zid>/<whatami>/querier/<keyexpr>`        | that node queries here     |
//! | `@/<zid>/<whatami>/token/<keyexpr>`          | an app is alive here       |
//!
//! The key expression is carried in the reply's KEY, not its payload, which is
//! why this can be read without decoding anything.
//!
//! Without this, the explorer's key space starts empty and only fills as
//! traffic happens to arrive — so a network that is configured but idle looks
//! identical to one that does not exist. Declarations describe what the network
//! is set up to carry, which is available the moment you connect.

use std::sync::Arc;

use zenoh::Session;
use zenoh::pubsub::Subscriber;
use zenoh::query::{ConsolidationMode, QueryTarget};
use zenoh::sample::SampleKind;

use crate::error::{Error, Result};
use crate::model::DeclarationKind;

/// The selector matching every declaration of one kind, anywhere.
///
/// Built from the kind rather than written out, so adding a kind to
/// [`DeclarationKind`] cannot leave it unread here.
fn selector_for(kind: DeclarationKind) -> String {
    format!("@/*/*/{}/**", kind.admin_segment())
}

/// How long to wait for declarations.
///
/// A wildcard query against `QueryTarget::All` ALWAYS runs to its timeout:
/// there is no way to know that every queryable on the network has answered, so
/// Zenoh waits. This value is therefore not "how long until it usually
/// finishes", it is "how long we are prepared to wait for stragglers" — and a
/// reply that arrives after it is lost.
///
/// Generous, because nothing waits on this. The initial read is spawned and the
/// live watch keeps the index current from then on, so the cost of a long
/// timeout is a background task sleeping, not a user waiting.
const TIMEOUT_MS: u64 = 10_000;

/// One declaration, as read off an admin-space reply key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    /// Zid of the node that declared it.
    pub zid: String,
    /// The key expression it declared, wildcards included.
    pub key_expr: String,
    /// Subscriber or queryable.
    pub kind: DeclarationKind,
}

/// Every declaration the network will tell us about.
///
/// Returns what it managed to read plus a diagnostic per selector that failed,
/// rather than failing outright: one unreachable subtree should not cost the
/// caller the other one.
pub async fn probe(session: &Session) -> (Vec<Declaration>, Vec<String>) {
    let mut declarations = Vec::new();
    let mut diagnostics = Vec::new();

    for kind in DeclarationKind::ALL {
        let selector = selector_for(kind);
        match collect(session, &selector, kind).await {
            Ok(found) => declarations.extend(found),
            Err(err) => diagnostics.push(format!("{selector}: {err}")),
        }
    }

    declarations.sort_by(|a, b| a.key_expr.cmp(&b.key_expr).then(a.zid.cmp(&b.zid)));
    declarations.dedup();

    (declarations, diagnostics)
}

/// Runs one selector and parses every reply key it returns.
async fn collect(
    session: &Session,
    selector: &str,
    kind: DeclarationKind,
) -> Result<Vec<Declaration>> {
    let replies = session
        .get(selector)
        .target(QueryTarget::All)
        // Every replier answers for itself, so consolidating would silently
        // drop the fact that two nodes subscribe to the same expression.
        .consolidation(ConsolidationMode::None)
        .timeout(std::time::Duration::from_millis(TIMEOUT_MS))
        .await
        .map_err(|err| Error::KeyExpr {
            expr: selector.to_owned(),
            reason: err.to_string(),
        })?;

    let mut out = Vec::new();
    while let Ok(reply) = replies.recv_async().await {
        if let Ok(sample) = reply.result()
            && let Some(declaration) = parse_key(sample.key_expr().as_str(), kind)
        {
            out.push(declaration);
        }
    }

    Ok(out)
}

/// Splits `@/<zid>/<whatami>/<what>/<keyexpr…>` into its parts.
///
/// Returns `None` for anything that does not have all four leading chunks and a
/// non-empty remainder, which is how malformed or unexpected admin keys are
/// dropped rather than becoming a key called `""`.
fn parse_key(admin_key: &str, kind: DeclarationKind) -> Option<Declaration> {
    let rest = admin_key.strip_prefix("@/")?;
    let mut chunks = rest.splitn(4, '/');

    let zid = chunks.next()?;
    let _whatami = chunks.next()?;
    let _what = chunks.next()?;
    let key_expr = chunks.next()?;

    if zid.is_empty() || key_expr.is_empty() {
        return None;
    }

    Some(Declaration {
        zid: zid.to_owned(),
        key_expr: key_expr.to_owned(),
        kind,
    })
}

/// A live subscription to the network's declarations.
///
/// Held for its lifetime; dropping it undeclares the subscribers.
#[derive(Debug)]
pub struct DeclarationWatch {
    _subscribers: Vec<Subscriber<()>>,
}

/// What a declaration change was.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    /// A node started subscribing or answering here.
    Declared,
    /// A node stopped.
    Undeclared,
}

/// Where declaration changes go.
pub trait DeclarationSink: Send + Sync + 'static {
    /// Delivers one change. Must not block the caller.
    fn send(&self, declaration: Declaration, change: Change);
}

impl<F> DeclarationSink for F
where
    F: Fn(Declaration, Change) + Send + Sync + 'static,
{
    fn send(&self, declaration: Declaration, change: Change) {
        self(declaration, change);
    }
}

/// Watches declarations appear and disappear.
///
/// Zenoh publishes a PUT on the admin key when a node declares a subscriber or
/// queryable, and a DELETE when it withdraws one. Subscribing to those keys is
/// what makes the keyspace live rather than a snapshot: a node that comes up
/// two minutes after you connected shows up on its own.
///
/// `history(true)` is deliberately NOT used here — the admin space is not a
/// storage, so there is no history to replay. The initial state comes from
/// [`probe`], and this keeps it current from that point on.
pub async fn watch(session: &Session, sink: Arc<dyn DeclarationSink>) -> Result<DeclarationWatch> {
    let mut subscribers = Vec::new();

    for kind in DeclarationKind::ALL {
        let sink = Arc::clone(&sink);
        let selector = selector_for(kind);
        let subscriber = session
            .declare_subscriber(selector.clone())
            .callback(move |sample| {
                let Some(declaration) = parse_key(sample.key_expr().as_str(), kind) else {
                    return;
                };
                let change = match sample.kind() {
                    SampleKind::Put => Change::Declared,
                    SampleKind::Delete => Change::Undeclared,
                };
                sink.send(declaration, change);
            })
            .await
            .map_err(|err| Error::KeyExpr {
                expr: selector.clone(),
                reason: err.to_string(),
            })?;

        subscribers.push(subscriber);
    }

    Ok(DeclarationWatch {
        _subscribers: subscribers,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_kind_has_a_selector_zenoh_publishes() {
        // The five segments Zenoh's adminspace registers handlers for.
        let selectors: Vec<String> = DeclarationKind::ALL
            .iter()
            .copied()
            .map(selector_for)
            .collect();
        assert_eq!(
            selectors,
            vec![
                "@/*/*/subscriber/**",
                "@/*/*/publisher/**",
                "@/*/*/queryable/**",
                "@/*/*/querier/**",
                "@/*/*/token/**",
            ]
        );
    }

    #[test]
    fn a_publisher_key_parses() {
        let parsed = parse_key(
            "@/abc/peer/publisher/fleet/agv/**",
            DeclarationKind::Publisher,
        )
        .expect("should parse");
        assert_eq!(parsed.key_expr, "fleet/agv/**");
        assert_eq!(parsed.kind, DeclarationKind::Publisher);
    }

    #[test]
    fn a_liveliness_token_key_parses() {
        let parsed = parse_key(
            "@/abc/peer/token/fleet/agv/07",
            DeclarationKind::LivelinessToken,
        )
        .expect("should parse");
        assert_eq!(parsed.key_expr, "fleet/agv/07");
        assert_eq!(parsed.kind, DeclarationKind::LivelinessToken);
    }

    use super::*;

    #[test]
    fn a_subscriber_key_splits_into_zid_and_expression() {
        let parsed = parse_key(
            "@/34f797e3/router/subscriber/fleet/agv/07/telemetry/**",
            DeclarationKind::Subscriber,
        )
        .expect("a well-formed admin key parses");

        assert_eq!(parsed.zid, "34f797e3");
        assert_eq!(parsed.key_expr, "fleet/agv/07/telemetry/**");
        assert_eq!(parsed.kind, DeclarationKind::Subscriber);
    }

    #[test]
    fn the_expression_keeps_its_wildcards() {
        let parsed = parse_key("@/abc/peer/queryable/**", DeclarationKind::Queryable)
            .expect("a wildcard expression is a valid declaration");
        assert_eq!(parsed.key_expr, "**");
    }

    #[test]
    fn a_key_with_no_expression_is_not_a_declaration() {
        assert!(parse_key("@/abc/peer/subscriber", DeclarationKind::Subscriber).is_none());
        assert!(parse_key("@/abc/peer/subscriber/", DeclarationKind::Subscriber).is_none());
    }

    #[test]
    fn a_key_outside_the_admin_space_is_ignored() {
        assert!(parse_key("fleet/agv/07", DeclarationKind::Subscriber).is_none());
    }
}
