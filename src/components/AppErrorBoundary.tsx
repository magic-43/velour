import React, { ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected runtime error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled app error in boundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ink text-paper font-sans flex items-center justify-center p-6">
          <div className="w-full max-w-xl border border-red-900/40 bg-red-950/20 p-6 rounded-2xl shadow-2xl">
            <p className="text-[0.65rem] tracking-[0.2em] uppercase text-red-400 font-semibold mb-2">
              Runtime Error
            </p>
            <h1 className="font-serif text-2xl text-paper mb-3">
              Something went wrong while rendering.
            </h1>
            <p className="text-sm text-red-300 font-mono bg-black/40 p-3 rounded-lg break-words mb-5">
              {this.state.message}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.href = '/';
                }}
                className="px-5 py-2.5 bg-gold text-ink text-xs font-semibold uppercase tracking-wider rounded-full hover:bg-gold-light transition-colors"
              >
                Go to Home
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 border border-border-subtle text-paper text-xs font-semibold uppercase tracking-wider rounded-full hover:border-gold transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
