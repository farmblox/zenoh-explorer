//! Commands exposed as `plugin:zenoh-session|<name>`.

use tauri::{AppHandle, Runtime};
use zenoh_explorer_core::model::{SessionId, TransportSummary};
use zenoh_explorer_core::search::{self, SearchCandidate, SearchResults};
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

/// Ranks nodes and key expressions against one query.
///
/// Lives here rather than in the key-space plugin because it spans both halves
/// of what a session knows: the topology snapshot and the key index. Splitting
/// it would mean two round trips and two rankings the caller had to interleave
/// itself, which is exactly the frontend logic this crate exists to prevent.
///
/// `commands` carries the palette's own entries. They are named in the UI —
/// "Collapse the sidebar" is not a fact about a Zenoh network — but they are
/// scored here, so one ranking orders the whole list instead of three.
///
/// `session_id` is optional because the palette opens before anything is
/// connected, and its commands work there.
///
/// Reads local state only, so it is safe to call on every keystroke.
#[tauri::command]
pub(crate) async fn search<R: Runtime>(
    app: AppHandle<R>,
    session_id: Option<SessionId>,
    query: String,
    limit: usize,
    commands: Vec<SearchCandidate>,
) -> Result<SearchResults> {
    let mut results = match session_id {
        Some(id) => app.zenoh_sessions()?.get(&id)?.search(&query, limit),
        None => SearchResults::empty(),
    };

    let (hits, total) = search::search_candidates(&commands, &query, limit);
    results.commands = hits;
    results.command_total = total;

    Ok(results)
}
