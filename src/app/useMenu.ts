/**
 * Acts on the native menu.
 *
 * The Rust side builds the menu and forwards the id of whatever was chosen; it
 * cannot act on most of them itself, because what "Re-read the network" means
 * depends on which session tab is in front. Ids match [`ActionId`], so a menu
 * item and its keyboard equivalent run exactly the same code.
 */
import { useEffect } from "react";

import { onMenuEvent } from "@/ipc/shell";
import { useAppActions } from "./useAppActions";

export function useMenu(): void {
  const actions = useAppActions();

  useEffect(() => {
    // `listen` resolves after the effect may already have been torn down, so
    // the unlisten has to be applied on arrival rather than returned.
    let unlisten: (() => void) | undefined;
    let live = true;

    void onMenuEvent((id) => {
      // An id the frontend does not know is a menu item added in Rust without
      // a handler here. Ignored rather than thrown: a stray menu click should
      // not take the window down.
      const run = actions[id as keyof typeof actions];
      if (run) run();
    }).then((off) => {
      if (live) unlisten = off;
      else off();
    });

    return () => {
      live = false;
      unlisten?.();
    };
  }, [actions]);
}
