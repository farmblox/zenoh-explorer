import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

export interface Tab<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Trailing count, e.g. the number of rows behind the tab. */
  readonly count?: number;
}

export interface TabsProps<T extends string> {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
}

/**
 * Switching between panels of one subject.
 *
 * The same enclosed shape as `SegmentedControl` on purpose: both are "pick one
 * of these", and having them look different would imply a distinction that is
 * not there. The difference is semantic — this one is a `tablist`, so a screen
 * reader announces panels rather than options.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "rounded-control bg-surface-2 border-line inline-flex h-8 items-center gap-0.5 border p-0.5",
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.value}`}
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-inner text-small tracking-ui flex h-full items-center gap-2 px-3 font-medium whitespace-nowrap",
              focusRing,
              transitionFast,
              selected
                ? "bg-surface-3 text-ink"
                : "text-ink-faint hover:bg-surface-3 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn("numeric text-tiny", selected ? "text-ink-faint" : "opacity-70")}>
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps<T extends string> {
  value: T;
  children: React.ReactNode;
}

/** The panel a tab controls. Rendered only when its tab is selected. */
export function TabPanel<T extends string>({ value, children }: TabPanelProps<T>) {
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`}>
      {children}
    </div>
  );
}
