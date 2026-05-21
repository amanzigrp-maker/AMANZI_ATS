import React, { Component, ErrorInfo, ReactNode } from "react";

// Initialize startup logs array globally
if (!(window as any).APP_STARTUP_LOGS) {
  (window as any).APP_STARTUP_LOGS = [];
}
(window as any).addStartupLog = (stage: string) => {
  const timestamp = new Date().toLocaleTimeString();
  const log = { stage, timestamp };
  (window as any).APP_STARTUP_LOGS.push(log);
  console.log(`[STARTUP] ${stage} at ${timestamp}`);
  // Dispatch custom event to notify listeners
  window.dispatchEvent(new CustomEvent('app-startup-log', { detail: log }));
};

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  startupLogs: Array<{ stage: string; timestamp: string }>;
}

export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    startupLogs: [...((window as any).APP_STARTUP_LOGS || [])]
  };

  private handleStartupLog = () => {
    this.setState({ startupLogs: [...((window as any).APP_STARTUP_LOGS || [])] });
  };

  componentDidMount() {
    window.addEventListener('app-startup-log', this.handleStartupLog);
  }

  componentWillUnmount() {
    window.removeEventListener('app-startup-log', this.handleStartupLog);
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("GlobalErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h1 style={styles.title}>⚠️ React Renderer Crash</h1>
            <p style={styles.subtitle}>
              A critical UI error occurred. Below are the diagnostic details:
            </p>
            
            <div style={styles.label}>Error Message:</div>
            <div style={styles.errorMsg}>{this.state.error?.message || "Unknown error"}</div>
            
            {this.state.errorInfo && (
              <>
                <div style={styles.label}>Component Stack Trace:</div>
                <div style={styles.stack}>{this.state.errorInfo.componentStack}</div>
              </>
            )}

            {this.state.error?.stack && (
              <>
                <div style={styles.label}>JavaScript Stack Trace:</div>
                <div style={styles.stack}>{this.state.error.stack}</div>
              </>
            )}

            <div style={styles.label}>Recent Startup Stages:</div>
            <div style={styles.logsContainer}>
              {this.state.startupLogs.length === 0 ? (
                <div style={styles.emptyLogs}>No startup logs recorded.</div>
              ) : (
                this.state.startupLogs.map((log, index) => (
                  <div key={index} style={styles.logLine}>
                    <span style={styles.logTime}>[{log.timestamp}]</span> {log.stage}
                  </div>
                ))
              )}
            </div>

            <div style={styles.actions}>
              <button onClick={this.handleReload} style={styles.primaryButton}>
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Fullscreen Global Error Overlay (handles window.onerror and onunhandledrejection)
export const GlobalErrorOverlay: React.FC = () => {
  const [error, setError] = React.useState<{ message: string; stack?: string } | null>(null);
  const [startupLogs, setStartupLogs] = React.useState<Array<{ stage: string; timestamp: string }>>([]);

  React.useEffect(() => {
    setStartupLogs([...((window as any).APP_STARTUP_LOGS || [])]);

    const handleLog = () => {
      setStartupLogs([...((window as any).APP_STARTUP_LOGS || [])]);
    };

    window.addEventListener('app-startup-log', handleLog);

    const handleError = (event: ErrorEvent) => {
      console.error("GlobalErrorOverlay captured window.onerror:", event.error || event.message);
      setError({
        message: event.message || "Unknown Runtime Error",
        stack: event.error?.stack || "No JS stack trace available"
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("GlobalErrorOverlay captured unhandled Promise rejection:", event.reason);
      const reason = event.reason;
      setError({
        message: reason?.message || String(reason || "Unhandled Promise Rejection"),
        stack: reason?.stack || "No stack trace available"
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener('app-startup-log', handleLog);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (!error) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚠️ Runtime Exception Captured</h1>
        <p style={styles.subtitle}>
          A critical uncaught exception or unhandled promise occurred in the renderer:
        </p>

        <div style={styles.label}>Error Message:</div>
        <div style={styles.errorMsg}>{error.message}</div>

        {error.stack && (
          <>
            <div style={styles.label}>Stack Trace:</div>
            <div style={styles.stack}>{error.stack}</div>
          </>
        )}

        <div style={styles.label}>Recent Startup Stages:</div>
        <div style={styles.logsContainer}>
          {startupLogs.length === 0 ? (
            <div style={styles.emptyLogs}>No startup logs recorded.</div>
          ) : (
            startupLogs.map((log, index) => (
              <div key={index} style={styles.logLine}>
                <span style={styles.logTime}>[{log.timestamp}]</span> {log.stage}
              </div>
            ))
          )}
        </div>

        <div style={styles.actions}>
          <button onClick={() => window.location.reload()} style={styles.primaryButton}>
            Reload Application
          </button>
          <button onClick={() => setError(null)} style={styles.secondaryButton}>
            Dismiss Overlay
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "#020617",
    color: "#f8fafc",
    zIndex: 99999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    overflowY: "auto" as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  card: {
    backgroundColor: "#0f172a",
    border: "1px solid #ef4444",
    borderRadius: "12px",
    padding: "28px",
    maxWidth: "700px",
    width: "100%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.7)",
    textAlign: "left" as const,
  },
  title: {
    color: "#ef4444",
    margin: "0 0 8px 0",
    fontSize: "22px",
    fontWeight: "bold",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "13px",
    margin: "0 0 20px 0",
    lineHeight: "1.5",
  },
  label: {
    color: "#f1f5f9",
    fontWeight: "bold",
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: "16px",
    marginBottom: "6px",
  },
  errorMsg: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "14px",
    fontFamily: "monospace",
    color: "#fca5a5",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  stack: {
    backgroundColor: "#020617",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "11px",
    fontFamily: "monospace",
    color: "#cbd5e1",
    maxHeight: "180px",
    overflowY: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
    lineHeight: "1.4",
  },
  logsContainer: {
    backgroundColor: "#020617",
    border: "1px solid #1e293b",
    borderRadius: "6px",
    padding: "10px 12px",
    maxHeight: "120px",
    overflowY: "auto" as const,
  },
  logLine: {
    fontSize: "11px",
    color: "#94a3b8",
    lineHeight: "1.5",
    fontFamily: "monospace",
  },
  logTime: {
    color: "#38bdf8",
  },
  emptyLogs: {
    fontSize: "11px",
    color: "#475569",
    fontStyle: "italic",
  },
  actions: {
    marginTop: "24px",
    display: "flex",
    gap: "12px",
  },
  primaryButton: {
    backgroundColor: "#ef4444",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    padding: "10px 18px",
    fontWeight: "bold" as const,
    fontSize: "13px",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  secondaryButton: {
    backgroundColor: "#334155",
    color: "#cbd5e1",
    border: "none",
    borderRadius: "6px",
    padding: "10px 18px",
    fontWeight: "bold" as const,
    fontSize: "13px",
    cursor: "pointer",
    transition: "background 0.2s",
  }
};
