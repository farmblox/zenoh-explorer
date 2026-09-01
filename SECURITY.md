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

## Known weak spot

Credentials in a connection profile's `advancedJson5` go into
`tauri-plugin-store`, which writes plaintext JSON into the OS app-data
directory. Treat that file as sensitive. Moving it to the platform keychain is
on the list.
