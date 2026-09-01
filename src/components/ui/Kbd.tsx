import { cn } from "@/lib/cn";
import { formatCombo } from "@/hooks/useHotkeys";

export interface KbdProps {
  /** A combo in `mod+k` form; rendered for the current platform. */
  combo: string;
  className?: string;
}

/**
 * A keyboard shortcut, written the way this platform writes it.
 *
 * Deliberately NOT in the monospace face. Geist Mono has no glyph for ⌘
 * (U+2318), ⇧ or ⌥, so the browser silently substitutes a fallback for those
 * characters alone — leaving the modifier and the letter at visibly different
 * weights and widths inside one chip. IBM Plex Sans carries all of them, so the
 * whole shortcut renders in one face.
 *
 * A filled chip rather than an outlined one: at this size a 1px border is more
 * noise than the glyph it surrounds.
 */
export function Kbd({ combo, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        "bg-surface-3 text-ink-faint rounded-inner inline-flex items-center justify-center",
        "h-[18px] min-w-[18px] px-1.5",
        // Tracking is normal here: the glyphs are already tight, and the UI's
        // negative tracking would collide the modifier with the letter.
        "text-tiny font-medium tracking-normal",
        className,
      )}
    >
      {formatCombo(combo)}
    </kbd>
  );
}
