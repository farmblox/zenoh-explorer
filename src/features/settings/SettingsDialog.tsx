import { useState } from "react";
import { ScrollText, Trash2 } from "lucide-react";

import {
  Button,
  Dialog,
  EmptyState,
  Kbd,
  SectionLabel,
  SegmentedControl,
  StatusDot,
} from "@/components/ui";
import { SHORTCUT_GROUPS, SHORTCUTS } from "@/app/shortcuts";
import { useAsync } from "@/hooks";
import { openDistributionLicenses, profiles as profilesIpc } from "@/ipc";
import { cn } from "@/lib/cn";
import { ageSince, groupedNumber } from "@/lib/format";
import { focusRing, transitionFast } from "@/lib/states";
import { useSessionStore, useUiStore, type ThemePreference } from "@/stores";

/** The panes, in the order they are read. */
const PANES = ["Appearance", "Connections", "Shortcuts", "About"] as const;
type Pane = (typeof PANES)[number];

const THEMES = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

/**
 * Everything that persists between sessions.
 *
 * Four panes, and each one controls something that exists. The mockup has a
 * "Data & polling" pane and this does not: nothing in this app polls. Topology,
 * declarations and samples are pushed, and the one thing that cannot be —
 * the admin space, which is a queryable — is re-read when a live signal says
 * the network moved. An interval control here would be a dial wired to nothing.
 */
export function SettingsDialog() {
  const open = useUiStore((state) => state.overlay === "settings");
  const closeOverlay = useUiStore((state) => state.closeOverlay);
  const requested = useUiStore((state) => state.settingsPane);
  const [pane, setPane] = useState<Pane>("Appearance");

  // Help ▸ Keyboard Shortcuts should land on Shortcuts, not on Appearance with
  // one more click to go. The dialog stays mounted, so the pane is adjusted as
  // it opens rather than initialised once.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      const target = PANES.find((entry) => entry === requested);
      setPane(target ?? "Appearance");
    }
  }

  return (
    // A fixed frame. The panes hold very different amounts — four lines of
    // Appearance against nine shortcuts — and sizing to content made the dialog
    // jump every time you changed pane, which reads as the window flinching.
    // The frame stays put and the pane scrolls inside it.
    <Dialog open={open} onClose={closeOverlay} title="Settings" className="!w-[660px] max-w-[92vw]">
      <div className="flex h-[440px]">
        <nav aria-label="Settings sections" className="border-line w-[150px] shrink-0 border-r p-2">
          {PANES.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setPane(entry)}
              aria-current={pane === entry ? "page" : undefined}
              className={cn(
                "rounded-control text-small flex h-8 w-full items-center px-2.5 text-left",
                focusRing,
                transitionFast,
                pane === entry
                  ? "bg-selected text-ink"
                  : "text-ink-muted hover:bg-overlay-hover hover:text-ink",
              )}
            >
              {entry}
            </button>
          ))}
        </nav>

        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-5">
          {pane === "Appearance" ? <Appearance /> : null}
          {pane === "Connections" ? <Connections /> : null}
          {pane === "Shortcuts" ? <Shortcuts /> : null}
          {pane === "About" ? <About /> : null}
        </div>
      </div>
    </Dialog>
  );
}

function Appearance() {
  const theme = useUiStore((state) => state.themePreference);
  const setTheme = useUiStore((state) => state.setThemePreference);

  return (
    <section>
      <SectionLabel className="mb-2.5">Theme</SectionLabel>
      <SegmentedControl label="Theme" segments={THEMES} value={theme} onChange={setTheme} />
      <p className="text-tiny text-ink-faint mt-2.5 leading-relaxed">
        System follows the desktop and changes with it.
      </p>

      <SectionLabel className="mt-7 mb-2.5">Motion</SectionLabel>
      <p className="text-tiny text-ink-faint leading-relaxed">
        The app follows your system&rsquo;s reduced-motion setting. Turn it on there and every
        transition and animation here stops, including the traffic on the graph.
      </p>
    </section>
  );
}

/**
 * Saved connections.
 *
 * A list of places you go, so it is ordered by when you last went there — the
 * one you want is nearly always the one you used last, and a never-used profile
 * sinks to the bottom where it belongs. Nothing else about the order would tell
 * you anything: alphabetical by a name you chose is just the alphabet.
 *
 * The primary action DIALS. It used to open the connect form with the fields
 * filled in, which is a strange thing to do with a connection you already
 * saved — you saved it so you would not have to look at the form again. Editing
 * is still there, second, for when the form is what you actually wanted.
 *
 * Deleting asks first, in the row. A modal over a modal to confirm one line is
 * heavier than the thing it is protecting, and an irreversible button sitting
 * next to the one you press all the time is a trap.
 */
