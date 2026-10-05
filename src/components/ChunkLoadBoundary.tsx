import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

// Lazy-loaded routes (e.g. `navigate('/games')`) fetch their JS chunk on demand. On a flaky
// mobile connection, or when the deployed build has moved on since this tab first loaded, that
// fetch can fail — React then throws mid-render with nothing else changing, so the tap that
// triggered navigation just looks like it silently did nothing. Reloading picks up a fresh,
// currently-deployed bundle and resolves both cases, so we do that once automatically instead
// of leaving the user stuck on a page that looks unresponsive.
const RELOAD_FLAG_KEY = 'driplove_chunk_reload_attempted';

const isChunkLoadError = (error: Error): boolean => {
  const message = error?.message || '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module|error loading dynamically imported module/i.test(message);
};

class ChunkLoadBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG_KEY) === '1';
      } catch {
        // Storage inaccessible (private browsing, etc.) — fall through to the manual fallback.
      }

      if (!alreadyTried) {
        try { sessionStorage.setItem(RELOAD_FLAG_KEY, '1'); } catch { /* ignore */ }
        window.location.reload();
        return;
      }
    }

    console.error('[ChunkLoadBoundary] Caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      // Either a non-chunk error, or we already tried the automatic reload once this session —
      // show a manual recovery instead of a blank/unresponsive page.
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-black p-4">
          <div className="text-center max-w-sm">
            <p className="text-gray-300 mb-4">This page didn't load. Check your connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2 rounded-full font-medium"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkLoadBoundary;
