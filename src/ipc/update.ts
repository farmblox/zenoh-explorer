/** The signed Tauri updater, kept behind the IPC boundary like every native API. */
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const CHECK_TIMEOUT_MS = 15_000;

let pending: Update | null = null;

export interface AvailableUpdate {
  readonly currentVersion: string;
  readonly version: string;
  readonly date: string | null;
  readonly notes: string | null;
}

export interface UpdateProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number | null;
  readonly finished: boolean;
}

/** Version embedded in this application bundle. */
export function appVersion(): Promise<string> {
  return getVersion();
}

/** Checks the configured HTTPS endpoint and retains the verified update handle. */
export async function findUpdate(): Promise<AvailableUpdate | null> {
  if (pending) {
    await pending.close();
    pending = null;
  }

  pending = await check({ timeout: CHECK_TIMEOUT_MS });
  if (!pending) return null;

  return {
    currentVersion: pending.currentVersion,
    version: pending.version,
    date: pending.date ?? null,
    notes: pending.body ?? null,
  };
}

/** Downloads, verifies, and installs the update retained by `findUpdate`. */
export async function installUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void> {
  if (!pending) throw new Error("No checked update is ready to install");

  let downloadedBytes = 0;
  let totalBytes: number | null = null;
  const report = (event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? null;
        onProgress({ downloadedBytes, totalBytes, finished: false });
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength;
        onProgress({ downloadedBytes, totalBytes, finished: false });
        break;
      case "Finished":
        onProgress({ downloadedBytes, totalBytes, finished: true });
        break;
    }
  };

  await pending.downloadAndInstall(report);
  // Windows exits while installing. macOS and Linux return here and need an
  // explicit relaunch before the newly installed application is running.
  await relaunch();
}
