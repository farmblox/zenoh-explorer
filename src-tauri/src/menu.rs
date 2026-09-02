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
//!
//! Every id here is an `ActionId` in `src/app/useAppActions.ts`, which is where
//! it is acted on. That is deliberately the same map the keyboard uses: a menu
//! item and its shortcut cannot disagree about what they do, because they run
//! the same function.

use tauri::menu::{AboutMetadata, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime, image::Image};

/// Frontend event carrying the id of the menu item that was chosen.
const MENU_EVENT: &str = "zenoh://menu";

/// Which cluster a view sits in, so the Go menu draws the seams the sidebar
/// draws. Not a label: the groups are separators there too, never headings.
type Group = u8;

/// The views, in sidebar order.
///
/// Kept in step with `src/navigation/views.ts` by hand, because that registry
/// maps ids to React components and cannot move here. The failure mode is mild
/// and one-directional: an id that drifts reaches the frontend, matches no
/// action and is ignored, so a stale entry is a menu item that does nothing
/// rather than a crash. Labels are the sidebar's own, sentence case and all —
/// the menu and the sidebar naming the same view differently would be worse
/// than either matching the platform's title case.
const VIEWS: &[(&str, &str, Option<&str>, Group)] = &[
    ("view:topology", "Topology", Some("CmdOrCtrl+1"), 0),
    ("view:nodes", "Nodes", Some("CmdOrCtrl+2"), 0),
    ("view:regions", "Regions", None, 0),
    ("view:keyspace", "Keyspace", Some("CmdOrCtrl+3"), 1),
    ("view:admin", "Admin space", None, 1),
    ("view:scouting", "Scouting", None, 2),
    ("view:events", "Events", None, 2),
    ("view:transport", "Transport", None, 3),
    ("view:config", "Configuration", None, 3),
];

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
        go_submenu(app)?,
        window_submenu(app)?,
        help_submenu(app)?,
    ];
    #[cfg(not(target_os = "macos"))]
    let submenus: Vec<Submenu<R>> = vec![
        file_submenu(app)?,
        edit_submenu(app)?,
        view_submenu(app)?,
        go_submenu(app)?,
        window_submenu(app)?,
        help_submenu(app)?,
    ];

    let refs: Vec<&dyn IsMenuItem<R>> = submenus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<R>)
        .collect();

    app.set_menu(Menu::with_items(app, &refs)?)?;

    app.on_menu_event(|app, event| {
        // The shell has no idea what "Re-read the network" means for the
        // current tab. The frontend does, so forward the id and let it decide.
        if let Err(err) = app.emit(MENU_EVENT, event.id().as_ref()) {
            tracing::warn!(error = %err, "could not deliver menu event to the webview");
        }
    });

    Ok(())
}

/// Metadata for the About panel.
fn about_metadata<R: Runtime>(app: &AppHandle<R>) -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("Zenoh Explorer".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("© Farmblox. Apache-2.0.".into()),
        website: Some("https://github.com/farmblox/zenoh-explorer".into()),
        website_label: Some("Source".into()),
        icon: about_icon(app),
        ..Default::default()
    }
}

/// The app icon, with less of its Dock-safe transparent margin.
///
/// `AppKit` gives the About panel its own breathing room. Passing the Dock asset
/// unchanged therefore makes the tile look smaller than the native icons beside
/// it. Half the fully transparent border is removed here; opaque artwork is
/// never cropped, and the bundled icon itself remains untouched.
fn about_icon<R: Runtime>(app: &AppHandle<R>) -> Option<Image<'static>> {
    trim_about_icon(app.default_window_icon()?)
}

