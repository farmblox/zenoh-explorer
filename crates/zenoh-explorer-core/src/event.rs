//! Push events from the core to whatever is driving it.
//!
//! The core never depends on Tauri. It emits [`AppEvent`]s into an
//! [`EventSink`]; the Tauri layer implements that sink by forwarding to the
//! webview, and tests implement it with a `Vec`.
//!
//! This channel carries *broadcast* state — things many views care about, at a
//! low rate. High-rate per-subscription data does not belong here: tap samples
//! go through [`crate::tap::SampleSink`] instead, which the Tauri layer backs
//! with an IPC channel rather than a global event.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::model::{SessionId, TopologySnapshot};

/// Everything the backend can tell the frontend without being asked.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum AppEvent {
    /// A session finished connecting and is ready for queries.
    #[serde(rename_all = "camelCase")]
    SessionOpened {
        /// Which session.
        session_id: SessionId,
        /// The zid Zenoh assigned to it.
        zid: String,
    },
    /// A session was closed, by the user or by losing its last transport.
    #[serde(rename_all = "camelCase")]
    SessionClosed {
        /// Which session.
        session_id: SessionId,
        /// Human-readable cause, when the close was not user-initiated.
        reason: Option<String>,
    },
    /// A fresh topology snapshot is available.
    #[serde(rename_all = "camelCase")]
    TopologyUpdated {
        /// Which session the snapshot belongs to.
        session_id: SessionId,
        /// The snapshot itself.
        snapshot: TopologySnapshot,
    },
    /// A node appeared or disappeared on a directly connected transport.
    #[serde(rename_all = "camelCase")]
    TransportChanged {
        /// Which session observed it.
        session_id: SessionId,
        /// Zid of the node on the other end.
        zid: String,
        /// `true` when the transport came up, `false` when it went down.
        up: bool,
    },
    /// A node declared or withdrew a subscriber or queryable.
    ///
    /// Carries the counts rather than the declaration itself: the key index has
    /// already absorbed the change, and the UI's job is to re-read the level it
    /// is showing, not to patch a tree it does not own.
    #[serde(rename_all = "camelCase")]
    KeyspaceChanged {
        /// Which session observed it.
        session_id: SessionId,
        /// Distinct keys the index now holds.
        total_keys: usize,
        /// Declarations the index now holds.
        declarations: usize,
    },
    /// Something went wrong outside the scope of a single command, so there is
    /// no `Result` to carry it. The UI shows these in the events log.
    #[serde(rename_all = "camelCase")]
    Diagnostic {
        /// Which session it concerns, when it concerns one.
        session_id: Option<SessionId>,
        /// Severity.
        level: DiagnosticLevel,
        /// What happened.
        message: String,
        /// A concrete next step, when there is one.
        hint: Option<String>,
    },
}

/// Severity for [`AppEvent::Diagnostic`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DiagnosticLevel {
    /// Worth showing, not a problem.
    Info,
    /// Degraded, but the view is still usable.
    Warning,
    /// The operation failed.
    Error,
}

/// Where [`AppEvent`]s go.
pub trait EventSink: Send + Sync + 'static {
    /// Delivers one event. Implementations must not block; dropping an event is
    /// preferable to stalling the Zenoh runtime.
    fn emit(&self, event: AppEvent);
}

impl<F> EventSink for F
where
    F: Fn(AppEvent) + Send + Sync + 'static,
{
    fn emit(&self, event: AppEvent) {
        self(event);
    }
}
