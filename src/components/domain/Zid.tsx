import { Check, Copy } from "lucide-react";

import { useCopy } from "@/hooks";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { shortZid } from "@/lib/format";

export interface ZidProps {
  zid: string;
  /** Show the whole id rather than the abbreviated form. */
  full?: boolean;
  /** Adds a copy button. Off in dense tables, on in inspectors. */
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
    <span className={cn("inline-flex items-center gap-1.5", className)}>
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
            "rounded-inner text-ink-faint hover:text-ink shrink-0",
            focusRing,
            transitionFast,
          )}
        >
          {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
        </button>
      ) : null}
    </span>
  );
}
