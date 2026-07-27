import { apiClient } from '@/services/api.client';
import type { ApiResponse, ApiResponsePaginated, PaginatedParams } from '@/services/api.types';
import type { StudentListItem, StudentDetail, CreateStudentPayload, UpdateStudentPayload } from '../types/student.types';
import { env } from '@/config/env';
import { mockStudentList, mockStudentDetail } from '../constants/student.mock';

// Student API service — all endpoints use env.apiBaseUrl via apiClient
export const studentService = {
  async list(params: PaginatedParams & { classId?: string; status?: string }): Promise<ApiResponsePaginated<StudentListItem>> {
    if (env.enableMock) return mockStudentList(params);
    const response = await apiClient.get('/students', { params });
    return response.data;
  },

  async getById(id: string): Promise<ApiResponse<StudentDetail>> {
    if (env.enableMock) return mockStudentDetail(id);
    const response = await apiClient.get(`/students/${id}`);
    return response.data;
  },

  async create(data: CreateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    if (env.enableMock) {
      return { success: true, data: { ...data, id: Date.now().toString() } as any, message: 'Siswa berhasil ditambahkan' };
    }
    const response = await apiClient.post('/students', data);
    return response.data;
  },

  async update(id: string, data: UpdateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    if (env.enableMock) {
      return { success: true, data: { ...data, id } as any, message: 'Data siswa berhasil diperbarui' };
    }
    const response = await apiClient.put(`/students/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    if (env.enableMock) {
      return { success: true, data: undefined, message: 'Siswa berhasil dihapus' };
    }
    const response = await apiClient.delete(`/students/${id}`);
    return response.data;
  },

  async importExcel(file: File): Promise<ApiResponse<{ imported: number; skipped: number; errors: string[] }>> {
    if (env.enableMock) {
      return { success: true, data: { imported: 50, skipped: 2, errors: [] }, message: 'Import berhasil' };
    }
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/students/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async exportData(format: 'excel' | 'pdf', params?: PaginatedParams): Promise<Blob> {
    if (env.enableMock) return new Blob(['mock'], { type: 'application/octet-stream' });
    const response = await apiClient.get('/students/export', { params: { format, ...params }, responseType: 'blob' });
    return response.data;
  },
};