/// Removes half of an image's fully transparent outer border.
fn trim_about_icon(source: &Image<'_>) -> Option<Image<'static>> {
    let width = usize::try_from(source.width()).ok()?;
    let height = usize::try_from(source.height()).ok()?;
    if width == 0 || height == 0 {
        return None;
    }

    let transparent_border = source
        .rgba()
        .chunks_exact(4)
        .enumerate()
        .filter(|(_, pixel)| pixel[3] != 0)
        .map(|(index, _)| {
            let x = index % width;
            let y = index / width;
            x.min(width - 1 - x).min(y).min(height - 1 - y)
        })
        .min()?;
    let inset = transparent_border / 2;

    if inset == 0 {
        return Some(source.clone().to_owned());
    }

    let cropped_width = width - inset * 2;
    let cropped_height = height - inset * 2;
    let mut rgba = Vec::with_capacity(cropped_width * cropped_height * 4);

    for y in inset..height - inset {
        let start = (y * width + inset) * 4;
        let end = start + cropped_width * 4;
        rgba.extend_from_slice(&source.rgba()[start..end]);
    }

    Some(Image::new_owned(
        rgba,
        u32::try_from(cropped_width).ok()?,
        u32::try_from(cropped_height).ok()?,
    ))
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
            &PredefinedMenuItem::about(app, None, Some(about_metadata(app)))?,
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

/// Session lifecycle.
///
/// There is deliberately no Export here. Nothing in this app writes a file yet,
/// and a menu item for a feature that does not exist is worse than a missing
/// one: it is discovered by being clicked.
fn file_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let connect = MenuItem::with_id(
        app,
        "connect",
        "Connect to Network…",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    // Shift, because plain ⌘W is Close Window in the Window menu and this is a
    // single-window app — the two would collide on the one binding.
    let close_session = MenuItem::with_id(
        app,
        "close-session",
        "Close Session",
        true,
        Some("CmdOrCtrl+Shift+W"),
    )?;

    // Pushed to only off macOS, where Settings and Quit join this menu; on
    // macOS the block below is compiled out and the `mut` is genuinely unused.
    #[allow(unused_mut)]
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&connect, &close_session];

    // Elsewhere there is no application menu, so Settings and Quit live here.
    #[cfg(not(target_os = "macos"))]
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    #[cfg(not(target_os = "macos"))]
    let quit = PredefinedMenuItem::quit(app, None)?;
    #[cfg(not(target_os = "macos"))]
    let separator = PredefinedMenuItem::separator(app)?;
    #[cfg(not(target_os = "macos"))]
    {
        items.push(&separator);
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

/// What you do to the window. Where you go is the Go menu.
fn view_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let palette = MenuItem::with_id(
        app,
        "palette",
        "Search or Run a Command…",
        true,
        Some("CmdOrCtrl+K"),
    )?;
    let sidebar = MenuItem::with_id(app, "sidebar", "Toggle Sidebar", true, Some("CmdOrCtrl+B"))?;
    let status_bar = MenuItem::with_id(app, "status-bar", "Toggle Status Bar", true, None::<&str>)?;
    let resync = MenuItem::with_id(
        app,
        "resync",
        "Re-read the Network",
        true,
        Some("CmdOrCtrl+R"),
    )?;

    Submenu::with_items(
        app,
        "View",
        true,
        &[
            &palette,
            &PredefinedMenuItem::separator(app)?,
            &sidebar,
            &status_bar,
            &PredefinedMenuItem::separator(app)?,
            &resync,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )
}

/// Every view, in sidebar order and with the sidebar's group seams.
fn go_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let items = VIEWS
        .iter()
        .map(|(id, label, accelerator, _)| MenuItem::with_id(app, *id, *label, true, *accelerator))
        .collect::<tauri::Result<Vec<_>>>()?;

    // One fewer than the number of groups would do, but building as many as
    // there are groups costs nothing and needs no arithmetic to be right.
    let separators = VIEWS
        .iter()
        .map(|_| PredefinedMenuItem::separator(app))
        .collect::<tauri::Result<Vec<_>>>()?;

    let mut refs: Vec<&dyn IsMenuItem<R>> = Vec::with_capacity(items.len() + separators.len());
    let mut separators = separators.iter();
    let mut group = VIEWS.first().map(|(_, _, _, group)| *group);

    for (item, (_, _, _, entry_group)) in items.iter().zip(VIEWS) {
        if group != Some(*entry_group) {
            group = Some(*entry_group);
            if let Some(separator) = separators.next() {
                refs.push(separator);
            }
        }
        refs.push(item);
    }

    Submenu::with_items(app, "Go", true, &refs)
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
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&shortcuts, &docs, &report];

    // No application menu off macOS, so About belongs here.
    #[cfg(not(target_os = "macos"))]
    let about = PredefinedMenuItem::about(app, None, Some(about_metadata(app)))?;
    #[cfg(not(target_os = "macos"))]
    let separator = PredefinedMenuItem::separator(app)?;
    #[cfg(not(target_os = "macos"))]
    {
        items.push(&separator);
        items.push(&about);
    }

    Submenu::with_items(app, "Help", true, &items)
}

#[cfg(test)]
mod tests {
    use super::trim_about_icon;
    use tauri::image::Image;

    #[test]
    fn the_about_icon_keeps_artwork_and_half_the_transparent_border() {
        let mut rgba = vec![0; 6 * 6 * 4];
        for y in 2..4 {
            for x in 2..4 {
                rgba[(y * 6 + x) * 4 + 3] = 255;
            }
        }
        let source = Image::new_owned(rgba, 6, 6);

        let trimmed = trim_about_icon(&source).expect("the icon contains opaque artwork");

        assert_eq!(trimmed.width(), 4);
        assert_eq!(trimmed.height(), 4);
        assert_eq!(trimmed.rgba()[23], 255);
        assert_eq!(trimmed.rgba()[(2 * 4 + 2) * 4 + 3], 255);
    }
}
