// Keep the console window hidden in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Desktop entry point. Everything real lives in the library so that the
//! mobile entry point can share it.

fn main() {
    zenoh_explorer_lib::run();
}
