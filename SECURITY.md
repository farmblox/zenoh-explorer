# Security

## Reporting something

Don't open a public issue. Use [GitHub Security
Advisories](https://github.com/farmblox/zenoh-explorer/security/advisories/new),
or email `security@farmblox.ag`.

Tell us what you did, what happened, and which versions. We'll get back to you
within three working days.

## Context that might help

Some things worth knowing if you're assessing a report:

The app connects to networks the user names. In `client` mode it joins as a leaf
and adds no routing load. In `peer` mode it joins the mesh properly.

It's read-only unless you build it otherwise. `put` and `delete` are left out of
the `zenoh-data` plugin's default permissions, so a build has to grant
`zenoh-data:read-write` to change anything.

Every command the webview can reach is listed in
`src-tauri/capabilities/default.json`. A command that isn't in there can't be
invoked even though it's compiled in.

File access is limited to `$DOWNLOAD`, `$DOCUMENT` and `$CONFIG`. The `opener`
plugin is restricted to an allowlist of doc sites. The CSP blocks remote
content, and fonts are bundled rather than fetched, so nothing but the Zenoh
session itself needs network access.

The WebDriver hooks used by the E2E suite sit behind the `e2e` cargo feature and
a separate config overlay. Release builds don't have them.

## Open advisories in the dependency tree

`pnpm audit` reports one, and it has no fix upstream:

**`extract-zip@2.0.1` — symlink path traversal (high).** No patched version
exists; 2.0.1 is the latest release. It reaches us through
`@wdio/cli → @wdio/utils → @puppeteer/browsers`, which is a `devDependency`
used only by the E2E suite, and it runs only when WebDriver downloads a browser
from Google's CDN. Nothing in a release build links it, and no user-supplied
archive is ever extracted. We'll drop the override note when upstream moves.

Two others — `serialize-javascript` and `deepmerge-ts` — are pinned to patched
versions through `pnpm.overrides` in `package.json`.

## Known weak spot

Credentials in a connection profile's `advancedJson5` go into
`tauri-plugin-store`, which writes plaintext JSON into the OS app-data
directory. Treat that file as sensitive. Moving it to the platform keychain is
on the list.
