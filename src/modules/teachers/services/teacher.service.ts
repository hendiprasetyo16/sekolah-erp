// src/modules/teachers/services/teacher.service.ts
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ApiResponse,
  ApiResponsePaginated,
} from '@/services/api.types';
import type {
  TeacherListItem,
  TeacherDetail,
  TeacherListParams,
  CreateTeacherPayload,
  UpdateTeacherPayload,
  TeacherBulkImportItem,
  TeacherBulkImportResult,
  PhotoRetentionDays,
  TeacherPhotoHistoryItem,
} from '../types/teacher.types';

interface BulkImportTeachersRpcResponse {
  success: boolean;
  inserted: number;
  updated: number;
  count: number;
  message: string;
}

interface UpdateTeacherPhotoRpcResponse {
  success: boolean;
  retentionDays: number;
  photoUrl: string | null;
}

interface SetRetentionDaysRpcResponse {
  success: boolean;
  retentionDays: PhotoRetentionDays;
}

const ALLOWED_SORT_COLUMNS = new Set([
  'fullName',
  'nip',
  'nuptk',
  'position',
  'status',
  'joinDate',
  'createdAt',
]);

const BULK_IMPORT_CHUNK_SIZE = 250;
const BULK_DELETE_CHUNK_SIZE = 200;
const TEACHER_PHOTOS_BUCKET = 'teacher-photos';
const MAX_RAW_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB sebelum kompresi
const MAX_STORED_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB batas bucket Supabase
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Memvalidasi dan membersihkan string UUID agar aman dikirim ke query PostgreSQL.
 */
export const normalizeTeacherSchoolId = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
};

const assertValidUuid = (id: string, label = 'ID guru'): string => {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`${label} tidak valid.`);
  }
  return trimmed;
};

// ============================================================================
// HELPER KOMPRESI & VALIDASI FOTO PROFIL PTK
// ============================================================================
const compressTeacherPhotoFile = async (
  file: File
): Promise<{ blob: Blob; contentType: string; extension: string }> => {
  if (!ALLOWED_PHOTO_MIME_TYPES.has(file.type)) {
    throw new Error('Format foto harus berupa JPG, PNG, atau WEBP.');
  }

  if (file.size > MAX_RAW_PHOTO_BYTES) {
    throw new Error('Ukuran file mentah maksimal 15 MB.');
  }

  // Jika lingkungan non-browser atau gagal decode canvas, gunakan file asli selama <= 2MB
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    if (file.size > MAX_STORED_PHOTO_BYTES) {
      throw new Error('Ukuran foto maksimal 2 MB.');
    }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    return { blob: file, contentType: file.type, extension: ext };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error('File gambar rusak atau tidak dapat dibaca.'));
      imageEl.src = objectUrl;
    });

    const maxDimension = 800;
    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, targetWidth);
    canvas.height = Math.max(1, targetHeight);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (file.size > MAX_STORED_PHOTO_BYTES) {
        throw new Error('Ukuran foto maksimal 2 MB.');
      }
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      return { blob: file, contentType: file.type, extension: ext };
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const webpBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.85);
    });

    if (webpBlob && webpBlob.size > 0 && webpBlob.size <= MAX_STORED_PHOTO_BYTES) {
      return { blob: webpBlob, contentType: 'image/webp', extension: 'webp' };
    }

    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.85);
    });

    if (jpegBlob && jpegBlob.size > 0 && jpegBlob.size <= MAX_STORED_PHOTO_BYTES) {
      return { blob: jpegBlob, contentType: 'image/jpeg', extension: 'jpg' };
    }

    throw new Error('Ukuran foto setelah kompresi masih melebihi 2 MB. Gunakan foto lain.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

// ============================================================================
// HELPER NORMALISASI & SANITASI DATA
// ============================================================================
const cleanNullableText = (value?: unknown): string | null => {
  if (value === undefined || value === null) return null;
  // Hapus tanda petik tunggal di awal (sering muncul pada ekspor Excel Dapodik untuk NIK/NUPTK/NIP)
  const trimmed = String(value)
    .replace(/^'+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed || trimmed === '(tidak diisi)' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  return trimmed;
};

const normalizeBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === 'ya' || v === 'y' || v === '1' || v === 'sudah';
  }
  return false;
};

