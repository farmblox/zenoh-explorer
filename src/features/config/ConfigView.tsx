import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Zid } from "@/components/domain";
import {
  Badge,
  EmptyState,
  Input,
  ListRow,
  ResizablePanel,
  ScrollArea,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { useAsync } from "@/hooks";
import { data as dataIpc, type SampleRecord } from "@/ipc";
import { bytes } from "@/lib/format";
import { useActiveSessionId, useLiveEpoch } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";

/** Every node's effective configuration, as published in its own admin space. */
const CONFIG_SELECTOR = "@/*/*/config";

/** Generous: a config document is large and every node answers separately. */
const TIMEOUT_MS = 6_000;

/** One node's reply, with its identity pulled out of the admin key. */
interface ConfigReply {
  readonly zid: string;
  readonly whatami: string;
  readonly sample: SampleRecord;
}

/** `@/<zid>/<whatami>/config` → the two parts that identify the replier. */
function identify(keyExpr: string): { zid: string; whatami: string } {
  const chunks = keyExpr.replace(/^@\//, "").split("/");
  return { zid: chunks[0] ?? keyExpr, whatami: chunks[1] ?? "node" };
}

/**
 * The configuration each node is actually running.
 *
 * Read from the admin space rather than from any file, because the file on disk
 * is what someone intended and this is what the process resolved — defaults
 * filled in, environment applied, plugins merged. When those two disagree, this
 * is the one that explains the behaviour you are looking at.
 *
 * Read-only. Zenoh accepts configuration writes on this key, but a diagnostic
 * tool that can silently reconfigure a production router is a different and
 * much more dangerous thing than one that reads it.
 */
export function ConfigView() {
  const sessionId = useActiveSessionId();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Configuration is the one thing Zenoh will not push: a node publishes it
  // when asked and never announces a change. Re-reading on the epoch is the
  // closest honest thing — a node that just joined gets read, and a node that
  // was quietly reconfigured does not, which is exactly what is true.
  const epoch = useLiveEpoch(sessionId);

  const {
    data: samples,
    loading,
    error,
  } = useAsync(
    () =>
      sessionId
        ? dataIpc.query(sessionId, CONFIG_SELECTOR, TIMEOUT_MS)
        : Promise.resolve<SampleRecord[]>([]),
    `${sessionId ?? "none"}:${epoch}`,
    { enabled: sessionId !== null },
  );

  const replies = useMemo<ConfigReply[]>(
    () =>
      (samples ?? [])
        .map((sample) => ({ ...identify(sample.keyExpr), sample }))
        .sort((a, b) => a.whatami.localeCompare(b.whatami) || a.zid.localeCompare(b.zid)),
    [samples],
  );

  const active = replies.find((reply) => reply.zid === selected) ?? replies[0] ?? null;

  // Pretty-printed if it parses, raw if it does not. A config that will not
  // parse is itself worth seeing rather than hiding behind an error.
  const document = useMemo(() => {
    if (!active) return "";
    try {
      return JSON.stringify(JSON.parse(active.sample.preview), null, 2);
    } catch {
      return active.sample.preview;
    }
  }, [active]);

  const lines = useMemo(() => {
    const all = document.split("\n");
    const needle = filter.trim().toLowerCase();
    if (!needle) return all.map((text, index) => ({ text, number: index + 1 }));
    return all
      .map((text, index) => ({ text, number: index + 1 }))
      .filter((line) => line.text.toLowerCase().includes(needle));
  }, [document, filter]);

  if (!sessionId) {
    return (
      <EmptyState
        icon={<SlidersHorizontal />}
        title="No session"
        description="Connect to a Zenoh network to read what its nodes are configured with."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Configuration"
        subtitle={
          active
            ? `${active.whatami} ${active.zid.slice(0, 8)} · ${bytes(active.sample.payloadLen)}`
            : "What each node resolved at startup"
        }
      />

      <Toolbar>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter lines"
          mono
          spellCheck={false}
          autoComplete="off"
          containerClassName="max-w-[320px] flex-1"
        />
        <span className="flex-1" />
        <span className="numeric text-tiny text-ink-faint">{CONFIG_SELECTOR}</span>
      </Toolbar>

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <ResizablePanel
          id="config-nodes"
          side="left"
          defaultWidth={264}
          minWidth={200}
          maxWidth={420}
          label="Resize the node list"
          className="border-line bg-surface-0 border-r"
        >
          <ScrollArea className="flex-1 p-2">
            {replies.length === 0 ? (
              <p className="text-tiny text-ink-faint px-2.5 py-2 leading-relaxed">
                No node answered. Zenoh only publishes its configuration when
                <span className="numeric text-ink-muted"> adminspace.enabled</span> is on and
                <span className="numeric text-ink-muted"> adminspace.permissions.read</span> allows
                it.
              </p>
            ) : (
              replies.map((reply) => (
                <ListRow
                  key={reply.zid}
                  size="comfortable"
                  selected={active?.zid === reply.zid}
                  onClick={() => setSelected(reply.zid)}
                  icon={
                    <Badge tone={reply.whatami === "router" ? "accent" : "neutral"}>
                      {reply.whatami}
                    </Badge>
                  }
                >
                  <Zid zid={reply.zid} />
                </ListRow>
              ))
            )}
          </ScrollArea>
        </ResizablePanel>

        {active ? (
          <ScrollArea className="min-w-0 flex-1">
            <pre className="numeric text-tiny p-5 leading-[1.85]">
              {lines.map((line) => (
                <div key={line.number} className="flex">
                  <span className="text-ink-faint w-12 shrink-0 pr-4 text-right select-none">
                    {line.number}
                  </span>
                  <span className="selectable text-ink-muted whitespace-pre-wrap">{line.text}</span>
                </div>
              ))}
              {lines.length === 0 ? (
                <span className="text-ink-faint">No line matches “{filter}”.</span>
              ) : null}
            </pre>
          </ScrollArea>
        ) : (
          <EmptyState
            icon={loading ? <Spinner /> : <SlidersHorizontal />}
            title={loading ? "Asking every node" : "Nothing to show"}
            description={
              loading
                ? `Running ${CONFIG_SELECTOR} across the network.`
                : "No node published its configuration."
            }
          />
        )}
      </div>
    </div>
  );
}
