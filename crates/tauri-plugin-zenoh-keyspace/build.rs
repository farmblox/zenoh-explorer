//! Generates this plugin's permission set from its command list.

/// Commands exposed by the key-space plugin.
const COMMANDS: &[&str] = &[
    "expand_keys",
    "refresh_declarations",
    "node_declarations",
    "clear_keys",
    "analyse_key_expr",
    "test_key_expr",
    "acl_findings",
    "storage_coverage",
    "declarations_under",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
