/**
 * Top-level React error boundary.
 *
 * Catches render/lifecycle errors anywhere in the tree so a single thrown
 * exception shows a branded recovery screen instead of a blank white page —
 * critical for a shipped mobile app where there is no dev console to inspect.
 *
 * Errors are logged to the console (and can be forwarded to a crash-reporting
 * service here) but never surface raw stack traces to end users.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shared full-screen branded message used by both fallbacks below. */
function FullScreenMessage({
  emoji,
  title,
  message,
  action,
}: {
  emoji: string;
  title: string;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        boxSizing: "border-box",
        background: "#F1F5F9",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#475569",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#D2E9DD",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 28,
          }}
        >
          {emoji}
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, color: "#1F2937" }}>{title}</h1>
        <div style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.5 }}>{message}</div>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 600,
              color: "white",
              background: "#0D5C3A",
              cursor: "pointer",
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shown at startup when env config is invalid (see getConfigErrors). Keeps the
 * failure visible and on-brand instead of a blank page, and never echoes secret
 * values — only the non-sensitive variable names that are missing.
 */
export function ConfigErrorScreen({ errors }: { errors: string[] }) {
  return (
    <FullScreenMessage
      emoji="🛠️"
      title="Configuration error"
      message={
        <>
          The app isn't configured correctly for this build:
          <ul style={{ textAlign: "left", margin: "12px 0 0", paddingLeft: 20 }}>
            {errors.map((e) => (
              <li key={e} style={{ marginBottom: 6 }}>
                {e}
              </li>
            ))}
          </ul>
        </>
      }
    />
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for local debugging / native remote logs.
    // Hook a crash reporter (Sentry, etc.) in here for production telemetry.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <FullScreenMessage
        emoji="⚠️"
        title="Something went wrong"
        message="The app hit an unexpected error. Please try again — your data is safe."
        action={{ label: "Reload app", onClick: this.handleReload }}
      />
    );
  }
}
