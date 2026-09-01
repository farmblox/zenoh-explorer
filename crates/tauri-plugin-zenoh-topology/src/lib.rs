//! Topology, scouting and route tracing.
//!
//! Everything here answers "what does the network look like?". It holds no
//! state of its own: sessions come from
//! [`tauri_plugin_zenoh_session`], which is why that plugin must be registered
//! first.

mod commands;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

/// Registers the plugin.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zenoh-topology")
        .invoke_handler(tauri::generate_handler![
            commands::resync,
            commands::scout,
            commands::route_trace,
        ])
        .build()
}
