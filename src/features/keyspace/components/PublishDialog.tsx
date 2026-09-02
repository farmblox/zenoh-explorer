import { Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Badge,
  Button,
  CodeEditor,
  ComboBox,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Switch,
} from "@/components/ui";
import { data, keyspace, toIpcError, type KeyExprAnalysis, type SessionId } from "@/ipc";
import { bytes } from "@/lib/format";
import { toast, useUiStore } from "@/stores";

/**
 * What the sample will be.
 *
 * Zenoh has no separate delete operation: a delete is a sample like any other,
 * carrying `SampleKind::Delete` instead of a value. So this is one composer with
 * the kind chosen first, rather than two dialogs — and the words are the ones
 * the sample table already uses, because what is sent here is what arrives
 * there.
 */
const KINDS = [
  { value: "put", label: "Publish a value" },
  { value: "delete", label: "Delete the key" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

/** The encodings Zenoh's documentation names. */
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
 * Composing one sample for one key.
 *
 * The only modal act in the key space. Everything else this app does is a
 * question; this is the one that changes the network being inspected, and on
 * the deployments this tool gets pointed at that can mean a robot. So it
 * interrupts, and it names the network it is about to change.
 *
 * The arming switch sits in the footer beside the button it gates rather than
 * in a banner across the top. It is a precondition of one action, not a warning
 * about the screen — and a banner that stays loud after it has been read is a
 * banner that stops being read.
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

  const [kind, setKind] = useState<Kind>("put");
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
      setKind("put");
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
  // `fleet/**` names every key beneath it — so the moment before the verdict
  // arrives has to be a moment where the button does not work.
  const ready = trimmed !== "" && analysis !== null && !invalid && !wildcard;
  const blocked = !armed || !ready || sending;

  const send = () => {
    setSending(true);

    const write =
      kind === "put"
        ? data.put(sessionId, target, new TextEncoder().encode(payload), encoding)
        : data.del(sessionId, target);

    void write
      .then(() => {
        toast.success(kind === "put" ? "Published" : "Deleted", `${target} on ${sessionName}`);
        onClose();
      })
      .catch((thrown: unknown) => {
        setSending(false);
        toast.error({ title: "The write failed", body: toIpcError(thrown).message });
      });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change a key"
      className="!w-[560px] max-w-[92vw]"
      footer={
        <>
          {/* The guard, beside the button it guards. */}
          <Switch
            checked={armed}
            onChange={(next) => armWrites(sessionId, next)}
            label={`Allow writes to ${sessionName}`}
          />
          <span className="text-tiny text-ink-muted min-w-0 truncate">
            {armed ? (
              <>
                Writing to <span className="text-ink font-medium">{sessionName}</span>
              </>
            ) : (
              <>
                <span className="text-ink font-medium">{sessionName}</span> is read-only
              </>
            )}
          </span>
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={kind === "put" ? "primary" : "danger"}
            icon={kind === "put" ? <Send size={13} /> : <Trash2 size={13} />}
            disabled={blocked}
            onClick={send}
          >
            {kind === "put" ? "Publish" : "Delete"}
          </Button>
        </>
      }
    >
      {/* A fixed frame, for the reason Settings gives for its own: a put
          carries a value editor and a delete carries a sentence, and sizing to
          content made the dialog jump every time the kind changed — which
          reads as the window flinching. */}
      <div className="scroll-thin h-[380px] space-y-5 overflow-y-auto p-5">
        <SegmentedControl segments={KINDS} value={kind} onChange={setKind} label="What to send" />

        <Field
          label="Key"
          {...(invalid && analysis?.error
            ? { error: analysis.error }
            : wildcard
              ? { error: "A wildcard names more than one key. This needs exactly one." }
              : analysis?.isCanonical === false && analysis.canonical
                ? { hint: `sent as ${analysis.canonical}` }
                : {})}
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

        {kind === "put" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-small text-ink font-medium">Value</span>
              {/* Only once there is something to measure. A byte count of an
                  empty field is a number that says nothing. */}
              {size > 0 ? (
                <span className="numeric text-tiny text-ink-faint">{bytes(size)}</span>
              ) : null}
              <span className="flex-1" />
              <ComboBox
                label="Encoding"
                value={encoding}
                options={ENCODINGS}
                onChange={setEncoding}
                mono
              />
            </div>
            <div className="rounded-control border-line bg-surface-2 focus-within:border-accent h-44 overflow-hidden border">
              <CodeEditor
                label="Value to publish"
                value={payload}
                onChange={setPayload}
                placeholder={'{"mode":"idle"}'}
              />
            </div>
          </div>
        ) : (
          // Said once, because it is not obvious: a delete is not a local
          // erasure, it is a sample every subscriber receives.
          <p className="text-small text-ink-muted rounded-control bg-surface-1 border-line border p-4 leading-relaxed">
            Sends a <Badge tone="danger">delete</Badge> sample on this key. Subscribers receive it
            the way they receive a value, and any storage covering the key drops what it held.
          </p>
        )}
      </div>
    </Dialog>
  );
}
