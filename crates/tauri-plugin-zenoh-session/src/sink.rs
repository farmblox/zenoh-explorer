//! Bridging core events onto the Tauri event bus.

use tauri::{AppHandle, Emitter, Runtime};
use zenoh_explorer_core::{AppEvent, EventSink};

/// The single Tauri event name every backend push arrives on.
///
/// One channel rather than one event per variant: the payload is a tagged union
/// (`AppEvent`), so the frontend registers one listener and narrows on `kind`.
/// That keeps listener bookkeeping out of every React component.
pub const ZENOH_EVENT: &str = "zenoh://event";

/// Forwards [`AppEvent`]s to the webview.
#[derive(Debug)]
pub struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriSink<R> {
    /// Wraps an app handle.
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> EventSink for TauriSink<R> {
    fn emit(&self, event: AppEvent) {
        // A failed emit means the webview is gone — during shutdown, or if the
        // window was closed while a tap was still flushing. Losing the event is
        // correct here; propagating the error would only stall the Zenoh
        // runtime thread that produced it.
        if let Err(err) = self.app.emit(ZENOH_EVENT, &event) {
            tracing::debug!(error = %err, "dropping event: no webview to receive it");
        }
    }
}
