import { useCallback, useMemo, useState } from "react";
import { Binary, FlaskConical, Radio, Trash2 } from "lucide-react";

import { KeyExpr } from "@/components/domain";
import { KeyInsight } from "./components/KeyInsight";
import { useKeyInsight } from "./hooks/useKeyInsight";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Panel,
  ResizablePanel,
  ScrollArea,
  Spinner,
  StatCell,
  StatGrid,
  Toolbar,
} from "@/components/ui";
import type { KeyNode, SampleRecord, SessionId } from "@/ipc";
import { compactNumber, groupedNumber } from "@/lib/format";
import { useReveal } from "@/navigation/useReveal";
import { useActiveSessionId, useTap, useTapStore } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";
import { KeyTree } from "./components/KeyTree";
import { MatchTester } from "./components/MatchTester";
import { SampleTable } from "./components/SampleTable";
import { useKeyTree } from "./hooks/useKeyTree";

/** Where a new subscription starts, before you have picked a key. */
const DEFAULT_KEY_EXPR = "**";

/**
 * The keyspace.
 *
 * Browsing and subscribing are the same activity, so they are the same screen:
 * the tree on the left is what the network declares, and clicking a key aims
 * the subscription at it. Splitting these apart would mean finding a key here,
 * remembering it, switching views and typing it again.
 *
 * The tree is built from DECLARATIONS — every subscriber and queryable any node
 * advertises — rather than only from traffic that happened to arrive, so it is
 * populated the moment you connect rather than only once something publishes.
 */
export function KeyspaceView() {
  const sessionId = useActiveSessionId();

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Binary />}
        title="No session"
        description="Connect to a Zenoh network to browse its keyspace."
      />
    );
  }

  return <Keyspace sessionId={sessionId} />;
}

