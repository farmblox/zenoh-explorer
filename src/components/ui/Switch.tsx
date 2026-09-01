import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name. Pair with a visible label where there is room. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * An on/off setting that takes effect immediately.
 *
 * Not a checkbox: a checkbox stages a change that some later button commits.
 * Everything this app toggles applies the moment it is flipped, and the control
 * should say so.
 */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-[34px] shrink-0 rounded-full",
        focusRing,
        transitionFast,
        "disabled:pointer-events-none disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-3",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-3.5 rounded-full",
          "transition-[left,background-color] duration-(--duration-fast) ease-(--ease-standard)",
          checked ? "bg-on-accent left-[17px]" : "bg-ink-faint left-[3px]",
        )}
      />
    </button>
  );
}

export interface SettingRowProps {
  label: string;
  /** One line explaining what the setting changes. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Renders the description in the monospace face, for addresses and locators. */
  mono?: boolean;
}

/** A switch with its label and explanation, as a row in a settings list. */
export function SettingRow({ label, description, checked, onChange, mono }: SettingRowProps) {
  return (
    <div className="border-line-soft flex items-center gap-4 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-small text-ink">{label}</p>
        {description ? (
          <p className={cn("text-tiny text-ink-faint mt-1", mono && "numeric")}>{description}</p>
        ) : null}
      </div>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
