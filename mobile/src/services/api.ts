import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// Backend API URL
const API_BASE_URL = __DEV__
  ? 'http://192.168.0.123:3001' // Your local network IP address for development
  : 'https://fleming-crm-api.fly.dev'; // Production API URL (Fly.io)

const TOKEN_KEY = 'fleming_auth_token';

// Lets AuthContext react when the API layer detects an invalid session (401),
// so AppNavigator flips to the Login stack instead of silently failing requests
type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => { unauthenticatedListeners.delete(listener); };
}

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (!this.token) {
          this.token = await SecureStore.getItemAsync(TOKEN_KEY);
        }

        if (this.token && config.headers) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - clear it and tell the UI
          await this.clearToken();
          unauthenticatedListeners.forEach(listener => listener());
        }
        return Promise.reject(error);
      }
    );
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync(TOKEN_KEY);
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  getClient(): AxiosInstance {
    return this.client;
  }

  getBaseUrl(): string {
    return API_BASE_URL;
  }
}

export const apiService = new ApiService();
export default apiService.getClient();
