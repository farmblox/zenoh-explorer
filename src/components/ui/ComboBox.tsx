import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { controlBase, focusRing, overlayStates, transitionFast } from "@/lib/states";
import { Popover, type PopoverAlign, type PopoverSide } from "./Popover";

/** One value the box can hold. */
export interface ComboBoxOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  /** Right-aligned trailing text. A count, usually. */
  readonly hint?: string;
  readonly disabled?: boolean;
}

/**
 * Options past which the panel grows a filter field.
 *
 * Under a screenful, scanning is faster than typing. Over it, a list you have
 * to scroll to find anything in is the reason this is a combo box and not a
 * menu, and a network can easily have thirty regions.
 */
const FILTER_THRESHOLD = 8;

/** Height of the scrolling option list, in pixels. */
const LIST_MAX_HEIGHT = 288;

export interface ComboBoxProps<T extends string> {
  /**
   * What the value is.
   *
   * Sits on the trigger in the quiet colour and doubles as the control's
   * accessible name, so the trigger reads as `Region all` rather than as a
   * dropdown you have to open to identify.
   */
  label: string;
  value: T;
  options: readonly ComboBoxOption<T>[];
  onChange: (value: T) => void;
  /** Shown on the trigger when `value` names no option. */
  fallback?: string;
  /** Forces the filter field on or off. Defaults to on past eight options. */
  filterable?: boolean | undefined;
  placeholder?: string | undefined;
  /** Renders the trigger's value in the monospace face. For ids and counts. */
  mono?: boolean | undefined;
  /** Panel width. Sized to its content, not to the trigger. */
  width?: number;
  side?: PopoverSide | undefined;
  align?: PopoverAlign | undefined;
  className?: string | undefined;
}

const TRIGGER = cn(
  "rounded-control bg-surface-2 text-small text-ink flex h-8 max-w-[280px] items-center gap-2 px-3",
  "font-medium whitespace-nowrap",
  controlBase,
  overlayStates,
);

/**
 * A control that names its current value and opens a list of the others.
 *
 * The one shape every filter in the app uses. `Menu` is its sibling and the
 * distinction is worth keeping: a menu's rows are things to DO, and it forgets
 * them once done. This holds a value, says so on its face, and ticks it in the
 * list — so a toolbar of these reads as a sentence about what is on screen.
 */
export function ComboBox<T extends string>({
  label,
  value,
  options,
  onChange,
  fallback = "—",
  filterable,
  placeholder = "Filter",
  mono,
  width = 252,
  side = "bottom",
  align = "start",
  className,
}: ComboBoxProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <Popover
      label={label}
      haspopup="listbox"
      side={side}
      align={align}
      triggerClassName={cn(TRIGGER, className)}
      // The filter row spans the panel edge to edge, so the padding that would
      // inset it moves onto the list instead.
      className="overflow-hidden p-0"
      trigger={
        <>
          <span className="text-ink-faint shrink-0">{label}</span>
          <span className={cn("min-w-0 truncate", mono && "numeric")}>
            {selected?.label ?? fallback}
          </span>
          <ChevronDown size={13} className="text-ink-faint shrink-0" />
        </>
      }
    >
      {({ close }) => (
        // Mounted with the panel and unmounted with it, which is what resets
        // the filter — a box that reopens still showing last time's query is a
        // box that appears to have lost most of its options.
        <ComboBoxPanel
          label={label}
          value={value}
          options={options}
          onChange={onChange}
          close={close}
          width={width}
          showFilter={filterable ?? options.length > FILTER_THRESHOLD}
          placeholder={placeholder}
        />
      )}
    </Popover>
  );
}

interface ComboBoxPanelProps<T extends string> {
  label: string;
  value: T;
  options: readonly ComboBoxOption<T>[];
  onChange: (value: T) => void;
  close: () => void;
  width: number;
  showFilter: boolean;
  placeholder: string;
}

function ComboBoxPanel<T extends string>({
  label,
  value,
  options,
  onChange,
  close,
  width,
  showFilter,
  placeholder,
}: ComboBoxPanelProps<T>) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    // The value as well as the label: regions are matched by their id, and a
    // node's id is often what you have to hand rather than its name.
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
    );
  }, [options, query]);

  // Arrow keys move real DOM focus between the rows rather than tracking an
  // active index in state. One selection model instead of two, and it stays
  // correct when the filter reorders what is on screen underneath it.
  const rows = useCallback(
    () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-option]") ?? [])],
    [],
  );

  const step = useCallback(
    (from: HTMLElement, delta: number) => {
      const all = rows();
      const index = all.indexOf(from as HTMLButtonElement);
      const next = all[index + delta];
      if (next) next.focus();
      // Off the top goes back to the field, so the whole panel is one loop.
      else if (delta < 0) filterRef.current?.focus();
    },
    [rows],
  );

  const focusOnMount = useCallback((element: HTMLInputElement | null) => {
    element?.focus();
  }, []);

  return (
    <div style={{ width }}>
      {showFilter ? (
        <div className="border-line-soft flex h-9 items-center gap-2 border-b px-3">
          <Search size={13} className="text-ink-faint shrink-0" aria-hidden />
          <input
            ref={(element) => {
              filterRef.current = element;
              focusOnMount(element);
            }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                rows()[0]?.focus();
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                rows().at(-1)?.focus();
              } else if (event.key === "Enter") {
                event.preventDefault();
                rows()[0]?.click();
              }
            }}
            placeholder={placeholder}
            aria-label={`Filter ${label.toLowerCase()}`}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className="text-small text-ink placeholder:text-ink-faint min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
      ) : null}

      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        style={{ maxHeight: LIST_MAX_HEIGHT }}
        className="scroll-thin overflow-y-auto p-1.5"
      >
        {matches.length === 0 ? (
          <p className="text-small text-ink-faint px-2.5 py-3 text-center">
            Nothing matches “{query.trim()}”
          </p>
        ) : (
          matches.map((option) => {
            const current = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                data-option
                aria-selected={current}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    step(event.currentTarget, 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    step(event.currentTarget, -1);
                  }
                }}
                className={cn(
                  "rounded-control text-small tracking-ui flex h-8 w-full items-center gap-2.5 px-2.5 text-left",
                  "disabled:text-ink-disabled disabled:pointer-events-none",
                  focusRing,
                  transitionFast,
                  current
                    ? "bg-accent-subtle text-ink"
                    : "text-ink-muted hover:bg-surface-3 hover:text-ink",
                )}
              >
                {/* The tick column is reserved on every row, so labels line up
                    whether or not the value is in the filtered set. */}
                <span className="text-accent flex w-3.5 shrink-0 justify-center">
                  {current ? <Check size={13} strokeWidth={2.5} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint ? (
                  <span className="numeric text-tiny text-ink-faint shrink-0">{option.hint}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
