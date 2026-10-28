import axios from 'axios';

const apiUrl = import.meta.env.VITE_API_URL || '/api';

export const apiBase = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;

const apiClient = axios.create({ baseURL: apiUrl });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
