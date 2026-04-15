import axios, { type AxiosRequestHeaders } from 'axios';

// Axios instance with global no-cache headers
const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

// Attach access token and enforce no-cache on every request
api.interceptors.request.use((config) => {
  const headers: AxiosRequestHeaders = (config.headers || {}) as AxiosRequestHeaders;

  const token = localStorage.getItem('accessToken');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  headers['Cache-Control'] = 'no-cache';
  headers.Pragma = 'no-cache';
  headers.Expires = '0';

  config.headers = headers;
  return config;
});

// Provide a logout helper compatible with previous ApiClient.logout()
// Called as: await api.logout()
// It will notify backend (best-effort) and always clear local tokens.
export async function logout(): Promise<void> {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await api.post('/api/auth/logout', { refreshToken }).catch(() => {
        // ignore network/backend errors on logout
      });
    }
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

// For backwards compatibility, allow api.logout()
(api as any).logout = logout;

export default api;