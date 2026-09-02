//! One error type for everything the core can fail at.

use crate::model::{SessionId, TapId};

/// Errors surfaced by the core to its callers.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The requested session is not open — usually a stale tab in the UI.
    #[error("no open session with id {0}")]
    UnknownSession(SessionId),

    /// The requested tap is not running.
    #[error("no running tap with id {0}")]
    UnknownTap(TapId),

    /// The connection profile could not be turned into a Zenoh config.
    #[error("invalid connection profile: {0}")]
    Config(String),

    /// A key expression failed to parse.
    #[error("invalid key expression {expr:?}: {reason}")]
    KeyExpr {
        /// The offending expression.
        expr: String,
        /// Why Zenoh rejected it.
        reason: String,
    },

    /// Anything Zenoh itself reported.
    #[error("zenoh: {0}")]
    Zenoh(String),

    /// A session could not be opened, with guidance on why.
    ///
    /// Separate from [`Error::Zenoh`] because the caller shows this one to a
    /// person: the transport error alone (`invalid peer certificate:
    /// UnknownIssuer`) is accurate and useless.
    #[error("{}", .0.summary)]
    Connect(Box<crate::diagnose::Diagnosis>),

    /// An operation failed with guidance suitable for showing to a person.
    ///
    /// The operation-specific diagnosis keeps this separate from [`Error::Zenoh`],
    /// whose raw message is intended for failures we do not yet understand.
    #[error("{}", .0.summary)]
    Diagnosed(Box<crate::diagnose::Diagnosis>),

    /// A query to the admin space returned a reply we could not read.
    #[error("malformed admin-space reply for {key}: {reason}")]
    AdminReply {
        /// Key the reply arrived on.
        key: String,
        /// What went wrong while decoding it.
        reason: String,
    },
}

impl Error {
    /// Wraps a `zenoh` error, which is a boxed trait object rather than a type
    /// we can implement `From` for without conflicting with the other variants.
    pub fn zenoh(err: impl std::fmt::Display) -> Self {
        Self::Zenoh(err.to_string())
    }
}

/// Convenience alias used throughout the crate.
pub type Result<T, E = Error> = std::result::Result<T, E>;
