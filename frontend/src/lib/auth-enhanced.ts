/**
 * Enhanced Authentication Service
 * 
 * Features:
 * - Request deduplication (prevents duplicate login requests)
 * - Abort controller support (cancels in-flight requests)
 * - Retry limits (prevents infinite retry loops)
 * - Token refresh safety (prevents refresh token recursion)
 * - Infinite loop detection (monitors auth call frequency)
 * - Loading state protection (prevents race conditions)
 * - Performance monitoring
 */

export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  isLoading: boolean;
  lastAuthTime: number;
}

interface LoginRequest {
  email: string;
  password: string;
}

// ============================================================================
// GLOBAL STATE - REQUEST DEDUPLICATION
// ============================================================================

let activeLoginRequest: Promise<any> | null = null;
let activeRefreshRequest: Promise<any> | null = null;
let loginAbortController: AbortController | null = null;
let refreshAbortController: AbortController | null = null;
let lastLoginAttemptTime = 0;
let lastRefreshAttemptTime = 0;
const AUTH_CALL_LIMIT = 5; // Max auth calls per 10 seconds
const AUTH_WINDOW = 10000; // 10 second window
const authCallTimestamps: number[] = [];

// ============================================================================
// INFINITE LOOP DETECTION
// ============================================================================

export const detectInfiniteAuthLoop = (): boolean => {
  const now = Date.now();
  
  // Remove old timestamps outside window
  while (authCallTimestamps.length > 0 && authCallTimestamps[0] < now - AUTH_WINDOW) {
    authCallTimestamps.shift();
  }
  
  // If too many auth calls in short time, it's likely a loop
  if (authCallTimestamps.length >= AUTH_CALL_LIMIT) {
    console.error('[AUTH] ⚠️ INFINITE LOOP DETECTED: Too many auth calls in 10 seconds', {
      callCount: authCallTimestamps.length,
      timeWindow: AUTH_WINDOW,
    });
    return true;
  }
  
  authCallTimestamps.push(now);
  return false;
};

// ============================================================================
// SAFE TOKEN VALIDATION
// ============================================================================

export const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    // Token is valid if expiration is at least 1 minute in the future
    return payload.exp && payload.exp > now + 60;
  } catch (e) {
    return false;
  }
};

export const getTokenExpiry = (token: string | null): number | null => {
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
};

// ============================================================================
// ENHANCED LOGIN WITH REQUEST DEDUPLICATION
// ============================================================================

export const enhancedLogin = async (
  email: string,
  password: string,
  timeoutMs: number = 30000
): Promise<{ accessToken: string; refreshToken: string; user: any }> => {
  
  // Detect infinite loop
  if (detectInfiniteAuthLoop()) {
    throw new Error('Authentication loop detected. Please refresh and try again.');
  }
  
  const now = Date.now();
  
  // Prevent too-frequent login attempts (minimum 500ms between attempts)
  const timeSinceLastAttempt = now - lastLoginAttemptTime;
  if (timeSinceLastAttempt < 500) {
    throw new Error('Too many login attempts. Please wait.');
  }
  
  // Return existing request if one is in progress
  if (activeLoginRequest) {
    console.debug('[AUTH] Returning existing login request (deduplication)');
    return activeLoginRequest;
  }
  
  // Cancel any previous request
  if (loginAbortController) {
    loginAbortController.abort();
  }
  
  loginAbortController = new AbortController();
  lastLoginAttemptTime = now;
  
  const performLogin = async (): Promise<{ accessToken: string; refreshToken: string; user: any }> => {
    try {
      console.debug('[AUTH] Starting login request for:', email);
      
      const controller = loginAbortController;
      if (!controller) throw new Error('Abort controller not initialized');
      
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const text = await response.text();
        let result;
        
        try {
          result = JSON.parse(text);
        } catch (e) {
          console.error('[AUTH] Failed to parse login response:', text);
          throw new Error(`Server error (${response.status}): Unexpected response format.`);
        }
        
        if (!response.ok) {
          throw new Error(result.message || result.error || 'Failed to log in');
        }
        
        // Validate response structure
        if (!result.accessToken || !result.refreshToken) {
          throw new Error('Invalid login response: missing tokens');
        }
        
        console.debug('[AUTH] ✅ Login successful for:', email);
        
        return {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user || { email },
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Handle abort
        if (fetchError.name === 'AbortError') {
          throw new Error('Login request timed out. Please try again.');
        }
        
        throw fetchError;
      }
    } finally {
      activeLoginRequest = null;
      loginAbortController = null;
    }
  };
  
  activeLoginRequest = performLogin();
  return activeLoginRequest;
};

// ============================================================================
// SAFE TOKEN REFRESH WITH RETRY LIMITS
// ============================================================================

