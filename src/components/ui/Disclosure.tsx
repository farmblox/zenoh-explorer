import { ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { transitionFast } from "@/lib/states";

export interface DisclosureProps {
  /** Always-visible label for the closed state. */
  summary: ReactNode;
  /** Metadata shown on the summary row — a count, a status, a rate. */
  meta?: ReactNode;
  /** Open on first render. */
  defaultOpen?: boolean;
  /** Hoists open/closed into the caller, for state that must persist. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

/**
 * A section that starts closed and opens on demand.
 *
 * Progressive disclosure is a governing principle of this interface, not a
 * decoration. A Zenoh deployment has more facts than a screen has room for —
 * tens of thousands of keys, hundreds of nodes, a dozen fields per transport —
 * so every surface starts at the smallest view that answers the common
 * question, and reveals the rest only when asked. This component is the
 * generic form of that; the specific forms are the sidebar's "More", the
 * status bar's expansion, the key tree's lazy levels, the node inspector's
 * tabs and the connect dialog's advanced section.
 *
 * Uncontrolled by default; pass `open` and `onOpenChange` when the state has to
 * outlive the component.
 */
export function Disclosure({
  summary,
  meta,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  children,
}: DisclosureProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;
  const panelId = useId();

  const toggle = () => {
    onOpenChange?.(!isOpen);
    if (open === undefined) setUncontrolled(!isOpen);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          "rounded-inner text-small flex w-full items-center gap-2 px-2 py-1.5",
          "text-ink-muted hover:bg-surface-2 hover:text-ink font-medium",
          transitionFast,
        )}
      >
        <ChevronRight
          size={13}
          className={cn(
            "shrink-0 transition-transform duration-(--duration-base) ease-(--ease-out)",
            isOpen && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
        {meta ? <span className="numeric text-tiny text-ink-faint shrink-0">{meta}</span> : null}
      </button>
      {/* Unmounted rather than hidden: a closed section must not keep a
          subscription open or hold a large list in memory. */}
      {isOpen ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
