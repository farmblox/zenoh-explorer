//! Commands exposed as `plugin:zenoh-keyspace|<name>`.

use tauri::{AppHandle, Runtime};
use tauri_plugin_zenoh_session::{Result, ZenohSessionExt};
use zenoh_explorer_core::acl::AclFinding;
use zenoh_explorer_core::keyexpr_tools::{KeyExprAnalysis, MatchResult};
use zenoh_explorer_core::model::{
    DeclarationKind, KeyDeclaration, KeySpaceSnapshot, NodeDeclaration, SessionId,
};
use zenoh_explorer_core::storage::StorageCoverage;

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

/// What one node has declared: the key expressions it subscribes to or answers
/// on.
///
/// Attributed rather than aggregated. The key tree can say that eleven
/// subscribers exist under `fleet/**`; this says which of them are this node's,
/// which is the difference between "somebody is listening" and "this node is
/// listening".
#[tauri::command]
pub(crate) async fn node_declarations<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    zid: String,
) -> Result<Vec<NodeDeclaration>> {
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .node_declarations(&zid))
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

/// What the network's access-control policies would do to `key_expr`.
///
/// ACL is the quietest failure Zenoh has: a node that denies
/// `declare_subscriber` on an expression covering yours does not refuse the
/// subscription or log at you, the samples simply never come. This is how the
/// UI can say so instead of showing a healthy network and no data.
///
/// `message` is a Zenoh message kind as the configuration spells it —
/// `declare_subscriber`, `put`, `query`, `liveliness_token` and so on.
#[tauri::command]
pub(crate) async fn acl_findings<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    key_expr: String,
    message: String,
) -> Result<Vec<AclFinding>> {
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .acl_findings(&key_expr, &message))
}

/// Which storages would keep data published on `key_expr`.
///
/// Answers "can I read this back later, and from where" — which nothing else on
/// a Zenoh network will tell you. A key covered only by the built-in `memory`
/// volume is durable exactly until the node holding it restarts, and the reply
/// says so.
#[tauri::command]
pub(crate) async fn storage_coverage<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    key_expr: String,
) -> Result<Vec<StorageCoverage>> {
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .storage_coverage(&key_expr))
}

/// Every declaration of one kind at or below `prefix`, and who made it.
///
/// What the counters on a key node are counting. The tile says how many; this
/// is the list behind it, so the two are computed by the same walk and cannot
/// disagree about what "below" means.
#[tauri::command]
pub(crate) async fn declarations_under<R: Runtime>(
    app: AppHandle<R>,
    session_id: SessionId,
    prefix: String,
    kind: DeclarationKind,
) -> Result<Vec<KeyDeclaration>> {
    Ok(app
        .zenoh_sessions()?
        .get(&session_id)?
        .declarations_under(&prefix, kind))
}
