import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-800">Something went wrong</h1>
          <p className="text-sm text-gray-500">The page hit an unexpected error. Your data is safe.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
