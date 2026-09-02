import { ErrorBoundary } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useNavigation } from "@/navigation/useNavigation";
import { ConnectDialog } from "@/features/connect";
import { CommandPalette } from "@/features/palette";
import { SettingsDialog } from "@/features/settings";
import { useActiveSessionId } from "@/stores";
import { Sidebar } from "./sidebar/Sidebar";
import { StatusBar } from "./statusbar/StatusBar";
import { Toaster } from "./Toaster";
import { Titlebar } from "./titlebar/Titlebar";

/**
 * The window layout.
 *
 * Four regions that never unmount: title bar, sidebar, content pane and status
 * bar. Only the content pane swaps, which is what keeps a view change feeling
 * instant — no chrome is rebuilt, and no scroll position outside the pane moves.
 *
 * The rounded, inset content pane is the mockup's central device: the chrome
 * sits behind, and the pane floats on it.
 */
export function AppShell() {
  const { definition } = useNavigation();
  const sessionId = useActiveSessionId();
  const View = definition.component;

  return (
    <div className="bg-surface-0 relative flex h-full flex-col">
      <Titlebar />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main
          className={cn(
            "bg-surface-1 flex min-w-0 flex-1 flex-col overflow-hidden",
            // Three sides, both left corners: the pane is an inset card that
            // the chrome wraps on the top, left and bottom, running flush to
            // the window on the right. The status bar below is full-width
            // chrome, which is what makes the bottom-left corner visible.
            "rounded-l-panel border-line border-t border-b border-l",
          )}
          // Announce which view is showing without a live region reading the
          // whole pane on every update.
          aria-label={definition.label}
        >
          {/* Keyed by session, so a view's local state (which region is open,
              which row is selected) is scoped to the tab it belongs to. Views
              get that for free instead of each writing a reset effect.

              The boundary is inside the pane on purpose: a view that throws
              costs you that pane, while the tabs, sidebar and status bar keep
              working and can navigate you out of it. */}
          <ErrorBoundary resetKey={`${sessionId ?? "none"}:${definition.id}`}>
            <View key={sessionId ?? "no-session"} />
          </ErrorBoundary>
        </main>
      </div>

      <StatusBar />
      <CommandPalette />
      <ConnectDialog />
      <SettingsDialog />
      {/* Positioned against the window, so it clears the status bar rather
          than being clipped by the content pane's overflow. */}
      <Toaster />
    </div>
  );
}
