import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import { controlBase, overlayStates } from "@/lib/states";
import { Menu, type MenuItem } from "./Menu";

export interface SplitButtonProps<T extends string> {
  /** The default action's label. Runs on the main half. */
  children: string;
  onClick: () => void;
  /** The rest of the actions, behind the caret. */
  items: readonly MenuItem<T>[];
  onSelect: (value: T) => void;
  /** Small uppercase heading above the menu items. */
  heading?: string | undefined;
  disabled?: boolean;
}

/**
 * The likeliest action, with its neighbours one click away.
 *
 * A view usually has one action worth a button and four worth a menu. Splitting
 * them keeps the common one at a single click without spending header width on
 * the rest, and without hiding the common one behind a caret.
 */
export function SplitButton<T extends string>({
  children,
  onClick,
  items,
  onSelect,
  heading,
  disabled,
}: SplitButtonProps<T>) {
  return (
    <div
      className={cn(
        "rounded-control border-line bg-surface-2 inline-flex h-8 shrink-0 items-stretch border",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "text-small text-ink rounded-l-[calc(var(--radius-control)-1px)] px-3 font-medium whitespace-nowrap",
          controlBase,
          overlayStates,
        )}
      >
        {children}
      </button>

      <Menu
        label="More actions"
        align="end"
        heading={heading}
        items={items}
        onSelect={onSelect}
        triggerClassName={cn(
          "border-line flex w-7 items-center justify-center rounded-r-[calc(var(--radius-control)-1px)] border-l",
          "text-ink-faint hover:text-ink",
          controlBase,
          overlayStates,
        )}
        trigger={<ChevronDown size={13} />}
      />
    </div>
  );
}