const normalizeGender = (value?: unknown): 'L' | 'P' | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'L' || upper === 'LAKI-LAKI' || upper === 'LAKILAKI' || upper === 'PRIA') {
    return 'L';
  }
  if (upper === 'P' || upper === 'PEREMPUAN' || upper === 'WANITA') {
    return 'P';
  }
  return null;
};

const normalizeReligion = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KATHOLIK') return 'KATOLIK';
  if (upper === 'BUDHA') return 'BUDDHA';
  if (upper.includes('KEPERCAYAAN')) return 'KEPERCAYAAN';
  return upper;
};

const normalizeMaritalStatus = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KAWIN') return 'Kawin';
  if (upper === 'BELUM KAWIN') return 'Belum Kawin';
  if (upper === 'JANDA/DUDA' || upper === 'JANDA' || upper === 'DUDA') {
    return 'Janda/Duda';
  }
  return cleaned;
};

const normalizeNationality = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  if (cleaned.toUpperCase() === 'ID') return 'Indonesia';
  return cleaned;
};

const normalizeTeacherFields = <T extends Record<string, unknown>>(
  raw: T
): Record<string, unknown> => {
  const data: Record<string, unknown> = { ...raw };

  // Hapus field yang dikelola otomatis oleh database
  delete data.id;
  delete data.userId;
  delete data.createdAt;
  delete data.updatedAt;

  if ('fullName' in data && typeof data.fullName === 'string') {
    data.fullName = data.fullName.replace(/\s+/g, ' ').trim();
  }
  if ('gender' in data && data.gender !== undefined) {
    const normalizedGender = normalizeGender(data.gender);
    if (normalizedGender) {
      data.gender = normalizedGender;
    }
  }
  if ('religion' in data) {
    data.religion = normalizeReligion(data.religion);
  }
  if ('statusPerkawinan' in data) {
    data.statusPerkawinan = normalizeMaritalStatus(data.statusPerkawinan);
  }
  if ('kewarganegaraan' in data) {
    data.kewarganegaraan = normalizeNationality(data.kewarganegaraan);
  }

  const nullableStringFields = [
    'nip',
    'nuptk',
    'nik',
    'noKk',
    'birthDate',
    'birthPlace',
    'address',
    'dusun',
    'rt',
    'rw',
    'kelurahan',
    'kecamatan',
    'city',
    'province',
    'postalCode',
    'telepon',
    'phone',
    'email',
    'photoUrl',
    'education',
    'major',
    'university',
    'status',
    'position',
    'tugasTambahan',
    'certificationNumber',
    'joinDate',
    'subjects',
    'skCpns',
    'tanggalCpns',
    'skPengangkatan',
    'tmtPengangkatan',
    'lembagaPengangkatan',
    'pangkatGolongan',
    'sumberGaji',
    'tmtPns',
    'karpeg',
    'namaIbuKandung',
    'statusPerkawinan',
    'namaSuamiIstri',
    'nipSuamiIstri',
    'pekerjaanSuamiIstri',
    'karisKarsu',
    'npwp',
    'namaWajibPajak',
    'bank',
    'nomorRekeningBank',
    'rekeningAtasNama',
    'lintang',
    'bujur',
    'nuks',
  ];

  for (const field of nullableStringFields) {
    if (field in data) {
      data[field] = cleanNullableText(data[field]);
    }
  }

  // Standarisasi huruf kapital untuk kode pendidikan & status kepegawaian
  if (typeof data.education === 'string') {
    data.education = data.education.toUpperCase();
  }
  if (typeof data.status === 'string') {
    data.status = data.status.toUpperCase();
  }

  if (data.telepon === '0') {
    data.telepon = null;
  }

  const booleanFields = [
    'isCertified',
    'isActive',
    'sudahLisensiKepalaSekolah',
    'pernahDiklatKepengawasan',
    'keahlianBraille',
    'keahlianBahasaIsyarat',
  ];

  for (const field of booleanFields) {
    if (field in data && data[field] !== undefined && data[field] !== null) {
      data[field] = normalizeBooleanFlag(data[field]);
    }
  }

  if ('baseSalary' in data) {
    const val = data.baseSalary;
    if (val === undefined || val === null || val === '' || Number.isNaN(Number(val))) {
      data.baseSalary = null;
    } else {
      const numericSalary = Number(val);
      if (numericSalary < 0) {
        throw new Error('Gaji pokok tidak boleh bernilai negatif.');
      }
      data.baseSalary = numericSalary;
    }
  }

  if ('maxHoursPerWeek' in data) {
    const val = Number(data.maxHoursPerWeek);
    data.maxHoursPerWeek = !Number.isNaN(val) && val > 0 ? Math.trunc(val) : 24;
  }

  return data;
};

