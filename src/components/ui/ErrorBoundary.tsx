import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

export interface ErrorBoundaryProps {
  /** Changing this resets the boundary — pass the view or session id. */
  resetKey?: string | number;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken view from taking the window with it.
 *
 * Without this, a render error anywhere below the shell unmounts the entire
 * tree and leaves a blank window with no way back — the session is still open
 * in Rust, the tabs still exist, but none of it is reachable. Scoping the
 * boundary to the view outlet means a failure costs you that pane and nothing
 * else: the chrome survives, and switching tabs or views clears it.
 *
 * Still a class component. Error boundaries are the one thing React has never
 * given a hook equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Goes to the rotating log file via tauri-plugin-log's webview target, so
    // a user can send it in with a bug report.
    console.error("view crashed", error, info.componentStack);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    // Navigating away is the natural "try again": drop the error so the next
    // view renders instead of inheriting this one's failure.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <EmptyState
        title="This view stopped working"
        description={error.message || "The view threw while rendering."}
        action={
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        }
      />
    );
  }
}
