//! Saved connection profiles.
//!
//! Persistence is `tauri-plugin-store`; see [`store`] for why that rather than
//! a database, and for the rule about private keys. This plugin adds no managed
//! state of its own — the store plugin already owns the file — so it is a thin
//! layer of typed commands over [`store`]'s functions.
//!
//! `tauri-plugin-store` must be registered before this one.

mod commands;
mod error;
mod store;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

pub use error::{Error, Result};
pub use store::SavedProfile;

/// Registers the plugin.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zenoh-profiles")
        .invoke_handler(tauri::generate_handler![
            commands::list_profiles,
            commands::save_profile,
            commands::delete_profile,
            commands::record_connection,
        ])
        .build()
}
