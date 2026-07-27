import { apiClient } from '@/services/api.client';
import type { ApiResponse } from '@/services/api.types';
import { env } from '@/config/env';
import { mockUsers, mockSchool, mockAcademicYear } from '@/constants/mock-data';
import type { User, School, AcademicYear } from '@/types/common.types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  school: School;
  academicYear: AcademicYear;
  token: string;
  refreshToken: string;
}

export const authService = {
  async login(payload: LoginPayload): Promise<ApiResponse<LoginResponse>> {
    if (env.enableMock) {
      await new Promise(resolve => setTimeout(resolve, 800));

      const userEntry = Object.values(mockUsers).find(u => u.email === payload.email);
      if (!userEntry || payload.password !== 'admin123') {
        return { success: false, data: null as any, message: 'Email atau kata sandi salah' };
      }

      return {
        success: true,
        data: {
          user: userEntry,
          school: mockSchool,
          academicYear: mockAcademicYear,
          token: `mock-jwt-${Date.now()}`,
          refreshToken: `mock-refresh-${Date.now()}`,
        },
        message: 'Login berhasil',
      };
    }

    const response = await apiClient.post('/auth/login', payload);
    return response.data;
  },

  async logout(): Promise<void> {
    if (env.enableMock) return;
    await apiClient.post('/auth/logout');
  },

  async getProfile(): Promise<ApiResponse<User>> {
    if (env.enableMock) {
      return { success: true, data: mockUsers.admin };
    }
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};
