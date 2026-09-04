import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appVersion, findUpdate, installUpdate, type UpdateProgress } from "./update";

const close = vi.fn().mockResolvedValue(undefined);
const downloadAndInstall = vi.fn();

beforeEach(() => {
  close.mockClear();
  downloadAndInstall.mockReset();
  vi.mocked(check).mockReset().mockResolvedValue(null);
  vi.mocked(relaunch).mockClear();
});

describe("signed app updates", () => {
  it("reads the version embedded in the application bundle", async () => {
    await expect(appVersion()).resolves.toBe("0.1.2");
    expect(getVersion).toHaveBeenCalledOnce();
  });

  it("retains a checked update for installation", async () => {
    vi.mocked(check).mockResolvedValue({
      currentVersion: "0.1.2",
      version: "0.1.3",
      date: "2026-09-04T00:00:00Z",
      body: "Routing polish",
      close,
      downloadAndInstall,
    } as never);

    await expect(findUpdate()).resolves.toEqual({
      currentVersion: "0.1.2",
      version: "0.1.3",
      date: "2026-09-04T00:00:00Z",
      notes: "Routing polish",
    });
    expect(check).toHaveBeenCalledWith({ timeout: 15_000 });
  });

  it("reports download progress, installs, and relaunches", async () => {
    downloadAndInstall.mockImplementation((report: (event: unknown) => void) => {
      report({ event: "Started", data: { contentLength: 100 } });
      report({ event: "Progress", data: { chunkLength: 40 } });
      report({ event: "Finished" });
      return Promise.resolve();
    });
    vi.mocked(check).mockResolvedValue({
      currentVersion: "0.1.2",
      version: "0.1.3",
      close,
      downloadAndInstall,
    } as never);
    await findUpdate();

    const progress: UpdateProgress[] = [];
    await installUpdate((event) => progress.push(event));

    expect(progress).toEqual([
      { downloadedBytes: 0, totalBytes: 100, finished: false },
      { downloadedBytes: 40, totalBytes: 100, finished: false },
      { downloadedBytes: 40, totalBytes: 100, finished: true },
    ]);
    expect(relaunch).toHaveBeenCalledOnce();
  });
});
