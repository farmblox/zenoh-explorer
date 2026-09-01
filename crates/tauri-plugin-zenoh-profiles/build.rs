//! Generates this plugin's permission set from its command list.

/// Commands exposed by the profiles plugin.
const COMMANDS: &[&str] = &[
    "list_profiles",
    "save_profile",
    "delete_profile",
    "record_connection",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
