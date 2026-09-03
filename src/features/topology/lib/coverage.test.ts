import { describe, expect, it } from "vitest";

import type { TopologySnapshot } from "@/ipc";
import { describeCoverage } from "./coverage";

function snapshot(unreadableRouters: number): TopologySnapshot {
  return { unverifiedNodes: unreadableRouters } as TopologySnapshot;
}

describe("describeCoverage", () => {
  it("says nothing when every known router answered", () => {
    expect(describeCoverage(snapshot(0))).toBeNull();
  });

  it("names one unreadable router precisely", () => {
    expect(describeCoverage(snapshot(1))).toEqual({
      label: "1 router unreadable",
      detail:
        "One known router did not answer at @/<zid>/router. Peers and links behind it may be missing. Enable readable adminspace on that router.",
    });
  });

  it("pluralises several unreadable routers", () => {
    expect(describeCoverage(snapshot(3))?.label).toBe("3 routers unreadable");
  });
});
