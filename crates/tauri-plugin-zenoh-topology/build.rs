//! Generates this plugin's permission set from its command list.

/// Commands exposed by the topology plugin.
const COMMANDS: &[&str] = &["resync", "scout", "route_trace"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
