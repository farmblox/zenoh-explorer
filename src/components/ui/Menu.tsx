import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { Popover, type PopoverAlign, type PopoverSide } from "./Popover";

export interface MenuItem<T extends string = string> {
  readonly value: T;
  readonly label: string;
  /** Right-aligned trailing text: a count, or a keyboard hint. */
  readonly hint?: string;
  /** Draws a tick and tints the row. Use for a menu that shows current state. */
  readonly selected?: boolean;
  readonly disabled?: boolean;
}

export interface MenuProps<T extends string> {
  /** The trigger's content. */
  trigger: ReactNode;
  /** Accessible name for the trigger. */
  label: string;
  items: readonly MenuItem<T>[];
  onSelect: (value: T) => void;
  /** Small uppercase heading above the items. */
  heading?: string | undefined;
  side?: PopoverSide | undefined;
  align?: PopoverAlign | undefined;
  triggerClassName?: string | undefined;
  /** Panel width. The mockup's menus are sized to their content, not the trigger. */
  width?: number;
}

/**
 * A list of actions or options, behind a control.
 *
 * `selected` decides which of the two things this is. With it, the menu reports
 * state and reads as a picker; without it, every row is an action. The same
 * component covers both because the mockup uses one shape for both, and two
 * near-identical menus would drift apart.
 */
export function Menu<T extends string>({
  trigger,
  label,
  items,
  onSelect,
  heading,
  side = "bottom",
  align = "start",
  triggerClassName,
  width = 216,
}: MenuProps<T>) {
  return (
    <Popover
      label={label}
      trigger={trigger}
      side={side}
      align={align}
      triggerClassName={triggerClassName}
      className="p-1.5"
    >
      {({ close }) => (
        <div role="menu" aria-label={label} style={{ width }}>
          {heading ? (
            <p className="text-tiny text-ink-faint px-2.5 pt-1.5 pb-2 font-medium tracking-wide uppercase">
              {heading}
            </p>
          ) : null}

          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onSelect(item.value);
                close();
              }}
              className={cn(
                "rounded-inner text-small tracking-ui flex h-8 w-full items-center gap-2.5 px-2.5 text-left",
                "disabled:text-ink-disabled disabled:pointer-events-none",
                focusRing,
                transitionFast,
                item.selected
                  ? "bg-accent-subtle text-ink"
                  : "text-ink-muted hover:bg-surface-3 hover:text-ink",
              )}
            >
              {/* The tick column is reserved on every row, so labels line up
                  whether or not anything in this menu is selected. */}
              <span className="text-accent flex w-3.5 shrink-0 justify-center">
                {item.selected ? <Check size={13} strokeWidth={2.5} /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint ? (
                <span className="numeric text-tiny text-ink-faint shrink-0">{item.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
