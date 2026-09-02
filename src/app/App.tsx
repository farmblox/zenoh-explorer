import { useMemo } from "react";

import { useHotkeys, type Hotkey } from "@/hooks";
import { AppShell } from "@/shell/AppShell";
import { SHORTCUTS } from "./shortcuts";
import { useAppActions } from "./useAppActions";
import { useMenu } from "./useMenu";

/**
 * The application root.
 *
 * Binds the two entry points that must work from anywhere — the keyboard and
 * the native menu — to the same action map, then hands off to the shell.
 * Everything else is composed further down.
 */
export function App() {
  const actions = useAppActions();

  useMenu();

  // Every shortcut in `SHORTCUTS` is bound, and nothing else is: the map is
  // keyed by id, so a combo with no handler cannot compile.
  const hotkeys = useMemo<Hotkey[]>(
    () =>
      SHORTCUTS.map((shortcut) => ({
        combo: shortcut.combo,
        handler: actions[shortcut.id],
        ...(shortcut.allowInInput === undefined ? {} : { allowInInput: shortcut.allowInInput }),
      })),
    [actions],
  );

  useHotkeys(hotkeys);

  return <AppShell />;
}
