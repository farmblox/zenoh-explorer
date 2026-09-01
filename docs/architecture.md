# Architecture

## The stack

```
┌─────────────────────────────────────────────────────────────┐
│  React + TypeScript                                          │
│  Renders. Doesn't decide anything.                           │
│                                                              │
│    features/  →  shell/  →  components/  →  stores/          │
│                                    ↓                         │
│                                  ipc/  ← the only Tauri door │
└────────────────────────────────────┬────────────────────────┘
                    commands ↓        ↑ events + channels
┌────────────────────────────────────┴────────────────────────┐
│  Four Tauri plugins, one per domain                          │
│                                                              │
│   zenoh-session   zenoh-topology   zenoh-keyspace  zenoh-data│
│        │                │                │             │    │
│        └────────────────┴────────┬───────┴─────────────┘    │
└───────────────────────────────────┬─────────────────────────┘
                                    ↓
┌───────────────────────────────────┴─────────────────────────┐
│  zenoh-explorer-core                                         │
│  Sessions, admin probing, key indexing, taps                 │
│  No Tauri. No UI. Tested on its own.                         │
└───────────────────────────────────┬─────────────────────────┘
                                    ↓
                            zenoh 1.10 (Rust)
```

All the thinking happens in Rust. The frontend draws what it's told and reports
what the user did.

The practical reason is testability: the domain has 60-odd tests that run
without a window. The other reason is that Zenoh's semantics are subtle, and a
second implementation of them in TypeScript would drift from the router. Better
to have one, in the same language as the library that defines them.

## Why four plugins

You could do this with a single `invoke_handler![...]` and forty commands. The
split buys three things.

**Permissions get granular.** Each plugin has its own `permissions/` directory
and its own default set. `zenoh-data` leaves `put` and `delete` out of its
default, so "this build can modify the network" ends up as a visible line in a
capability file rather than something nobody noticed.

**Domains stay apart.** A plugin is a crate. `zenoh-keyspace` can't poke at
`zenoh-topology`'s internals because it doesn't depend on it. That's a boundary
the compiler enforces, not one a comment suggests.

**The client sits with the server.** Each plugin has a `guest-js/index.ts` right
next to the Rust that answers it, so a command, its permission, and the function
the frontend calls it through are all in one folder.

`zenoh-session` is the bottom of the stack. It owns the `SessionManager` and the
event bridge, and exports `ZenohSessionExt` so the other three can get at a
session without keeping state of their own.

## Events vs. channels

There are two ways back to the frontend and they're used for different shapes of
data.

Broadcast state goes over Tauri events, all on one `zenoh://event` channel
carrying a tagged `AppEvent` union: session opened, topology updated, a
diagnostic. These are infrequent and several views care about each one. One
listener that narrows on `kind` beats a listener per variant scattered through
components.

Streams use `tauri::ipc::Channel`. A tap has exactly one consumer and a busy key
expression can push tens of thousands of samples a second. A channel gives that
consumer an ordered stream of its own with no global fan-out.

Either way the backend coalesces first. A tap fills a bounded ring and flushes
on a timer, so the IPC bridge sees a bounded message rate no matter what the
network is doing. The drop count rides along with each batch, because a
diagnostic tool that silently throws data away is worse than one that shows you
less.

## Generated types

Everything crossing the boundary derives `ts_rs::TS`. `pnpm bindings` writes
`src/ipc/generated/`, doc comments and all. Nothing in the frontend redeclares a
backend shape, so renaming a Rust field is a TypeScript compile error rather
than a runtime `undefined`.

One wrinkle: `u64` maps to `number`, set via `TS_RS_LARGE_INT` in
`.cargo/config.toml`. ts-rs defaults to `bigint`, but Tauri's IPC serialises
`u64` as a JSON number, so `bigint` would be a type that never matches what
actually shows up. Everything we send is either an epoch millisecond or a
counter, both well inside 2^53.

## Reading a network

Three sources, ordered by how much cooperation they need from the other end.

