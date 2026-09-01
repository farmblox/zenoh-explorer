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
import { PeersView } from "@/features/peers";
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
    description: "The network graph, grouped by region",
    component: TopologyView,
  },
  {
    id: "peers",
    label: "Peers & sessions",
    group: "explore",
    icon: Users,
    description: "Transports this session holds open",
    component: PeersView,
  },
  {
    id: "regions",
    label: "Regions",
    group: "explore",
    icon: Boxes,
    description: "Routing regions and the gateways between them",
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
    secondary: true,
  },
  {
    id: "config",
    label: "Configuration",
    group: "session",
    icon: SlidersHorizontal,
    description: "The effective configuration of each node",
    component: ConfigView,
    secondary: true,
  },
];

/** Lookup by id, built once. */
export const VIEW_BY_ID: ReadonlyMap<ViewId, ViewDefinition> = new Map(
  VIEWS.map((view) => [view.id, view]),
);

/** Views always visible in the sidebar. */
export const PRIMARY_VIEWS: readonly ViewDefinition[] = VIEWS.filter((view) => !view.secondary);

/** Views behind the sidebar's "More" toggle. */
export const SECONDARY_VIEWS: readonly ViewDefinition[] = VIEWS.filter((view) => view.secondary);
