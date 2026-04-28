// src/lib/api.ts

/**
 * Attempts to refresh the access token using the stored refresh token.
 * @returns {Promise<string | null>} The new access token, or null if refresh fails.
 */
const getNewAccessToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    console.warn('[AUTH] No refresh token found in localStorage');
    return null;
  }

  try {

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.error('[AUTH] Token refresh request failed:', response.status);
      if (response.status === 401 || response.status === 403) {
        // Refresh token is invalid/expired: user must re-authenticate.
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      return null;
    }

    const data = await response.json();
    if (!data.accessToken) {
      console.error('[AUTH] Refresh response missing accessToken');
      throw new Error('Missing accessToken in refresh response');
    }

    localStorage.setItem('accessToken', data.accessToken);

    return data.accessToken;
  } catch (error) {
    console.error('[AUTH] Error refreshing token:', error);
    // Network/CORS/temporary failures should not force logout.
    return null;
  }
};

/**
 * A wrapper around fetch that automatically includes the access token and handles token refreshing.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - The options for the fetch request.
 * @returns {Promise<Response>} The fetch response.
 */
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let accessToken = localStorage.getItem('accessToken');

  // Set Authorization header and Content-Type if a body is present
  const headers = new Headers(options.headers);
  
  // Only set Content-Type for JSON, let browser set it for FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  options.headers = headers;

  // Make the initial request
  let response = await fetch(url, options);

  // If the response is unauthorized (401), try to refresh the token and retry
  if (response.status === 401) {
    const newAccessToken = await getNewAccessToken();

    if (newAccessToken) {
      // Retry the request with the new token
      headers.set('Authorization', `Bearer ${newAccessToken}`);
      options.headers = headers;
      response = await fetch(url, options);
    } else {
      // If token refresh fails, we can't proceed.
      // The getNewAccessToken function will have already handled the redirect.
      // We return the original failed response to avoid further processing.
      return response;
    }
  }

  return response;
};

// Example of how to use it:
/*
async function getUserProfile() {
  try {
    const response = await authenticatedFetch('/api/profile');
    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }
    const profile = await response.json();

  } catch (error) {
    console.error(error);
  }
}
*/
