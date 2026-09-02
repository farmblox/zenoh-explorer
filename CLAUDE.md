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

**A backoff needs a non-zero `connect/timeout_ms` to run at all.** Zenoh reads
the global connect timeout first and takes a "connect once, do not retry" path
when it is zero, so `connection.rs` sets `-1` alongside the backoff unless the
user gave a timeout of their own. Without it the retry config is written,
accepted, and ignored.

This used to be load-bearing because the default was mode-dependent — `-1` for
a router or peer but `0` for a CLIENT, which is how the explorer connects. Zenoh
1.9 made it a uniform `-1`, so on the version we build against the explicit
value is belt-and-braces rather than the thing that makes retry work. It stays
because it is still correct, and because a profile can be pointed at an older
router. `scouting.timeout` changed in the same release, `3000` to `-1`, and the
autoconnect defaults now include `client`.

**`connect.retry` is an `Option` block, so its keys cannot be reached by path.**
`insert_json5` resolves against what already exists rather than creating it, so
`connect/retry/period_init_ms` is rejected with "unknown key" when `retry` is
unset. Write the whole object in one go. Every other nested block we touch
(`scouting/multicast`, `transport/link/tls`) derives `Default` and is always
present, which is why this is the only one. `config.rs` has a test that sets
every option at once, because emitting the right key and having Zenoh accept it
are different things.

**`adminspace.enabled` defaults to `false` in Zenoh 1.x.** Most "the explorer
sees nothing" situations are this. Do not treat an empty admin-space reply as an
empty network — the probe already reports it as a diagnostic.

**Regions are `region_name`, not a convention.** Zenoh 1.9 added a real
`region_name` to the node configuration, and it is what
`gateway.south[].filters[].region_names` matches on. It is read from
`@/*/*/config` and wins; `metadata.location` is a fallback, because
`region_name` is null by default. `NodeSummary.region_source` says which
answered. Do not confuse either with a LINK's region (`north`,
`south:0:peer`), which names a routing tree and belongs to the link.

**A gateway hides its south region on purpose.** Zenoh's deployment model says
a gateway "will hide non needed details of the sub region(s) to the upper
region (number of nodes, topology, individual subscribers and queryables)". So
a graph can be complete and still look small, and `unverified_nodes` alone
cannot tell the two apart — the probe emits a diagnostic naming the gateways
instead. `gateway.south` defaults to `"auto"`, which is a preset and not a
region, so only an explicit array counts.

**ACL is the quietest failure Zenoh has.** A node denying `declare_subscriber`
on an expression covering yours refuses nothing and logs nothing; the samples
never arrive while every other diagnostic reports a healthy network, because it
is one. `acl.rs` reads the policy and says what it would do, using
`keyexpr_tools` rather than a second matcher. Two subtleties it honours: a rule
is inert until a POLICY binds it to a subject, and ACL cannot change at runtime,
so one read per node is enough.

**Storages come from config, not from `status/`.** Both describe the same
storages, but the configuration schema is documented and the status one
explicitly is not. The topology probe already fetches configuration, so this
costs no extra query — and every wildcard admin query costs its full timeout.
A key held only by the built-in `memory` volume is durable until the node
restarts, which `StorageSummary::in_memory` exists to say.

**The topology probe runs three queries concurrently.** Nodes, link-state and
configuration are independent and each costs its full timeout, so `tokio::join!`
makes a probe as slow as the slowest rather than as slow as all three.

**Zenoh rejects data stamped more than 100ms from local time**, with "Error
treating timestamp for received Data". `SampleRecord::drift_ms` is where that
can be seen coming rather than diagnosed afterwards. Timestamping is off by
default, so a sample often carries no stamp at all — `None` is not a healthy
clock, it is no reading.

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
all five kinds Zenoh publishes — `subscriber`, `publisher`, `queryable`,
`querier` and `token` — whose REPLY KEYS carry the declared expression. The
selectors are built from `DeclarationKind::admin_segment`, so a kind cannot be
added to the enum and then quietly never read. Without it an idle-but-configured network looks identical
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

`crates/zenoh-explorer-core/tests/tap_delivers.rs` is the only test that opens
real Zenoh sessions — two peers on loopback with scouting off, on their own
ports because cargo runs tests in one process and two listeners on one port is
`EADDRINUSE`. Everything else in the crate is a pure function over a reply, a
config or a key. Add to it when a change is about data actually moving.

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
