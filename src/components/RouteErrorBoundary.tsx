import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches errors thrown during rendering of lazy route chunks (including
 * chunk load failures and TDZ/init errors in vendor bundles). Prevents the
 * entire shell from going blank — shows a recoverable fallback instead.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info);
  }

  handleReload = () => {
    // Force a hard reload so any broken chunk cache is discarded.
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message ?? "Unknown error";
    const isChunkError =
      /Loading chunk|dynamically imported module|Failed to fetch dynamically/i.test(
        message
      );

    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-md w-full border rounded-md p-6 bg-card text-card-foreground space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-sm font-medium">Something went wrong</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {isChunkError
              ? "A part of the app failed to load. Reloading usually fixes this."
              : "An unexpected error occurred while rendering this page."}
          </p>
          <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-32 text-muted-foreground">
            {message}
          </pre>
          <div className="flex gap-2">
            <Button size="sm" onClick={this.handleReload}>
              Reload page
            </Button>
            <Button size="sm" variant="outline" onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}