//! Commands exposed as `plugin:zenoh-data|<name>`.

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, Runtime};
use tauri_plugin_zenoh_session::{Result, ZenohSessionExt};
use zenoh_explorer_core::TapSpec;
use zenoh_explorer_core::model::{SampleBatch, SampleRecord, SessionId, TapId};
use zenoh_explorer_core::session::TapSummary;

/// Runs a `get` and returns every reply.
///
/// The selector may address the admin space (`@/**`) just as well as user keys —
/// to Zenoh they are the same namespace, so the admin browser and the query
/// drawer share this one command.
#[tauri::command]
pub(crate) async fn query<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    selector: String,
    timeout_ms: Option<u64>,
) -> Result<Vec<SampleRecord>> {
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .query(&selector, timeout_ms.unwrap_or(5_000))
        .await?)
}

/// Publishes a payload to a key.
#[tauri::command]
pub(crate) async fn put<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    key: String,
    payload: Vec<u8>,
    encoding: Option<String>,
) -> Result<()> {
    app.zenoh_sessions()?
        .get(&session_id)?
        .put(&key, payload, encoding.as_deref())
        .await?;
    Ok(())
}

/// Deletes a key.
#[tauri::command]
pub(crate) async fn delete<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    key: String,
) -> Result<()> {
    app.zenoh_sessions()?.get(&session_id)?.delete(&key).await?;
    Ok(())
}

/// Subscribes to a key expression, streaming batches into `on_batch`.
///
/// Samples come back over an IPC [`Channel`], not the global event bus. A tap
/// has exactly one consumer, and a busy key expression can produce tens of
/// thousands of samples a second — broadcasting that to every listener in the
/// webview would be both wasteful and unordered. The channel gives the caller
/// its own ordered stream, and the backend still coalesces into batches so the
/// bridge sees a bounded message rate.
#[tauri::command]
pub(crate) async fn start_tap<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    spec: TapSpec,
    on_batch: Channel<SampleBatch>,
) -> Result<TapId> {
    let sink = Arc::new(move |batch: SampleBatch| {
        // A send failure means the frontend dropped the channel — the view was
        // closed while samples were still in flight. Nothing to recover.
        if let Err(err) = on_batch.send(batch) {
            tracing::debug!(error = %err, "tap channel closed; dropping batch");
        }
    });

    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .start_tap(&spec, sink)
        .await?)
}

/// Stops a tap and undeclares its subscriber.
#[tauri::command]
pub(crate) async fn stop_tap<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    tap_id: TapId,
) -> Result<()> {
    app.zenoh_sessions()?.get(&session_id)?.stop_tap(&tap_id)?;
    Ok(())
}

/// Every tap running on a session.
#[tauri::command]
pub(crate) async fn list_taps<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
) -> Result<Vec<TapSummary>> {
    Ok(app.zenoh_sessions()?.get(&session_id)?.taps())
}
