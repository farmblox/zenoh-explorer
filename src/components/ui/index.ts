/**
 * UI primitives.
 *
 * These know nothing about Zenoh. They take props and render — no stores, no
 * IPC, no domain types. That boundary is what makes them reusable and what
 * keeps a change to the session model from rippling into a button.
 *
 * Components that *do* understand the domain live in `components/domain`.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";

export { DataTable } from "./DataTable";
export type { Column, DataTableProps } from "./DataTable";

export { Dialog } from "./Dialog";
export type { DialogProps } from "./Dialog";

export { Disclosure } from "./Disclosure";
export type { DisclosureProps } from "./Disclosure";

export { ErrorBoundary } from "./ErrorBoundary";
export type { ErrorBoundaryProps } from "./ErrorBoundary";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { Input } from "./Input";
export type { InputProps, InputSize } from "./Input";

export { Kbd } from "./Kbd";
export type { KbdProps } from "./Kbd";

export { FieldRow, Panel } from "./Panel";
export type { FieldRowProps, PanelProps } from "./Panel";

export { ScrollArea } from "./ScrollArea";
export type { ScrollAreaProps } from "./ScrollArea";

export { SegmentedControl } from "./SegmentedControl";
export type { Segment, SegmentedControlProps } from "./SegmentedControl";

export { Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { StatusDot } from "./StatusDot";
export type { Status, StatusDotProps } from "./StatusDot";

export { Menu } from "./Menu";
export type { MenuItem, MenuProps } from "./Menu";

export { Meter, Mix } from "./Meter";
export type { MeterProps, MeterSize, MeterTone, MixProps, MixSegment } from "./Meter";

export { Popover } from "./Popover";
export type { PopoverAlign, PopoverProps, PopoverSide } from "./Popover";

export { SplitButton } from "./SplitButton";
export type { SplitButtonProps } from "./SplitButton";

export { Stat, StatCell, StatGrid } from "./Stat";
export type { StatGridProps, StatProps, StatSize, StatTone } from "./Stat";

export { SettingRow, Switch } from "./Switch";
export type { SettingRowProps, SwitchProps } from "./Switch";

export { TabPanel, Tabs } from "./Tabs";
export type { Tab, TabPanelProps, TabsProps } from "./Tabs";

export { Toolbar, ToolbarDivider } from "./Toolbar";
export type { ToolbarProps } from "./Toolbar";

export { ResizablePanel } from "./ResizablePanel";
export type { PanelSide, ResizablePanelProps } from "./ResizablePanel";

export { ListRow } from "./ListRow";
export type { ListRowMark, ListRowProps, ListRowSize } from "./ListRow";

export { SectionLabel } from "./SectionLabel";
export type { SectionLabelProps } from "./SectionLabel";
