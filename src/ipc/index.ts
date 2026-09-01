/**
 * The IPC boundary.
 *
 * This is the only directory permitted to import from `@tauri-apps/*`. Features
 * and components call these namespaces instead, which keeps the invoke strings,
 * the argument casing and the error handling in one reviewable place — and lets
 * the whole UI be exercised without a Tauri runtime.
 *
 * Types under `generated/` are produced by `ts-rs` from the Rust definitions;
 * run `pnpm bindings` after changing a `#[derive(TS)]` type. They are the
 * contract, so nothing here re-declares a shape by hand.
 */
export * as session from "@plugin/zenoh-session";
export * as topology from "@plugin/zenoh-topology";
export * as keyspace from "@plugin/zenoh-keyspace";
export * as data from "@plugin/zenoh-data";
export * as profiles from "@plugin/zenoh-profiles";

export { pickCertificate } from "./files";

export { IpcError, toIpcError } from "./errors";
export type { CommandError, CommandErrorCode } from "./errors";

export type { AppEvent } from "./generated/AppEvent";
export type { ConnectionOptions } from "./generated/ConnectionOptions";
export type { OpenConditions } from "./generated/OpenConditions";
export type { RetryConfig } from "./generated/RetryConfig";
export type { Diagnosis } from "./generated/Diagnosis";
export type { ConnectionProfile } from "./generated/ConnectionProfile";
export type { DiagnosticLevel } from "./generated/DiagnosticLevel";
export type { KeyExprAnalysis } from "./generated/KeyExprAnalysis";
export type { KeyKind } from "./generated/KeyKind";
export type { KeyNode } from "./generated/KeyNode";
export type { KeySpaceSnapshot } from "./generated/KeySpaceSnapshot";
export type { LinkLocators } from "./generated/LinkLocators";
export type { LinkSummary } from "./generated/LinkSummary";
export type { MatchResult } from "./generated/MatchResult";
export type { NodeKind } from "./generated/NodeKind";
export type { NodeSummary } from "./generated/NodeSummary";
export type { Relation } from "./generated/Relation";
export type { SavedProfile } from "./generated/SavedProfile";
export type { SampleBatch } from "./generated/SampleBatch";
export type { SampleKindDto } from "./generated/SampleKindDto";
export type { SampleRecord } from "./generated/SampleRecord";
export type { ScoutedNode } from "./generated/ScoutedNode";
export type { SessionId } from "./generated/SessionId";
export type { SessionMode } from "./generated/SessionMode";
export type { SessionSummary } from "./generated/SessionSummary";
export type { TapId } from "./generated/TapId";
export type { TapSpec } from "./generated/TapSpec";
export type { TapStats } from "./generated/TapStats";
export type { TapSummary } from "./generated/TapSummary";
export type { CertSource } from "./generated/CertSource";
export type { ConnectivityEvent } from "./generated/ConnectivityEvent";
export type { DiscoverySource } from "./generated/DiscoverySource";
export type { TlsConfig } from "./generated/TlsConfig";
export type { Transport } from "./generated/Transport";
export type { TopologySnapshot } from "./generated/TopologySnapshot";
export type { TransportSummary } from "./generated/TransportSummary";
