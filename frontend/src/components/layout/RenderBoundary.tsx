import React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

type RenderBoundaryProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

type RenderBoundaryState = {
  hasError: boolean;
};

export class RenderBoundary extends React.Component<
  RenderBoundaryProps,
  RenderBoundaryState
> {
  state: RenderBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): RenderBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("RenderBoundary caught a render failure", {
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="rounded-[1.25rem] border border-danger/30 bg-card/90 p-6 shadow-[0_24px_80px_-60px_rgba(0,0,0,0.95)]">
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {this.props.title ?? "This section failed to render"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {this.props.description ??
                  "A runtime UI error interrupted rendering. Reload the page after checking the browser console."}
              </p>
            </div>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={this.handleReload}>
              Reload page
            </Button>
          </div>
        </div>
      </section>
    );
  }
}
