//! Wiring that belongs to the shell rather than to any one plugin.

use tauri::{AppHandle, Manager, Runtime};

/// Label of the window created from `tauri.conf.json`.
pub(crate) const MAIN_WINDOW: &str = "main";

/// URL scheme the explorer answers to, e.g.
/// `zenoh-explorer://connect?endpoint=tcp/router.internal:7447`.
const DEEP_LINK_SCHEME: &str = "zenoh-explorer";

/// Frontend event carrying a deep link that arrived after startup.
const DEEP_LINK_EVENT: &str = "zenoh://deep-link";

/// The log plugin, configured to write both to a rotating file and to the
/// webview console so a user can read the same log the developer would.
pub(crate) fn logging<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        })
        // Zenoh is extremely chatty at debug level; keep it at warn unless
        // someone is deliberately diagnosing the transport layer.
        .level_for("zenoh", log::LevelFilter::Warn)
        .level_for("zenoh_transport", log::LevelFilter::Warn)
        .level_for("zenoh_shm", log::LevelFilter::Warn)
        // tauri-runtime-wry 2.11.4 logs "web content process terminated" from
        // OUTSIDE the closure that handles it, so the line prints when the
        // handler is REGISTERED — once, at every startup — not when the webview
        // dies. The message is misinformation until that is fixed upstream.
        .level_for("tauri_runtime_wry", log::LevelFilter::Info)
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("zenoh-explorer".into()),
            },
        ))
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Webview,
        ))
        .build()
}

/// Brings the existing window forward. Used when a second launch is rejected.
pub(crate) fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Registers the global shortcut that summons the explorer.
///
/// Returns nothing: another application may already own the combination, and
/// that is a fact about the user's machine rather than a startup failure.
#[cfg(desktop)]
pub(crate) fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };

    // Cmd/Ctrl + Shift + Z. Chosen to avoid every default editor binding.
    let summon = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyZ);

    let registered = app
        .global_shortcut()
        .on_shortcut(summon, |app, _shortcut, event| {
            // Fire on press only; without this the handler also runs on release.
            if event.state() == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        });

    // Another application may already own this combination. That is a fact
    // about the user's machine, not a startup failure, so log it and move on.
    if let Err(err) = registered {
        tracing::warn!(error = %err, "could not register the summon shortcut");
    }
}

/// No global shortcuts on mobile.
#[cfg(not(desktop))]
pub(crate) fn register_shortcuts<R: Runtime>(_app: &AppHandle<R>) {}

/// Hides the window if it is focused, otherwise brings it to the front.
#[cfg(desktop)]
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    if window.is_focused().unwrap_or(false) {
        let _ = window.hide();
    } else {
        focus_main_window(app);
    }
}

/// Starts listening for `zenoh-explorer://` URLs.
#[cfg(desktop)]
pub(crate) fn register_deep_links<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_deep_link::DeepLinkExt;

    // Only needed for dev builds on Linux and Windows, where no installer has
    // registered the scheme yet. It is a no-op elsewhere.
    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    let _ = app.deep_link().register(DEEP_LINK_SCHEME);

    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls: Vec<String> = event.urls().iter().map(ToString::to_string).collect();
        handle_deep_links(&handle, &urls);
    });
}

/// No deep links on mobile builds of this app.
#[cfg(not(desktop))]
pub(crate) fn register_deep_links<R: Runtime>(_app: &AppHandle<R>) {}

/// Forwards any `zenoh-explorer://` URLs to the frontend, which decides what a
/// given link means. Keeping the parsing in TypeScript means adding a new link
/// shape does not need a Rust change.
pub(crate) fn handle_deep_links<R: Runtime>(app: &AppHandle<R>, candidates: &[String]) {
    use tauri::Emitter;

    let links: Vec<&String> = candidates
        .iter()
        .filter(|url| url.starts_with(DEEP_LINK_SCHEME))
        .collect();

    if links.is_empty() {
        return;
    }
    focus_main_window(app);
    if let Err(err) = app.emit(DEEP_LINK_EVENT, &links) {
        tracing::warn!(error = %err, "could not deliver deep link to the webview");
    }
}
