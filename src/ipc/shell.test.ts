import { resolveResource } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { openDistributionLicenses } from "./shell";

describe("openDistributionLicenses", () => {
  it("opens the notice file from the bundled resource directory", async () => {
    await openDistributionLicenses();

    expect(vi.mocked(resolveResource)).toHaveBeenCalledWith("licenses/DISTRIBUTION_LICENSES.txt");
    expect(vi.mocked(openPath)).toHaveBeenCalledWith(
      "/resources/licenses/DISTRIBUTION_LICENSES.txt",
    );
  });
});
