import { useHotkeys, type Hotkey } from "@/hooks";
import { AppShell } from "@/shell/AppShell";
import { SHORTCUTS, type ShortcutId } from "./shortcuts";
import { useNavigation } from "@/navigation/useNavigation";
import { useActiveSessionId, useTopologyStore, useUiStore } from "@/stores";
import { useMemo } from "react";

/**
 * The application root.
 *
 * Holds the shortcuts that must work from anywhere, then hands off to the
 * shell. Everything else is composed further down.
 */
export function App() {
  const openOverlay = useUiStore((state) => state.openOverlay);
  const closeOverlay = useUiStore((state) => state.closeOverlay);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const resync = useTopologyStore((state) => state.resync);
  const sessionId = useActiveSessionId();
  const { navigate } = useNavigation();

  // Handlers by id, so the binding and the printed map cannot drift: every
  // shortcut in `SHORTCUTS` is bound here, and nothing else is.
  const hotkeys = useMemo<Hotkey[]>(() => {
    const handlers: Record<ShortcutId, () => void> = {
      palette: () => openOverlay("palette"),
      connect: () => openOverlay("connect"),
      settings: () => openOverlay("settings"),
      sidebar: toggleSidebar,
      resync: () => {
        if (sessionId) void resync(sessionId);
      },
      close: closeOverlay,
      "view:topology": () => navigate("topology"),
      "view:nodes": () => navigate("nodes"),
      "view:keyspace": () => navigate("keyspace"),
      "view:regions": () => navigate("regions"),
      "view:admin": () => navigate("admin"),
      "view:scouting": () => navigate("scouting"),
      "view:events": () => navigate("events"),
      "view:transport": () => navigate("transport"),
      "view:config": () => navigate("config"),
    };

    return SHORTCUTS.map((shortcut) => ({
      combo: shortcut.combo,
      handler: handlers[shortcut.id],
      ...(shortcut.allowInInput === undefined ? {} : { allowInInput: shortcut.allowInInput }),
    }));
  }, [openOverlay, closeOverlay, toggleSidebar, resync, sessionId, navigate]);

  useHotkeys(hotkeys);

  return <AppShell />;
}