// ============================================================================
// ERROR HANDLER POSTGRESQL & JARINGAN
// ============================================================================
const handleDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan saat memproses data guru.';
  const lowerMsg = message.toLowerCase();

  const rowPrefixMatch = message.match(/(Impor gagal pada baris ke-\d+:)/i);
  const rowPrefix = rowPrefixMatch ? `${rowPrefixMatch[1]} ` : '';

  if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
    message = 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
  } else if (pgError?.code === '23505' || lowerMsg.includes('unique constraint')) {
    if (lowerMsg.includes('nuptk')) {
      message = `${rowPrefix}NUPTK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nik')) {
      message = `${rowPrefix}NIK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nip')) {
      message = `${rowPrefix}NIP tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data guru tersebut sudah terdaftar (Duplikat).`;
    }
  } else if (pgError?.code === '23502') {
    message = `${rowPrefix}Terdapat kolom wajib yang masih kosong. Pastikan semua data wajib sudah terisi.`;
  } else if (pgError?.code === '23503') {
    message =
      'Operasi gagal karena data guru masih terhubung dengan modul lain (wali kelas, jadwal pelajaran, atau presensi).';
  } else if (pgError?.code === '23514') {
    message = `${rowPrefix}Nilai input tidak memenuhi aturan validasi data (cek Gaji Pokok >= 0 atau Jam Mengajar > 0).`;
  } else if (pgError?.code === '22007' || pgError?.code === '22008') {
    message = `${rowPrefix}Format tanggal tidak valid. Gunakan format YYYY-MM-DD.`;
  } else if (pgError?.code === '22P02') {
    message = `${rowPrefix}Format input angka, status, atau ID tidak valid.`;
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.';
  } else if (pgError?.code === 'PGRST116') {
    message = 'Data guru tidak ditemukan atau Anda tidak memiliki akses ke data ini.';
  }

  return new Error(message);
};

