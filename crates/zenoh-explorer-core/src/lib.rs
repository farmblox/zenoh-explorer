//! Zenoh network introspection, with no dependency on any UI framework.
//!
//! This crate is where every decision about *what the explorer knows* lives:
//! how a connection profile becomes a Zenoh config, how the admin space is read
//! into a topology graph, how the key space is indexed, and how a firehose
//! subscription is turned into something a UI can render.
//!
//! The Tauri layer above it contributes no domain logic — it maps commands to
//! these APIs and forwards [`event::AppEvent`]s to the webview. Keeping the
//! split that sharp is what makes the domain testable without a window.
//!
//! # Layout
//!
//! - [`config`] — connection profiles and their translation to `zenoh::Config`
//! - [`connection`] — timeouts, retry and what `open` waits for
//! - [`session`] — open sessions and the registry that owns them
//! - [`admin`] — reading topology out of `@/**`
//! - [`diagnose`] — turning transport failures into something actionable
//! - [`discovery`] — every way to learn what is on the network, and which one told us
//! - [`scout`] — discovering nodes we are not connected to
//! - [`tap`] — subscriptions, coalesced for the UI
//! - [`transport`] — transports, endpoints and TLS material
//! - [`keys`] — the observed key-space trie
//! - [`keyexpr_tools`] — key-expression analysis and match testing
//! - [`search`] — one matcher, ranking nodes and keys for the command palette
//! - [`model`] — the serializable types shared with the frontend
//! - [`event`] — push events and the sink they go into

pub mod admin;
pub mod config;
pub mod connection;
pub mod declarations;
pub mod diagnose;
pub mod discovery;
pub mod error;
pub mod event;
pub mod keyexpr_tools;
pub mod keys;
pub mod model;
pub mod pulse;
pub mod scout;
pub mod search;
pub mod session;
pub mod tap;
pub mod time;
pub mod transport;

pub use config::{ConnectionProfile, SessionMode};
pub use connection::{ConnectionOptions, OpenConditions, RetryConfig};
pub use error::{Error, Result};
pub use event::{AppEvent, DiagnosticLevel, EventSink};
pub use session::{ManagedSession, SessionManager, SessionSummary};
pub use tap::{SampleSink, TapSpec, TapStats};
pub use transport::{CertSource, TlsConfig, Transport};
