import { describe, expect, it } from "vitest";

import { tokenizeJsonLine } from "./highlight";

/**
 * Renders a line as `kind:text` pairs, so a test reads like the output.
 *
 * Indentation and the spaces around punctuation are trimmed: they belong to the
 * document's formatting, not to what the tokenizer decided.
 */
const shape = (line: string) =>
  tokenizeJsonLine(line)
    .map((token) => ({ ...token, text: token.text.trim() }))
    .filter((token) => token.text !== "")
    .map((token) => `${token.kind}:${token.text}`);

describe("tokenizeJsonLine", () => {
  it("tells a key from a string value", () => {
    expect(shape('  "mode": "router",')).toEqual([
      'key:"mode"',
      "plain::",
      'string:"router"',
      "plain:,",
    ]);
  });

  it("colours numbers, booleans and null", () => {
    expect(shape('  "ttl": 1,')).toContain("number:1");
    expect(shape('  "enabled": true,')).toContain("keyword:true");
    expect(shape('  "iface": null,')).toContain("keyword:null");
  });

  it("does not find a number inside a key or a quoted value", () => {
    // `unixsock-stream` has a hyphen and `7447` sits inside quotes: neither is
    // a number, and colouring them as one is the classic tokenizer slip.
    const tokens = tokenizeJsonLine('  "endpoint": "tcp/10.0.4.2:7447",');
    expect(tokens.filter((t) => t.kind === "number")).toEqual([]);
    expect(shape('  "transport": "unixsock-stream",')).toContain('string:"unixsock-stream"');
  });

  it("keeps an escaped quote inside its string", () => {
    const tokens = tokenizeJsonLine('  "note": "say \\"hi\\"",');
    expect(tokens.find((t) => t.kind === "string")?.text).toBe('"say \\"hi\\""');
  });

  it("reassembles into exactly the line it was given", () => {
    for (const line of [
      '    "endpoints": ["quic/10.0.4.2:7447", "tls/34.19.8.4:7447"],',
      "  },",
      "",
      '  "adminspace": { "permissions": { "read": true, "write": false } },',
    ]) {
      expect(
        tokenizeJsonLine(line)
          .map((t) => t.text)
          .join(""),
      ).toBe(line);
    }
  });
});
