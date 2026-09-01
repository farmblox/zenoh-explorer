import { Plus, Trash2 } from "lucide-react";

import { StatusDot } from "@/components/ui";
import type { SavedProfile, SessionSummary } from "@/ipc";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { focusRing, transitionFast } from "@/lib/states";

export interface SavedConnectionsProps {
  profiles: readonly SavedProfile[];
  /** Which saved profile is loaded in the form, if any. */
  selectedId: string | null;
  /** Sessions currently open, so a saved profile can show as connected. */
  openSessions: readonly SessionSummary[];
  onSelect: (profile: SavedProfile) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

/**
 * The saved-connections column of the connect dialog.
 *
 * Ordering comes from the store: most recently used first. That is the only
 * ordering worth having — a list of connections is used far more than it is
 * curated, and alphabetical puts your production router below `a-test`.
 */
export function SavedConnections({
  profiles,
  selectedId,
  openSessions,
  onSelect,
  onDelete,
  onNew,
}: SavedConnectionsProps) {
  /**
   * A saved profile counts as open when a live session shares its name.
   *
   * Name rather than id because a session is opened from a profile's contents,
   * not a reference to it — the backend has no idea a session came from a
   * saved row, and giving it one would couple the session registry to storage
   * for the sake of a dot.
   */
  const openNames = new Set(openSessions.map((session) => session.profile.name));

  return (
    <aside className="border-line bg-surface-1 flex h-full w-[232px] shrink-0 flex-col overflow-hidden border-r">
      <h3 className="text-tiny text-ink-muted px-4 pt-4 pb-2 font-semibold tracking-wider uppercase">
        Saved
      </h3>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {profiles.length === 0 ? (
          <p className="text-tiny text-ink-faint px-2 py-3">
            Nothing saved yet. Fill in a connection and press Save.
          </p>
        ) : (
          profiles.map((saved) => {
            const isOpen = openNames.has(saved.profile.name);
            const isSelected = saved.id === selectedId;

            return (
              <div
                key={saved.id}
                className={cn(
                  // Full-bleed with a 2px left edge, matching every other list
                  // in the app. A row is a row wherever it appears.
                  "group relative border-l-2",
                  isSelected
                    ? "border-l-accent bg-accent-subtle"
                    : "hover:bg-surface-2 border-l-transparent",
                  transitionFast,
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(saved)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn("w-full px-4 py-2 text-left", focusRing)}
                >
                  <span className="flex items-center gap-2">
                    <StatusDot status={isOpen ? "live" : "idle"} />
                    <span className="text-small text-ink min-w-0 flex-1 truncate font-medium">
                      {saved.profile.name}
                    </span>
                  </span>
                  <span className="text-tiny text-ink-faint mt-0.5 flex items-center gap-1.5 pl-3.5">
                    <span className="numeric">{saved.profile.transport}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {saved.lastUsedAtMs === null
                        ? "never used"
                        : relativeTime(saved.lastUsedAtMs)}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onDelete(saved.id)}
                  aria-label={`Delete ${saved.profile.name}`}
                  className={cn(
                    "text-ink-faint hover:text-danger absolute top-2 right-3",
                    // Hidden until hover so the list stays quiet, but always
                    // reachable by keyboard.
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    transitionFast,
                  )}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onNew}
        className={cn(
          "border-line text-small text-ink-muted hover:text-ink hover:bg-surface-2",
          "flex items-center gap-2 border-t px-4 py-3 font-medium",
          transitionFast,
        )}
      >
        <Plus size={13} />
        New connection
      </button>
    </aside>
  );
}
