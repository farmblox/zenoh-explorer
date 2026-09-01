# Contributing

## Setup

You need Rust 1.95+ (rustup will pick it up from `rust-toolchain.toml`), Node
22.12+, pnpm 10+, and the [Tauri
prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

```bash
pnpm install
pnpm dev
```

For something to point the app at:

```bash
docker run --rm -p 7447:7447/tcp eclipse/zenoh:1.10.0 \
  --adminspace-permissions=rw --cfg='adminspace/enabled:true'
```

The `adminspace` flags matter. Zenoh defaults that to off, and without it you
get transports but no topology.

## Layout

```
crates/
  zenoh-explorer-core/          the domain. No Tauri, no UI.
  tauri-plugin-zenoh-session/   sessions; owns the registry the others use
  tauri-plugin-zenoh-topology/  graph, scouting, route trace
  tauri-plugin-zenoh-keyspace/  key tree, key-expression analysis
  tauri-plugin-zenoh-data/      get / put / delete / live taps
src-tauri/                      registers plugins, nothing else
src/                            React frontend
```

One rule holds everything together: **anything that decides something about a
Zenoh network goes in `zenoh-explorer-core`.** Not in a plugin, and definitely
not in a component. The plugins are a thin translation layer between Tauri's IPC
and the core; the frontend renders.

[docs/architecture.md](docs/architecture.md) explains why the backend is split
into four plugins and how the frontend layers work.

## Adding a command

1. Write it in `zenoh-explorer-core`, with tests.
2. Add a `#[tauri::command]` to whichever plugin owns that domain.
3. Add the command name to that plugin's `build.rs` `COMMANDS` array. This
   generates the `allow-*` / `deny-*` permissions.
4. Decide if it belongs in `permissions/default.toml`. Reads usually do.
   Anything that writes to the network should need an explicit grant.
5. Add the wrapper to the plugin's `guest-js/index.ts`.
6. If you touched a `#[derive(TS)]` type, run `pnpm bindings`.

## Adding a view

1. `src/features/<name>/` with a `<Name>View.tsx` and an `index.ts`.
2. One entry in `src/navigation/views.ts`.

That's it. The sidebar, the command palette and the outlet all read that
registry.

## Before opening a PR

```bash
pnpm check
```

Typecheck, ESLint, Prettier, Vitest, Clippy with `-D warnings`, and the Rust
tests. Same thing CI runs.

## Tests

Four layers. Use the cheapest one that can catch the bug you care about.

```bash
cargo test -p zenoh-explorer-core   # key-expr semantics, DOT parsing, the trie
cargo test -p zenoh-explorer        # commands through the real ACL, headless
pnpm test                           # frontend, IPC stubbed
pnpm e2e                            # the built app through WebDriver
```

E2E is slow and it will flake eventually. Keep it to the seam nothing else
reaches: the window opens, the frontend talks to Rust.

## Style

Rust: `rustfmt`, and clippy at `-D warnings` with `pedantic` on. `unsafe` is
forbidden workspace-wide.

TypeScript: Prettier and type-aware ESLint. `strict`, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. If one of those is
fighting you it usually has a point.

Comments should say why, not what. "This guard can't be held across the `.await`
or the future stops being `Send`" is worth writing. "Increment the counter" is
not.

## Filing bugs

Tell us the Zenoh version, how the network is set up, and whether
`adminspace.enabled` is on. Most "it doesn't see anything" reports come down to
that last one.
