/**
 * The view registry — the single source of truth for what this app contains.
 *
 * The sidebar, the command palette and the view outlet all read from here, so
 * adding a screen is exactly two steps: create the feature folder, add an entry
 * below. Nothing else needs to change, and nothing else knows the list.
 */
import {
  AtSign,
  Binary,
  Boxes,
  Cable,
  Network,
  Radar,
  ScrollText,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { AdminView } from "@/features/admin";
import { ConfigView } from "@/features/config";
import { EventsView } from "@/features/events";
import { KeyspaceView } from "@/features/keyspace";
import { NodesView } from "@/features/nodes";
import { RegionsView } from "@/features/regions";
import { ScoutingView } from "@/features/scouting";
import { TopologyView } from "@/features/topology";
import { TransportView } from "@/features/transport";

import type { ViewDefinition, ViewId } from "./types";

/** Every view, in sidebar order. */
export const VIEWS: readonly ViewDefinition[] = [
  {
    id: "topology",
    label: "Topology",
    group: "explore",
    icon: Network,
    description: "The network graph, and the links between its nodes",
    component: TopologyView,
  },
  {
    id: "nodes",
    label: "Nodes",
    group: "explore",
    icon: Users,
    description: "Every router, peer and client on the network",
    component: NodesView,
  },
  {
    id: "regions",
    label: "Regions",
    group: "explore",
    icon: Boxes,
    description: "What each region holds, and how it is attached",
    component: RegionsView,
  },
  {
    id: "keyspace",
    label: "Keyspace",
    group: "data",
    icon: Binary,
    description: "Browse what the network declares, and subscribe to any of it",
    component: KeyspaceView,
  },
  {
    id: "admin",
    label: "Admin space",
    group: "data",
    icon: AtSign,
    description: "Query the @ namespace directly",
    component: AdminView,
  },
  {
    id: "scouting",
    label: "Scouting",
    group: "activity",
    icon: Radar,
    description: "Nodes answering scouts, whether or not we are connected",
    component: ScoutingView,
    // The only view that works with nothing open — it is how you find a network.
    requiresSession: false,
  },
  {
    id: "events",
    label: "Events",
    group: "activity",
    icon: ScrollText,
    description: "Diagnostics and lifecycle notices from the backend",
    component: EventsView,
    requiresSession: false,
  },
  {
    id: "transport",
    label: "Transport",
    group: "session",
    icon: Cable,
    description: "Link detail: MTU, interfaces, priorities and reliability",
    component: TransportView,
  },
  {
    id: "config",
    label: "Configuration",
    group: "session",
    icon: SlidersHorizontal,
    description: "The effective configuration of each node",
    component: ConfigView,
  },
];

/** Lookup by id, built once. */
export const VIEW_BY_ID: ReadonlyMap<ViewId, ViewDefinition> = new Map(
  VIEWS.map((view) => [view.id, view]),
);
