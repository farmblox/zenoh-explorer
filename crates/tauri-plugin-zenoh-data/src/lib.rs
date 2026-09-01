//! The Zenoh data plane: get, put, delete and live taps.
//!
//! # Read and write are separated on purpose
//!
//! An explorer is a read-mostly tool pointed at production networks, so
//! `put` and `delete` are excluded from this plugin's default permission set. A
//! window gets them only by asking for `zenoh-data:read-write` in its
//! capability file — which makes "this build can modify the network" a visible,
//! reviewable decision rather than an accident.

mod commands;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

/// Registers the plugin.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zenoh-data")
        .invoke_handler(tauri::generate_handler![
            commands::query,
            commands::put,
            commands::delete,
            commands::start_tap,
            commands::stop_tap,
            commands::list_taps,
        ])
        .build()
}
