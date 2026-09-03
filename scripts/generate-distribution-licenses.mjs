import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "DISTRIBUTION_LICENSES.txt");
const allowedNpmLicenses = new Set([
  "Apache-2.0 OR MIT",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "OFL-1.1",
]);

const projectManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (projectManifest.license !== "Apache-2.0") {
  throw new Error('package.json must declare "license": "Apache-2.0"');
}

const rust = normalizeText(
  execFileSync(
    "cargo",
    [
      "about",
      "generate",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--config",
      "about.toml",
      "--features",
      "updater",
      "--locked",
      "--fail",
      "scripts/licenses/rust.hbs",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);

const listed = JSON.parse(
  execFileSync("pnpm", ["list", "--prod", "--depth", "Infinity", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const packages = new Map();
collectPackages(listed[0]?.dependencies ?? {}, packages);

const npm = [...packages.values()]
  .sort((left, right) =>
    `${left.manifest.name}@${left.manifest.version}`.localeCompare(
      `${right.manifest.name}@${right.manifest.version}`,
    ),
  )
  .map(({ manifest, path, resolved: tarball }) => {
    const license = licenseExpression(manifest);
    if (!license) {
      throw new Error(`${manifest.name}@${manifest.version} has no declared license`);
    }
    if (!allowedNpmLicenses.has(license)) {
      throw new Error(
        `${manifest.name}@${manifest.version} uses unapproved production license ${license}`,
      );
    }

    const files = readdirSync(path)
      .filter((name) => /^(licen[cs]e|copying|notice)([._-]|$)/i.test(name))
      .map((name) => join(path, name))
      .filter((candidate) => statSync(candidate).isFile())
      .sort();

    if (files.length === 0) {
      throw new Error(
        `${manifest.name}@${manifest.version} declares ${license} but ships no license file`,
      );
    }

    const source = repositoryUrl(manifest.repository) ?? manifest.homepage ?? tarball;
    const notices = files
      .map(
        (file) =>
          `--- ${file.slice(path.length + 1)} ---\n${normalizeText(readFileSync(file, "utf8"))}`,
      )
      .join("\n\n");

    return [
      "=".repeat(80),
      `${manifest.name} ${manifest.version}`,
      "=".repeat(80),
      `License: ${license}`,
      `Source: ${source}`,
      "",
      notices,
    ].join("\n");
  })
  .join("\n\n");

const document = [
  "ZENOH EXPLORER DISTRIBUTION LICENSES",
  "=".repeat(80),
  "",
  "Generated from Cargo.lock and pnpm-lock.yaml. Do not edit by hand.",
  "The exact source for every MPL-covered Rust crate is linked beside it.",
  "",
  "ZENOH EXPLORER",
  "-".repeat(80),
  "Source: https://github.com/farmblox/zenoh-explorer",
  "Contact: https://github.com/farmblox/zenoh-explorer/issues",
  "",
  normalizeText(readFileSync(join(root, "NOTICE"), "utf8")),
  "",
  normalizeText(readFileSync(join(root, "LICENSE"), "utf8")),
  "",
  "RUST DEPENDENCIES",
  "-".repeat(80),
  rust,
  "",
  "NPM PRODUCTION DEPENDENCIES",
  "-".repeat(80),
  npm,
  "",
].join("\n");

writeFileSync(output, document);
process.stdout.write(`Wrote ${output}\n`);

function collectPackages(dependencies, target) {
  for (const dependency of Object.values(dependencies)) {
    if (!dependency?.path) continue;
    const manifest = JSON.parse(readFileSync(join(dependency.path, "package.json"), "utf8"));
    const key = `${manifest.name}@${manifest.version}`;
    if (!target.has(key)) {
      target.set(key, { manifest, path: dependency.path, resolved: dependency.resolved });
    }
    collectPackages(dependency.dependencies ?? {}, target);
  }
}

function licenseExpression(manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((entry) => entry.type)
      .filter(Boolean)
      .join(" OR ");
  }
  return null;
}

function repositoryUrl(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  return (
    raw
      ?.replace(/^git\+/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/\.git$/, "") ?? null
  );
}

/** Normalizes insignificant transport whitespace while preserving license text. */
function normalizeText(value) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
