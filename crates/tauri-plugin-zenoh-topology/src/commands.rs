//! Commands exposed as `plugin:zenoh-topology|<name>`.

use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tauri_plugin_zenoh_session::{Result, ZenohSessionExt};
use zenoh_explorer_core::model::SessionId;
use zenoh_explorer_core::scout::ScoutedNode;
use zenoh_explorer_core::trace::Trace;

/// Longest scouting window we will honour, so a stray value cannot hang the UI.
const MAX_SCOUT_MS: u64 = 10_000;

/// Re-reads everything the session can be asked for.
///
/// Returns nothing: the results arrive as `topologyUpdated` and
/// `keyspaceChanged` events like every other change, so there is one way data
/// reaches the frontend rather than two that can disagree.
#[tauri::command]
pub(crate) async fn resync<R: Runtime>(app: AppHandle<R>, session_id: SessionId) -> Result<()> {
    app.zenoh_sessions()?.get(&session_id)?.resync().await?;
    Ok(())
}

/// Listens for scout replies and reports everything heard.
///
/// Independent of any session: scouting is how the explorer finds networks it
/// is not connected to yet.
#[tauri::command]
pub(crate) async fn scout(duration_ms: Option<u64>) -> Result<Vec<ScoutedNode>> {
    let window = Duration::from_millis(duration_ms.unwrap_or(2_000).clamp(100, MAX_SCOUT_MS));
    Ok(zenoh_explorer_core::scout::scout_once(window).await?)
}

/// The path a message would take between two nodes.
///
/// A graph shows which links exist; this shows which one Zenoh would pick. On
/// any mesh with more than one route those are different questions, and "why is
/// this slow" often turns out to be "it is not going the way you think".
///
/// One query for the whole path, assembled in the core rather than returned as
/// raw replies for the caller to chain: which router forwards where is a fact
/// about the network, not a rendering decision.
#[tauri::command]
pub(crate) async fn route_trace<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    from: String,
    to: String,
) -> Result<Trace> {
    app.zenoh_sessions()?
        .get(&session_id)?
        .trace_route(&from, &to)
        .await
        .map_err(Into::into)
}