const MAX_REFRESH_RETRIES = 2;
let refreshRetryCount = 0;

export const safeTokenRefresh = async (
  refreshToken: string,
  timeoutMs: number = 15000
): Promise<{ accessToken: string; refreshToken: string } | null> => {
  
  // Detect infinite loop
  if (detectInfiniteAuthLoop()) {
    console.error('[AUTH] Infinite loop detected during token refresh');
    return null;
  }
  
  const now = Date.now();
  
  // Check if token is even worth refreshing
  if (!isTokenValid(refreshToken)) {
    console.warn('[AUTH] Refresh token is invalid or expired');
    return null;
  }
  
  // Prevent too-frequent refresh attempts (minimum 1 second between attempts)
  const timeSinceLastRefresh = now - lastRefreshAttemptTime;
  if (timeSinceLastRefresh < 1000) {
    console.debug('[AUTH] Refresh throttled (< 1 second since last attempt)');
    return null;
  }
  
  // Enforce retry limit
  if (refreshRetryCount >= MAX_REFRESH_RETRIES) {
    console.error('[AUTH] Max refresh retries exceeded. Logout required.');
    clearAuthState();
    return null;
  }
  
  // Return existing request if one is in progress
  if (activeRefreshRequest) {
    console.debug('[AUTH] Returning existing refresh request (deduplication)');
    return activeRefreshRequest;
  }
  
  // Cancel any previous refresh request
  if (refreshAbortController) {
    refreshAbortController.abort();
  }
  
  refreshAbortController = new AbortController();
  lastRefreshAttemptTime = now;
  refreshRetryCount++;
  
  const performRefresh = async (): Promise<{ accessToken: string; refreshToken: string } | null> => {
    try {
      console.debug('[AUTH] Starting token refresh. Attempt:', refreshRetryCount);
      
      const controller = refreshAbortController;
      if (!controller) return null;
      
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          if (response.status === 403) {
            // Refresh token is invalid/expired
            console.warn('[AUTH] Refresh token rejected by server');
            clearAuthState();
            return null;
          }
          throw new Error('Token refresh failed');
        }
        
        const result = await response.json();
        
        if (!result.accessToken || !result.refreshToken) {
          throw new Error('Invalid refresh response');
        }
        
        // Reset retry count on success
        refreshRetryCount = 0;
        console.debug('[AUTH] ✅ Token refresh successful');
        
        return {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.warn('[AUTH] Token refresh request timed out');
          return null;
        }
        
        throw fetchError;
      }
    } catch (error) {
      console.error('[AUTH] Token refresh error:', error);
      return null;
    } finally {
      activeRefreshRequest = null;
      refreshAbortController = null;
    }
  };
  
  activeRefreshRequest = performRefresh();
  return activeRefreshRequest;
};

// ============================================================================
// AUTHENTICATION STATE MANAGEMENT
// ============================================================================

export const saveAuthState = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
};

export const getAuthState = (): AuthState => {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  
  return {
    isAuthenticated: !!(accessToken || refreshToken),
    accessToken,
    refreshToken,
    error: null,
    isLoading: false,
    lastAuthTime: Date.now(),
  };
};

export const clearAuthState = () => {
  console.debug('[AUTH] Clearing auth state');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  
  // Cancel any in-flight requests
  if (loginAbortController) {
    loginAbortController.abort();
    loginAbortController = null;
  }
  if (refreshAbortController) {
    refreshAbortController.abort();
    refreshAbortController = null;
  }
  
  activeLoginRequest = null;
  activeRefreshRequest = null;
  refreshRetryCount = 0;
};

// ============================================================================
// BACKWARD COMPATIBILITY - OLD isAuthenticated() FUNCTION
// ============================================================================

export const isAuthenticated = (): boolean => {
  const { isAuthenticated: auth } = getAuthState();
  return auth && isTokenValid(localStorage.getItem('accessToken'));
};

export const getAccessToken = (): string | null => {
  const token = localStorage.getItem('accessToken');
  return isTokenValid(token) ? token : null;
};

export const logout = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (refreshToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {
        // Ignore server-side logout errors
      });
    } catch (error) {
      console.error('[AUTH] Logout error:', error);
    }
  }
  
  clearAuthState();
  
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// ============================================================================
// MONITORING & DEBUGGING
// ============================================================================

export const getAuthMetrics = () => ({
  hasActiveLoginRequest: !!activeLoginRequest,
  hasActiveRefreshRequest: !!activeRefreshRequest,
  lastLoginAttemptTime,
  lastRefreshAttemptTime,
  refreshRetryCount,
  authCallTimestamps: [...authCallTimestamps],
  currentAuthCallCount: authCallTimestamps.length,
});
