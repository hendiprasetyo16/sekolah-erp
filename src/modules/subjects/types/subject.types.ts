// src/modules/subjects/types/subject.types.ts

export type SubjectCategory =
  | 'UMUM'
  | 'PILIHAN'
  | 'KEJURUAN'
  | 'MUATAN_LOKAL'
  | 'KOKURIKULER';

export interface SubjectItem {
  id: string;
  schoolId: string;
  code: string | null;
  name: string;
  category: string;
  sortOrder: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectPayload {
  schoolId: string;
  code?: string | null;
  name: string;
  category: string;
  sortOrder: number;
  description?: string | null;
  isActive: boolean;
}

export interface SubjectFormState {
  code: string;
  name: string;
  category: SubjectCategory;
  sortOrder: number;
  description: string;
  isActive: boolean;
}