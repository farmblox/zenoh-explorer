//! Failures the profile store can produce.

use serde::{Serialize, Serializer};

/// A profile-store failure.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The store plugin could not read or write the file.
    #[error("profile store: {0}")]
    Store(#[from] tauri_plugin_store::Error),

    /// The profile could not be encoded or decoded.
    #[error("profile store: {0}")]
    Json(#[from] serde_json::Error),

    /// The database file could not be created or opened.
    #[error("profile store: {0}")]
    Io(#[from] std::io::Error),

    /// A profile carried inline private key material.
    ///
    /// Refused rather than written: the store is an unencrypted file in the
    /// application data directory, and a private key belongs on disk under the
    /// user's own permissions, referenced by path.
    #[error("a private key cannot be saved in a profile — reference the key file by path instead")]
    RefusedSecret,
}

impl Serialize for Error {
    // Spelled out because this module's `Result<T>` alias would shadow it.
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Store result alias.
pub type Result<T> = std::result::Result<T, Error>;
