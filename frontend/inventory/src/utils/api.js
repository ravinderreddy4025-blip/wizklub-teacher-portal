import axios from 'axios';

export function resolveApiBase() {
  if (import.meta.env.VITE_INVENTORY_API_URL) {
    return String(import.meta.env.VITE_INVENTORY_API_URL).replace(/\/$/, '');
  }
  const appBase = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const isStandaloneInventory = /\/inventory$/i.test(appBase) || appBase === '/inventory';

  if (import.meta.env.DEV) {
    if (isStandaloneInventory) {
      return appBase ? `${appBase}/api` : 'http://127.0.0.1:5002/api';
    }
    return appBase
      ? `${appBase}/inventory-api`.replace(/\/{2,}/g, '/')
      : 'http://127.0.0.1:5002/api';
  }

  if (isStandaloneInventory) {
    return `${appBase}/api`.replace(/\/{2,}/g, '/');
  }
  return appBase
    ? `${appBase}/inventory-api`.replace(/\/{2,}/g, '/')
    : '/inventory-api';
}

const baseURL = resolveApiBase()

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const userInfo = sessionStorage.getItem('userInfo');
  if (userInfo) {
    const parsed = JSON.parse(userInfo);
    const { token, wizklubAccessToken } = parsed;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (wizklubAccessToken) {
      config.headers['X-Wizklub-Access-Token'] = wizklubAccessToken;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
