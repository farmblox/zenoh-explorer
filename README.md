<div align="center">

<h1>Zenoh Explorer</h1>

<p>
  A desktop app for looking at <a href="https://zenoh.io">Eclipse Zenoh</a> networks.<br>
  Topology, key space, key-expression testing, and live data. Think MQTT Explorer, for Zenoh.
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#what-you-get">What you get</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p>
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.95-CE422B?style=flat-square&logo=rust&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/tauri-2.11-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="Zenoh" src="https://img.shields.io/badge/zenoh-1.10-4a9eff?style=flat-square">
  <img alt="Platforms" src="https://img.shields.io/badge/macOS%20·%20Linux%20·%20Windows-8a919c?style=flat-square">
</p>

</div>

---

> [!NOTE]
> This is young. Every view is built and the backend is well covered by tests,
> but it has been run against a handful of networks, not hundreds.
> [Status](#status) has the details.

## Why

Debugging Zenoh usually means tailing `zenohd` logs and guessing. Is my
subscriber actually matching that key? Which router is this peer going through?
Why did that node drop off?

The answers are all in the network already. Zenoh publishes an admin space, and
`zenoh-keyexpr` can tell you exactly what an expression matches. This app just
puts a window on it.

## Quick start

You will need Rust 1.95+, Node 22.12+, pnpm 10+, and your platform's
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/farmblox/zenoh-explorer
cd zenoh-explorer
pnpm install
pnpm dev
```

If you do not have a network handy:

```bash
docker run --rm -p 7447:7447/tcp eclipse/zenoh:1.10.0 \
  --adminspace-permissions=rw --cfg='adminspace/enabled:true'
```

Connect to `tcp/localhost:7447` and you are in.

> [!IMPORTANT]
> Zenoh ships with `adminspace.enabled` set to **false**. Without it the
> explorer can see the transports it holds open but cannot read topology,
> declarations or link-state from anything else. If the topology view looks
> empty, check this first. The app will say so in the events log.

### Other commands

```bash
pnpm build     # bundle for the current platform
pnpm check     # everything CI runs
pnpm bindings  # regenerate TypeScript types from Rust
```

## How it is built

The rule the whole codebase follows: **logic lives in Rust, the frontend only
renders.** Nothing in React decides anything about a Zenoh network.

```
crates/zenoh-explorer-core     the domain. No Tauri, no UI, unit tested.
crates/tauri-plugin-zenoh-*    four Tauri plugins, one per domain
src-tauri                      the shell. Registers plugins, and that's it.
src                            React + TypeScript
```

The backend is four first-party [Tauri
plugins](https://v2.tauri.app/develop/plugins/): `zenoh-session`,
`zenoh-topology`, `zenoh-keyspace` and `zenoh-data`. Each one owns its commands,
its permission set and its TypeScript client. That is why `put` and `delete` can
sit outside the default permissions: a build has to ask for
`zenoh-data:read-write` before it can write to the network it is inspecting.

Every type that crosses the boundary is generated from the Rust definition with
`ts-rs`, so renaming a field breaks the TypeScript build instead of producing
`undefined` at runtime.

|          |                                                                        |
| -------- | ---------------------------------------------------------------------- |
| Backend  | Rust 1.95, [zenoh 1.10](https://github.com/eclipse-zenoh/zenoh), Tokio |
| Shell    | [Tauri 2.11](https://v2.tauri.app)                                     |
| Frontend | React 19, TypeScript 7, Vite 8, Tailwind 4, Zustand                    |

More detail in [docs/architecture.md](docs/architecture.md).

## Status

|                                                                                 |              |
| ------------------------------------------------------------------------------- | ------------ |
| Core domain: sessions, discovery, declarations, key index, taps, key-expr tools | ✅ 118 tests |
| Five plugins with permissions and TS clients                                    | ✅           |
| Shell: tabs, sidebar, status bar, theming, shortcuts, resizable panels          | ✅           |
| Keyspace and live tap, admin space, peers, scouting, events                     | ✅           |
| Topology: region / router / flat, drill-down, route trace, inspector            | ✅           |
| Regions, transport detail, configuration                                        | ✅           |
| Command palette, tap export, per-node throughput rates                          | 📋 planned   |

## Testing

```bash
pnpm test:rust   # domain logic, plus commands through the real ACL
pnpm test        # frontend, with the IPC layer stubbed
pnpm e2e         # the built app, driven through WebDriver
```

The middle one is worth calling out. It uses `tauri::test::mock_builder` to run
a real `App` on a mock runtime, so commands go through the actual permission
system and the actual serde boundary, with no display server and no window. It
runs on macOS too, which WebDriver could not do until recently.

## Contributing

Please do. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup and the layering
rules. Adding a view is a folder and one line in a registry; adding a command is
a few more steps, all listed there.

## License

[Apache 2.0](LICENSE), © Farmblox.

Eclipse Zenoh is a trademark of the Eclipse Foundation. This project is not
affiliated with or endorsed by them.

The topology graph is drawn with [React Flow](https://reactflow.dev) by xyflow,
and laid out by [dagre](https://github.com/dagrejs/dagre). Both are MIT
licensed. Every other dependency is in `package.json` and `Cargo.toml`.
