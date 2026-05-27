/**
 * useDebounceLogin Hook
 * 
 * Prevents:
 * - Multiple simultaneous login requests
 * - Button spam clicks
 * - Race conditions
 * - Renderer freezing from request flooding
 */

import { useCallback, useRef, useState, useEffect } from 'react';

interface UseDebounceLoginOptions {
  debounceMs?: number;
  maxConcurrent?: number;
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

export const useDebounceLogin = (options: UseDebounceLoginOptions = {}) => {
  const {
    debounceMs = 300,
    maxConcurrent = 1,
    onError,
    onSuccess,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const concurrentRequestsRef = useRef(0);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const debouncedLogin = useCallback(
    async (loginFn: () => Promise<any>) => {
      // Prevent concurrent requests
      if (concurrentRequestsRef.current >= maxConcurrent) {
        console.warn('[Login] Max concurrent requests reached');
        return;
      }

      // Check debounce
      const now = Date.now();
      if (now - lastSubmitTime < debounceMs) {
        console.debug('[Login] Debounce active, skipping request');
        return;
      }

      setError(null);

      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set debounce timer for next request
      debounceTimerRef.current = setTimeout(() => {
        setLastSubmitTime(Date.now());
      }, debounceMs);

      setIsLoading(true);
      concurrentRequestsRef.current++;

      try {
        const result = await Promise.race([
          loginFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Login request timeout')), 30000)
          ),
        ]);

        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Login failed';
        setError(errorMsg);
        onError?.(err instanceof Error ? err : new Error(errorMsg));
      } finally {
        setIsLoading(false);
        concurrentRequestsRef.current--;
      }
    },
    [lastSubmitTime, debounceMs, maxConcurrent, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
    setLastSubmitTime(0);
    concurrentRequestsRef.current = 0;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    debouncedLogin,
    isLoading,
    error,
    reset,
    canSubmit: !isLoading && concurrentRequestsRef.current < maxConcurrent,
  };
};
