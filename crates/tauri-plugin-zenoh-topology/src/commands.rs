//! Commands exposed as `plugin:zenoh-topology|<name>`.

use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tauri_plugin_zenoh_session::{Result, ZenohSessionExt};
use zenoh_explorer_core::model::SessionId;
use zenoh_explorer_core::scout::ScoutedNode;

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

/// Asks the routers on the path which node they would forward to next.
///
/// Backs the route-trace panel: each hop is one admin-space query against
/// `@/*/*/route/successor/src/<from>/dst/<to>`.
#[tauri::command]
pub(crate) async fn route_trace<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    from: String,
    to: String,
) -> Result<Vec<zenoh_explorer_core::model::SampleRecord>> {
    let selector = format!("@/*/*/route/successor/src/{from}/dst/{to}");
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .query(&selector, 2_500)
        .await?)
}
