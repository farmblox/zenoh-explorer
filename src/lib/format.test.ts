import { describe, expect, it } from "vitest";

import { EMPTY, bytes, compactNumber, duration, groupedNumber, rate, shortZid } from "./format";

describe("compactNumber", () => {
  it("leaves small numbers alone", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(999)).toBe("999");
  });

  it("abbreviates at each SI step", () => {
    expect(compactNumber(41_900)).toBe("41.9k");
    expect(compactNumber(2_184_000)).toBe("2.2M");
    expect(compactNumber(3_000_000_000)).toBe("3G");
  });

  it("drops a trailing zero rather than writing 4.0k", () => {
    expect(compactNumber(4_000)).toBe("4k");
  });

  it("renders non-finite input as the placeholder", () => {
    expect(compactNumber(Number.NaN)).toBe(EMPTY);
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe(EMPTY);
  });
});

describe("bytes", () => {
  it("uses binary units", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(4096)).toBe("4 KiB");
    expect(bytes(1_572_864)).toBe("1.5 MiB");
  });

  it("rejects negatives instead of rendering them", () => {
    expect(bytes(-1)).toBe(EMPTY);
  });
});

describe("shortZid", () => {
  it("keeps both ends, because zids often share a prefix", () => {
    const zid = "34f797e3aaaaaaaaaaaac1a2";
    const short = shortZid(zid);
    expect(short).toBe("34f797e3…c1a2");
    expect(short.startsWith("34f797e3")).toBe(true);
    expect(short.endsWith("c1a2")).toBe(true);
  });

  it("leaves an already-short id untouched", () => {
    expect(shortZid("abc123")).toBe("abc123");
  });
});

describe("duration", () => {
  it("coarsens as the interval grows", () => {
    expect(duration(4_000)).toBe("4s");
    expect(duration(12 * 60_000)).toBe("12m");
    expect(duration(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20m");
    expect(duration(2 * 86_400_000 + 4 * 3_600_000)).toBe("2d 4h");
  });
});

describe("groupedNumber and rate", () => {
  it("groups with thin spaces, not commas", () => {
    expect(groupedNumber(2184)).toBe("2 184");
  });

  it("suffixes rates", () => {
    expect(rate(41_900)).toBe("41.9k/s");
  });
});

describe("groupedNumber is locale-independent", () => {
  it("always uses a plain space, whatever ICU would do", () => {
    expect(groupedNumber(1_234_567)).toBe("1 234 567");
    expect(groupedNumber(999)).toBe("999");
    expect(groupedNumber(1000)).toBe("1 000");
    expect(groupedNumber(-2184)).toBe("-2 184");
  });
});
