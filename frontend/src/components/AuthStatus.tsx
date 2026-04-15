import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAuthenticated, getAccessToken } from '@/lib/auth';

interface AuthStatusProps {
  onAuthRequired?: () => void;
}

export const AuthStatus: React.FC<AuthStatusProps> = ({ onAuthRequired }) => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    const checkAuth = () => {
      if (isAuthenticated()) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
        onAuthRequired?.();
      }
    };

    checkAuth();
    
    // Check auth status periodically
    const interval = setInterval(checkAuth, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [onAuthRequired]);

  if (authStatus === 'checking') {
    return null;
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">Authentication Required</p>
          <p className="text-xs text-yellow-700">Please log in to upload resumes</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          <LogIn className="h-4 w-4 mr-1" />
          Log In
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
      <CheckCircle className="h-4 w-4 text-green-600" />
      <p className="text-xs text-green-700">Ready to upload</p>
    </div>
  );
};

export default AuthStatus;
