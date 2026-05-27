/**
 * Safe Authenticated Fetch with Token Refresh
 * 
 * Prevents:
 * - Infinite token refresh loops
 * - Multiple simultaneous refresh requests
 * - Hanging requests
 * - Race conditions between requests and token refresh
 */

import { safeTokenRefresh, isTokenValid, saveAuthState, clearAuthState } from './auth-enhanced';

let tokenRefreshPromise: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

export const authenticatedFetchSafe = async (
  url: string,
  options: RequestInit = {},
  maxRetries: number = 1
): Promise<Response> => {
  let retryCount = 0;

  const performFetch = async (
    currentUrl: string,
    currentOptions: RequestInit
  ): Promise<Response> => {
    const accessToken = localStorage.getItem('accessToken');

    // Set up headers
    const headers = new Headers(currentOptions.headers || {});
    
    // Only set Content-Type for JSON, let browser set it for FormData
    if (currentOptions.body && !(currentOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    currentOptions.headers = headers;

    try {
      const response = await fetch(currentUrl, currentOptions);

      // If unauthorized, attempt token refresh
      if (response.status === 401 && retryCount < maxRetries) {
        console.debug('[AUTH] 401 Unauthorized, attempting token refresh...');
        retryCount++;

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          console.warn('[AUTH] No refresh token available');
          clearAuthState();
          window.location.href = '/login';
          return response;
        }

        // Use promise to prevent multiple simultaneous refresh requests
        if (!tokenRefreshPromise) {
          tokenRefreshPromise = safeTokenRefresh(refreshToken);
        }

        const newTokens = await tokenRefreshPromise;
        tokenRefreshPromise = null;

        if (newTokens) {
          saveAuthState(newTokens.accessToken, newTokens.refreshToken);
          
          // Retry the original request with new token
          const newHeaders = new Headers(currentOptions.headers || {});
          if (currentOptions.body && !(currentOptions.body instanceof FormData)) {
            newHeaders.set('Content-Type', 'application/json');
          }
          newHeaders.set('Authorization', `Bearer ${newTokens.accessToken}`);
          currentOptions.headers = newHeaders;

          return fetch(currentUrl, currentOptions);
        } else {
          console.error('[AUTH] Token refresh failed, logging out');
          clearAuthState();
          window.location.href = '/login';
          return response;
        }
      }

      return response;
    } catch (error) {
      console.error('[AUTH] Fetch error:', error);
      throw error;
    }
  };

  return performFetch(url, options);
};

/**
 * Export as replacement for old authenticatedFetch
 * Maintains backward compatibility
 */
export { authenticatedFetchSafe as authenticatedFetch };
