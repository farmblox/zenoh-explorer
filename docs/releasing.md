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

Signed release builds check this endpoint once after startup. A current app
shows only its quiet version label at the far right of the status bar. When a
newer version exists, that label becomes an update action; the user reviews the
release notes and explicitly chooses **Update and restart**. Download progress
stays in the status bar and dialog. Failed checks are silent because an offline
launch is normal; failed installs remain visible and retryable.

The updater was first invoked by version 0.1.2. Version 0.1.1 contains signed
updater artifacts and the native plugin, but no runtime check, so it cannot
discover 0.1.2 by itself. That one transition requires a manual installer.

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
# Keep package.json and the Cargo workspace version in sync. Tauri reads the
# installer/updater version from package.json; CARGO_PKG_VERSION comes from
# Cargo.toml.
#
# The third-party notice intentionally excludes workspace crates, so a
# version-only bump does not require regenerating it. `pnpm licenses:check`
# below proves that assumption and catches real dependency changes.
pnpm licenses:check
# Update `releaseBody` in .github/workflows/release.yml with notes that read
# well both on GitHub and as plain text in the in-app update dialog.
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

## The Linux AppImage

An AppImage carries most of its libraries with it, and that is where the one
Linux-specific problem lives. Tauri's bundler hands the packaging to
linuxdeploy, which walks the binary's dependency tree and copies in everything
that is not on its exclude list. The linuxdeploy it downloads is a July 2024
build from Tauri's mirror, and that build's exclude list predates the entry for
`libwayland-client.so.0`. So the AppImage ships Ubuntu's libwayland-client, the
loader uses it for the whole process because it is already loaded by the time
Mesa asks, and Mesa 25 or newer cannot load its EGL driver against a
libwayland-client that old. The web process prints

```
Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
```

and exits, while the main process keeps running without ever showing a window.
Upstream tracks this as tauri-apps/tauri#15665.

The bundler downloads linuxdeploy once, into `~/.cache/tauri`, and uses
whatever is there on every later run. The release workflow puts upstream's
current build there before `tauri build` runs, then extracts the finished
AppImage and fails if the library is inside. Upstream's `continuous` release is
a moving target, but so are the AppImage plugin and the GTK plugin the bundler
already fetches from upstream on every build, and the check after the build is
what actually guards the property we care about.

To build a working AppImage locally, do the same thing first:

```bash
mkdir -p ~/.cache/tauri
curl -fsSL -o ~/.cache/tauri/linuxdeploy-x86_64.AppImage \
  https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage
chmod +x ~/.cache/tauri/linuxdeploy-x86_64.AppImage
pnpm tauri build --bundles appimage
```

An AppImage that already has the problem can be run by preloading the host's
library over the bundled one:

```bash
LD_PRELOAD=/usr/lib/libwayland-client.so.0 ./Zenoh.Explorer_0.1.1_amd64.AppImage
```

`ldconfig -p | grep libwayland-client` prints the path on distributions that
keep it under `/usr/lib/x86_64-linux-gnu` instead.
