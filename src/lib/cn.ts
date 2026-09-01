import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain `clsx` would leave both `px-2` and `px-4` in the output and the winner
 * would depend on stylesheet order — which is how a `className` prop silently
 * stops overriding a component's default.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
