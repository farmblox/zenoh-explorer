//! The Zenoh Explorer application shell.
//!
//! This crate deliberately contains no domain logic. Its whole job is to
//! assemble plugins:
//!
//! - four first-party plugins (`zenoh-session`, `zenoh-topology`,
//!   `zenoh-keyspace`, `zenoh-data`) that expose
//!   [`zenoh_explorer_core`](https://docs.rs/zenoh-explorer-core) to the webview;
//! - a set of official Tauri plugins, each earning its place by backing a
//!   feature the explorer actually has.
//!
//! Everything the frontend can do is therefore either a plugin command or a
//! `zenoh://event`, and the permission for it is declared in
//! `capabilities/default.json`.

mod menu;
mod setup;

/// Builds and runs the application.
///
/// # Panics
///
/// Panics if Tauri cannot create the main window — there is no meaningful way
/// to continue without one.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must be registered before any other plugin so that a second launch
    // forwards its arguments instead of opening a rival window.
    //
    // Left out of `e2e` builds. Single-instance is exactly wrong for a test
    // harness: the driver launches its own copy, and with this registered that
    // copy hands its arguments to whatever instance is already open and exits
    // with status 0 — which the driver reports as a crash during startup. It
    // also means the suite cannot run while a dev build is open.
    #[cfg(all(desktop, not(feature = "e2e")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        setup::focus_main_window(app);
        setup::handle_deep_links(app, &argv);
    }));

    let builder = builder
        // --- first-party domain plugins -------------------------------------
        // Order matters: `zenoh-session` owns the session registry that the
        // other three reach through `ZenohSessionExt`.
        .plugin(tauri_plugin_zenoh_session::init())
        .plugin(tauri_plugin_zenoh_topology::init())
        .plugin(tauri_plugin_zenoh_keyspace::init())
        .plugin(tauri_plugin_zenoh_data::init())
        .plugin(tauri_plugin_zenoh_profiles::init())
        // --- official plugins ------------------------------------------------
        .plugin(setup::logging())
        // Registered before zenoh-profiles, which stores its
        // connections through it.
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // The WebDriver hooks the E2E suite needs. `wdio-webdriver` is the
    // embedded driver, which is what makes the suite runnable on macOS —
    // `tauri-driver` has no WKWebView backend there.
    #[cfg(all(desktop, feature = "e2e"))]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    #[cfg(all(desktop, feature = "updater"))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .setup(|app| {
            menu::install(app.handle())?;
            setup::register_shortcuts(app.handle());
            setup::register_deep_links(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Zenoh Explorer window");
}