/** Split out so the tree hook only runs once there is a session to read. */
function Keyspace({ sessionId }: { sessionId: SessionId }) {
  const tree = useKeyTree(sessionId);
  const tap = useTap(sessionId);
  const { start, stop, setPaused, clear } = useTapStore();

  const [selected, setSelected] = useState<string | null>(null);
  const [keyExpr, setKeyExpr] = useState(DEFAULT_KEY_EXPR);
  const [sample, setSample] = useState<SampleRecord | null>(null);
  const [testerOpen, setTesterOpen] = useState(false);

  // Durability and access control for whatever is selected.
  const insight = useKeyInsight(sessionId, selected);

  // Picking a key in the tree aims the subscription at it. It does not start
  // one: subscribing is a deliberate act, and clicking through a tree should
  // not silently open sockets behind you.
  const selectKey = useCallback((node: KeyNode) => {
    setSelected(node.key);
    // A branch aimed at literally would subscribe to nothing: `fleet/agv`
    // matches the key `fleet/agv` and not one thing published beneath it, so
    // clicking a subtree with 148 keys under it and pressing Subscribe would
    // sit there receiving silence. `**` matches zero or more chunks, so the
    // wildcard form covers the branch key itself as well.
    setKeyExpr(node.childCount > 0 ? `${node.key}/**` : node.key);
  }, []);

  // The palette can name a key at any depth, so the tree has to be opened down
  // to it before there is a row to select. Destructured rather than reached
  // through `tree`, whose identity changes every render.
  const { expandTo } = tree;
  const revealKey = useCallback(
    (key: string) => {
      expandTo(key);
      setSelected(key);
      // The palette carries a key, not a tree node, so whether this one has
      // children is not known here. `**` is the safe aim: it matches the key
      // itself too, so a leaf is not made unreachable by it.
      setKeyExpr(`${key}/**`);
    },
    [expandTo],
  );
  useReveal("keyspace", revealKey);

  const subscribe = useCallback(() => {
    if (tap.streaming) void stop(sessionId);
    else void start(sessionId, { keyExpr, buffer: 4096, flushMs: 80 });
  }, [tap.streaming, stop, start, sessionId, keyExpr]);

  // Declaration counts for the selected key, read off the level that holds it
  // rather than refetched: the tree already knows.
  const selectedNode = useMemo(() => {
    if (!selected) return null;
    const parent = selected.includes("/") ? selected.slice(0, selected.lastIndexOf("/")) : "";
    const level = tree.levels[parent];
    if (level?.status !== "ready") return null;
    return level.nodes.find((node) => node.key === selected) ?? null;
  }, [selected, tree.levels]);

  const listeners = (selectedNode?.subscribers ?? 0) + (selectedNode?.queryables ?? 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Keyspace"
        subtitle={
          tap.streaming
            ? `${groupedNumber(tap.total)} samples · ${compactNumber(tap.samples.length)} in view`
            : `${groupedNumber(tree.totalKeys)} keys declared or observed`
        }
        actions={
          <>
            {tap.dropped > 0 ? (
              <Badge tone="warn" title="Samples the backend discarded because its ring filled">
                {compactNumber(tap.dropped)} dropped
              </Badge>
            ) : null}
            <Button
              variant={testerOpen ? "primary" : "secondary"}
              icon={<FlaskConical size={13} />}
              onClick={() => setTesterOpen((open) => !open)}
            >
              Test matching
            </Button>
          </>
        }
      />

      <Toolbar>
        <Input
          value={keyExpr}
          onChange={(event) => setKeyExpr(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !tap.streaming) subscribe();
          }}
          prefix="key expr"
          mono
          spellCheck={false}
          autoComplete="off"
          disabled={tap.streaming}
          containerClassName="flex-1"
          placeholder="fleet/**/telemetry/*"
        />
        <Button
          variant={tap.streaming ? "danger" : "primary"}
          icon={<Radio size={13} />}
          onClick={subscribe}
        >
          {tap.streaming ? "Stop" : "Subscribe"}
        </Button>
        {tap.streaming ? (
          <Button onClick={() => setPaused(sessionId, !tap.paused)}>
            {tap.paused ? "Resume" : "Pause"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          icon={<Trash2 size={13} />}
          onClick={() => clear(sessionId)}
          aria-label="Clear samples"
          disabled={tap.samples.length === 0}
        />
      </Toolbar>

      {tap.error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{tap.error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <ResizablePanel
          id="keyspace-tree"
          side="left"
          defaultWidth={328}
          minWidth={240}
          maxWidth={560}
          label="Resize the key tree"
          className="border-line border-r"
        >
          <ScrollArea className="flex-1">
            <KeyTree tree={tree} selected={selected} onSelect={selectKey} />
          </ScrollArea>
        </ResizablePanel>

        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <div className="border-line-soft shrink-0 border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <KeyExpr value={selected} className="text-base" />
                <Badge tone={listeners > 0 ? "accent" : "neutral"}>
                  {listeners > 0 ? `${listeners} listening` : "nobody listening"}
                </Badge>
                <span className="flex-1" />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Radio size={12} />}
                  onClick={subscribe}
                  disabled={tap.streaming}
                >
                  Subscribe to this key
                </Button>
              </div>

              {testerOpen ? (
                <div className="mt-4">
                  <MatchTester initialExpr={selected} candidates={[selected]} />
                </div>
              ) : null}

              <KeyInsight insight={insight} />

              {/* One tile per kind Zenoh declares. Subscribers and queryables
                  alone answered "is anyone listening"; publishers, queriers and
                  liveliness tokens are what answer "who is on the other end". */}
              <Panel title="Declared at or below this key" flush className="mt-4">
                <StatGrid columns={5}>
                  <StatCell
                    label="Subscribers"
                    value={groupedNumber(selectedNode?.subscribers ?? 0)}
                    tone={selectedNode?.subscribers ? "accent" : "ink"}
                    size="sm"
                  />
                  <StatCell
                    label="Publishers"
                    value={groupedNumber(selectedNode?.publishers ?? 0)}
                    tone={selectedNode?.publishers ? "accent" : "ink"}
                    size="sm"
                  />
                  <StatCell
                    label="Queryables"
                    value={groupedNumber(selectedNode?.queryables ?? 0)}
                    tone={selectedNode?.queryables ? "accent" : "ink"}
                    size="sm"
                  />
                  <StatCell
                    label="Queriers"
                    value={groupedNumber(selectedNode?.queriers ?? 0)}
                    tone={selectedNode?.queriers ? "accent" : "ink"}
                    size="sm"
                  />
                  <StatCell
                    label="Live tokens"
                    value={groupedNumber(selectedNode?.tokens ?? 0)}
                    tone={selectedNode?.tokens ? "ok" : "ink"}
                    size="sm"
                  />
                </StatGrid>
              </Panel>

              <Panel title="Observed at or below this key" flush className="mt-4">
                <StatGrid columns={2}>
                  <StatCell
                    label="Keys with data"
                    value={groupedNumber(selectedNode?.descendantKeys ?? 0)}
                    size="sm"
                  />
                  <StatCell
                    label="Samples seen"
                    value={groupedNumber(selectedNode?.sampleCount ?? 0)}
                    size="sm"
                  />
                </StatGrid>
              </Panel>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1">
            {tap.samples.length === 0 ? (
              <EmptyState
                icon={tap.streaming ? <Spinner /> : <Radio />}
                title={tap.streaming ? "Subscribed, nothing yet" : "Not subscribed"}
                description={
                  tap.streaming
                    ? `Listening on ${keyExpr}. Nothing has been published on it since you subscribed.`
                    : selected
                      ? "Press Subscribe to watch data arrive on this key."
                      : "Pick a key on the left, or type an expression above, then subscribe."
                }
              />
            ) : (
              <SampleTable
                samples={tap.samples}
                selected={sample?.seq ?? null}
                // Clicking the open row closes it: the detail is a disclosure
                // on the row, so the row is also how you put it away.
                onSelect={(row) => setSample((open) => (open?.seq === row.seq ? null : row))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
