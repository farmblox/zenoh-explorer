import { useCallback, useState } from "react";

import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/** Milliseconds the "copied" confirmation stays up. */
const CONFIRM_MS = 1_400;

/**
 * Copies text to the system clipboard and reports a short confirmation.
 *
 * Uses Tauri's clipboard plugin rather than `navigator.clipboard`, which
 * needs a secure context and a user-gesture heuristic that the webview does
 * not reliably satisfy.
 */
export function useCopy(): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    await writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), CONFIRM_MS);
  }, []);

  return { copied, copy };
}
