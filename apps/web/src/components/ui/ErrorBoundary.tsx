import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Error boundary that shows the real error message + stack on screen. Catches
 * render-time crashes so a single broken subtree shows a useful message
 * instead of a blank white page.
 */
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div className="m-4 rounded-lg border border-error/60 bg-error/5 p-4">
          <p className="text-sm font-semibold text-[var(--error)]">
            Render error{this.props.label ? ` in ${this.props.label}` : ''}
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--text)]">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
          {info?.componentStack && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-[var(--sub)]">
              {info.componentStack}
            </pre>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => this.setState({ error: null, info: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
