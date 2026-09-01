/**
 * Domain components.
 *
 * These know about Zenoh — node kinds, zids, key expressions — but not about
 * any particular view. Anything a second view would want to reuse belongs here;
 * anything only one view needs stays in that feature's `components/` folder.
 */
export { KeyExpr } from "./KeyExpr";
export type { KeyExprProps } from "./KeyExpr";

export { NodeKindIcon } from "./NodeKindIcon";
export { NODE_KINDS, NODE_ROLES } from "./nodeRoles";
export type { NodeRole } from "./nodeRoles";
export type { NodeKindIconProps } from "./NodeKindIcon";

export { Zid } from "./Zid";
export type { ZidProps } from "./Zid";
