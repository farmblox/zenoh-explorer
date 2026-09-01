//! Commands exposed as `plugin:zenoh-session|<name>`.

use tauri::{AppHandle, Runtime};
use zenoh_explorer_core::model::{SessionId, TransportSummary};
use zenoh_explorer_core::{ConnectionProfile, SessionSummary};

use crate::ZenohSessionExt;
use crate::error::Result;

/// Opens a session against the network described by `profile`.
#[tauri::command]
pub(crate) async fn connect<R: Runtime>(
    app: AppHandle<R>,
    profile: ConnectionProfile,
) -> Result<SessionId> {
    Ok(app.zenoh_sessions()?.connect(profile).await?)
}

/// Closes a session and everything derived from it.
#[tauri::command]
pub(crate) async fn disconnect<R: Runtime>(app: AppHandle<R>, session_id: SessionId) -> Result<()> {
    app.zenoh_sessions()?.disconnect(&session_id, None).await?;
    Ok(())
}

/// Every open session, oldest first — the order of the tab strip.
#[tauri::command]
pub(crate) async fn list_sessions<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SessionSummary>> {
    Ok(app.zenoh_sessions()?.summaries().await)
}

/// One session's summary.
#[tauri::command]
pub(crate) async fn session_summary<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
) -> Result<SessionSummary> {
    Ok(app.zenoh_sessions()?.get(&session_id)?.summary().await)
}

/// Transports the session holds open right now.
#[tauri::command]
pub(crate) async fn transports<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
) -> Result<Vec<TransportSummary>> {
    Ok(app.zenoh_sessions()?.get(&session_id)?.transports().await)
}
