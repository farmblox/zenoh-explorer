//! Integration tests for the first-party plugins, driven through Tauri's own
//! IPC layer.
//!
//! These use `tauri::test::mock_builder`, which runs a real `tauri::App` on a
//! mock runtime — no window, no webview, no display server. That means the test
//! exercises the whole path the frontend uses: argument deserialisation from
//! JSON, `camelCase` renaming, the command body, and serialisation of the reply.
//! A plain unit test on the command function would skip every one of those, and
//! they are where the interesting mistakes live.
//!
//! Runs on macOS, unlike the `WebDriver` suite.

use serde::de::DeserializeOwned;
use serde_json::json;
use tauri::test::mock_builder;
use tauri::webview::InvokeRequest;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Builds an app with the plugins under test registered.
///
/// Uses `generate_context!` rather than `mock_context`, because a command is
/// only reachable if the ACL authorises it — and that ACL is compiled from
/// `capabilities/default.json` by this crate's build script. A mock context
/// carries an empty ACL, so every invoke would come back "Plugin not found".
fn test_app() -> tauri::App<tauri::test::MockRuntime> {
    mock_builder()
        .plugin(tauri_plugin_zenoh_session::init())
        .plugin(tauri_plugin_zenoh_keyspace::init())
        .build(tauri::generate_context!())
        .expect("the mock app must build")
}

/// Invokes a command the way the webview would and decodes the reply.
fn invoke<T: DeserializeOwned>(
    app: &tauri::App<tauri::test::MockRuntime>,
    command: &str,
    body: serde_json::Value,
) -> Result<T, serde_json::Value> {
    let webview = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .build()
        .expect("mock webview must build");

    let response = tauri::test::get_ipc_response(
        &webview,
        InvokeRequest {
            cmd: command.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            // The ACL grants these commands "on: local" only. Tauri treats a
            // request as local when its URL matches the app's own protocol,
            // which is `tauri://localhost` everywhere except Windows/Android.
            url: "tauri://localhost".parse().expect("valid url"),
            body: body.into(),
            headers: tauri::http::HeaderMap::default(),
            invoke_key: tauri::test::INVOKE_KEY.to_string(),
        },
    );

    match response {
        // A success carries an `InvokeResponseBody` that still needs decoding;
        // a failure is already the serialised `CommandError`.
        Ok(body) => Ok(body.deserialize().expect("reply must decode")),
        Err(value) => Err(value),
    }
}

#[test]
fn analyse_key_expr_reports_a_canonical_expression() {
    let app = test_app();
    let analysis: serde_json::Value = invoke(
        &app,
        "plugin:zenoh-keyspace|analyse_key_expr",
        json!({ "expr": "fleet/*/telemetry" }),
    )
    .expect("analysis must succeed");

    assert_eq!(analysis["valid"], json!(true));
    assert_eq!(analysis["isCanonical"], json!(true));
    assert_eq!(analysis["chunkCount"], json!(3));
    assert_eq!(analysis["hasWildcards"], json!(true));
}

#[test]
fn analyse_key_expr_rewrites_a_non_canonical_expression() {
    let app = test_app();
    let analysis: serde_json::Value = invoke(
        &app,
        "plugin:zenoh-keyspace|analyse_key_expr",
        json!({ "expr": "fleet/**/*" }),
    )
    .expect("analysis must succeed");

    assert_eq!(analysis["valid"], json!(true));
    assert_eq!(analysis["isCanonical"], json!(false));
    assert_eq!(analysis["canonical"], json!("fleet/*/**"));
}

#[test]
fn test_key_expr_matches_through_the_ipc_boundary() {
    let app = test_app();
    let results: serde_json::Value = invoke(
        &app,
        "plugin:zenoh-keyspace|test_key_expr",
        json!({
            "expr": "fleet/**/pose",
            "candidates": ["fleet/pose", "fleet/agv/07/pose", "infra/pose"],
        }),
    )
    .expect("match test must succeed");

    let rows = results.as_array().expect("an array of results");
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["matches"], json!(true), "** matches zero chunks");
    assert_eq!(rows[1]["matches"], json!(true), "** matches two chunks");
    assert_eq!(
        rows[2]["matches"],
        json!(false),
        "a different prefix must not match"
    );
}

#[test]
fn a_command_against_an_unknown_session_reports_the_right_code() {
    let app = test_app();
    let error: serde_json::Value = invoke::<serde_json::Value>(
        &app,
        "plugin:zenoh-keyspace|expand_keys",
        json!({ "sessionId": "ses_does_not_exist", "prefix": "" }),
    )
    .expect_err("an unknown session must fail");

    // The discriminant is the contract the frontend branches on, so it is
    // asserted rather than the prose message.
    assert_eq!(error["code"], json!("unknownSession"));
}

#[test]
fn the_session_registry_starts_empty() {
    let app = test_app();
    let sessions: serde_json::Value = invoke(&app, "plugin:zenoh-session|list_sessions", json!({}))
        .expect("listing must succeed");

    assert_eq!(sessions, json!([]));
}
