import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as showPlaceholder,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Syntax colours, in the app's own palette.
 *
 * The same five roles the hand-written tokenizer used to produce, mapped onto
 * what a real parser reports: a key is ink, a string is the accent, a number is
 * the ok colour, `true`/`false`/`null` are the warn colour, and punctuation
 * recedes. Keeping the mapping means a config that has been read a hundred
 * times still looks like itself.
 *
 * Written as `var(--…)` rather than resolved values, so the whole editor follows
 * a theme switch with nothing to rebuild and no second source of colour.
 */
const HIGHLIGHT = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--ink)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--accent)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--ok)" },
  { tag: [tags.bool, tags.null, tags.keyword], color: "var(--warn)" },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: "var(--ink-faint)" },
  { tag: tags.comment, color: "var(--ink-faint)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--danger)" },
]);

/** The app's surfaces, spacing and type, applied to CodeMirror's own classes. */
const THEME = EditorView.theme({
  // Fills its container, which therefore has to have a height. Given only a
  // max-height CodeMirror sizes to its content and the scroller never gets a
  // reason to scroll, so a long payload is clipped with no way to reach the
  // rest of it.
  "&": {
    color: "var(--ink-muted)",
    backgroundColor: "transparent",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-tiny)",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    // The same leading the config viewer was set at: a wall of punctuation
    // needs more room between lines than prose does.
    lineHeight: "1.85",
    overflow: "auto",
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px" },
  "&.cm-focused": { outline: "none" },

  // Faint, not disabled. A line number is content you read off and count with,
  // and at the disabled weight it measured 2.4:1 — present but not legible.
  // A tint rather than a surface: this editor sits on `surface-0` in the node
  // peek, `surface-1` in the config screen and `surface-2` in a dialog, and a
  // fixed colour would be wrong on two of the three. `--line-soft` is
  // translucent and directional, so it darkens the light theme and lightens the
  // dark one whatever is behind it.
  ".cm-gutters": {
    backgroundColor: "var(--line-soft)",
    color: "var(--ink-faint)",
    border: "none",
    borderRight: "1px solid var(--line-soft)",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 16px", minWidth: "2.5rem" },
  // The active row highlights across the gutter and the line together, so it
  // reads as one row rather than as two things that happen to line up.
  ".cm-activeLineGutter": { backgroundColor: "var(--overlay-hover)", color: "var(--ink-muted)" },
  ".cm-activeLine": { backgroundColor: "var(--overlay-hover)" },

  // Drawn selection rather than the native one, so it can use the app's token
  // on both themes instead of the platform's blue.
  ".cm-selectionBackground, ::selection": { backgroundColor: "var(--selected)" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--selected)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionMatch": { backgroundColor: "var(--accent-subtle)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--accent-subtle)",
    color: "inherit",
    outline: "none",
  },

  // The search panel is a browser-default form until told otherwise, and one
  // of those inside this app looks like a bug.
  ".cm-panels": {
    backgroundColor: "var(--surface-2)",
    color: "var(--ink)",
    borderTop: "1px solid var(--line)",
  },
  ".cm-panel.cm-search": {
    padding: "8px 12px",
    fontFamily: "var(--font-ui, inherit)",
    fontSize: "var(--text-tiny)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
    fontFamily: "inherit",
    fontSize: "inherit",
  },
  ".cm-panel.cm-search input[type=text]": {
    backgroundColor: "var(--surface-1)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-inner)",
    padding: "3px 8px",
    outline: "none",
  },
  ".cm-panel.cm-search input[type=text]:focus-visible": { borderColor: "var(--accent)" },
  ".cm-panel.cm-search button:not([name=close])": {
    backgroundColor: "var(--surface-1)",
    backgroundImage: "none",
    color: "var(--ink-muted)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-inner)",
    padding: "3px 8px",
    margin: "0 2px",
    cursor: "pointer",
  },
  ".cm-panel.cm-search button[name=close]": {
    color: "var(--ink-faint)",
    cursor: "pointer",
    padding: "0 6px",
    fontSize: "16px",
  },
  ".cm-searchMatch": { backgroundColor: "var(--warn-subtle)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--accent-subtle)" },
  ".cm-placeholder": { color: "var(--ink-faint)" },
});

const MATCH = Decoration.mark({ class: "cm-searchMatch" });

/**
 * Marks every occurrence of `needle`, so a filter box outside the editor can
 * drive highlighting inside it.
 *
 * The app's own toolbar rather than CodeMirror's find panel: the config screen
 * already had a filter field, and a second search control appearing on ⌘F would
 * be two ways to do one thing. Only the visible ranges are scanned, which is
 * what keeps it cheap on a document with thousands of lines.
 */
