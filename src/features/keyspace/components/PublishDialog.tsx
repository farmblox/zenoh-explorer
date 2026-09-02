import { AlertTriangle, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { KeyExpr } from "@/components/domain";
import { Button, CodeEditor, ComboBox, Dialog, Field, Input, Switch } from "@/components/ui";
import { data, keyspace, toIpcError, type KeyExprAnalysis, type SessionId } from "@/ipc";
import { cn } from "@/lib/cn";
import { bytes } from "@/lib/format";
import { toast, useUiStore } from "@/stores";

/**
 * The encodings Zenoh names, plus the one it assumes.
 *
 * Zenoh transports any bytes; an encoding is a note to whoever reads them
 * about how to decode. The list is short on purpose — these are the ones the
 * documentation names, and a free-text field would invite typos into a value
 * other applications parse.
 */
const ENCODINGS = [
  { value: "text/plain", label: "text/plain" },
  { value: "application/json", label: "application/json" },
  { value: "application/octet-stream", label: "application/octet-stream" },
  { value: "application/properties", label: "application/properties" },
  { value: "application/integer", label: "application/integer" },
  { value: "application/float", label: "application/float" },
] as const;

type Encoding = (typeof ENCODINGS)[number]["value"];

export interface PublishDialogProps {
  open: boolean;
  sessionId: SessionId;
  /** The network being changed, named as the user named it. */
  sessionName: string;
  /** The key to start on — whatever was selected when this was opened. */
  initialKey: string;
  onClose: () => void;
}

/**
 * Publishing to a key, or deleting one.
 *
 * A dialog rather than a panel, and the only modal act in the key space. Every
 * other thing this app does is a question; this is the one that changes the
 * network being inspected, and on the deployments this tool is pointed at that
 * can mean a robot. So it interrupts, it names the network it is about to
 * change, and it puts the key and the payload in front of you together.
 *
 * Writes are armed per session and default to off. The Tauri capability permits
 * them — it has to, or the command would fail at the boundary — so the guard
 * has to be here, where it can say which network it is guarding.
 */
export function PublishDialog({
  open,
  sessionId,
  sessionName,
  initialKey,
  onClose,
}: PublishDialogProps) {
  const armed = useUiStore((state) => state.writesArmed(sessionId));
  const armWrites = useUiStore((state) => state.armWrites);

  const [key, setKey] = useState(initialKey);
  const [payload, setPayload] = useState("");
  const [encoding, setEncoding] = useState<Encoding>("text/plain");
  const [analysed, setAnalysed] = useState<{ key: string; result: KeyExprAnalysis } | null>(null);
  const [sending, setSending] = useState(false);

  // Opening is when the key should follow the selection; typing in here after
  // that is a deliberate choice the selection must not overwrite.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setKey(initialKey);
      setPayload("");
      setSending(false);
    }
  }

  const trimmed = key.trim();

  // The verdict comes from `zenoh-keyexpr`, not from looking for asterisks: the
  // rules have corners, and a tool that writes to the wrong key because it
  // misread one is worse than no tool.
  useEffect(() => {
    if (!open || trimmed === "") return;

    let current = true;
    void keyspace
      .analyseKeyExpr(trimmed)
      .then((result) => {
        if (current) setAnalysed({ key: trimmed, result });
      })
      .catch(() => {
        // Leaving it unanalysed is what blocks the write, which is the outcome
        // a failed check should have.
      });

    return () => {
      current = false;
    };
  }, [open, trimmed]);

  // Only an answer about the key as it stands counts. An answer about the key
  // as it was two characters ago is what would let a wildcard through.
  const analysis = analysed?.key === trimmed ? analysed.result : null;

  const size = new TextEncoder().encode(payload).length;
  const wildcard = analysis?.hasWildcards === true;
  const invalid = analysis !== null && !analysis.valid;
  const target = analysis?.canonical ?? trimmed;

  // Unverified blocks too. A wildcard is refused rather than warned about —
  // `fleet/**` names every key beneath it, and a put that fans out across a
  // fleet is not something to confirm your way into — so the moment before the
  // verdict arrives has to be a moment where the button does not work.
  const blocked = trimmed === "" || analysis === null || invalid || wildcard;

  const finish = (verb: string) => {
    toast.success(verb, `${target} on ${sessionName}`);
    onClose();
  };

  const fail = (thrown: unknown) => {
    setSending(false);
    toast.error({ title: "The write failed", body: toIpcError(thrown).message });
  };

  const send = () => {
    setSending(true);
    void data
      .put(sessionId, target, new TextEncoder().encode(payload), encoding)
      .then(() => finish("Published"))
      .catch(fail);
  };

  const remove = () => {
    setSending(true);
    void data
      .del(sessionId, target)
      .then(() => finish("Deleted"))
      .catch(fail);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change a key"
      className="!w-[560px] max-w-[92vw]"
      footer={
        <>
          <Button
            variant="danger"
            icon={<Trash2 size={13} />}
            disabled={!armed || blocked || sending}
            onClick={remove}
          >
            Delete this key
          </Button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send size={13} />}
            disabled={!armed || blocked || sending}
            onClick={send}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        {/* Which network, before what to send. The same key means different
            things on a test rig and on a fleet, and only one of those is
            recoverable by shrugging. */}
        <div
          className={cn(
            "rounded-panel border-line flex items-start gap-3 border p-3",
            armed ? "bg-warn-subtle" : "bg-surface-1",
          )}
        >
          <AlertTriangle
            size={15}
            className={cn("mt-px shrink-0", armed ? "text-warn" : "text-ink-faint")}
          />
          <div className="min-w-0 flex-1">
            <p className="text-small text-ink font-medium">
              {armed ? `Writing to ${sessionName}` : `${sessionName} is read-only`}
            </p>
            <p className="text-tiny text-ink-muted mt-0.5">
              {armed
                ? "Anything subscribed to this key will receive what you send, immediately."
                : "Turn this on to publish or delete. It goes back off when the app restarts."}
            </p>
          </div>
          <Switch
            checked={armed}
            onChange={(next) => armWrites(sessionId, next)}
            label={`Allow writes to ${sessionName}`}
          />
        </div>

        <Field
          label="Key"
          {...(invalid && analysis?.error
            ? { error: analysis.error }
            : wildcard
              ? { error: "A wildcard names more than one key. Publishing needs exactly one." }
              : analysis?.isCanonical === false && analysis.canonical
                ? { hint: `sent as ${analysis.canonical}` }
                : { hint: "one key, no wildcards" })}
        >
          <Input
            data-autofocus
            value={key}
            onChange={(event) => setKey(event.target.value)}
            mono
            placeholder="fleet/agv/07/mode"
            invalid={invalid || wildcard}
          />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-end gap-3">
            <span className="text-tiny text-ink-muted font-medium">Value</span>
            <span className="flex-1" />
            <span className="numeric text-tiny text-ink-faint">{bytes(size)}</span>
            <ComboBox
              label="Encoding"
              value={encoding}
              options={ENCODINGS}
              onChange={setEncoding}
              mono
            />
          </div>
          <div className="rounded-control border-line bg-surface-2 focus-within:border-accent h-40 overflow-hidden border">
            <CodeEditor
              label="Value to publish"
              value={payload}
              onChange={setPayload}
              placeholder={'{"mode":"idle"}'}
            />
          </div>
          <p className="text-tiny text-ink-faint">
            Sent as bytes. The encoding is a note to whoever reads them, not a conversion.
          </p>
        </div>

        {/* Shown rather than described: the one line that says exactly what
            leaves this window. */}
        {!blocked ? (
          <p className="text-tiny text-ink-muted flex items-center gap-2">
            <span>Sending</span>
            <KeyExpr value={target} className="text-tiny" />
            <span className="numeric">{bytes(size)}</span>
            <span className="numeric">{encoding}</span>
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
