import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface FieldProps {
  label: string;
  /**
   * A word on what the field takes, beside the label.
   *
   * Beside rather than beneath, so a form of six fields is six rows rather
   * than twelve — and so the hint reads as part of the question rather than as
   * an answer to it.
   */
  hint?: ReactNode;
  /** Shown in place of the hint when the value is wrong, in the danger colour. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A labelled control.
 *
 * A `<label>` wrapping the control rather than pointing at it by id: nothing
 * here has to invent an id, and clicking the label focuses what it names for
 * free.
 *
 * Not [`FieldRow`], which is the read-only label/value pair an inspector panel
 * is built from. This one labels something you type into.
 *
 * An error replaces the hint rather than joining it. Both at once is one line
 * telling you what the field is for and another telling you that you got it
 * wrong, and only one of those is worth reading at that moment.
 */
export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="flex items-baseline gap-2">
        <span className="text-small text-ink font-medium">{label}</span>
        {error ? (
          <span className="text-tiny text-danger min-w-0">{error}</span>
        ) : hint ? (
          <span className="text-tiny text-ink-faint min-w-0">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
