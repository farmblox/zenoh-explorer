import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Zid } from "@/components/domain";
import {
  Badge,
  CodeEditor,
  EmptyState,
  Input,
  ListRow,
  ResizablePanel,
  ScrollArea,
  Spinner,
  Toolbar,
  ToolbarDivider,
} from "@/components/ui";
import { useAsync } from "@/hooks";
import { data as dataIpc, type SampleRecord } from "@/ipc";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { useActiveSessionId, useLiveEpoch, useTopology } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";
import { readHighlights } from "./lib/highlights";

/** Every node's effective configuration, as published in its own admin space. */
const CONFIG_SELECTOR = "@/*/*/config";

/** Generous: a config document is large and every node answers separately. */
const TIMEOUT_MS = 6_000;

/** Colour per token. Keys carry the structure, so they are the brightest. */
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
  const snapshot = useTopology(sessionId).snapshot;

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

  /**
   * The node's own name, when the topology knows it.
   *
   * `null` rather than a hex prefix when it does not: the caller shows the zid
   * itself in that case, and a truncated zid standing in for a name means the
   * same string appears twice on one line.
   */
  const nameOf = (zid: string): string | null => {
    const node = snapshot?.nodes.find((candidate) => candidate.zid === zid);
    return node?.name ?? null;
  };

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

  const highlights = useMemo(() => (document ? readHighlights(document) : null), [document]);

  // Counted rather than filtered. Hiding the lines that do not match takes the
  // nesting with them, and in a config the nesting is what says which section a
  // setting is in — `enabled: true` on its own means nothing.
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return 0;
    return document.split("\n").filter((line) => line.toLowerCase().includes(needle)).length;
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
      <ViewHeader title="Configuration" />

      <Toolbar>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find in this config"
          mono
          spellCheck={false}
          autoComplete="off"
          disabled={active === null}
          containerClassName="max-w-[320px] flex-1"
        />
        {filter.trim() && active ? (
          <span className="numeric text-tiny text-ink-faint">
            {groupedNumber(matches)} {matches === 1 ? "line matches" : "lines match"}
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="numeric text-tiny text-ink-faint">
          {groupedNumber(replies.length)} answered
        </span>
        <ToolbarDivider />
        <span className="numeric text-tiny text-ink-faint">{CONFIG_SELECTOR}</span>
      </Toolbar>

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      {active === null ? (
        // One message, across the whole area. There used to be a node list
        // holding a paragraph of explanation next to an empty state saying the
        // same thing — two answers to one question, neither of them the view.
        <EmptyState
          icon={loading ? <Spinner /> : <SlidersHorizontal />}
          title={loading ? "Asking every node" : "No node published its configuration"}
          description={
            loading
              ? `Running ${CONFIG_SELECTOR} across the network.`
              : "Zenoh publishes a node's configuration only when adminspace.enabled is on and adminspace.permissions.read allows it. Both are off by default, so a network of untouched nodes answers nothing here."
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ResizablePanel
            id="config-nodes"
            side="left"
            defaultWidth={248}
            minWidth={190}
            maxWidth={420}
            label="Resize the node list"
            className="border-line bg-surface-0 border-r"
          >
            <ScrollArea className="flex-1 p-2">
              {replies.map((reply) => (
                <ListRow
                  key={reply.zid}
                  size="comfortable"
                  selected={active.zid === reply.zid}
                  onClick={() => setSelected(reply.zid)}
                  icon={
                    <Badge tone={reply.whatami === "router" ? "accent" : "neutral"}>
                      {reply.whatami}
                    </Badge>
                  }
                >
                  {nameOf(reply.zid) ?? <Zid zid={reply.zid} />}
                </ListRow>
              ))}
            </ScrollArea>
          </ResizablePanel>

          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="border-line rounded-panel bg-surface-1 flex min-h-0 flex-1 flex-col overflow-hidden border">
              <header className="border-line-soft flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
                <span className="numeric text-small text-ink">
                  {nameOf(active.zid) ?? active.whatami} · config
                </span>
                <Zid zid={active.zid} copyable />
                <span className="flex-1" />
                {highlights ? <Permissions highlights={highlights} /> : null}
              </header>

              <CodeEditor
                label={`Configuration of ${nameOf(active.zid) ?? active.zid}`}
                value={document}
                highlight={filter.trim()}
                className="min-w-0 flex-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Whether this node answers for itself, and whether it can be rewritten.
 *
 * On the document's header rather than in a panel of its own: it is two facts,
 * and it is the reason the document is on screen at all. `write: true` is drawn
 * as a warning because a node that accepts configuration over the network is a
 * node anyone on that network can reconfigure.
 */
function Permissions({
  highlights,
}: {
  highlights: NonNullable<ReturnType<typeof readHighlights>>;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {highlights.mode ? (
        <span className="numeric text-tiny text-ink-faint">{highlights.mode}</span>
      ) : null}
      <Flag label="read" value={highlights.adminRead} />
      <Flag
        label="write"
        value={highlights.adminWrite}
        warnWhen
        title={
          highlights.adminWrite === true
            ? "This node accepts configuration changes over the network"
            : undefined
        }
      />
    </span>
  );
}

function Flag({
  label,
  value,
  warnWhen,
  title,
}: {
  label: string;
  value: boolean | null;
  warnWhen?: boolean;
  title?: string | undefined;
}) {
  if (value === null) return null;

  return (
    <span
      title={title}
      className={cn(
        "rounded-inner numeric text-tiny px-1.5 py-0.5",
        value
          ? warnWhen
            ? "bg-warn-subtle text-warn"
            : "bg-ok-subtle text-ok"
          : "bg-surface-2 text-ink-faint",
      )}
    >
      {label} {value ? "on" : "off"}
    </span>
  );
}
