import { useCallback, useEffect, useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { profiles as profilesIpc, toIpcError } from "@/ipc";
import type { ConnectionProfile, SavedProfile } from "@/ipc";
import { toast, useSessionStore, useUiStore } from "@/stores";
import { ConnectForm } from "./ConnectForm";
import { BLANK_PROFILE } from "./defaults";
import { SavedConnections } from "./SavedConnections";

/**
 * The connect dialog: saved connections on the left, the form on the right.
 *
 * This component owns everything that outlives a single edit — the saved list,
 * which profile is loaded, the draft handed over by a failed connection. The
 * form owns the field values and is REMOUNTED by `key` whenever a different
 * profile is loaded, so nothing has to sync a dozen pieces of state.
 */
export function ConnectDialog() {
  const open = useUiStore((state) => state.overlay === "connect");
  const close = useUiStore((state) => state.closeOverlay);

  const connect = useSessionStore((state) => state.connect);
  const sessions = useSessionStore((state) => state.sessions);
  const draft = useSessionStore((state) => state.draft);
  const draftReplaces = useSessionStore((state) => state.draftReplaces);
  const disconnect = useSessionStore((state) => state.disconnect);
  const clearDraft = useSessionStore((state) => state.clearDraft);

  const [saved, setSaved] = useState<SavedProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** What the form is currently showing, kept for the footer's actions. */
  const [profile, setProfile] = useState<ConnectionProfile>(BLANK_PROFILE);

  /**
   * The form's `key`. Incrementing it remounts the form with new initial
   * values — see `ConnectForm` for why that beats syncing state in an effect.
   */
  const [formKey, setFormKey] = useState(0);
  const [initial, setInitial] = useState<ConnectionProfile>(BLANK_PROFILE);

  const load = useCallback((next: ConnectionProfile, id: string | null) => {
    setInitial(next);
    setProfile(next);
    setSelectedId(id);
    setFormKey((key) => key + 1);
  }, []);

  const reload = useCallback(() => {
    profilesIpc.listProfiles().then(setSaved, (thrown: unknown) => {
      toast.warning("Could not read saved connections", toIpcError(thrown).message);
    });
  }, []);

  // Refresh when the dialog opens, so a profile saved elsewhere shows up.
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // A failed connection hands its profile over for correction, so a wrong
  // character in a certificate path does not cost you the whole form.
  //
  // Derived rather than synced: a draft simply becomes the form's initial
  // values and changes its key, which remounts it. Nothing is copied into
  // state, so there is no effect and no window where the form is half-applied.
  const showingDraft = open && draft !== null;
  const formInitial = showingDraft ? draft : initial;
  const activeKey = showingDraft ? "draft" : formKey;

  const dismiss = () => {
    clearDraft();
    close();
  };

  const submit = () => {
    // Captured before `dismiss`, which clears the draft it belongs to.
    const replacing = draftReplaces;

    dismiss();
    void connect(profile).then((id) => {
      // Only a connection that actually opened counts as "used" — a broken
      // profile must not sort itself to the top of the list.
      if (id && selectedId) void profilesIpc.recordConnection(selectedId);

      // Editing a session means replacing it, because Zenoh reads most of a
      // configuration once at startup. Closed only once the replacement is up:
      // an edit that cannot connect should cost you nothing.
      if (id && replacing) void disconnect(replacing);
    });
  };

  const save = () => {
    profilesIpc.saveProfile(profile, selectedId ?? undefined).then(
      (id) => {
        setSelectedId(id);
        reload();
        toast.success("Connection saved", profile.name);
      },
      (thrown: unknown) => {
        toast.error({ title: "Could not save", body: toIpcError(thrown).message });
      },
    );
  };

  const remove = (id: string) => {
    profilesIpc.deleteProfile(id).then(
      () => {
        if (id === selectedId) load(BLANK_PROFILE, null);
        reload();
      },
      (thrown: unknown) => {
        toast.error({ title: "Could not delete", body: toIpcError(thrown).message });
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title="Connect to a network"
      className="w-[min(880px,94vw)]"
      footer={
        <>
          <span className="flex-1" />
          <Button onClick={save}>{selectedId ? "Update" : "Save"}</Button>
          <Button variant="primary" onClick={submit}>
            Connect
          </Button>
        </>
      }
    >
      {/* A fixed height, not a minimum. Expanding a disclosure must not resize
          the window — the columns scroll inside instead, so the saved list and
          the footer stay exactly where they were. */}
      {/* A fixed height, so opening Advanced does not resize the window under
          the cursor — but sized for the form as it usually stands rather than
          for its longest possible state, which left most of the panel empty.
          The columns scroll independently when the content outgrows it. */}
      <div className="flex h-[min(468px,78vh)] overflow-hidden">
        <SavedConnections
          profiles={saved}
          selectedId={selectedId}
          openSessions={sessions}
          onSelect={(entry) => load(entry.profile, entry.id)}
          onDelete={remove}
          onNew={() => load(BLANK_PROFILE, null)}
        />
        <ConnectForm
          key={activeKey}
          initial={formInitial}
          onChange={setProfile}
          onSubmit={submit}
        />
      </div>
    </Dialog>
  );
}
