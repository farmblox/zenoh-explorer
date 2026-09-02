import { describe, expect, it } from "vitest";

import { cn } from "./cn";

/**
 * The type scale has to survive being composed with a colour.
 *
 * tailwind-merge recognises Tailwind's own sizes and files every other `text-*`
 * under colour, so it treated `text-tiny` and `text-ink-faint` as two colours
 * competing and dropped the first. That silently deleted the font size wherever
 * a component built a class list from a size and a tone — which is most of them
 * — and left the element at whatever it inherited.
 */
describe("cn", () => {
  const SIZES = ["text-micro", "text-tiny", "text-small", "text-base", "text-title", "text-metric"];

  it.each(SIZES)("keeps %s when a colour is merged over it", (size) => {
    expect(cn(size, "text-ink")).toContain(size);
    expect(cn(size, "text-ink")).toContain("text-ink");
  });

  it("still lets one size replace another", () => {
    expect(cn("text-tiny", "text-small")).toBe("text-small");
  });

  it("still lets one colour replace another", () => {
    expect(cn("text-ink", "text-warn")).toBe("text-warn");
  });

  it("resolves ordinary conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
