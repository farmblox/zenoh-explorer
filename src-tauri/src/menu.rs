//! The native application menu.
//!
//! The window chrome is custom-drawn (`titleBarStyle: "Overlay"` in
//! `tauri.conf.json`), but the app still needs a real menu bar — on macOS
//! especially, where a missing Services or Hide item is immediately noticeable
//! and the standard shortcuts are muscle memory.
//!
//! Items that map to explorer features carry an id and emit `zenoh://menu`, so
//! the frontend acts on them with its own state. Everything the OS can handle
//! itself is a `PredefinedMenuItem` and never reaches our code.

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Frontend event carrying the id of the menu item that was chosen.
const MENU_EVENT: &str = "zenoh://menu";

/// Builds the menu and attaches its handler.
pub(crate) fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // The application menu is a macOS convention. On Windows and Linux its
    // contents belong in File and Help instead, which `file_submenu` and
    // `help_submenu` handle below.
    #[cfg(target_os = "macos")]
    let submenus: Vec<Submenu<R>> = vec![
        app_submenu(app)?,
        file_submenu(app)?,
        edit_submenu(app)?,
        view_submenu(app)?,
        window_submenu(app)?,
        help_submenu(app)?,
    ];
    #[cfg(not(target_os = "macos"))]
    let submenus: Vec<Submenu<R>> = vec![
        file_submenu(app)?,
        edit_submenu(app)?,
        view_submenu(app)?,
        window_submenu(app)?,
        help_submenu(app)?,
    ];

    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = submenus
        .iter()
        .map(|submenu| submenu as &dyn tauri::menu::IsMenuItem<R>)
        .collect();

    app.set_menu(Menu::with_items(app, &refs)?)?;

    app.on_menu_event(|app, event| {
        // The shell has no idea what "Refresh Topology" means for the current
        // tab. The frontend does, so forward the id and let it decide.
        if let Err(err) = app.emit(MENU_EVENT, event.id().as_ref()) {
            tracing::warn!(error = %err, "could not deliver menu event to the webview");
        }
    });

    Ok(())
}

/// Metadata for the About panel.
fn about_metadata() -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("Zenoh Explorer".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("© Farmblox. Apache-2.0.".into()),
        website: Some("https://github.com/farmblox/zenoh-explorer".into()),
        website_label: Some("Source".into()),
        ..Default::default()
    }
}

/// The macOS application menu, in the order the platform expects.
#[cfg(target_os = "macos")]
fn app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;

    Submenu::with_items(
        app,
        "Zenoh Explorer",
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata()))?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            // Populated by AppKit; the app never sees these.
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

/// Session lifecycle and export.
fn file_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let connect = MenuItem::with_id(
        app,
        "connect",
        "Connect to Network…",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let close_session = MenuItem::with_id(
        app,
        "close-session",
        "Close Session",
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let export = MenuItem::with_id(app, "export-tap", "Export Tap…", true, Some("CmdOrCtrl+S"))?;

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<R>> = vec![&connect, &close_session];

    let separator = PredefinedMenuItem::separator(app)?;
    items.push(&separator);
    items.push(&export);

    // Elsewhere there is no application menu, so Settings and Quit live here.
    #[cfg(not(target_os = "macos"))]
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    #[cfg(not(target_os = "macos"))]
    let quit = PredefinedMenuItem::quit(app, None)?;
    #[cfg(not(target_os = "macos"))]
    let tail_separator = PredefinedMenuItem::separator(app)?;
    #[cfg(not(target_os = "macos"))]
    {
        items.push(&tail_separator);
        items.push(&settings);
        items.push(&quit);
    }

    Submenu::with_items(app, "File", true, &items)
}

/// Text editing. All predefined, so the webview handles them natively.
fn edit_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )
}

/// Navigation and appearance, all forwarded to the frontend.
fn view_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let palette = MenuItem::with_id(
        app,
        "command-palette",
        "Command Palette…",
        true,
        Some("CmdOrCtrl+K"),
    )?;
    let sidebar = MenuItem::with_id(
        app,
        "toggle-sidebar",
        "Toggle Sidebar",
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let refresh = MenuItem::with_id(
        app,
        "refresh",
        "Refresh Topology",
        true,
        Some("CmdOrCtrl+R"),
    )?;

    let topology = MenuItem::with_id(app, "view-topology", "Topology", true, Some("CmdOrCtrl+1"))?;
    let peers = MenuItem::with_id(
        app,
        "view-peers",
        "Peers & Sessions",
        true,
        Some("CmdOrCtrl+2"),
    )?;
    let keyspace = MenuItem::with_id(
        app,
        "view-keyspace",
        "Key Expressions",
        true,
        Some("CmdOrCtrl+3"),
    )?;
    let tap = MenuItem::with_id(app, "view-tap", "Live Tap", true, Some("CmdOrCtrl+4"))?;

    Submenu::with_items(
        app,
        "View",
        true,
        &[
            &palette,
            &PredefinedMenuItem::separator(app)?,
            &topology,
            &peers,
            &keyspace,
            &tap,
            &PredefinedMenuItem::separator(app)?,
            &sidebar,
            &refresh,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )
}

/// Standard window controls.
fn window_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}

/// Documentation and shortcuts.
fn help_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let shortcuts = MenuItem::with_id(
        app,
        "shortcuts",
        "Keyboard Shortcuts",
        true,
        Some("CmdOrCtrl+/"),
    )?;
    let docs = MenuItem::with_id(app, "docs", "Zenoh Documentation", true, None::<&str>)?;
    let report = MenuItem::with_id(app, "report-issue", "Report an Issue", true, None::<&str>)?;

    // Appended to only off macOS, where About goes in this menu. On macOS the
    // block below is compiled out, so the `mut` is genuinely unused there and
    // would otherwise fail CI's `-D warnings`.
    #[allow(unused_mut)]
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<R>> = vec![&shortcuts, &docs, &report];

    // No application menu off macOS, so About belongs here.
    #[cfg(not(target_os = "macos"))]
    let about = PredefinedMenuItem::about(app, None, Some(about_metadata()))?;
    #[cfg(not(target_os = "macos"))]
    let separator = PredefinedMenuItem::separator(app)?;
    #[cfg(not(target_os = "macos"))]
    {
        items.push(&separator);
        items.push(&about);
    }

    Submenu::with_items(app, "Help", true, &items)
}
