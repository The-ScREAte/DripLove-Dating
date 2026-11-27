import React from 'react';
import { logAppError } from '@/utils/errorLog';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{error: Error}>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logAppError('app', error, errorInfo);
  }

  // First "Restart App" tap tries a soft recovery (re-render the subtree with fresh
  // state, no page reload — keeps the session and avoids a cold start). If the same
  // subtree throws again straight away, the next tap does the full reload.
  private softRecoverTried = false;
  private handleRestart = () => {
    if (!this.softRecoverTried) {
      this.softRecoverTried = true;
      this.setState({ hasError: false, error: undefined });
      // Allow another soft attempt later if the app stays healthy for a while.
      window.setTimeout(() => { this.softRecoverTried = false; }, 15000);
      return;
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error!} />;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 p-4">
          <div className="text-center bg-white rounded-lg p-8 shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-6">
              The app encountered an error. Please restart the app or contact support if the issue persists.
            </p>
            <button 
              onClick={this.handleRestart}
              className="h-11 px-6 rounded-full bg-brand-gradient text-white font-semibold shadow-dl-brand active:scale-[0.97] dl-focus"
            >
              Restart App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
