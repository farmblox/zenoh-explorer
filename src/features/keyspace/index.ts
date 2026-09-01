/**
 * The key-space feature.
 *
 * A feature's `index.ts` is its entire public surface: the registry imports the
 * view from here and nothing else reaches inside. Components under
 * `components/` are private to the feature — if a second view needs one, it
 * moves down to `components/domain` rather than being imported across.
 */
export { KeyspaceView } from "./KeyspaceView";
