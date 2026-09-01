//! Commands exposed as `plugin:zenoh-profiles|<name>`.
//!
//! Synchronous on purpose. Each is a lookup in an in-memory map plus, at most,
//! one small JSON write; Tauri spawns async commands onto the runtime, and
//! paying a task switch to avoid blocking for less time than the switch costs
//! would be the wrong trade.

use tauri::{AppHandle, Runtime};
use zenoh_explorer_core::ConnectionProfile;

use crate::error::Result;
use crate::store::{self, SavedProfile};

/// Every saved profile, most recently used first.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn list_profiles<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SavedProfile>> {
    store::list(&app)
}

/// Inserts or updates a profile, returning its id.
///
/// Pass `id` to update an existing profile; omit it to create one.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn save_profile<R: Runtime>(
    app: AppHandle<R>,
    id: Option<String>,
    profile: ConnectionProfile,
) -> Result<String> {
    store::save(&app, id, &profile)
}

/// Removes a profile.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn delete_profile<R: Runtime>(app: AppHandle<R>, id: String) -> Result<()> {
    store::delete(&app, &id)
}

/// Records that a profile was just connected with, so it sorts to the top.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn record_connection<R: Runtime>(app: AppHandle<R>, id: String) -> Result<()> {
    store::record_use(&app, &id)
}