| Source                                     | Needs                              | Gives you                                         |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------- |
| `session.info().transports()` / `.links()` | nothing                            | Directly connected nodes. Always works.           |
| `@/*/*` admin space                        | `adminspace.enabled` on the remote | Locators, sessions, regions, metadata. The graph. |
| `@/*/*/linkstate/*`                        | a router running link-state        | Routers you can't reach directly                  |

The admin-space JSON is the primary source because it's stable and structured.
Link-state comes back as Graphviz DOT (it's `petgraph`'s `Dot` formatter under
the hood), so the parser for it is written to be tolerant: if the format
changes, the overlay degrades instead of the whole refresh failing.

Worth repeating: **`adminspace.enabled` is `false` by default in Zenoh 1.x.** A
network where nobody turned it on answers none of these queries. That's the most
common reason topology looks empty, so the probe reports it as a diagnostic with
the fix attached rather than just drawing nothing.

## Frontend layers

Dependencies point one direction. A module can import from layers above it in
this list, never below.

```
styles/             design tokens. The only place a colour literal exists.
lib/                pure helpers. No React, no Tauri.
ipc/                the only place that imports @tauri-apps/*
stores/             Zustand, one slice per concern, no cross-store imports
components/ui/      primitives that know nothing about Zenoh
components/domain/  Zenoh-aware, but not tied to a view
features/           one folder per view, self-contained
shell/              the window chrome
app/                composition root
```

Two of those are enforced by ESLint rather than trusted. Nothing outside
`src/ipc` may import `@tauri-apps/*`, and nothing may reach past a feature's
`index.ts`. If one feature wants another's component, the component moves down
into `components/domain`.

There's no router. This is a window, not a document: no URL, no back button. But
view state _is_ per session, because switching tabs should put you back where
you were. A router models the first three facts and fights the fourth.
Navigation is a registry (`src/navigation/views.ts`) plus a Zustand slice.

No server-state library either. Almost everything here is either pushed from the
backend or triggered by a click, so a cache with its own invalidation rules
would just be a second source of truth arguing with the first.

## Progressive disclosure

This is a constraint, not decoration. A real deployment has far more facts than
fit on a screen: tens of thousands of keys, thousands of nodes, a dozen fields
per transport. So everything starts at the smallest view that answers the usual
question.

| Surface         | Starts as               | Opens to                                   |
| --------------- | ----------------------- | ------------------------------------------ |
| Sidebar         | six views               | "More" for the rest                        |
| Status bar      | endpoint and node count | counts, modes, scouting flags              |
| Key tree        | root level              | one level per expansion, fetched on demand |
| Topology        | region cards            | region → nodes → node detail               |
| Key expressions | the tree                | "Test matching" for the tester             |
| Connect dialog  | endpoint and name       | "Advanced" for mode, scouting, raw JSON5   |
| Tap row         | truncated preview       | full payload in the inspector              |

The backend has to play along for this to mean anything. `expand_keys` returns
one level, not a tree. Sample previews are truncated in Rust with the full bytes
left behind. Hiding things in the DOM wouldn't help at this scale.

## Tests

| Layer                               | Where it runs      | What it covers                                                                         |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `cargo test -p zenoh-explorer-core` | anywhere           | key-expression semantics, DOT parsing, the trie, payload rendering, config translation |
| `cargo test -p zenoh-explorer`      | anywhere, headless | commands through the real ACL and serde boundary                                       |
| `pnpm test`                         | anywhere           | helpers and components, `src/ipc` stubbed                                              |
| `pnpm e2e`                          | needs a build      | the window opens, the frontend reaches Rust                                            |

The second one is the most useful and the least obvious. `tauri::test::mock_builder`
gives you a real `App` on a mock runtime, and because the tests live in
`src-tauri` they get the ACL generated from the real `capabilities/`
directory. So a command invoked in a test goes through the same permission
check, the same camelCase argument mapping and the same serialisation as one
invoked from the webview. No display server needed, and it works on macOS.
