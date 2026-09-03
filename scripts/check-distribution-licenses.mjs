import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const noticePath = resolve(root, "DISTRIBUTION_LICENSES.txt");
const before = readFileSync(noticePath, "utf8");

run("cargo", [
  "deny",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--features",
  "updater",
  "check",
  "licenses",
]);
run(process.execPath, ["scripts/generate-distribution-licenses.mjs"]);
const after = readFileSync(noticePath, "utf8");
expect(before === after, "DISTRIBUTION_LICENSES.txt is stale; commit the regenerated file");

const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const bundle = config.bundle;
expect(bundle.license === "Apache-2.0", "bundle.license must be Apache-2.0");
expect(bundle.licenseFile === "../LICENSE", "bundle.licenseFile must include the project license");
expect(
  bundle.resources?.["../DISTRIBUTION_LICENSES.txt"] === "licenses/DISTRIBUTION_LICENSES.txt",
  "all installers must bundle DISTRIBUTION_LICENSES.txt",
);
expect(
  bundle.linux?.deb?.files?.["/usr/share/doc/zenoh-explorer/copyright"] ===
    "../DISTRIBUTION_LICENSES.txt",
  "the Debian package must install its mandatory copyright file",
);
expect(
  bundle.linux?.appimage?.files?.[
    "/usr/share/licenses/zenoh-explorer/DISTRIBUTION_LICENSES.txt"
  ] === "../DISTRIBUTION_LICENSES.txt",
  "the AppImage must install its distribution licenses",
);
expect(
  bundle.linux?.rpm?.files?.["/usr/share/licenses/zenoh-explorer/DISTRIBUTION_LICENSES.txt"] ===
    "../DISTRIBUTION_LICENSES.txt",
  "the RPM must install its distribution licenses",
);

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
