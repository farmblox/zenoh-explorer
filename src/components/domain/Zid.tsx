import { Check, Copy } from "lucide-react";

import { useCopy } from "@/hooks";
import { cn } from "@/lib/cn";
import { focusRing } from "@/lib/states";
import { shortZid } from "@/lib/format";

export interface ZidProps {
  zid: string;
  /** Show the whole id rather than the abbreviated form. */
  full?: boolean;
  /**
   * Adds a copy button, revealed on hover or focus.
   *
   * Hidden at rest because a zid appears in dense strips and tables where a
   * permanent icon beside every one of them is more clutter than affordance.
   * The slot is always reserved, so revealing it never shifts the text.
   */
  copyable?: boolean;
  className?: string;
}

/**
 * A Zenoh id.
 *
 * Abbreviated from both ends by default — zids from one deployment often share
 * a prefix, so truncating only the tail would render distinct nodes identical.
 * The full value is always in the tooltip and on the clipboard.
 */
export function Zid({ zid, full, copyable, className }: ZidProps) {
  const { copied, copy } = useCopy();

  return (
    <span className={cn("group/zid inline-flex items-center gap-1.5", className)}>
      <span
        className="numeric selectable text-tiny text-ink-muted truncate font-medium"
        title={zid}
      >
        {full ? zid : shortZid(zid)}
      </span>
      {copyable ? (
        <button
          type="button"
          onClick={() => void copy(zid)}
          aria-label={copied ? "Copied" : "Copy id"}
          className={cn(
            "rounded-inner text-ink-faint hover:text-ink shrink-0 px-0.5",
            "hover:bg-overlay-hover active:bg-overlay-press",
            // Revealed rather than permanent, and it keeps its box either way.
            "opacity-0 group-hover/zid:opacity-100 focus-visible:opacity-100",
            copied && "opacity-100",
            // Not `transitionFast`, and not `iconButton`: the reveal owns the
            // transition property here, so the fill has to join it rather than
            // replace it — two `transition-*` utilities and the later one wins.
            "transition-[opacity,background-color,color] duration-(--duration-fast)",
            focusRing,
          )}
        >
          {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
        </button>
      ) : null}
    </span>
  );
}
