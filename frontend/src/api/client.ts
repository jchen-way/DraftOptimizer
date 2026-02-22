import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

// Extend config for retry flag
interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    const requestUrl = originalRequest.url ?? '';
    const isRefreshRequest = requestUrl.includes('/auth/refresh');
    if (isRefreshRequest) {
      return Promise.reject(error);
    }

    const is401 = error.response?.status === 401;
    const tokenExpired =
      (error.response?.data as { code?: string })?.code === 'TOKEN_EXPIRED';
    const shouldRetry = is401 && tokenExpired && !originalRequest._retry;

    if (shouldRetry) {
      originalRequest._retry = true;
      try {
        await apiClient.post('/auth/refresh', undefined, { withCredentials: true });
        return apiClient(originalRequest);
      } catch {
        if (typeof window !== 'undefined') {
          const protectedRoute = /^\/(dashboard|config|draft)(\/|$)/.test(window.location.pathname);
          if (protectedRoute) {
            window.location.href = '/login?reason=session-expired';
          }
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };
