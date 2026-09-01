//! Serializable data-transfer types shared with the frontend.
//!
//! Everything in this module derives [`ts_rs::TS`], so `cargo test export_bindings`
//! regenerates the matching TypeScript in `src/ipc/generated/`. Keep these types
//! free of `zenoh` internals: conversion from `zenoh` lives next to the code that
//! produces it.

mod ids;
mod keys;
mod node;
mod sample;
mod topology;

pub use ids::{SessionId, TapId};
pub use keys::{KeyKind, KeyNode, KeySpaceSnapshot};
pub use node::{LinkLocators, NodeKind, NodeSummary, TransportSummary};
pub use sample::{SampleBatch, SampleKindDto, SampleRecord};
pub use topology::{LinkSummary, TopologySnapshot};
