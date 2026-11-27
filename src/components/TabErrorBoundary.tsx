import React from 'react';
import i18n from 'i18next';
import { Button } from '@/components/ui/button';
import { logAppError } from '@/utils/errorLog';

interface TabErrorBoundaryProps {
  /** Which tab / area this guards ('dripcheck', 'profile', 'popup-host', …) - used in the error log. */
  tab: string;
  /** Overlay-style guards (the popup host): on error render nothing instead of an in-place card. */
  silent?: boolean;
  children: React.ReactNode;
}

interface TabErrorBoundaryState {
  error?: Error;
  /** Bumped by "Try again" so the guarded subtree is re-created from scratch (fresh state, fresh effects). */
  attempt: number;
}

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module|error loading dynamically imported module/i;

/**
 * One of these wraps every tab panel (and the popup host) so a render/effect error inside ONE tab
 * can never unmount the whole app: the bottom navigation and the other tabs keep working and the
 * broken tab shows a small in-place card with a "Try again" that re-creates just that tab.
 * The app-wide ErrorBoundary stays as the last resort.
 */
class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { error: undefined, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<TabErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logAppError(`tab:${this.props.tab}`, error, info, { tab: this.props.tab });
  }

  private retry = () => {
    const { error } = this.state;
    // A lazy chunk that failed to load stays rejected inside React.lazy, so re-rendering can't fix it
    // (this happens e.g. after a new deploy replaced the files, or on a dropped connection).
    if (error && CHUNK_ERROR.test(error.message || '')) {
      window.location.reload();
      return;
    }
    this.setState((prev) => ({ error: undefined, attempt: prev.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      if (this.props.silent) return null;
      return (
        <div
          role="alert"
          className="flex h-full w-full items-center justify-center px-6 py-10 dl-tab-error"
          data-testid="tab-error"
        >
          <div className="w-full max-w-xs text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl"
            >
              💔
            </div>
            <h2 className="mb-1.5 text-lg font-semibold text-white">
              {i18n.t('errors.tabErrorTitle', { defaultValue: "Couldn't load this tab" })}
            </h2>
            <p className="mb-5 text-sm text-white/60">
              {i18n.t('errors.tabErrorBody', { defaultValue: 'This part hit a problem. Your other tabs are fine.' })}
            </p>
            <Button variant="primary" size="md" onClick={this.retry}>
              {i18n.t('errors.tabErrorRetry', { defaultValue: 'Try again' })}
            </Button>
          </div>
        </div>
      );
    }

    // Changing the key re-creates the whole guarded subtree on "Try again".
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

export default TabErrorBoundary;
