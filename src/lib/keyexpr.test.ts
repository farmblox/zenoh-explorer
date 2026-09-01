import { describe, expect, it } from "vitest";

import { ancestorsOf, hasWildcard, isAdminKey, joinKey, parentOf, tokenize } from "./keyexpr";

describe("tokenize", () => {
  it("reconstructs the input exactly", () => {
    const expr = "fleet/*/telemetry/**";
    expect(
      tokenize(expr)
        .map((token) => token.text)
        .join(""),
    ).toBe(expr);
  });

  it("distinguishes the three wildcard forms", () => {
    const kinds = tokenize("a/*/b/**/c$*d").map((token) => token.kind);
    expect(kinds).toContain("star");
    expect(kinds).toContain("double-star");
    expect(kinds).toContain("sub-chunk");
  });

  it("does not emit empty tokens for repeated slashes", () => {
    expect(tokenize("a//b").every((token) => token.text.length > 0)).toBe(true);
  });
});

describe("prefix helpers", () => {
  it("finds the parent, and stops at the root", () => {
    expect(parentOf("fleet/agv/07")).toBe("fleet/agv");
    expect(parentOf("fleet")).toBe("");
  });

  it("lists ancestors root-first", () => {
    expect(ancestorsOf("a/b/c")).toEqual(["a", "a/b", "a/b/c"]);
  });

  it("joins while dropping empties", () => {
    expect(joinKey("fleet", "", "agv/07")).toBe("fleet/agv/07");
  });
});

describe("classification", () => {
  it("detects wildcards and admin keys", () => {
    expect(hasWildcard("a/*/b")).toBe(true);
    expect(hasWildcard("a/b")).toBe(false);
    expect(isAdminKey("@/abc/router")).toBe(true);
    expect(isAdminKey("fleet/agv")).toBe(false);
  });
});
