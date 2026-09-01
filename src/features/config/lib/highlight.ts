/** What a run of characters is, so it can be coloured for what it means. */
export type TokenKind = "key" | "string" | "number" | "keyword" | "plain";

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

/**
 * Splits one line of pretty-printed JSON into coloured runs.
 *
 * Line by line, which is safe here and only here: the document is the output of
 * `JSON.stringify`, so every string is on a single line with its newlines
 * escaped. A hand-written JSON5 config could wrap a string across lines and
 * this would mis-colour it — but that document never reaches this function,
 * because a config that will not parse is shown raw.
 *
 * A key and a string value are the same token to a JSON parser and different
 * things to a person reading a config, so they are separated here by what
 * follows them. That distinction is most of the value: it turns a wall of one
 * colour into a shape you can skim for the setting you want.
 */
export function tokenizeJsonLine(line: string): readonly Token[] {
  const tokens: Token[] = [];
  let index = 0;
  /** Start of the run of uncoloured characters not yet emitted. */
  let plainFrom = 0;

  const flushPlain = (upTo: number) => {
    if (upTo > plainFrom) tokens.push({ text: line.slice(plainFrom, upTo), kind: "plain" });
  };

  while (index < line.length) {
    const char = line[index];

    if (char === '"') {
      const end = endOfString(line, index);
      if (end === -1) break;

      flushPlain(index);
      // Whatever comes next decides what this string WAS. A colon means the
      // string named something; anything else means it was a value.
      const after = line.slice(end + 1).trimStart();
      tokens.push({
        text: line.slice(index, end + 1),
        kind: after.startsWith(":") ? "key" : "string",
      });
      index = end + 1;
      plainFrom = index;
      continue;
    }

    const literal = /^(?:true|false|null)\b/.exec(line.slice(index));
    if (literal) {
      flushPlain(index);
      tokens.push({ text: literal[0], kind: "keyword" });
      index += literal[0].length;
      plainFrom = index;
      continue;
    }

    // Only where a number can begin, so the `-` in a quoted `unixsock-stream`
    // or the digits inside a key never get picked up as one.
    if (/[-\d]/.test(char ?? "") && startsValue(line, index)) {
      const number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(line.slice(index));
      if (number) {
        flushPlain(index);
        tokens.push({ text: number[0], kind: "number" });
        index += number[0].length;
        plainFrom = index;
        continue;
      }
    }

    index += 1;
  }

  flushPlain(line.length);
  return tokens;
}

/** Index of the closing quote of the string starting at `from`, or -1. */
function endOfString(line: string, from: number): number {
  for (let i = from + 1; i < line.length; i += 1) {
    if (line[i] === "\\") {
      i += 1;
      continue;
    }
    if (line[i] === '"') return i;
  }
  return -1;
}

/** Whether position `at` is where a JSON value may start. */
function startsValue(line: string, at: number): boolean {
  const before = line.slice(0, at).trimEnd();
  return before === "" || before.endsWith(":") || before.endsWith("[") || before.endsWith(",");
}
