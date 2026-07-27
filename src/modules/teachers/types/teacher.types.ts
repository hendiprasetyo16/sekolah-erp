import type { PaginatedResponse } from '@/types/common.types';

export interface TeacherListItem {
  id: string;
  fullName: string;
  nip?: string;
  nuptk?: string;
  gender: 'L' | 'P';
  phone?: string;
  email?: string;
  status: string;
  position: string;
  isCertified: boolean;
  isActive: boolean;
  photoUrl?: string;
}

export interface TeacherDetail extends TeacherListItem {
  nik?: string;
  birthDate?: string;
  birthPlace?: string;
  address?: string;
  education?: string;
  major?: string;
  university?: string;
  certificationNumber?: string;
  joinDate?: string;
  baseSalary?: number;
  subjects?: string;
  maxHoursPerWeek: number;
}

export type CreateTeacherPayload = Omit<TeacherDetail, 'id' | 'photoUrl'>;
export type UpdateTeacherPayload = Partial<CreateTeacherPayload>;

export interface TeacherListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}
