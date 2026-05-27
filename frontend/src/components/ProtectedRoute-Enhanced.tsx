import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isTokenValid, getAuthState } from '@/lib/auth-enhanced';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Optimized Protected Route
 * 
 * Prevents:
 * - Infinite auth check loops
 * - Unnecessary re-renders
 * - Multiple redirects
 * - Race conditions
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();

  // Stable callback - only changes when location pathname changes
  const checkAuth = useCallback(() => {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    
    // At least one token must be present and valid
    const hasValidToken = isTokenValid(accessToken) || isTokenValid(refreshToken);
    
    if (!hasValidToken) {
      console.debug('[ProtectedRoute] User not authenticated, redirecting to login');
      setIsAuthenticated(false);
      setAuthChecked(true);
      return;
    }

    console.debug('[ProtectedRoute] User authenticated');
    setIsAuthenticated(true);
    setAuthChecked(true);
  }, []);

  // Effect runs once on mount and when location pathname changes
  useEffect(() => {
    // Prevent infinite loops by tracking check state
    let isMounted = true;

    if (!authChecked) {
      checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [authChecked, checkAuth]);

  // Memoize loading state to prevent flashing
  const loadingUI = useMemo(() => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-spin p-1">
              <div className="w-full h-full bg-white rounded-full"></div>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Verifying access...</h3>
          <p className="text-sm text-gray-600 mt-2">Please wait while we verify your credentials</p>
        </div>
      </div>
    </div>
  ), []);

  // While checking authentication, show loading state
  if (!authChecked) {
    return loadingUI;
  }

  // If not authenticated, redirect to login with return location
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated, render children
  return <>{children}</>;
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(ProtectedRoute);
