import { ChevronRight } from "lucide-react";

import { Spinner } from "@/components/ui";
import type { KeyNode } from "@/ipc";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";
import type { KeyTreeState } from "../hooks/useKeyTree";

export interface KeyTreeProps {
  tree: KeyTreeState;
  selected: string | null;
  onSelect: (key: string) => void;
}

/**
 * The key-space tree, expanded one level at a time.
 *
 * The backend never sends the whole tree — a real deployment has tens of
 * thousands of keys — so opening a node fetches exactly its children.
 *
 * The number on the right is how many nodes are LISTENING at or below that
 * chunk, not how many keys exist under it. On a diagnostic tool that is the
 * more useful of the two: an empty branch nobody subscribes to is noise, and a
 * branch forty nodes depend on is where an outage will hurt.
 */
export function KeyTree({ tree, selected, onSelect }: KeyTreeProps) {
  const renderLevel = (prefix: string, depth: number) => {
    const level = tree.levels[prefix];
    if (!level) return null;

    if (level.status === "loading") {
      return (
        <div
          className="text-tiny text-ink-faint flex items-center gap-2 py-1.5"
          style={{ paddingLeft: depth * 14 + 26 }}
        >
          <Spinner label="Loading keys" />
        </div>
      );
    }

    if (level.nodes.length === 0 && depth === 0) {
      return (
        <p className="text-tiny text-ink-faint px-3 py-2 leading-relaxed">
          Nothing declared and nothing observed. Either no node on this network has
          <span className="numeric text-ink-muted"> adminspace.enabled</span>, or none has declared
          a subscriber or queryable yet.
        </p>
      );
    }

    return level.nodes.map((node) => renderNode(node, depth));
  };

  const renderNode = (node: KeyNode, depth: number) => {
    const isOpen = tree.open.has(node.key);
    const expandable = node.childCount > 0;
    const listeners = node.subscribers + node.queryables;

    return (
      <div key={node.key}>
        <div
          role="treeitem"
          aria-expanded={expandable ? isOpen : undefined}
          aria-selected={selected === node.key}
          tabIndex={0}
          onClick={() => onSelect(node.key)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSelect(node.key);
            if (event.key === "ArrowRight" && expandable && !isOpen) tree.toggle(node.key);
            if (event.key === "ArrowLeft" && isOpen) tree.toggle(node.key);
          }}
          style={{ paddingLeft: depth * 14 + 8 }}
          className={cn(
            "rounded-inner flex h-8 cursor-pointer items-center gap-1.5 pr-2.5",
            "transition-colors duration-(--duration-fast)",
            selected === node.key ? "bg-accent-subtle" : "hover:bg-surface-2",
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              if (expandable) tree.toggle(node.key);
            }}
            aria-label={isOpen ? "Collapse" : "Expand"}
            className={cn(
              "text-ink-faint flex size-4 shrink-0 items-center justify-center",
              !expandable && "invisible",
            )}
          >
            <ChevronRight
              size={12}
              className={cn(
                "transition-transform duration-(--duration-fast)",
                isOpen && "rotate-90",
              )}
            />
          </button>

          <span
            className={cn(
              "numeric text-tiny min-w-0 flex-1 truncate",
              node.kind === "branch" ? "text-ink-muted" : "text-ink",
            )}
          >
            {node.segment}
          </span>

          {listeners > 0 ? (
            <span
              className="numeric text-tiny text-accent-strong shrink-0"
              title={`${node.subscribers} subscribers · ${node.queryables} queryables at or below here`}
            >
              {compactNumber(listeners)}
            </span>
          ) : node.descendantKeys > 0 ? (
            <span
              className="numeric text-tiny text-ink-faint shrink-0"
              title={`${node.descendantKeys} keys have carried data at or below here`}
            >
              {compactNumber(node.descendantKeys)}
            </span>
          ) : null}
        </div>

        {isOpen ? renderLevel(node.key, depth + 1) : null}
      </div>
    );
  };

  return (
    <div role="tree" aria-label="Key space" className="p-2">
      {renderLevel("", 0)}
    </div>
  );
}
