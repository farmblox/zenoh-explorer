//! Commands exposed as `plugin:zenoh-keyspace|<name>`.

use tauri::{AppHandle, Runtime};
use tauri_plugin_zenoh_session::{Result, ZenohSessionExt};
use zenoh_explorer_core::keyexpr_tools::{KeyExprAnalysis, MatchResult};
use zenoh_explorer_core::model::{KeySpaceSnapshot, SessionId};

/// Returns the immediate children of `prefix`.
///
/// One level at a time: a real deployment's key space is far too large to send
/// whole, so the tree is expanded lazily as the user opens it.
#[tauri::command]
pub(crate) async fn expand_keys<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    prefix: String,
) -> Result<KeySpaceSnapshot> {
    Ok(app.zenoh_sessions()?.get(&session_id)?.expand_keys(&prefix))
}

/// Asks the network what it has declared and folds the answer into the index.
///
/// Returns the root level, so a caller that just wants to populate an empty
/// tree does not have to follow up with an `expand_keys` call.
#[tauri::command]
pub(crate) async fn refresh_declarations<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
) -> Result<KeySpaceSnapshot> {
    app.zenoh_sessions()?
        .get(&session_id)?
        .refresh_declarations()
        .await
        .map_err(Into::into)
}

/// Forgets every observed key for this session.
#[tauri::command]
pub(crate) async fn clear_keys<R: Runtime>(app: AppHandle<R>, session_id: SessionId) -> Result<()> {
    app.zenoh_sessions()?.get(&session_id)?.clear_keys();
    Ok(())
}

/// Validates and canonicalises one key expression.
///
/// Takes `String` rather than `&str` because Tauri deserialises command
/// arguments from JSON and hands them over owned; a borrowed parameter cannot
/// be expressed here.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn analyse_key_expr(expr: String) -> KeyExprAnalysis {
    zenoh_explorer_core::keyexpr_tools::analyse(&expr)
}

/// Tests `expr` against candidate keys, reporting the precise set relation.
///
/// Owned arguments for the same reason as above.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn test_key_expr(expr: String, candidates: Vec<String>) -> Vec<MatchResult> {
    zenoh_explorer_core::keyexpr_tools::test_matches(&expr, &candidates)
}
