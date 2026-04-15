import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Check authentication status
    const checkAuth = () => {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      
      // Store debug info in sessionStorage
      const authDebug: any = {
        timestamp: new Date().toISOString(),
        path: location.pathname,
        accessToken: !!accessToken,
        refreshToken: !!refreshToken,
        accessTokenValue: accessToken ? accessToken.substring(0, 20) + '...' : null
      };
      
      console.log('ProtectedRoute: Checking authentication...');
      console.log('Access Token:', accessToken ? 'Present' : 'Missing');
      console.log('Refresh Token:', refreshToken ? 'Present' : 'Missing');
      
      const isAuth = isAuthenticated();
      console.log('Authentication result:', isAuth);
      
      authDebug.authResult = isAuth;
      sessionStorage.setItem('authDebug', JSON.stringify(authDebug));
      
      setAuthenticated(isAuth);
      setAuthChecked(true);
    };

    checkAuth();
  }, [location.pathname]);

  // Show loading while checking authentication
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!authenticated) {
    // Only redirect if isAuthenticated() is false (already checked)
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
