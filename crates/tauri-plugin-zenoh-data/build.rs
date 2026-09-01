//! Generates this plugin's permission set from its command list.

/// Commands exposed by the data-plane plugin.
const COMMANDS: &[&str] = &[
    "query",
    "put",
    "delete",
    "start_tap",
    "stop_tap",
    "list_taps",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
