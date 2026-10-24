import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Central configuration for API endpoints.
// Auto-detects local host IP from Expo Constants when running in local development mode
// so that testing on physical mobile devices connects successfully to the server.
// Use the VPS for both Expo Go and production builds.
const USE_CLOUD_BACKEND = true;
const VPS_BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'http://50.6.44.247:5100/api/v1';

const getApiUrl = () => {
  // Always use the live cloud backend if USE_CLOUD_BACKEND is enabled or if in production build
  if (USE_CLOUD_BACKEND || (typeof __DEV__ !== 'undefined' && !__DEV__)) {
    console.log('[API] Using VPS backend:', VPS_BACKEND_URL);
    return VPS_BACKEND_URL;
  }

  // 1. Web Platform (Browser)
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api/v1';
  }

  // 2. Auto-detect host machine IP from Expo Constants (Works automatically for Wi-Fi & LAN)
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const localIp = hostUri.split(':')[0];
    if (localIp && localIp !== 'localhost' && localIp !== '127.0.0.1') {
      const url = `http://${localIp}:5000/api/v1`;
      console.log('[API] Auto-detected Expo host IP:', url);
      return url;
    }
  }

  // 3. Android Emulator fallback
  if (Platform.OS === 'android' && (Constants.expoConfig?.hostUri?.includes('10.0.2.2') || Constants.manifest?.hostUri?.includes('10.0.2.2'))) {
    return 'http://10.0.2.2:5000/api/v1';
  }

  // 4. Fallback to active laptop Wi-Fi IP
  const defaultWifiIp = '192.168.0.101';
  console.log('[API] Using Wi-Fi LAN IP fallback:', `http://${defaultWifiIp}:5000/api/v1`);
  return `http://${defaultWifiIp}:5000/api/v1`;
};

export const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
    'x-client-type': 'mobile',
  },
});

let logoutHandler = null;
let tokenRefreshHandler = null;

export const setLogoutHandler = (handler) => {
  logoutHandler = handler;
};

export const setTokenRefreshHandler = (handler) => {
  tokenRefreshHandler = handler;
};

// In-flight GET request deduplication map
const pendingGetRequests = new Map();

// Request interceptor: Attach Access Token & Deduplicate GET requests
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error('Error reading access token from storage:', err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Token refresh mutex — prevents concurrent refresh storms that would trigger RTR security revocation
let isRefreshing = false;
let refreshSubscribers = [];

function onTokenRefreshed(newToken) {
  refreshSubscribers.forEach((sub) => sub.resolve(newToken));
  refreshSubscribers = [];
}

function onTokenRefreshFailed(error) {
  refreshSubscribers.forEach((sub) => sub.reject(error));
  refreshSubscribers = [];
}

function addRefreshSubscriber(resolve, reject) {
  refreshSubscribers.push({ resolve, reject });
}

// Response interceptor: Handle expired tokens & auto-refresh
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    // Avoid infinite loops and refresh loops
    const isAuthRoute = originalRequest.url && (
      originalRequest.url.includes('/auth/login') ||
      originalRequest.url.includes('/auth/register') ||
      originalRequest.url.includes('/auth/otp/') ||
      originalRequest.url.includes('/auth/forgot-password') ||
      originalRequest.url.includes('/auth/reset-password')
    );

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;

      // If a refresh is already in progress, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          addRefreshSubscriber(
            (newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            },
            (err) => {
              reject(err);
            }
          );
        });
      }

      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Call rotate endpoint
        const refreshResponse = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'x-client-type': 'mobile',
          }
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = refreshResponse.data;

        // Save new credentials
        await AsyncStorage.setItem('accessToken', newAccessToken);
        await AsyncStorage.setItem('refreshToken', newRefreshToken);
        await AsyncStorage.setItem('userProfile', JSON.stringify(user));

        if (tokenRefreshHandler) {
          tokenRefreshHandler(newAccessToken);
        }

        // Notify all queued requests with the new token
        isRefreshing = false;
        onTokenRefreshed(newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onTokenRefreshFailed(refreshError);

        // If refresh fails, clear credentials and sign out
        await AsyncStorage.removeItem('accessToken');
        await AsyncStorage.removeItem('refreshToken');
        await AsyncStorage.removeItem('userProfile');

        if (logoutHandler) {
          logoutHandler();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

api.getPublicAlerts = async () => {
  return api.get('/settings/public');
};

export default api;
