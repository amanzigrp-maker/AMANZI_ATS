import { authenticatedFetch } from './api';

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  // If both tokens are missing, not authenticated
  if (!accessToken && !refreshToken) return false;

  // If we have an access token, check if it's valid
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp > now) return true;
    } catch (e) {}
  }

  // If we have a refresh token, check if it's valid
  if (refreshToken) {
    try {
      const payload = JSON.parse(atob(refreshToken.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp > now) return true;
    } catch (e) {}
  }

  // Both tokens are present but both are expired/invalid
  return false;
};

/**
 * Get current user's access token
 */
export const getAccessToken = (): string | null => {
  return localStorage.getItem('accessToken');
};

/**
 * Redirect to login if not authenticated
 */
export const requireAuth = (): boolean => {
  if (!isAuthenticated()) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return false;
  }
  return true;
};

/**
 * Logs the user out by removing tokens from local storage and invalidating the refresh token on the server.
 */
export const logout = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  if (refreshToken) {
    try {
      await authenticatedFetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      console.error('Logout failed on server, proceeding with client-side logout:', error);
    }
  }

  // Always clear local storage as a fallback
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  
  // Redirect to login page only if not already there
  if (!isAuthenticated() && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};