function highlightMatches(needle: string): Extension {
  if (needle === "") return [];

  const build = (view: EditorView): DecorationSet => {
    const lower = needle.toLowerCase();
    const found: Range<Decoration>[] = [];

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to).toLowerCase();
      let at = text.indexOf(lower);
      while (at !== -1) {
        found.push(MATCH.range(from + at, from + at + lower.length));
        at = text.indexOf(lower, at + lower.length);
      }
    }

    return Decoration.set(found, true);
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export interface CodeEditorProps {
  value: string;
  /**
   * Called as the document changes. Omit for a read-only view.
   *
   * Read-only rather than disabled: the text stays selectable, searchable and
   * scrollable, which is the whole point of showing a config you cannot edit.
   */
  onChange?: ((value: string) => void) | undefined;
  /**
   * Numbers down the left. On by default.
   *
   * They are how you say where something is to someone else, and a payload
   * worth opening is a payload worth pointing at a line of.
   */
  lineNumbers?: boolean | undefined;
  /** Adds the find panel and its ⌘F binding. */
  searchable?: boolean | undefined;
  /** Marks every occurrence of this string, for a filter field of your own. */
  highlight?: string | undefined;
  placeholder?: string | undefined;
  /** Accessible name. Required — this is a text field however it looks. */
  label: string;
  /** Give the box a height: the editor fills it and scrolls inside it. */
  className?: string | undefined;
}

/**
 * A code surface: JSON, shown or edited.
 *
 * One component for every place this app puts a structured document on screen —
 * a node's metadata, a router's effective configuration, a payload about to be
 * published, a raw JSON5 override. Those were four different `<pre>` blocks and
 * two bare `<textarea>`s, which is four highlighting behaviours and two with
 * none.
 *
 * CodeMirror rather than Monaco for a reason that is not taste: Monaco needs
 * blob workers, and this app ships a CSP of `default-src 'self'` with no
 * `worker-src` and no `blob:`. Loosening that to get syntax colours would be a
 * poor trade. CodeMirror needs neither, and themes from CSS variables — so it
 * takes `theme.css` directly rather than keeping a palette of its own.
 */
export function CodeEditor({
  value,
  onChange,
  lineNumbers: showLineNumbers = true,
  searchable = false,
  highlight = "",
  placeholder,
  label,
  className,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Held in a ref so a new handler each render does not tear the editor down
  // and lose the cursor with it.
  const emit = useRef(onChange);

  // Built once. Everything that can change at runtime — the value, and whether
  // it is editable — goes through a compartment or a transaction instead, so
  // typing never reconstructs the document.
  const editable = useRef(new Compartment());
  const marks = useRef(new Compartment());

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      bracketMatching(),
      indentOnInput(),
      json(),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorState.allowMultipleSelections.of(true),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit.current?.(update.state.doc.toString());
      }),
      editable.current.of([]),
      marks.current.of(highlightMatches(highlight)),
    ];

    if (showLineNumbers) extensions.push(lineNumbers(), highlightActiveLineGutter());
    if (searchable) extensions.push(search({ top: true }), keymap.of(searchKeymap));
    if (placeholder !== undefined) extensions.push(showPlaceholder(placeholder));

    const created = new EditorView({
      parent,
      state: EditorState.create({ doc: value, extensions }),
    });
    view.current = created;

    return () => {
      created.destroy();
      view.current = null;
    };
    // Deliberately built from the first render's structural options. Changing
    // whether a surface has line numbers mid-life is not a thing this app does,
    // and depending on them here would rebuild the editor on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The value is an input, so it has to be pushed in — but only when it differs
  // from what is already there. Without that guard every keystroke would
  // dispatch a transaction replacing the document with itself and put the
  // cursor back at the start.
  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;

    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: marks.current.reconfigure(highlightMatches(highlight)),
    });
  }, [highlight]);

  // The handler and the editable state are the same fact, so they are kept in
  // step in one place. Assigned here rather than during render: a ref written
  // while rendering is a value React cannot see change.
  useEffect(() => {
    emit.current = onChange;
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorView.editable.of(onChange !== undefined),
        EditorState.readOnly.of(onChange === undefined),
      ]),
    });
  }, [onChange]);

  return (
    <div
      ref={host}
      role="textbox"
      aria-label={label}
      aria-readonly={onChange === undefined}
      aria-multiline
      className={cn("scroll-thin min-h-0 overflow-hidden", className)}
    />
  );
}
