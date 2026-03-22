import api, { apiService } from './api';
import { AuthResponse, User } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });

    if (response.data.token) {
      await apiService.setToken(response.data.token);
    }

    return response.data;
  },

  async logout(): Promise<void> {
    await apiService.clearToken();
  },

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await api.get<{ user: User }>('/api/auth/me');
    return response.data;
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await apiService.getToken();
    if (!token) return false;

    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  },
};
