import type { PaginatedResponse } from '@/types/common.types';

export interface TeacherListItem {
  id: string;
  fullName: string;
  nip?: string;
  nuptk?: string;
  gender: 'L' | 'P';
  phone?: string;
  email?: string;
  status?: string; // Diubah menjadi opsional agar sesuai database
  position?: string; // Diubah menjadi opsional agar sesuai database
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
  
  // --- KOLOM DAPODIK BARU ---
  tugasTambahan?: string;
  skCpns?: string;
  tanggalCpns?: string;
  skPengangkatan?: string;
  tmtPengangkatan?: string;
  lembagaPengangkatan?: string;
  pangkatGolongan?: string;
  sumberGaji?: string;
  namaIbuKandung?: string;
  statusPerkawinan?: string;
  namaSuamiIstri?: string;
  nipSuamiIstri?: string;
  pekerjaanSuamiIstri?: string;
  tmtPns?: string;
  sudahLisensiKepalaSekolah?: boolean;
  pernahDiklatKepengawasan?: boolean;
  keahlianBraille?: boolean;
  keahlianBahasaIsyarat?: boolean;
  npwp?: string;
  namaWajibPajak?: string;
  kewarganegaraan?: string;
  bank?: string;
  nomorRekeningBank?: string;
  rekeningAtasNama?: string;
  noKk?: string;
  karpeg?: string;
  karisKarsu?: string;
  lintang?: string;
  bujur?: string;
  nuks?: string;
}

export type CreateTeacherPayload = Omit<TeacherDetail, 'id' | 'photoUrl'>;
export type UpdateTeacherPayload = Partial<CreateTeacherPayload>;

export interface TeacherListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}