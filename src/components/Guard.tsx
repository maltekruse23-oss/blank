import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { logError } from '../platform/errorLog';

type Props = {
  /** The part of the app, for the error log and the notice ("Twitch", "Einstellungen" …). */
  name: string;
  children: ReactNode;
  /** Shown instead of the part; default: a small notice with "Neu laden". */
  fallback?: (retry: () => void) => ReactNode;
};
type State = { failed: boolean; run: number };

/**
 * A render error stays in its part (a card, a page, a dialog): it is written to the error log and
 * the part shows a notice instead of the whole window going blank. "Neu laden" builds it again.
 */
export class Guard extends Component<Props, State> {
  state: State = { failed: false, run: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const components = (info.componentStack ?? '')
      .split('\n')
      .map((line) => line.trim().replace(/^at /, '').split(' ')[0])
      .filter(Boolean)
      .slice(0, 4)
      .join(' < ');
    logError(this.props.name, error, components || undefined);
  }

  retry = () => this.setState((state) => ({ failed: false, run: state.run + 1 }));

  render() {
    if (!this.state.failed) return <Fragment key={this.state.run}>{this.props.children}</Fragment>;
    if (this.props.fallback) return this.props.fallback(this.retry);
    return <GuardNotice name={this.props.name} retry={this.retry} />;
  }
}

/** The notice in place of a failed part. */
export function GuardNotice({
  name,
  retry,
  retryLabel = 'Neu laden',
}: {
  name: string;
  retry: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="guard" role="alert">
      <TriangleAlert size={18} aria-hidden />
      <div>
        <strong>Fehler in „{name}“</strong>
        <small>Bericht: Zahnrad → System → Fehlerbericht</small>
      </div>
      <button className="secondary-button" onClick={retry}>
        <RotateCcw size={14} aria-hidden />
        {retryLabel}
      </button>
    </div>
  );
}
