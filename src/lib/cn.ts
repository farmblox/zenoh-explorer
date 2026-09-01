import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale from `theme.css`, named for tailwind-merge.
 *
 * It has to be told. Out of the box it recognises Tailwind's own sizes —
 * `text-sm`, `text-base` — and files every other `text-*` under colour. So
 * `cn("text-tiny", "text-ink-faint")` looked like two colours competing and it
 * dropped the first, silently deleting the font size and leaving the element at
 * whatever it inherited.
 *
 * That was happening everywhere a component composed a size with a colour,
 * which is most of them. Keep this list in step with the `--text-*` tokens.
 */
const FONT_SIZES = ["micro", "tiny", "small", "base", "title", "metric", "metric-lg"];

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
    },
  },
});

/**
 * Merges class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain `clsx` would leave both `px-2` and `px-4` in the output and the winner
 * would depend on stylesheet order — which is how a `className` prop silently
 * stops overriding a component's default.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
