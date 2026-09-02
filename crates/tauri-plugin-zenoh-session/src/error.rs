//! The error type every Zenoh Explorer plugin command returns.
//!
//! Tauri requires command errors to be `Serialize`. Rather than each plugin
//! inventing its own shape, they all use this one, so the frontend has a single
//! error contract to handle.

use serde::{Serialize, Serializer};
use ts_rs::TS;

/// A command failure, as the frontend sees it.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Something in the domain layer failed.
    #[error(transparent)]
    Core(#[from] zenoh_explorer_core::Error),

    /// The plugin was asked to act before its state existed. This is a bug in
    /// the host application's setup, not something a user can cause.
    #[error("the Zenoh session plugin is not initialised")]
    NotInitialised,
}

/// The JSON shape of [`Error`], kept in sync by `serialize`.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename = "CommandError")]
pub struct CommandErrorDto {
    /// Machine-readable discriminant, for branching in the UI.
    pub code: &'static str,
    /// Human-readable message, safe to show directly.
    pub message: String,
    /// What to do about it, when the failure is one we recognise. The frontend
    /// renders these as the actionable half of an error toast.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub remedies: Vec<String>,
    /// The underlying transport error, kept so nothing is hidden from someone
    /// who needs it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl Error {
    /// Stable discriminant so the frontend can branch without parsing prose.
    fn code(&self) -> &'static str {
        use zenoh_explorer_core::Error as Core;
        match self {
            Self::NotInitialised => "notInitialised",
            Self::Core(Core::UnknownSession(_)) => "unknownSession",
            Self::Core(Core::UnknownTap(_)) => "unknownTap",
            Self::Core(Core::Config(_)) => "config",
            Self::Core(Core::KeyExpr { .. }) => "keyExpr",
            Self::Core(Core::Zenoh(_)) => "zenoh",
            Self::Core(Core::Connect(_)) => "connect",
            Self::Core(Core::Diagnosed(_)) => "diagnosed",
            Self::Core(Core::AdminReply { .. }) => "adminReply",
        }
    }
}

impl Serialize for Error {
    // Spelled out because this module's `Result<T>` alias would shadow it.
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let (remedies, detail) = match self {
            Self::Core(
                zenoh_explorer_core::Error::Connect(d) | zenoh_explorer_core::Error::Diagnosed(d),
            ) => (d.remedies.clone(), Some(d.detail.clone())),
            _ => (Vec::new(), None),
        };

        CommandErrorDto {
            code: self.code(),
            message: self.to_string(),
            remedies,
            detail,
        }
        .serialize(serializer)
    }
}

/// Command result alias.
pub type Result<T> = std::result::Result<T, Error>;

#[cfg(test)]
mod tests {
    use super::*;
    use zenoh_explorer_core::diagnose::Diagnosis;

    #[test]
    fn a_diagnosed_error_keeps_its_guidance_across_ipc() {
        let error = Error::Core(zenoh_explorer_core::Error::Diagnosed(Box::new(Diagnosis {
            summary: "The session is no longer open".to_owned(),
            remedies: vec!["Reconnect and try again.".to_owned()],
            detail: "Session is closed".to_owned(),
        })));

        let value = serde_json::to_value(error).expect("command errors serialize");

        assert_eq!(value["code"], "diagnosed");
        assert_eq!(value["message"], "The session is no longer open");
        assert_eq!(value["remedies"][0], "Reconnect and try again.");
        assert_eq!(value["detail"], "Session is closed");
    }
}