// ============================================================================
// SERVICE UTAMA MODUL GURU & PEGAWAI
// ============================================================================
export const teacherService = {
  async list(params: TeacherListParams): Promise<ApiResponsePaginated<TeacherListItem>> {
    const {
      schoolId,
      teacherId,
      page = 1,
      limit = 10,
      search,
      status,
      isCertified,
      isActive,
      sortBy = 'fullName',
      sortOrder = 'asc',
    } = params;

    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const validTeacherId = normalizeTeacherSchoolId(teacherId);
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

    let query = supabase
      .from('teachers')
      .select('*', { count: 'exact' });

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    if (validTeacherId) {
      query = query.eq('id', validTeacherId);
    }

    if (search && search.trim()) {
      const safeSearch = search
        .trim()
        .replace(/[,()\\]/g, '')
        .replace(/[%_]/g, '\\$&');
      if (safeSearch) {
        query = query.or(
          `fullName.ilike.%${safeSearch}%,nip.ilike.%${safeSearch}%,nuptk.ilike.%${safeSearch}%,nik.ilike.%${safeSearch}%,position.ilike.%${safeSearch}%`
        );
      }
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (isCertified !== undefined) {
      query = query.eq('isCertified', isCertified);
    }

    if (isActive !== undefined) {
      query = query.eq('isActive', isActive);
    }

    const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'fullName';
    const isAsc = sortOrder === 'asc';

    query = query.order(safeSortBy, { ascending: isAsc, nullsFirst: false });
    if (safeSortBy !== 'fullName') {
      query = query.order('fullName', { ascending: true, nullsFirst: false });
    }

    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw handleDbError(error);

    const mappedData = ((data || []) as TeacherDetail[]).map((item) => ({
      id: item.id,
      schoolId: item.schoolId,
      userId: item.userId ?? null,
      fullName: item.fullName,
      nip: item.nip ?? null,
      nuptk: item.nuptk ?? null,
      nik: item.nik ?? null,
      gender: item.gender,
      phone: item.phone ?? null,
      email: item.email ?? null,
      status: item.status ?? null,
      position: item.position ?? null,
      tugasTambahan: item.tugasTambahan ?? null,
      isCertified: Boolean(item.isCertified),
      isActive: item.isActive ?? true,
      photoUrl: item.photoUrl ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / safeLimit);

    return {
      success: true,
      data: {
        data: mappedData,
        meta: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages,
          hasNext: safePage < totalPages,
          hasPrev: safePage > 1,
        },
      },
      message: 'Berhasil mengambil data guru & pegawai',
    };
  },

  async getById(id: string, schoolId?: string): Promise<ApiResponse<TeacherDetail>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);

    let query = supabase
      .from('teachers')
      .select('*')
      .eq('id', validId);

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    const { data, error } = await query.single();
    if (error) throw handleDbError(error);

    return {
      success: true,
      data: data as TeacherDetail,
      message: 'Berhasil mengambil detail guru',
    };
  },

  async create(payload: CreateTeacherPayload): Promise<ApiResponse<TeacherDetail>> {
    const validSchoolId = normalizeTeacherSchoolId(payload.schoolId);
    if (!validSchoolId) {
      throw new Error('Identitas sekolah tujuan tidak valid.');
    }

    const normalized = normalizeTeacherFields(
      payload as CreateTeacherPayload & Record<string, unknown>
    );

    if (!normalized.fullName || typeof normalized.fullName !== 'string') {
      throw new Error('Nama lengkap guru wajib diisi.');
    }
    if (normalized.gender !== 'L' && normalized.gender !== 'P') {
      throw new Error('Jenis kelamin wajib dipilih (L atau P).');
    }

    normalized.schoolId = validSchoolId;

    const { data, error } = await supabase
      .from('teachers')
      .insert(normalized)
      .select('id, schoolId')
      .single();

    if (error) throw handleDbError(error);

    return this.getById(data.id, data.schoolId);
  },

  async update(id: string, payload: UpdateTeacherPayload): Promise<ApiResponse<TeacherDetail>> {
    const validId = assertValidUuid(id);
    const normalized = normalizeTeacherFields(
      payload as UpdateTeacherPayload & Record<string, unknown>
    );
    delete normalized.schoolId;

    // Ekstrak photoUrl agar perubahan foto selalu melalui RPC update_own_teacher_photo
    // sehingga histori foto lama & avatarUrl akun login tetap tersinkronisasi
    const hasPhotoField = 'photoUrl' in normalized;
    const incomingPhotoUrl = (normalized.photoUrl as string | null) ?? null;
    delete normalized.photoUrl;

    if ('fullName' in normalized && !normalized.fullName) {
      throw new Error('Nama lengkap guru tidak boleh dikosongkan.');
    }
    if ('gender' in normalized && normalized.gender !== 'L' && normalized.gender !== 'P') {
      throw new Error('Jenis kelamin tidak valid (gunakan L atau P).');
    }

    const { data: existing, error: fetchError } = await supabase
      .from('teachers')
      .select('id, schoolId, userId, fullName, photoUrl')
      .eq('id', validId)
      .single();

    if (fetchError) throw handleDbError(fetchError);

    if (Object.keys(normalized).length > 0) {
      const { error: updateError } = await supabase
        .from('teachers')
        .update(normalized)
        .eq('id', validId)
        .eq('schoolId', existing.schoolId);

      if (updateError) throw handleDbError(updateError);

      // Sinkronkan perubahan nama lengkap ke akun login (public.users) jika sudah tertaut
      if (
        existing.userId &&
        typeof normalized.fullName === 'string' &&
        normalized.fullName !== existing.fullName
      ) {
        try {
          await supabase
            .from('users')
            .update({ fullName: normalized.fullName })
            .eq('id', existing.userId)
            .eq('schoolId', existing.schoolId);

          const authState = useAuthStore.getState();
          if (authState.user && authState.user.id === existing.userId) {
            useAuthStore.setState({
              user: {
                ...authState.user,
                fullName: normalized.fullName,
              },
            });
          }
        } catch {
          // Best-effort sync (tidak menggagalkan update guru jika RLS users membatasi role Operator/TU)
        }
      }
    }

    if (hasPhotoField && incomingPhotoUrl !== (existing.photoUrl ?? null)) {
      await this.updateTeacherPhoto(validId, incomingPhotoUrl, existing.userId);
    }

    return this.getById(validId, existing.schoolId);
  },

  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);

    let query = supabase
      .from('teachers')
      .delete()
      .eq('id', validId);

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    // Gunakan .select('id') untuk mendeteksi jika RLS menolak penghapusan (0 baris terhapus)
    const { data, error } = await query.select('id');
    if (error) throw handleDbError(error);

    if (!data || data.length === 0) {
      throw new Error(
        'Data guru gagal dihapus. Pastikan data masih ada atau Anda memiliki peran Admin / Kepala Sekolah.'
      );
    }

    return {
      success: true,
      data: undefined,
      message: 'Data guru berhasil dihapus',
    };
  },

  async deleteMany(ids: string[], schoolId?: string): Promise<ApiResponse<{ deleted: number }>> {
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const uniqueIds = Array.from(
      new Set(
        ids
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => UUID_REGEX.test(item))
      )
    );

    if (uniqueIds.length === 0) {
      return {
        success: true,
        data: { deleted: 0 },
        message: 'Tidak ada data guru valid yang dipilih',
      };
    }

    let totalDeleted = 0;

    for (let i = 0; i < uniqueIds.length; i += BULK_DELETE_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BULK_DELETE_CHUNK_SIZE);
      let query = supabase
        .from('teachers')
        .delete()
        .in('id', chunk);

      if (validSchoolId) {
        query = query.eq('schoolId', validSchoolId);
      }

      const { data, error } = await query.select('id');
      if (error) throw handleDbError(error);
      totalDeleted += data?.length ?? 0;
    }

    if (totalDeleted === 0) {
      throw new Error(
        'Tidak ada data guru yang berhasil dihapus. Periksa hak akses Anda (khusus Admin / Kepala Sekolah).'
      );
    }

    return {
      success: true,
      data: { deleted: totalDeleted },
      message: `${totalDeleted} data guru berhasil dihapus`,
    };
  },

  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('schoolId', validSchoolId);

    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Seluruh data guru & pegawai dikosongkan',
    };
  },

  async exportAll(schoolId?: string): Promise<ApiResponse<TeacherDetail[]>> {
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const allRows: TeacherDetail[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      let query = supabase
        .from('teachers')
        .select('*')
        .order('fullName', { ascending: true })
        .range(from, from + batchSize - 1);

      if (validSchoolId) {
        query = query.eq('schoolId', validSchoolId);
      }

      const { data, error } = await query;
      if (error) throw handleDbError(error);

      if (data && data.length > 0) {
        allRows.push(...(data as TeacherDetail[]));
      }
      if (!data || data.length < batchSize) break;
    }

    return {
      success: true,
      data: allRows,
      message: 'Berhasil mengambil semua data guru lengkap',
    };
  },

  async bulkImport(
    payload: TeacherBulkImportItem[]
  ): Promise<ApiResponse<TeacherBulkImportResult>> {
    if (!payload || payload.length === 0) {
      throw new Error('Data impor guru kosong.');
    }

    const sanitizedBatch = payload.map((item) => {
      const {
        id,
        schoolId: itemSchoolId,
        diffAction: _diffAction,
        diffFields: _diffFields,
        ...rest
      } = item;
      void [_diffAction, _diffFields];

      const normalizedCore = normalizeTeacherFields(rest);
      const validItemSchoolId = normalizeTeacherSchoolId(itemSchoolId);
      const validItemId = id && UUID_REGEX.test(id.trim()) ? id.trim() : undefined;

      return {
        ...(validItemId ? { id: validItemId } : {}),
        ...(validItemSchoolId ? { schoolId: validItemSchoolId } : {}),
        ...normalizedCore,
      };
    });

    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < sanitizedBatch.length; i += BULK_IMPORT_CHUNK_SIZE) {
      const chunk = sanitizedBatch.slice(i, i + BULK_IMPORT_CHUNK_SIZE);

      const { data, error } = await supabase.rpc('bulk_import_teachers', {
        batch_data: chunk,
      });

      if (error) {
        throw handleDbError(error);
      }

      const result = data as BulkImportTeachersRpcResponse;
      totalInserted += result?.inserted ?? 0;
      totalUpdated += result?.updated ?? 0;
    }

    return {
      success: true,
      data: {
        inserted: totalInserted,
        updated: totalUpdated,
      },
      message: `${totalInserted} data guru baru ditambahkan, ${totalUpdated} data diperbarui`,
    };
  },

  // ==========================================================================
  // MANAJEMEN FOTO PROFIL PTK & HISTORI RETENSI (SUPABASE STORAGE + RPC)
  // ==========================================================================

  /**
   * Mengompresi dan mengunggah foto profil ke bucket `teacher-photos`
   * dengan struktur folder wajib `{schoolId}/{teacherId}/{fileName}`.
   */
  async uploadTeacherPhoto(params: {
    schoolId: string;
    teacherId: string;
    file: File;
  }): Promise<{ publicUrl: string; storagePath: string }> {
    const validSchoolId = assertValidUuid(params.schoolId, 'Identitas sekolah');
    const validTeacherId = assertValidUuid(params.teacherId, 'ID guru');

    const { blob, contentType, extension } = await compressTeacherPhotoFile(params.file);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const storagePath = `${validSchoolId}/${validTeacherId}/${Date.now()}-${randomSuffix}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(TEACHER_PHOTOS_BUCKET)
      .upload(storagePath, blob, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        uploadError.message || 'Gagal mengunggah foto profil ke server penyimpanan.'
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(TEACHER_PHOTOS_BUCKET)
      .getPublicUrl(storagePath);

    return {
      publicUrl: publicUrlData.publicUrl,
      storagePath,
    };
  },

  /**
   * Memperbarui kolom `photoUrl` guru melalui RPC `update_own_teacher_photo`.
   * Foto sebelumnya otomatis diarsipkan ke `teacher_photo_history` dan `users.avatarUrl` disinkronkan.
   */
  async updateTeacherPhoto(
    teacherId: string,
    newPhotoUrl: string | null,
    linkedUserId?: string | null
  ): Promise<ApiResponse<UpdateTeacherPhotoRpcResponse>> {
    const validTeacherId = assertValidUuid(teacherId);
    const cleanUrl = typeof newPhotoUrl === 'string' ? newPhotoUrl.trim() : '';

    const { data, error } = await supabase.rpc('update_own_teacher_photo', {
      p_teacher_id: validTeacherId,
      p_new_photo_url: cleanUrl,
    });

    if (error) {
      throw handleDbError(error);
    }

    const result = data as UpdateTeacherPhotoRpcResponse;

    // Sinkronkan avatar pada auth store sesi aktif jika guru mengubah fotonya sendiri
    const authState = useAuthStore.getState();
    if (
      authState.user &&
      linkedUserId &&
      authState.user.id === linkedUserId
    ) {
      useAuthStore.setState({
        user: {
          ...authState.user,
          avatarUrl: result.photoUrl ?? undefined,
        },
      });
    }

    return {
      success: true,
      data: result,
      message: result.photoUrl
        ? 'Foto profil berhasil diperbarui'
        : 'Foto profil berhasil dihapus dari tampilan aktif',
    };
  },

  /**
   * Alur lengkap: kompresi -> unggah ke Storage -> simpan & arsipkan foto lama via RPC.
   */
  async uploadAndSaveTeacherPhoto(params: {
    schoolId: string;
    teacherId: string;
    file: File;
    linkedUserId?: string | null;
  }): Promise<ApiResponse<UpdateTeacherPhotoRpcResponse>> {
    const { publicUrl } = await this.uploadTeacherPhoto({
      schoolId: params.schoolId,
      teacherId: params.teacherId,
      file: params.file,
    });

    return this.updateTeacherPhoto(params.teacherId, publicUrl, params.linkedUserId);
  },

  /**
   * Mengambil daftar histori foto lama milik guru (Hanya SUPER_ADMIN yang lolos RLS).
   */
  async getPhotoHistory(teacherId: string): Promise<ApiResponse<TeacherPhotoHistoryItem[]>> {
    const validTeacherId = assertValidUuid(teacherId);

    const { data, error } = await supabase
      .from('teacher_photo_history')
      .select('*')
      .eq('teacherId', validTeacherId)
      .order('replacedAt', { ascending: false });

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: (data || []) as TeacherPhotoHistoryItem[],
      message: 'Berhasil mengambil histori foto profil',
    };
  },

  /**
   * Mengambil konfigurasi masa simpan histori foto (7, 14, atau 30 hari) pada sekolah terkait.
   */
  async getPhotoRetentionDays(schoolId: string): Promise<PhotoRetentionDays> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { data, error } = await supabase
      .from('schools')
      .select('settings')
      .eq('id', validSchoolId)
      .single();

    if (error) {
      throw handleDbError(error);
    }

    const rawDays = Number(
      (data?.settings as Record<string, unknown> | null)?.teacherPhotoRetentionDays
    );
    if (rawDays === 7 || rawDays === 14 || rawDays === 30) {
      return rawDays;
    }
    return 30;
  },

  /**
   * Mengatur masa simpan histori foto sekolah (7 / 14 / 30 hari) — Khusus SUPER_ADMIN.
   */
  async setPhotoRetentionDays(
    schoolId: string,
    days: PhotoRetentionDays
  ): Promise<ApiResponse<SetRetentionDaysRpcResponse>> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { data, error } = await supabase.rpc('set_teacher_photo_retention_days', {
      p_school_id: validSchoolId,
      p_days: days,
    });

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: data as SetRetentionDaysRpcResponse,
      message: `Masa simpan histori foto diatur menjadi ${days} hari`,
    };
  },

  /**
   * Menghapus satu arsip foto lama secara permanen (Storage + tabel histori) — Khusus SUPER_ADMIN.
   */
  async deletePhotoHistoryItem(item: TeacherPhotoHistoryItem): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(item.id, 'ID histori foto');

    if (item.storagePath && !item.storagePath.startsWith('http')) {
      await supabase.storage
        .from(TEACHER_PHOTOS_BUCKET)
        .remove([item.storagePath]);
    }

    const { error } = await supabase
      .from('teacher_photo_history')
      .delete()
      .eq('id', validId);

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: undefined,
      message: 'Arsip foto lama berhasil dihapus permanen',
    };
  },

  /**
   * Membersihkan seluruh arsip foto yang sudah melewati `expiresAt` — Khusus SUPER_ADMIN.
   */
  async purgeExpiredPhotoHistory(
    schoolId?: string
  ): Promise<ApiResponse<{ deleted: number }>> {
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const nowIso = new Date().toISOString();

    let selectQuery = supabase
      .from('teacher_photo_history')
      .select('id, storagePath')
      .lt('expiresAt', nowIso);

    if (validSchoolId) {
      selectQuery = selectQuery.eq('schoolId', validSchoolId);
    }

    const { data: expiredRows, error: fetchError } = await selectQuery;
    if (fetchError) {
      throw handleDbError(fetchError);
    }

    const rows = (expiredRows || []) as Array<{ id: string; storagePath: string }>;
    if (rows.length === 0) {
      return {
        success: true,
        data: { deleted: 0 },
        message: 'Tidak ada arsip foto kedaluwarsa yang perlu dibersihkan',
      };
    }

    const paths = rows
      .map((r) => r.storagePath)
      .filter((p) => Boolean(p) && !p.startsWith('http'));

    if (paths.length > 0) {
      await supabase.storage.from(TEACHER_PHOTOS_BUCKET).remove(paths);
    }

    const ids = rows.map((r) => r.id);
    const { error: deleteError } = await supabase
      .from('teacher_photo_history')
      .delete()
      .in('id', ids);

    if (deleteError) {
      throw handleDbError(deleteError);
    }

    return {
      success: true,
      data: { deleted: rows.length },
      message: `${rows.length} arsip foto kedaluwarsa berhasil dibersihkan`,
    };
  },
};