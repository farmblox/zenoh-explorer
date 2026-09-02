import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { usePresence } from "@/hooks";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered as the heading unless `header` replaces it. */
  title: string;
  /** Replaces the default heading row entirely. */
  header?: ReactNode;
  footer?: ReactNode;
  /** Anchors the dialog near the top — right for the command palette. */
  align?: "center" | "top";
  className?: string;
  children: ReactNode;
}

/**
 * A modal dialog.
 *
 * Built on `<dialog>` so the browser supplies the focus trap, the inert
 * background and Escape handling, rather than reimplementing all three.
 */
export function Dialog({
  open,
  onClose,
  title,
  header,
  footer,
  align = "center",
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // A native <dialog> that is `close()`d is removed from the top layer at once,
  // so closing on the prop would cut the exit animation off before its first
  // frame. The element stays open for one exit duration and closes after.
  const { mounted, state } = usePresence(open, EXIT_MS);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (mounted && !dialog.open) {
      dialog.showModal();

      // `showModal()` focuses the first tabbable descendant, which is whatever
      // happens to be first in the DOM — a delete button, a list item, a "New"
      // action. React's `autoFocus` does not help: it fires on MOUNT, and the
      // content mounts while the dialog is still hidden, so focusing there is
      // a no-op. Marking the intended field and focusing it here is the only
      // reliable way to land where the user expects to start typing.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!mounted && dialog.open) {
      dialog.close();
    }
  }, [mounted]);

  return (
    <dialog
      ref={ref}
      data-state={state}
      aria-label={title}
      onCancel={(event) => {
        // Take Escape ourselves so React state stays the single source of
        // truth for whether this dialog is open.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is on the backdrop:
        // the content sits in a child that stops here.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "text-ink backdrop:bg-scrim m-0 max-h-none max-w-none bg-transparent p-0",
        "motion-safe:data-[state=open]:backdrop:animate-[var(--animate-fade-in)]",
        "motion-safe:data-[state=closed]:backdrop:animate-[var(--animate-fade-out)]",
        "h-full w-full",
        // `hidden open:flex`, not a bare `flex`. A closed <dialog> is hidden by
        // the user-agent stylesheet, and any author `display` rule beats that —
        // so a plain `flex` here leaves the dialog laid out over the whole
        // window, invisible and swallowing every click in the app.
        "hidden justify-center open:flex",
        align === "center" ? "items-center" : "items-start pt-[15vh]",
      )}
    >
      <div
        className={cn(
          "flex max-h-[80vh] w-[min(660px,90vw)] flex-col overflow-hidden",
          "rounded-dialog border-line-elevated bg-surface-2 shadow-dialog border",
          "motion-safe:data-[state=open]:animate-[var(--animate-scale-in)]",
          "motion-safe:data-[state=closed]:animate-[var(--animate-scale-out)]",
          className,
        )}
      >
        {header ?? (
          <header className="border-line flex h-14 shrink-0 items-center gap-3 border-b px-5">
            <h2 className="text-base font-medium">{title}</h2>
            <span className="flex-1" />
            {/* Escape and a backdrop click already close this, but neither is
                discoverable. A visible affordance is the one people look for. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cn(
                "rounded-inner text-ink-faint hover:bg-surface-3 hover:text-ink",
                "flex size-7 shrink-0 items-center justify-center",
                focusRing,
                transitionFast,
              )}
            >
              <X size={15} />
            </button>
          </header>
        )}
        {/* `overflow-hidden`, not `auto`: content that needs to scroll manages its
            own scrollers, so a dialog with two independently scrolling columns
            does not get a third one wrapped around both. */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {footer ? (
          <footer className="border-line bg-surface-2 flex shrink-0 items-center gap-2 border-t px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
