## What this does

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What problem this solves. Skip if it's obvious from the above. -->

## Checklist

- [ ] `pnpm check` passes
- [ ] New logic lives in `zenoh-explorer-core` with tests, not in a plugin or a component
- [ ] `pnpm bindings` run if a `#[derive(TS)]` type changed
- [ ] New commands added to the plugin's `build.rs` `COMMANDS`, and a decision made about `permissions/default.toml`
- [ ] `pnpm licenses:generate` run if a production dependency changed
