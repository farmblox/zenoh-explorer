/**
 * Everything the app can be asked to do, and what each one does.
 *
 * There are three ways in — a key combo, the native menu, the command palette —
 * and they all land here. Keeping one map is the same argument `shortcuts.ts`
 * makes about its own list: three copies of "what Settings… does" drift, and
 * the drift is silent, because a menu item wired to nothing looks exactly like
 * one that works until someone clicks it.
 */
import { useCallback, useMemo } from "react";

import { openExternal } from "@/ipc/shell";
import type { ViewId } from "@/navigation/types";
import { useNavigation } from "@/navigation/useNavigation";
import { VIEWS } from "@/navigation/views";
import { useActiveSessionId, useSessionStore, useTopologyStore, useUiStore } from "@/stores";
import type { ShortcutId } from "./shortcuts";

/** Where Help points. */
const DOCS_URL = "https://zenoh.io/docs/";
const ISSUES_URL = "https://github.com/farmblox/zenoh-explorer/issues/new";

/**
 * Every action id.
 *
 * A superset of [`ShortcutId`]: the menu can offer things that have no key of
 * their own, but nothing has a key without also being an action.
 */
export type ActionId =
  ShortcutId | "close-session" | "status-bar" | "shortcuts" | "docs" | "report-issue";

export type ActionMap = Readonly<Record<ActionId, () => void>>;

/** The handler for every action, bound to the active session. */
export function useAppActions(): ActionMap {
  const openOverlay = useUiStore((state) => state.openOverlay);
  const closeOverlay = useUiStore((state) => state.closeOverlay);
  const openSettingsAt = useUiStore((state) => state.openSettingsAt);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleStatusBar = useUiStore((state) => state.toggleStatusBar);
  const resync = useTopologyStore((state) => state.resync);
  const disconnect = useSessionStore((state) => state.disconnect);
  const sessionId = useActiveSessionId();
  const { navigate } = useNavigation();

  const goTo = useCallback(
    (view: ViewId) => () => {
      navigate(view);
    },
    [navigate],
  );

  return useMemo<ActionMap>(() => {
    // Built from the registry, so a new view is reachable from every entry
    // point the moment it is added to `views.ts`. The assertion is confined to
    // this narrow record rather than wrapping the whole map, so the literal
    // below is still checked for exhaustiveness against `ActionId` — a handler
    // that goes missing is a compile error, which is the point of keying the
    // map by id at all.
    const views = Object.fromEntries(
      VIEWS.map((view) => [`view:${view.id}`, goTo(view.id)]),
    ) as Record<`view:${ViewId}`, () => void>;

    return {
      ...views,
      palette: () => openOverlay("palette"),
      connect: () => openOverlay("connect"),
      settings: () => openSettingsAt(null),
      sidebar: toggleSidebar,
      "status-bar": toggleStatusBar,
      resync: () => {
        if (sessionId) void resync(sessionId);
      },
      close: closeOverlay,
      "close-session": () => {
        if (sessionId) void disconnect(sessionId);
      },
      shortcuts: () => openSettingsAt("Shortcuts"),
      docs: () => void openExternal(DOCS_URL),
      "report-issue": () => void openExternal(ISSUES_URL),
    };
  }, [
    goTo,
    openOverlay,
    closeOverlay,
    openSettingsAt,
    toggleSidebar,
    toggleStatusBar,
    resync,
    disconnect,
    sessionId,
  ]);
}
