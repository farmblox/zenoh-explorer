# Releasing

Releases go out through GitHub Releases, and the same release doubles as the
update server. There is no separate infrastructure to run.

## How the updater finds an update

`tauri-plugin-updater` will take a plain static JSON file as its endpoint, so we
point it at an asset attached to the latest release:

```
https://github.com/farmblox/zenoh-explorer/releases/latest/download/latest.json
```

`releases/latest/download/<asset>` is a permanent GitHub URL that redirects to
whatever the current release is, so the endpoint never changes between versions.

`tauri-action` generates `latest.json` and uploads it along with the installers.
It looks like this:

```json
{
  "version": "0.2.0",
  "notes": "…",
  "pub_date": "2026-09-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "…",
      "url": "https://github.com/.../Zenoh.Explorer.app.tar.gz"
    },
    "darwin-x86_64": { "signature": "…", "url": "…" },
    "linux-x86_64": { "signature": "…", "url": "…" },
    "windows-x86_64": { "signature": "…", "url": "…" }
  }
}
```

One caveat worth knowing: `releases/latest` skips prereleases. Mark a release as
a prerelease and the updater will keep pointing at the last stable one, which is
usually what you want, but it does mean prereleases cannot be tested through the
update path without a second endpoint.

## One-time setup

**1. Generate a signing keypair.** Updates are signature-checked and the plugin
will not start without a public key.

```bash
pnpm tauri signer generate -w ~/.tauri/zenoh-explorer.key
```

**2. Put the public key in `src-tauri/tauri.updater.conf.json`**, replacing the
placeholder. This one is safe to commit.

**3. Add the private key to the repo secrets** as `TAURI_SIGNING_PRIVATE_KEY`,
and its password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Do not commit it; if
it leaks, anyone can sign an update that the app will happily install.

**4. Turn the feature on.** The updater is behind a cargo feature so that a
build without a key still works:

```toml
# src-tauri/Cargo.toml
updater = ["dep:tauri-plugin-updater", "dep:tauri-plugin-process"]
```

`.github/workflows/release.yml` already builds with `--features updater` and the
config overlay.

## Cutting a release

```bash
# bump the version in package.json — tauri.conf.json reads it from there
git tag v0.2.0
git push origin v0.2.0
```

The release workflow then builds macOS (both architectures), Linux and Windows,
signs everything, and publishes a draft release with the installers and
`latest.json` attached. Review the draft, add notes, publish.

Before any platform build starts, the workflow rejects unapproved dependency
licenses and verifies that `DISTRIBUTION_LICENSES.txt` matches the locked Rust
and npm production graphs. The file is bundled with every installer. Linux
builds additionally place it at the standard package paths, and the release job
opens the generated Debian and AppImage payloads to prove it is present.

Nothing ships until you publish the draft, so a bad build is a delete rather
than a recall.

## Without the updater

If you would rather not run an update channel at all, build without the feature:

```bash
pnpm build
```

That produces ordinary installers with no updater plugin compiled in and no
`latest.json`. The app simply never checks for updates.
