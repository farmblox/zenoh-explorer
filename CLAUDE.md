# Notes for Claude

Read this before making changes. It records decisions that are not obvious from
the code.

## The one rule

**All logic lives in Rust. React only renders.** Nothing in the frontend decides
anything about a Zenoh network. If you find yourself writing a key-expression
matcher, a topology heuristic, or a parser in TypeScript, it belongs in
`crates/zenoh-explorer-core` instead.

## Layout

```
crates/zenoh-explorer-core/      domain logic, no Tauri, no UI, 63 tests
crates/tauri-plugin-zenoh-*/     four plugins: session, topology, keyspace, data
src-tauri/                       shell only; registers plugins
src/                             React frontend
docs/architecture.md             why it is shaped this way — read this too
```

`zenoh-session` owns the `SessionManager` and the event bridge; the other three
plugins depend on it through `ZenohSessionExt`. Do not add a second source of
session state.

## Zenoh facts established by reading the 1.10 API in full

**Use the library's primitives.** Before hand-rolling, check `zenoh::handlers`
(`RingChannel`, `FifoChannel`), `zenoh::matching`, `zenoh::query::Querier` and
`zenoh-ext`. The tap's ring buffer is hand-written ONLY because `RingChannel`
discards silently and a diagnostic tool has to show its drop count.

**Topology does not require the admin space.**
`info().transport_events_listener()` and `link_events_listener()`, both with
`.history(true)`, replay current state and then stream changes, asking nothing
of the far end. Polling `@/**` is the richer source, not the primary one.

**Liveliness is application presence, not node presence.** Zenoh does not
auto-declare a token per session; tokens are app-declared. Do not build node
discovery on it.

**QUIC and TLS read the same `transport/link/tls` config block.** `udp` is not
QUIC — same port number, nothing else in common.

**Endpoints are `<proto>/<address>[?<metadata>][#<config>]`.** The serialised
`Transport` value is exactly the scheme string, and a test enforces that.

**Certificates travel as paths, not contents.** Zenoh opens them itself, so key
material never crosses the IPC boundary. `_base64` variants exist for profiles
that must travel; `TlsConfig::redacted()` before logging either.

## Things that will trip you up

**`adminspace.enabled` defaults to `false` in Zenoh 1.x.** Most "the explorer
sees nothing" situations are this. Do not treat an empty admin-space reply as an
empty network — the probe already reports it as a diagnostic.

**Generated types.** Anything with `#[derive(TS)]` regenerates into
`src/ipc/generated/` via `pnpm bindings`. That directory is gitignored and must
never be hand-edited. `u64` maps to `number`, not `bigint` — see
`.cargo/config.toml` for why.

**Two paths to the frontend.** Broadcast state goes over the `zenoh://event`
Tauri event as a tagged `AppEvent`. Streams (taps) use `tauri::ipc::Channel`.
Do not push high-rate data through events.

**The frontend never pulls.** Data reaches a view one way: an `AppEvent`.
Transports, declarations and samples are pushed by Zenoh; the admin space is a
queryable and cannot be, so `pulse::TopologyPulse` re-probes it whenever a live
signal says the network moved, coalescing bursts. There are no refresh buttons
and no polling. `resync` exists for the one case nothing announces —
`adminspace.enabled` being switched on after the explorer connected.

**A wildcard admin query always runs to its timeout.** With
`QueryTarget::All` there is no way to know every queryable has answered, so
Zenoh waits the full duration and the router logs "Didn't receive final reply".
That is normal, not a fault. Never put a user-facing spinner on one.

**The keyspace comes from declarations, not traffic.** `declarations.rs` reads
`@/*/*/subscriber/**` and `@/*/*/queryable/**`, whose REPLY KEYS carry the
declared expression. Without it an idle-but-configured network looks identical
to an empty one. The reply payload is a `Sources` object naming the declaring
zids — not read yet, and the obvious next step.

**`parking_lot` guards are not `Send`.** Holding one across an `.await` makes
the future `!Send` and every Tauri command calling it fails to compile. Read
locked state into a local first.

**Adding a command** needs four things: the `#[tauri::command]`, its name in
that plugin's `build.rs` `COMMANDS` array, a decision about
`permissions/default.toml`, and a wrapper in `guest-js/index.ts`.

**Adding a view** is a folder in `src/features/` plus one entry in
`src/navigation/views.ts`. Nothing else.

**Views are keyed by session** in `AppShell`, so view-local state resets when
you switch tabs. Do not write a reset effect for that.

## Pinned versions and why

- **TypeScript is pinned to 6.0.3.** TS 7 is `latest` but typescript-eslint 8
  does not support it yet. Bump when it does.
- **`tauri-plugin-updater` is behind the `updater` cargo feature**, because the
  plugin refuses to initialise without a signing pubkey. See
  `docs/releasing.md`.
- **WebDriver plugins are behind the `e2e` feature** and a config overlay. Never
  enable them for a release: they embed a server that runs arbitrary JS.

## Checks

`pnpm check` runs everything CI does. Clippy is `-D warnings` with `pedantic`
on, and TypeScript has `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Fix rather than suppress; where a suppression is
right, it carries a comment saying why.

## Style

Comments explain _why_ the code is the way it is. The codebase has a lot of
them because most of the non-obvious decisions here are about Zenoh's behaviour
or Tauri's constraints, and those are worth writing down.

**No archaeology.** Never write what the code used to be, what bug a line
fixed, what approach was tried first, or what someone got wrong. Git holds the
history. A comment describes the design that exists and the constraint that
shapes it — nothing else. "Renders lighter than the default, which is why the
weight is 450" is right; "the first pass had this wrong" is not.

Do not add comments that restate the code.

Docs in `README.md`, `CONTRIBUTING.md` and `docs/` are written to read like a
person wrote them. Keep that: plain sentences, varied length, no scaffolding
phrases, no em-dash-heavy parallel constructions.

## Design

Tokens live in `src/styles/theme.css` and are the only place a colour literal
appears. Progressive disclosure is a governing constraint, not a preference —
see the table in `docs/architecture.md`.

The design reference is `design/mockup/`, exported from Claude Design.
Screenshots in the README are still the mockup; replace them with real ones once
the views are finished.
