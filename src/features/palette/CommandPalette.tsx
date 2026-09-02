import { Binary, CornerDownLeft, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";

import { Dialog, Kbd } from "@/components/ui";
import { session as sessionIpc, type SearchHit, type SearchResults } from "@/ipc";
import { cn } from "@/lib/cn";
import { transitionFast } from "@/lib/states";
import { useNavigation } from "@/navigation/useNavigation";
import { VIEW_BY_ID } from "@/navigation/views";
import { useActiveSessionId, useTopologyStore, useUiStore } from "@/stores";
import { buildCommands, type PaletteAction, type PaletteCommand } from "./commands";

/** Rows per group. Enough to choose from without becoming a list to read. */
const PER_GROUP = 8;

/** Typed in front of a query to search commands alone. */
const COMMAND_PREFIX = ">";

const EMPTY: SearchResults = {
  nodes: [],
  nodeTotal: 0,
  keys: [],
  keyTotal: 0,
  commands: [],
  commandTotal: 0,
};

interface Group {
  readonly title: string;
  readonly hits: readonly SearchHit[];
  /** How many matched, when that is more than are shown. */
  readonly total: number;
}

/**
 * Search and run a command.
 *
 * Everything on screen is ranked by the matcher in `zenoh-explorer-core`,
 * including the commands — their text is written here because naming what the
 * app does is not a fact about a Zenoh network, but scoring it here as well
 * would give the combined list two orderings and no way to interleave them.
 *
 * The highlighted characters come back from that same matcher. A palette that
 * re-derives them with `indexOf` disagrees with its own ranking the moment a
 * query matches non-contiguously, which is most of the time.
 */
export function CommandPalette() {
  const open = useUiStore((state) => state.overlay === "palette");
  const closeOverlay = useUiStore((state) => state.closeOverlay);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const themePreference = useUiStore((state) => state.themePreference);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const revealIn = useUiStore((state) => state.revealIn);
  const resync = useTopologyStore((state) => state.resync);
  const sessionId = useActiveSessionId();
  const { navigate } = useNavigation();

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  // Tagged with the query they answered. Without that the effect would have
  // to clear them on every keystroke, and a synchronous write there is both
  // an extra render and something the compiler refuses.
  const [answered, setAnswered] = useState<{ term: string; data: SearchResults }>({
    term: "",
    data: EMPTY,
  });

  const commands = useMemo(
    () => buildCommands({ hasSession: sessionId !== null, sidebarCollapsed, themePreference }),
    [sessionId, sidebarCollapsed, themePreference],
  );

  // Opening is the one moment the palette should forget everything: the query
  // you ran last time is never the one you want next.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }

  const commandsOnly = query.startsWith(COMMAND_PREFIX);
  const term = commandsOnly ? query.slice(COMMAND_PREFIX.length).trim() : query.trim();

  useEffect(() => {
    if (!open || term === "") return;

    // The response can outrun a later keystroke's, so the last request wins
    // rather than the last reply.
    let current = true;
    const candidates = commands.map(({ id, label, detail }) => ({ id, label, detail }));

    void sessionIpc
      .search(commandsOnly ? null : sessionId, term, PER_GROUP, candidates)
      .then((found) => {
        if (current) setAnswered({ term, data: found });
      })
      .catch(() => {
        if (current) setAnswered({ term, data: EMPTY });
      });

    return () => {
      current = false;
    };
  }, [open, term, commandsOnly, sessionId, commands]);

  /**
   * The query the list on screen reflects, which lags the one being typed.
   *
   * Rendering `term` directly makes the panel flicker: for the frame between a
   * keystroke and its answer there are no results for the new query yet, so the
   * list empties and refills on every character. Showing the last answer until
   * the next one is ready keeps it still — the search is local and answers in
   * about a millisecond, so what is briefly stale is never visibly stale.
   *
   * Clearing the field is exempt. That answer needs no round trip, so it lands
   * on the same frame as the keystroke.
   */
  const shownTerm = term === "" ? "" : answered.term;

  const groups = useMemo<Group[]>(() => {
    // Nothing typed yet: offer what the app can do rather than an empty box.
    // Unranked and unfiltered, because there is no query to rank against.
    if (shownTerm === "") {
      const hits = commands.map<SearchHit>((command) => ({
        kind: "command",
        label: command.label,
        detail: command.detail,
        target: command.id,
        highlights: [],
        score: 0,
      }));
      return [{ title: "Commands", hits, total: hits.length }];
    }

    const { data } = answered;
    return [
      { title: "Nodes", hits: data.nodes, total: data.nodeTotal },
      { title: "Key expressions", hits: data.keys, total: data.keyTotal },
      { title: "Commands", hits: data.commands, total: data.commandTotal },
    ].filter((group) => group.hits.length > 0);
  }, [shownTerm, commands, answered]);

  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);

  // A shorter result list can leave the cursor past the end.
  const active = Math.min(cursor, Math.max(flat.length - 1, 0));

  const runAction = useCallback(
    (action: PaletteAction) => {
      switch (action.kind) {
        case "view":
          navigate(action.view);
          closeOverlay();
          break;
        case "overlay":
          openOverlay(action.overlay);
          break;
        case "sidebar":
          toggleSidebar();
          closeOverlay();
          break;
        case "resync":
          if (sessionId) void resync(sessionId);
          closeOverlay();
          break;
        case "theme":
          setThemePreference(action.theme);
          closeOverlay();
          break;
      }
    },
    [navigate, closeOverlay, openOverlay, toggleSidebar, resync, sessionId, setThemePreference],
  );

  const run = useCallback(
    (hit: SearchHit) => {
      switch (hit.kind) {
        case "command": {
          const command = commands.find((entry) => entry.id === hit.target);
          if (command) runAction(command.action);
          break;
        }
        case "node":
          revealIn(sessionId, "nodes", hit.target);
          break;
        case "key":
          revealIn(sessionId, "keyspace", hit.target);
          break;
      }
    },
    [commands, runAction, revealIn, sessionId],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setCursor((index) => (index + 1) % flat.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setCursor((index) => (index - 1 + flat.length) % flat.length);
        break;
      case "Home":
        event.preventDefault();
        setCursor(0);
        break;
      case "End":
        event.preventDefault();
        setCursor(flat.length - 1);
        break;
      case "Enter": {
        event.preventDefault();
        const hit = flat[active];
        if (hit) run(hit);
        break;
      }
    }
  };

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let index = -1;

  return (
    <Dialog
      open={open}
      onClose={closeOverlay}
      title="Search or run a command"
      align="top"
      className="w-[min(640px,92vw)]"
      header={
        <div className="border-line flex h-13 shrink-0 items-center gap-3 border-b px-4">
          <Search size={16} className="text-ink-faint shrink-0" />
          <input
            data-autofocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search nodes, keys and commands"
            aria-label="Search nodes, keys and commands"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={flat.length > 0 ? `palette-hit-${active}` : undefined}
            className={cn(
              "placeholder:text-ink-faint flex-1 bg-transparent text-base outline-none",
              "text-ink min-w-0",
            )}
          />
          <Kbd combo="esc" />
        </div>
      }
      footer={
        <div className="text-tiny text-ink-faint flex w-full items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Kbd combo="↑" />
            <Kbd combo="↓" />
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd combo="↵" />
            open
          </span>
          <span className="flex-1" />
          <span>
            Type <span className="numeric text-ink-muted">{COMMAND_PREFIX}</span> for commands only
          </span>
        </div>
      }
    >
      {/* 8px of padding against the dialog's 16px corner puts the rows' 8px
          corners exactly concentric with it. */}
      <div
        ref={listRef}
        id="palette-results"
        role="listbox"
        aria-label="Results"
        className="scroll-thin max-h-100 overflow-x-hidden overflow-y-auto p-2"
      >
        {flat.length === 0 ? (
          <p className="text-small text-ink-muted px-3 py-6 text-center">
            Nothing matches <span className="text-ink font-medium">{shownTerm}</span>. Try a node
            name, a key expression, or part of a command.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.title}>
              <header className="flex items-baseline gap-3 px-3 pt-2 pb-1">
                <h3 className="text-tiny text-ink-faint font-medium tracking-wide uppercase">
                  {group.title}
                </h3>
                {group.total > group.hits.length ? (
                  <>
                    <span className="flex-1" />
                    <span className="numeric text-tiny text-ink-faint shrink-0">
                      {group.hits.length} of {group.total}
                    </span>
                  </>
                ) : null}
              </header>
              {group.hits.map((hit) => {
                index += 1;
                return (
                  <Row
                    key={`${hit.kind}:${hit.target}`}
                    id={`palette-hit-${index}`}
                    hit={hit}
                    active={index === active}
                    command={commands.find((entry) => entry.id === hit.target)}
                    icon={iconFor(
                      hit,
                      commands.find((entry) => entry.id === hit.target),
                    )}
                    onMouseMove={setCursor}
                    position={index}
                    onRun={run}
                  />
                );
              })}
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}

/** The icon for a hit, taken from the view it opens. */
function iconFor(hit: SearchHit, command: PaletteCommand | undefined): ComponentType<IconProps> {
  if (hit.kind === "node") return Users;
  if (hit.kind === "key") return Binary;
  // A "Go to Topology" row carries the Topology icon, so the palette teaches
  // the same glyph the sidebar uses rather than a second vocabulary.
  if (command?.action.kind === "view") return VIEW_BY_ID.get(command.action.view)?.icon ?? Search;
  return CornerDownLeft;
}

interface IconProps {
  size?: number;
  className?: string;
}

interface RowProps {
  id: string;
  hit: SearchHit;
  active: boolean;
  command: PaletteCommand | undefined;
  icon: ComponentType<IconProps>;
  position: number;
  onMouseMove: (position: number) => void;
  onRun: (hit: SearchHit) => void;
}

function Row({ id, hit, active, command, icon: Icon, position, onMouseMove, onRun }: RowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onClick={() => onRun(hit)}
      // Pointer movement, not entry: a list scrolling under a still cursor
      // would otherwise reselect whatever slid beneath it.
      onMouseMove={() => onMouseMove(position)}
      className={cn(
        "rounded-control flex h-10 cursor-pointer items-center gap-3 px-3",
        transitionFast,
        active ? "bg-selected text-ink" : "text-ink-muted",
      )}
    >
      <Icon size={15} className={cn("shrink-0", active ? "text-ink" : "text-ink-faint")} />
      <span className="text-small shrink-0 truncate">
        <Highlighted text={hit.label} positions={hit.highlights} />
      </span>
      <span className="numeric text-tiny text-ink-faint min-w-0 flex-1 truncate">{hit.detail}</span>
      {command?.combo ? <Kbd combo={command.combo} /> : null}
    </div>
  );
}

interface HighlightedProps {
  text: string;
  positions: readonly number[];
}

/**
 * Marks the characters the matcher actually scored.
 *
 * Offsets are into code points rather than bytes, which is why the string is
 * split with the spread rather than indexed directly — a name with an emoji or
 * a combining mark in it would otherwise mark the wrong half of a character.
 */
function Highlighted({ text, positions }: HighlightedProps) {
  if (positions.length === 0) return text;

  const marked = new Set(positions);
  const characters = [...text];

  // Adjacent matched characters become one span, so a run reads as a word
  // rather than as separately styled letters.
  const runs: { text: string; on: boolean }[] = [];
  for (const [at, character] of characters.entries()) {
    const on = marked.has(at);
    const last = runs.at(-1);
    if (last && last.on === on) last.text += character;
    else runs.push({ text: character, on });
  }

  return (
    <>
      {runs.map((run, at) => (
        <span key={at} className={run.on ? "text-accent font-medium" : undefined}>
          {run.text}
        </span>
      ))}
    </>
  );
}
