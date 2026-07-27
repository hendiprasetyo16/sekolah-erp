import apiClient from '@/services/api.client';
import type { PaginatedResponse } from '@/types/common.types';
import type { TeacherDetail, TeacherListItem, TeacherListParams, CreateTeacherPayload, UpdateTeacherPayload } from '../types/teacher.types';

class TeacherService {
  private readonly baseUrl = '/teachers';

  async list(params?: TeacherListParams) {
    return apiClient.get<PaginatedResponse<TeacherListItem>>(this.baseUrl, { params });
  }

  async getById(id: string) {
    return apiClient.get<TeacherDetail>(`${this.baseUrl}/${id}`);
  }

  async create(data: CreateTeacherPayload) {
    return apiClient.post<TeacherDetail>(this.baseUrl, data);
  }

  async update(id: string, data: UpdateTeacherPayload) {
    return apiClient.put<TeacherDetail>(`${this.baseUrl}/${id}`, data);
  }

  async delete(id: string) {
    return apiClient.delete(`${this.baseUrl}/${id}`);
  }
}

export const teacherService = new TeacherService();
