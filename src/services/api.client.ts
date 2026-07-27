import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';

// Token management — reads from localStorage to avoid circular deps with Zustand
function getAccessToken(): string | null {
  try {
    const stored = localStorage.getItem('sekolah-erp-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

function getRefreshToken(): string | null {
  try {
    const stored = localStorage.getItem('sekolah-erp-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.refreshToken ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

function clearAuthStorage(): void {
  localStorage.removeItem('sekolah-erp-auth');
}

// Create axios instance — URL from env, never hardcoded
const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor — attach JWT token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (env.enableDebug) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, {
        params: config.params,
        data: config.data,
      });
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle errors & token refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v?: unknown) => void; reject: (r?: unknown) => void }> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) { prom.reject(error); } else { prom.resolve(token); }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => {
    if (env.enableDebug) {
      console.log(`[API] Response:`, response.status, response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 — try token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${env.apiBaseUrl}/auth/refresh`, { refreshToken });
        const { token: newToken, refreshToken: newRefreshToken } = response.data.data;

        // Update stored tokens
        const stored = localStorage.getItem('sekolah-erp-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.state.token = newToken;
          parsed.state.refreshToken = newRefreshToken;
          localStorage.setItem('sekolah-erp-auth', JSON.stringify(parsed));
        }

        processQueue(null, newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);
        clearAuthStorage();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (env.enableDebug) {
      console.error(`[API] Error:`, error.response?.status, error.response?.data);
    }
    return Promise.reject(error);
  }
);

export { apiClient };
export default apiClient;
