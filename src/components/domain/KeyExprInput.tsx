import { Asterisk, CornerDownLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input, Kbd } from "@/components/ui";
import { useAnchored, useDismiss } from "@/hooks";
import { keyspace, type KeyExprAnalysis, type KeyNode, type SessionId } from "@/ipc";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { pressable, transitionFast } from "@/lib/states";

/**
 * The two wildcards, as offers rather than syntax to remember.
 *
 * `$*` is deliberately absent. It matches within a chunk, it is slower than
 * `*`, and Zenoh's own guidance is to design a key space that does not need it
 * — so offering it here would be suggesting the thing the documentation asks
 * people not to reach for. Typing it still works.
 */
const WILDCARDS = [
  { chunk: "*", says: "any one chunk" },
  { chunk: "**", says: "the rest of the path, or nothing" },
] as const;

/** How long typing has to pause before the network's index is consulted. */
const SETTLE_MS = 120;

interface Completion {
  /** The chunk to insert. */
  readonly chunk: string;
  /** What it means, for a wildcard; what is under it, for a real chunk. */
  readonly says: string;
  /** Whether accepting it should open a further level. */
  readonly deeper: boolean;
}

/**
 * Which chunk the caret is in.
 *
 * The caret is the answer to "which part of this do you mean", and it is an
 * answer the reader gives by clicking or by pressing an arrow — so there is no
 * second selection to invent, and the keyboard gets it for free.
 */
function slotAt(chunks: readonly Chunk[], caret: number): number {
  for (const [index, chunk] of chunks.entries()) {
    // Inclusive of the trailing edge: a caret sitting immediately after `agv`
    // is still editing `agv`, which is where it lands after typing it.
    if (caret <= chunk.start + chunk.text.length) return index;
  }
  return Math.max(chunks.length - 1, 0);
}

interface Chunk {
  readonly text: string;
  /** Character offset of the chunk within the whole value. */
  readonly start: number;
  readonly index: number;
}

/** The value split at its separators, with each chunk's offset kept. */
function chunksOf(value: string): Chunk[] {
  const out: Chunk[] = [];
  let start = 0;

  for (const [index, text] of value.split("/").entries()) {
    out.push({ text, start, index });
    start += text.length + 1;
  }

  return out;
}

/** Whether a chunk is a wildcard rather than a name. */
function isWildcard(chunk: string): boolean {
  return chunk === "*" || chunk === "**" || chunk.includes("$*");
}

/** What one child of the current level offers. */
function fromKeyNode(node: KeyNode): Completion {
  const parts: string[] = [];
  if (node.descendantKeys > 0) parts.push(`${groupedNumber(node.descendantKeys)} keys`);
  if (node.subscribers > 0) parts.push(`${groupedNumber(node.subscribers)} listening`);

  return {
    chunk: node.segment,
    says: parts.join(" · "),
    deeper: node.childCount > 0,
  };
}

