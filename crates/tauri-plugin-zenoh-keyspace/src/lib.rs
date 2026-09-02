//! The key space: what keys exist, and what a key expression would match.
//!
//! The two halves are deliberately different in kind. Expanding the tree needs
//! a session, because it reports what the explorer has actually observed.
//! Analysing an expression does not — it is a pure function over a string,
//! answered by `zenoh-keyexpr` itself rather than a reimplemented matcher.

mod commands;

use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};

/// Registers the plugin.
#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zenoh-keyspace")
        .invoke_handler(tauri::generate_handler![
            commands::expand_keys,
            commands::refresh_declarations,
            commands::node_declarations,
            commands::clear_keys,
            commands::analyse_key_expr,
            commands::test_key_expr,
            commands::acl_findings,
            commands::storage_coverage,
            commands::declarations_under,
        ])
        .build()
}
