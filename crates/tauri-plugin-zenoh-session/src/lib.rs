//! Session lifecycle, and the foundation the other Zenoh Explorer plugins sit on.
//!
//! # Why this is a plugin
//!
//! The explorer's backend is split into four Tauri plugins — `zenoh-session`,
//! `zenoh-topology`, `zenoh-keyspace` and `zenoh-data` — rather than one
//! monolithic command list. Each owns its commands, its permission set and its
//! slice of the API surface, which means a capability file can grant exactly
//! the reach a window needs, and a domain can grow without widening anything
//! else.
//!
//! This plugin is the base of that stack: it owns the
//! [`SessionManager`](zenoh_explorer_core::SessionManager) and the bridge that
//! turns core events into Tauri events. The other three depend on it for both,
//! through [`ZenohSessionExt`].
//!
//! # Usage
//!
//! ```no_run
//! tauri::Builder::default()
//!     .plugin(tauri_plugin_zenoh_session::init())
//!     .plugin(tauri_plugin_zenoh_topology::init())
//!     .run(tauri::generate_context!())
//!     .expect("failed to start");
//! ```

mod commands;
mod error;
mod sink;

use std::sync::Arc;

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};
use zenoh_explorer_core::SessionManager;

pub use error::{CommandErrorDto, Error, Result};
pub use sink::{TauriSink, ZENOH_EVENT};

/// The plugin's managed state.
#[derive(Debug)]
pub struct ZenohSessions {
    manager: Arc<SessionManager>,
}

impl ZenohSessions {
    /// The session registry.
    #[must_use]
    pub fn manager(&self) -> &Arc<SessionManager> {
        &self.manager
    }
}

/// Reaches the session registry from an `AppHandle`, a `Window`, or anything
/// else implementing [`Manager`].
///
/// Sibling plugins use this instead of managing their own state, so there is
/// exactly one place a session can be opened or closed.
pub trait ZenohSessionExt<R: Runtime> {
    /// The shared session registry.
    ///
    /// # Errors
    ///
    /// Returns [`Error::NotInitialised`] if the `zenoh-session` plugin was not
    /// registered before the plugin calling this.
    fn zenoh_sessions(&self) -> Result<Arc<SessionManager>>;
}

impl<R: Runtime, T: Manager<R>> ZenohSessionExt<R> for T {
    fn zenoh_sessions(&self) -> Result<Arc<SessionManager>> {
        self.try_state::<ZenohSessions>()
            .map(|state| Arc::clone(&state.manager))
            .ok_or(Error::NotInitialised)
    }
}

/// Registers the plugin.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zenoh-session")
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::list_sessions,
            commands::session_summary,
            commands::transports,
        ])
        .setup(|app, _api| {
            let sink = Arc::new(TauriSink::new(app.clone()));
            app.manage(ZenohSessions {
                manager: Arc::new(SessionManager::new(sink)),
            });
            Ok(())
        })
        .on_event(|app, event| {
            // Zenoh transports deserve an orderly close. Without this the
            // process exits with sessions still open and peers only notice on
            // their own keepalive timeout.
            if let tauri::RunEvent::Exit = event
                && let Ok(manager) = app.zenoh_sessions()
            {
                tauri::async_runtime::block_on(manager.close_all());
            }
        })
        .build()
}