export interface KeyExprInputProps {
  value: string;
  onChange: (value: string) => void;
  /** The session whose key space is completed from. */
  sessionId: SessionId | null;
  /** Offers `*` and `**`. Off where the target has to be a single key. */
  wildcards?: boolean | undefined;
  /**
   * Told the verdict as it changes, so a caller can gate an action on it.
   *
   * `null` while nothing has been typed or nothing has come back yet. The
   * analysis is run here rather than by every caller, because two of them
   * asking `zenoh-keyexpr` the same question about the same string is how the
   * answers start disagreeing.
   */
  onAnalysis?: ((analysis: KeyExprAnalysis | null) => void) | undefined;
  /** Rings the field for a reason of the caller's own, beyond validity. */
  invalid?: boolean | undefined;
  placeholder?: string | undefined;
  /** Static label inside the field, e.g. `key expr`. */
  prefix?: string | undefined;
  /**
   * Field height. `lg` by default.
   *
   * Taller than an ordinary input on purpose: this one carries chunk marks
   * under its text and a verdict at its trailing edge, and both want room.
   *
   * Taller than the buttons beside it, too. That is not an oversight — the
   * field is what a keyspace toolbar is about and the buttons act on it, so it
   * reads as the subject rather than as one control among equals.
   */
  size?: "md" | "lg" | undefined;
  /** Marks this as the field a dialog focuses on open. */
  autoFocusInDialog?: boolean | undefined;
  onSubmit?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * Building a key expression against the key space that exists.
 *
 * A key expression is hard to type for one reason: you are addressing a
 * namespace you cannot see. Forty thousand keys, and a text field that knows
 * none of them. So this completes chunk by chunk from the index the session
 * already holds, and says how many keys the whole expression currently reaches
 * — which is the difference between `fleet/*` and `fleet/**` stated in the only
 * terms that mean anything, this network's own keys.
 *
 * The wildcards are offered in the list beside the real chunks, described
 * rather than spelled. `*` matching one chunk and `**` matching any number is
 * the distinction the whole language turns on, and it is not guessable from the
 * characters.
 *
 * Accepting a chunk that has children appends the separator, so a path is built
 * by repeated choice rather than by typing slashes.
 */
export function KeyExprInput({
  value,
  onChange,
  sessionId,
  wildcards = true,
  onAnalysis,
  invalid,
  placeholder,
  prefix,
  size = "lg",
  autoFocusInDialog,
  onSubmit,
  className,
}: KeyExprInputProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [children, setChildren] = useState<{ parent: string; nodes: KeyNode[] } | null>(null);
  const [reach, setReach] = useState<{ expr: string; keys: number } | null>(null);
  const [verdict, setVerdict] = useState<{ expr: string; analysis: KeyExprAnalysis } | null>(null);
  /** How far the field has scrolled, so the marks stay under their text. */
  const [scrolled, setScrolled] = useState(0);
  /**
   * The selection, which says both which chunk and how much of it is spoken for.
   *
   * The end alone would say which chunk. The pair says whether the reader has
   * narrowed it: a chunk selected whole has not been narrowed at all, and that
   * is the difference between offering everything for a position and offering
   * only what already matches.
   */
  const [range, setRange] = useState({ start: 0, end: 0 });
  /** Where to put the caret once a replacement has been applied. */
  const pending = useRef<number | null>(null);

  // Held in a ref so a caller passing a fresh closure each render does not
  // restart the evaluation on every keystroke.
  const report = useRef(onAnalysis);
  useEffect(() => {
    report.current = onAnalysis;
  }, [onAnalysis]);

  const { rect, host, measure, forget } = useAnchored(anchor);
  const close = () => {
    setOpen(false);
    forget();
  };
  useDismiss([anchor, panel], open, close);

  const chunks = chunksOf(value);
  const slot = slotAt(chunks, range.start);
  const typing = chunks[slot]?.text ?? "";
  // Everything to the left of the slot is the path whose children are the
  // candidates for it.
  const parent = chunks
    .slice(0, slot)
    .map((chunk) => chunk.text)
    .join("/");

  // One level of the tree, for the chunk being typed. Asked for the parent
  // rather than the whole path, because that is the level whose children are
  // the candidates.
  useEffect(() => {
    if (!open || sessionId === null) return;

    const timer = setTimeout(() => {
      void keyspace
        .expandKeys(sessionId, parent)
        .then((level) => setChildren({ parent, nodes: level.children }))
        .catch(() => setChildren({ parent, nodes: [] }));
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [open, sessionId, parent]);

  // What the whole expression reaches. Settled rather than per keystroke: it
  // walks every key in the index, which is cheap in Rust and still not worth
  // doing between two characters of the same word.
  useEffect(() => {
    if (sessionId === null || value.trim() === "") return;

    const asked = value.trim();
    const timer = setTimeout(() => {
      void keyspace
        .matchingKeys(sessionId, asked)
        .then((keys) => setReach({ expr: asked, keys }))
        .catch(() => setReach(null));
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [sessionId, value]);

  // Syntax, from `zenoh-keyexpr`. Every corner of the language lives there —
  // `**` matching zero chunks, `$*` matching within one, `**/*` canonicalising
  // to `*/**` — and a second opinion formed here would eventually disagree
  // with the router, which is the bug this whole app exists to prevent.
  useEffect(() => {
    const asked = value.trim();

    // Withdrawn first, every time. A listener that keeps the previous verdict
    // while the next one is in flight is holding an answer about a string that
    // is no longer in the field — which is how a wildcard slips past a guard
    // that checked the key as it was two characters ago.
    report.current?.(null);
    if (asked === "") return;

    const timer = setTimeout(() => {
      void keyspace
        .analyseKeyExpr(asked)
        .then((analysis) => {
          setVerdict({ expr: asked, analysis });
          report.current?.(analysis);
        })
        .catch(() => {
          setVerdict(null);
          report.current?.(null);
        });
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  const analysis = verdict?.expr === value.trim() ? verdict.analysis : null;

  const bad = new Set(analysis?.badChunks ?? []);

  const level = children?.parent === parent ? children.nodes : [];

  // A chunk selected whole is a chunk being replaced, so everything available
  // at that position is a candidate. Clicking `agv` to change it and being
  // offered only `agv` is the list answering a question nobody asked. Typing
  // collapses the selection, and the filter comes back with it.
  const slotChunk = chunks[slot];
  const replacing =
    slotChunk !== undefined &&
    slotChunk.text !== "" &&
    range.start === slotChunk.start &&
    range.end === slotChunk.start + slotChunk.text.length;
  const needle = replacing ? "" : typing.toLowerCase();

  const completions: Completion[] = [
    ...level
      .filter((node) => node.segment.toLowerCase().startsWith(needle))
      // A declaration is stored as written, so `fleet/**` puts a chunk called
      // `**` in the tree. It is offered once, below, as the wildcard it is —
      // listing it here as well showed it twice and gave two rows the same key.
      .filter((node) => !isWildcard(node.segment))
      .map(fromKeyNode),
    ...(wildcards
      ? WILDCARDS.filter((entry) => entry.chunk.startsWith(needle) || needle === "").map(
          (entry) => ({ chunk: entry.chunk, says: entry.says, deeper: entry.chunk === "*" }),
        )
      : []),
  ];

  const active = Math.min(cursor, Math.max(completions.length - 1, 0));

  const accept = (completion: Completion) => {
    const parts = chunks.map((chunk) => chunk.text);
    parts[slot] = completion.chunk;

    // Only the last chunk opens a further level. Appending a separator to a
    // chunk in the middle would cut the rest of the path off from it.
    const last = slot === parts.length - 1;
    const grow = last && completion.deeper;
    const built = parts.join("/") + (grow ? "/" : "");

    // The caret follows the chunk it just replaced, so a path can be revised
    // left to right without reaching for the mouse between steps.
    const upto = parts.slice(0, slot + 1).join("/").length;
    pending.current = grow ? upto + 1 : upto;

    onChange(built);
    setCursor(0);
    field.current?.focus();
  };

  /**
   * Puts a chunk under the caret, selected.
   *
   * Selected rather than merely pointed at, because "click it and type" is the
   * gesture being offered — a caret placed inside `agv` would have you deleting
   * three characters before you could replace it.
   */
  const pick = (chunk: Chunk) => {
    const input = field.current;
    if (!input) return;

    input.focus();
    input.setSelectionRange(chunk.start, chunk.start + chunk.text.length);
    setRange({ start: chunk.start, end: chunk.start + chunk.text.length });
    setCursor(0);
    measure();
    setOpen(true);
  };

  // Applied after the value has landed, because setting a selection on the old
  // value would be overwritten by the re-render that follows.
  useEffect(() => {
    const at = pending.current;
    if (at === null) return;
    pending.current = null;
    field.current?.setSelectionRange(at, at);
    setRange({ start: at, end: at });
  }, [value]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === "Enter" && !open) {
      onSubmit?.();
      return;
    }

    if (!open || completions.length === 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        measure();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setCursor((index) => (index + 1) % completions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setCursor((index) => (index - 1 + completions.length) % completions.length);
        break;
      case "Tab":
      case "Enter": {
        const chosen = completions[active];
        if (!chosen) break;
        event.preventDefault();
        accept(chosen);
        break;
      }
    }
  };

  const matched = reach?.expr === value.trim() ? reach.keys : null;

  return (
    <div ref={anchor} className={cn("relative", className)}>
      <Input
        ref={field}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          const at = event.target.selectionStart ?? event.target.value.length;
          setRange({ start: at, end: at });
          setCursor(0);
          if (!open) measure();
          setOpen(true);
        }}
        onFocus={() => {
          measure();
          setOpen(true);
        }}
        // Fires for a click, an arrow key and a drag alike, which is every way
        // the caret moves. Clicking into a chunk is therefore all it takes to
        // start editing that chunk.
        onSelect={(event) =>
          setRange({
            start: event.currentTarget.selectionStart ?? 0,
            end: event.currentTarget.selectionEnd ?? 0,
          })
        }
        onKeyDown={onKeyDown}
        mono
        size={size}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        {...(prefix === undefined ? {} : { prefix })}
        {...(autoFocusInDialog ? { "data-autofocus": true } : {})}
        invalid={invalid === true || analysis?.valid === false}
        // Inside the field rather than under it. The marks say which chunk is
        // wrong; this says what is wrong with it, and a squiggle on its own
        // teaches nobody the rule they just broke. Truncated with the whole
        // message on hover, because Zenoh's wording can run long.
        {...(analysis?.valid === false
          ? {
              suffix: (
                <span className="text-danger max-w-[13rem] truncate" title={analysis.error ?? ""}>
                  {analysis.error ?? "not valid"}
                </span>
              ),
            }
          : matched === null
            ? {}
            : {
                suffix: (
                  <span className={cn("numeric", matched === 0 && "text-warn")}>
                    {matched === 1 ? "1 key" : `${groupedNumber(matched)} keys`}
                  </span>
                ),
              })}
        // Marked in place rather than described underneath. Positioned in `ch`
        // units, which is exact because the face is monospace — one character
        // is one `ch`, so a chunk's box needs no measuring.
        decoration={
          <span
            className="text-small block h-full"
            style={{ transform: `translateX(${-scrolled}px)` }}
          >
            {chunks.map((chunk) =>
              chunk.text === "" ? null : (
                <span
                  key={`${chunk.index}:${chunk.start}`}
                  className={cn(
                    "absolute top-1/2 h-[1.35em] -translate-y-1/2 rounded-[3px]",
                    transitionFast,
                    bad.has(chunk.index)
                      ? "bg-danger-subtle ring-danger/40 ring-1"
                      : isWildcard(chunk.text)
                        ? "bg-accent-subtle"
                        : chunk.index === slot
                          ? // The chunk the menu is offering options for. Marked
                            // so the two are visibly about the same thing.
                            "bg-selected"
                          : "",
                  )}
                  style={{ left: `${chunk.start}ch`, width: `${chunk.text.length}ch` }}
                />
              ),
            )}
          </span>
        }
        // The targets, above the text. Only the chunks themselves take a
        // click, so the separators between them still place a caret in the
        // field the ordinary way.
        overlay={
          <span className="block h-full" style={{ transform: `translateX(${-scrolled}px)` }}>
            {chunks.map((chunk) =>
              chunk.text === "" ? null : (
                <button
                  key={`hit:${chunk.index}:${chunk.start}`}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Edit the chunk ${chunk.text}`}
                  onMouseDown={(event) => {
                    // Before the input's own placement, or the caret lands
                    // wherever the pointer happened to be inside the word.
                    event.preventDefault();
                    pick(chunk);
                  }}
                  className={cn(
                    "pointer-events-auto absolute top-1/2 h-[1.35em] -translate-y-1/2 cursor-pointer",
                    "hover:ring-accent/50 rounded-[3px] hover:ring-1",
                    transitionFast,
                  )}
                  style={{ left: `${chunk.start}ch`, width: `${chunk.text.length}ch` }}
                />
              ),
            )}
          </span>
        }
        onScroll={(event) => setScrolled(event.currentTarget.scrollLeft)}
      />

      <Verdict analysis={analysis} onUse={onChange} />

      {open && rect && host && completions.length > 0
        ? createPortal(
            <div
              ref={panel}
              role="listbox"
              aria-label="Key chunks"
              style={{
                position: "fixed",
                top: rect.bottom + 5,
                left: rect.left,
                width: Math.max(rect.width, 280),
              }}
              className={cn(
                "rounded-dialog border-line-elevated bg-surface-2 shadow-popover z-50 border p-1.5",
                "motion-safe:animate-scale-in origin-top",
              )}
            >
              {/* Which position is being filled, made visible. A menu of
                  chunk names says nothing about where they would go. */}
              {chunks.length > 1 ? (
                <div className="border-line-soft text-tiny mb-1.5 flex flex-wrap items-center border-b px-2.5 pb-2">
                  {chunks.map((chunk) => (
                    <span key={`${chunk.index}:${chunk.start}`} className="flex items-center">
                      {chunk.index > 0 ? <span className="text-ink-faint px-0.5">/</span> : null}
                      <span
                        className={cn(
                          "numeric rounded-[3px]",
                          chunk.index === slot
                            ? "bg-accent-subtle text-accent-strong px-1"
                            : "text-ink-faint",
                        )}
                      >
                        {chunk.text === "" ? "\u2026" : chunk.text}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="scroll-thin max-h-64 overflow-y-auto">
                {completions.map((completion, index) => (
                  <div
                    key={completion.chunk}
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => accept(completion)}
                    className={cn(
                      "rounded-control flex h-8 cursor-pointer items-center gap-2.5 px-2.5",
                      transitionFast,
                      index === active ? "bg-selected text-ink" : "text-ink-muted",
                    )}
                  >
                    {completion.chunk === "*" || completion.chunk === "**" ? (
                      <Asterisk size={12} className="text-accent shrink-0" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <span className="numeric text-small shrink-0">{completion.chunk}</span>
                    <span className="text-tiny text-ink-faint min-w-0 flex-1 truncate">
                      {completion.says}
                    </span>
                    {/* Which one is already there. Offering every option for a
                        position is only half an answer without saying which of
                        them the reader is replacing. */}
                    {completion.chunk === slotChunk?.text ? (
                      <span className="text-tiny text-ink-faint shrink-0">current</span>
                    ) : null}
                    {index === active ? (
                      <CornerDownLeft size={11} className="text-ink-faint shrink-0" />
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="border-line-soft text-tiny text-ink-faint mt-1.5 flex items-center gap-3 border-t px-2.5 pt-2">
                <span className="flex items-center gap-1.5">
                  <Kbd combo="↑" />
                  <Kbd combo="↓" />
                  pick
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd combo="tab" />
                  add chunk
                </span>
              </div>
            </div>,
            host,
          )
        : null}
    </div>
  );
}

interface VerdictProps {
  analysis: KeyExprAnalysis | null;
  onUse: (value: string) => void;
}

/**
 * The one thing that cannot be said inside the field.
 *
 * A double wildcard followed by a single one is valid, and Zenoh rewrites it
 * with the two swapped — they look like they should mean different things.
 * Saying so needs the rewritten form spelled out and something to click, which
 * is more than a field's trailing edge can hold.
 *
 * (Written out in words rather than shown: the two characters that end a
 * wildcard pair also end a block comment.)
 *
 * Everything else lives in the field: which chunk is at fault, what is wrong
 * with it, and how many keys the expression reaches. Nothing appears here for a
 * plain valid expression, because a line that is always present is a line that
 * stops being read.
 */
function Verdict({ analysis, onUse }: VerdictProps) {
  if (analysis === null || !analysis.valid) return null;
  if (analysis.isCanonical || analysis.canonical === null) return null;

  const canonical = analysis.canonical;

  return (
    <p className="text-tiny text-ink-muted mt-1.5 flex items-center gap-2">
      <span>Zenoh will read this as</span>
      <button
        type="button"
        onClick={() => onUse(canonical)}
        title="Rewrite the field to this form"
        className={cn("numeric text-accent rounded-inner -mx-1 px-1", pressable)}
      >
        {canonical}
      </button>
    </p>
  );
}
