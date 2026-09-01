import { useHotkeys, type Hotkey } from "@/hooks";
import { AppShell } from "@/shell/AppShell";
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

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      { combo: "mod+k", handler: () => openOverlay("palette"), allowInInput: true },
      { combo: "mod+n", handler: () => openOverlay("connect") },
      { combo: "mod+b", handler: toggleSidebar },
      { combo: "mod+r", handler: () => sessionId && void resync(sessionId) },
      { combo: "escape", handler: closeOverlay, allowInInput: true },
      // Digit shortcuts jump between the views people move between constantly.
      { combo: "mod+1", handler: () => navigate("topology") },
      { combo: "mod+2", handler: () => navigate("nodes") },
      { combo: "mod+3", handler: () => navigate("keyspace") },
    ],
    [openOverlay, closeOverlay, toggleSidebar, resync, sessionId, navigate],
  );

  useHotkeys(hotkeys);

  return <AppShell />;
}