function Connections() {
  const sessions = useSessionStore((state) => state.sessions);
  const connect = useSessionStore((state) => state.connect);
  const setActive = useSessionStore((state) => state.setActive);
  const editProfile = useSessionStore((state) => state.editProfile);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const closeOverlay = useUiStore((state) => state.closeOverlay);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<readonly string[]>([]);

  const { data, loading, reload } = useAsync(() => profilesIpc.listProfiles(), "settings:profiles");

  const saved = (data ?? [])
    .filter((entry) => !deleted.includes(entry.id))
    // Most recently used first; never used last.
    .sort((a, b) => (b.lastUsedAtMs ?? -1) - (a.lastUsedAtMs ?? -1));

  /**
   * The open session for a profile, if it is already connected.
   *
   * Matched on name and address, which is what identifies a connection to the
   * person who saved it. A session does not carry the id of the profile it came
   * from, so this is a best effort — it can only ever be wrong by treating two
   * identically-named profiles on one address as the same thing, which they are.
   */
  const openSession = (name: string, address: string) =>
    sessions.find(
      (session) => session.profile.name === name && session.profile.address === address,
    ) ?? null;

  if (loading) {
    return <p className="text-tiny text-ink-faint">Reading saved connections…</p>;
  }

  if (saved.length === 0) {
    return (
      <EmptyState
        title="No saved connections"
        description="Tick “Save this connection” when you connect, and it will be waiting here next time."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              closeOverlay();
              openOverlay("connect");
            }}
          >
            Connect to a network
          </Button>
        }
      />
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2.5">
        <SectionLabel>Saved connections</SectionLabel>
        <span className="numeric text-tiny text-ink-faint">{groupedNumber(saved.length)}</span>
      </div>

      <ul className="divide-line-soft divide-y">
        {saved.map((entry) => {
          const session = openSession(entry.profile.name, entry.profile.address);

          return (
            <li key={entry.id} className="group/row flex min-w-0 items-center gap-3 py-3">
              <StatusDot status={session ? "live" : "idle"} />

              {/* Everything ABOUT the connection on one line under its name,
                  so the right-hand side is nothing but actions. Splitting the
                  age into its own column made it compete with the address for
                  width, and the address is the part you cannot guess. */}
              <div className="min-w-0 flex-1">
                <p className="text-small text-ink truncate">{entry.profile.name}</p>
                <p className="text-tiny text-ink-faint mt-0.5 truncate">
                  <span className="numeric">
                    {entry.profile.transport}/{entry.profile.address}
                  </span>
                  <span className="text-ink-disabled"> · {entry.profile.mode} · </span>
                  {session
                    ? "connected"
                    : entry.lastUsedAtMs === null
                      ? "never used"
                      : `${ageSince(entry.lastUsedAtMs)} ago`}
                </p>
              </div>

              {confirming === entry.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-tiny text-ink-muted">Delete it?</span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      // Hidden at once and reconciled after. Waiting on a round
                      // trip to remove a row you just deleted makes the click
                      // feel like it missed.
                      setConfirming(null);
                      setDeleted((current) => [...current, entry.id]);
                      void profilesIpc.deleteProfile(entry.id).then(reload);
                    }}
                  >
                    Delete
                  </Button>
                </span>
              ) : (
                <>
                  {/* Held back until the row is under the pointer. Three
                      controls on every row makes a list of four connections
                      look like a control panel. */}
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1",
                      "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
                      "transition-opacity duration-(--duration-fast)",
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${entry.profile.name}`}
                      title={`Delete ${entry.profile.name}`}
                      onClick={() => setConfirming(entry.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Open this in the connect form"
                      onClick={() => {
                        closeOverlay();
                        editProfile(entry.profile);
                        openOverlay("connect");
                      }}
                    >
                      Edit
                    </Button>
                  </span>

                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      closeOverlay();
                      if (session) {
                        setActive(session.id);
                        return;
                      }
                      // Not awaited: the tab strip shows the attempt the moment
                      // it starts, and can cancel it. Holding the dialog open
                      // on a spinner would hide the one place that reports it.
                      void connect(entry.profile);
                    }}
                  >
                    {session ? "Go to tab" : "Connect"}
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The keyboard map, printed from the same array the app binds. */
function Shortcuts() {
  return (
    <div className="space-y-6">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group}>
          <SectionLabel className="mb-2">{group}</SectionLabel>
          <ul className="divide-line-soft divide-y">
            {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
              <li key={shortcut.id} className="flex items-center justify-between gap-4 py-2">
                <span className="text-small text-ink-muted">{shortcut.label}</span>
                <Kbd combo={shortcut.combo} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function About() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-ink text-base font-medium">Zenoh Explorer</p>
        <p className="text-tiny text-ink-faint mt-1 leading-relaxed">
          A window onto an Eclipse Zenoh network: what is on it, how it is wired, and what is
          flowing across it. Read-only by design — it observes and never reconfigures.
        </p>
      </div>

      <dl className="divide-line-soft divide-y">
        <Fact label="Licence" value="Apache 2.0" />
        <Fact label="Zenoh" value="1.10" />
        <Fact label="Source" value="github.com/farmblox/zenoh-explorer" />
      </dl>

      <Button
        variant="secondary"
        icon={<ScrollText size={13} />}
        onClick={() => void openDistributionLicenses()}
      >
        Open distribution licenses
      </Button>

      <p className="text-tiny text-ink-faint leading-relaxed">
        Eclipse Zenoh is a trademark of the Eclipse Foundation. This project is not affiliated with
        or endorsed by them.
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="numeric text-tiny text-ink-faint">{value}</dd>
    </div>
  );
}
