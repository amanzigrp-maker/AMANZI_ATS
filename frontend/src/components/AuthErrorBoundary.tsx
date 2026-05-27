/**
 * Authentication Error Boundary
 * 
 * Prevents authentication errors from crashing the entire renderer.
 * Catches infinite loops, token errors, and network issues gracefully.
 */

import React, { ReactNode } from 'react';
import { clearAuthState } from '@/lib/auth-enhanced';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
  isRecovering: boolean;
}

export class AuthErrorBoundary extends React.Component<Props, State> {
  private recoveryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
      isRecovering: false,
    };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[AuthErrorBoundary] Caught error:', error);
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AuthErrorBoundary] Error caught:', error);
    console.error('[AuthErrorBoundary] Error info:', errorInfo);

    this.setState((prev) => ({
      errorCount: prev.errorCount + 1,
    }));

    // If too many errors, force logout
    if (this.state.errorCount > 5) {
      console.error('[AuthErrorBoundary] Too many errors, forcing logout');
      clearAuthState();
      window.location.href = '/login';
    }
  }

  handleRecovery = () => {
    console.log('[AuthErrorBoundary] Attempting recovery...');
    
    this.setState({ isRecovering: true });
    
    // Clear auth state and attempt reload
    clearAuthState();
    
    // Schedule recovery after a brief delay
    this.recoveryTimeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        isRecovering: false,
      });
    }, 1000);
  };

  handleLogout = () => {
    clearAuthState();
    window.location.href = '/login';
  };

  componentWillUnmount() {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      const isAuthError = this.state.error?.message?.includes('auth') ||
                         this.state.error?.message?.includes('token') ||
                         this.state.error?.message?.includes('Authentication');

      return (
        <div className="flex items-center justify-center min-h-screen bg-red-50 p-4">
          <div className="max-w-md bg-white rounded-lg shadow-lg p-6 border border-red-200">
            <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              {isAuthError ? 'Authentication Error' : 'Application Error'}
            </h2>

            <p className="text-sm text-gray-600 text-center mb-4">
              {isAuthError
                ? 'We encountered an authentication issue. Please log in again.'
                : 'An unexpected error occurred. Please try again.'}
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <p className="text-xs text-gray-500 text-center mb-4">
              Error count: {this.state.errorCount}
            </p>

            <div className="flex gap-2">
              <button
                onClick={this.handleRecovery}
                disabled={this.state.isRecovering}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-all"
              >
                {this.state.isRecovering ? 'Recovering...' : 'Try Again'}
              </button>
              <button
                onClick={this.handleLogout}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 font-medium text-sm transition-all"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthErrorBoundary;
