import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { NodeSummary } from "@/ipc";
import { RouterAdminWarning } from "./RouterAdminWarning";

const ROUTER: NodeSummary = {
  zid: "router-a",
  name: null,
  kind: "router",
  locators: [],
  isLocal: false,
  region: null,
  regionSource: null,
  southRegions: 0,
  plugins: [],
  stats: null,
  acl: null,
  metadata: null,
  source: "linkState",
};

afterEach(cleanup);

describe("RouterAdminWarning", () => {
  it("warns when a known router did not answer its status record", () => {
    render(<RouterAdminWarning node={ROUTER} />);

    const warning = screen.getByRole("note", { name: "Router status unavailable" });
    expect(warning.textContent).toContain("@/router-a/router");
    expect(warning.textContent).toContain("adminspace.permissions.read");
  });

  it("stays silent for a readable router", () => {
    const { container } = render(<RouterAdminWarning node={{ ...ROUTER, source: "adminSpace" }} />);
    expect(container.childElementCount).toBe(0);
  });

  it("does not treat an indirectly reported peer as an unreadable router", () => {
    const { container } = render(<RouterAdminWarning node={{ ...ROUTER, kind: "peer" }} />);
    expect(container.childElementCount).toBe(0);
  });
});
