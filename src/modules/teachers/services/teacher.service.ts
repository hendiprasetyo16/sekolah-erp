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
  BulkImportTeachersRpcResponse,
  PhotoRetentionDays,
  TeacherPhotoHistoryItem,
  UpdateTeacherPhotoRpcResponse,
  SetRetentionDaysRpcResponse,
  TeacherSecurityAuditItem,
  SecurityAuditLogEntry,
  AcademicYearOption,
  TeacherOptionItem,
  SubjectOptionItem,
  ClassOptionItem,
  TeacherSubjectAssignmentItem,
  AssignmentFormOptionsResult,
  AssignTeacherSubjectPayload,
  UpdateTeacherSubjectAssignmentPayload,
} from '../types/teacher.types';

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
const MAX_RAW_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_STORED_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const assertValidWeeklyHours = (rawHours: unknown): number => {
  const parsed = Math.trunc(Number(rawHours));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 40) {
    throw new Error('Jam pelajaran per minggu harus antara 1 hingga 40 JP.');
  }
  return parsed;
};

// ============================================================================
// HELPER PENAMAAN FOLDER & FILE STORAGE (URL-SAFE SLUG + WAKTU WIB)
// ============================================================================
const slugifyStorageSegment = (raw?: string | null, fallback = 'item'): string => {
  if (!raw || typeof raw !== 'string') return fallback;
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return cleaned || fallback;
};

const formatJakartaFileTimestamp = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
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

    // Fill white background before JPEG export so transparent PNG/WEBP areas do not turn black
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

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
  if (
    upper === 'L' ||
    upper === 'LAKI-LAKI' ||
    upper === 'LAKI LAKI' ||
    upper === 'LAKILAKI' ||
    upper === 'PRIA' ||
    upper === 'MALE' ||
    upper === 'M' ||
    upper === '1'
  ) {
    return 'L';
  }
  if (
    upper === 'P' ||
    upper === 'PEREMPUAN' ||
    upper === 'WANITA' ||
    upper === 'FEMALE' ||
    upper === 'F' ||
    upper === '2'
  ) {
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
  if (upper.includes('PROTESTAN') || upper === 'KRISTEN') return 'KRISTEN';
  if (upper.includes('KEPERCAYAAN')) return 'KEPERCAYAAN';
  return upper;
};

const normalizeMaritalStatus = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KAWIN' || upper === 'MENIKAH') return 'Kawin';
  if (upper === 'BELUM KAWIN' || upper === 'LAJANG') return 'Belum Kawin';
  if (
    upper === 'JANDA/DUDA' ||
    upper === 'JANDA' ||
    upper === 'DUDA' ||
    upper.includes('CERAI')
  ) {
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
    'allowDesktopAttendance',
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

  if (
    pgError?.code === '42P01' ||
    pgError?.code === 'PGRST205' ||
    lowerMsg.includes('teacher_subject_assignments')
  ) {
    message =
      'Tabel penugasan mata pelajaran (teacher_subject_assignments) belum tersedia di database. Jalankan migrasi SQL Milestone 1 di Supabase SQL Editor terlebih dahulu.';
  } else if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
    message = 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
  } else if (pgError?.code === '23505' || lowerMsg.includes('unique constraint')) {
    if (lowerMsg.includes('uq_teacher_subject_class_year')) {
      message = 'Guru tersebut sudah ditugaskan untuk mata pelajaran dan kelas yang sama pada tahun ajaran ini.';
    } else if (lowerMsg.includes('nuptk')) {
      message = `${rowPrefix}NUPTK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nik')) {
      message = `${rowPrefix}NIK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nip')) {
      message = `${rowPrefix}NIP tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data tersebut sudah terdaftar (Duplikat).`;
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
        .replace(/[,()"\\]/g, '')
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
      allowDesktopAttendance: Boolean(item.allowDesktopAttendance),
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

  async update(
    id: string,
    payload: UpdateTeacherPayload,
    schoolId?: string
  ): Promise<ApiResponse<TeacherDetail>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const normalized = normalizeTeacherFields(
      payload as UpdateTeacherPayload & Record<string, unknown>
    );
    delete normalized.schoolId;

    const hasPhotoField = 'photoUrl' in normalized;
    const incomingPhotoUrl = (normalized.photoUrl as string | null) ?? null;
    delete normalized.photoUrl;

    if ('fullName' in normalized && !normalized.fullName) {
      throw new Error('Nama lengkap guru tidak boleh dikosongkan.');
    }
    if ('gender' in normalized && normalized.gender !== 'L' && normalized.gender !== 'P') {
      throw new Error('Jenis kelamin tidak valid (gunakan L atau P).');
    }

    let fetchQuery = supabase
      .from('teachers')
      .select('id, schoolId, userId, fullName, photoUrl')
      .eq('id', validId);

    if (validSchoolId) {
      fetchQuery = fetchQuery.eq('schoolId', validSchoolId);
    }

    const { data: existing, error: fetchError } = await fetchQuery.single();
    if (fetchError) throw handleDbError(fetchError);

    if (Object.keys(normalized).length > 0) {
      const { error: updateError } = await supabase
        .from('teachers')
        .update(normalized)
        .eq('id', validId)
        .eq('schoolId', existing.schoolId);

      if (updateError) throw handleDbError(updateError);

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
        } catch (syncError) {
          console.warn('[teacherService.update] Best-effort users.fullName sync failed:', syncError);
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

  async deleteAll(schoolId: string): Promise<ApiResponse<{ deleted: number }>> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { data, error } = await supabase
      .from('teachers')
      .delete()
      .eq('schoolId', validSchoolId)
      .select('id');

    if (error) throw handleDbError(error);

    const deletedCount = data?.length ?? 0;
    if (deletedCount === 0) {
      throw new Error(
        'Tidak ada data guru yang dihapus. Pastikan data tersedia atau Anda memiliki peran Admin / Kepala Sekolah.'
      );
    }

    return {
      success: true,
      data: { deleted: deletedCount },
      message: `${deletedCount} data guru & pegawai berhasil dikosongkan`,
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
  // MANAJEMEN PENUGASAN MATA PELAJARAN GURU PER KELAS
  // ==========================================================================
  async getAssignmentFormOptions(
    schoolId: string,
    requestedAcademicYearId?: string | null
  ): Promise<AssignmentFormOptionsResult> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const [yearsRes, teachersRes, subjectsRes, classesRes] = await Promise.all([
      supabase
        .from('academic_years')
        .select('id, name, isActive')
        .eq('schoolId', validSchoolId)
        .order('name', { ascending: false }),
      supabase
        .from('teachers')
        .select('id, fullName, nip, nuptk, position, maxHoursPerWeek, isActive')
        .eq('schoolId', validSchoolId)
        .order('fullName', { ascending: true }),
      supabase
        .from('subjects')
        .select('id, name, code, category, isActive')
        .eq('schoolId', validSchoolId)
        .order('name', { ascending: true }),
      supabase
        .from('classes')
        .select('id, name, major, academicYearId, homeroomTeacherId')
        .eq('schoolId', validSchoolId)
        .order('name', { ascending: true }),
    ]);

    if (yearsRes.error) throw handleDbError(yearsRes.error);
    if (teachersRes.error) throw handleDbError(teachersRes.error);
    if (subjectsRes.error) throw handleDbError(subjectsRes.error);
    if (classesRes.error) throw handleDbError(classesRes.error);

    const academicYears: AcademicYearOption[] = (yearsRes.data ?? []).map((y) => ({
      id: String(y.id),
      name: String(y.name ?? ''),
      isActive: Boolean(y.isActive),
    }));

    const validRequestedYearId = normalizeTeacherSchoolId(requestedAcademicYearId);
    const activeAcademicYearId =
      (validRequestedYearId &&
      academicYears.some((y) => y.id === validRequestedYearId)
        ? validRequestedYearId
        : null) ??
      academicYears.find((y) => y.isActive)?.id ??
      academicYears[0]?.id ??
      null;

    const teacherNameMap = new Map<string, string>();
    const teachers: TeacherOptionItem[] = (teachersRes.data ?? [])
      .map((t) => {
        const id = String(t.id);
        const fullName = String(t.fullName ?? '');
        teacherNameMap.set(id, fullName);
        return {
          id,
          fullName,
          nip: t.nip ? String(t.nip) : null,
          nuptk: t.nuptk ? String(t.nuptk) : null,
          position: t.position ? String(t.position) : null,
          maxHoursPerWeek: Number(t.maxHoursPerWeek) > 0 ? Number(t.maxHoursPerWeek) : 24,
          isActive: t.isActive !== false,
        };
      })
      .filter((t) => t.isActive);

    const subjects: SubjectOptionItem[] = ((subjectsRes.data ?? []) as Record<string, unknown>[])
      .filter((s) => s.isActive !== false)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name ?? ''),
        code: s.code ? String(s.code) : null,
        category: s.category ? String(s.category) : null,
      }));

    const classes: ClassOptionItem[] = ((classesRes.data ?? []) as Record<string, unknown>[])
      .filter((c) => {
        if (!activeAcademicYearId) return true;
        return String(c.academicYearId ?? '') === activeAcademicYearId;
      })
      .map((c) => {
        const homeroomTeacherId = c.homeroomTeacherId ? String(c.homeroomTeacherId) : null;
        return {
          id: String(c.id),
          name: String(c.name ?? ''),
          major: c.major ? String(c.major) : null,
          academicYearId: String(c.academicYearId ?? ''),
          homeroomTeacherId,
          homeroomTeacherName: homeroomTeacherId
            ? (teacherNameMap.get(homeroomTeacherId) ?? null)
            : null,
        };
      });

    return {
      academicYears,
      activeAcademicYearId,
      teachers,
      subjects,
      classes,
    };
  },

  async listSubjectAssignments(params: {
    schoolId: string;
    academicYearId?: string | null;
    teacherId?: string | null;
    classId?: string | null;
    subjectId?: string | null;
  }): Promise<TeacherSubjectAssignmentItem[]> {
    const validSchoolId = assertValidUuid(params.schoolId, 'Identitas sekolah');
    const validYearId = normalizeTeacherSchoolId(params.academicYearId);
    const validTeacherId = normalizeTeacherSchoolId(params.teacherId);
    const validClassId = normalizeTeacherSchoolId(params.classId);
    const validSubjectId = normalizeTeacherSchoolId(params.subjectId);

    let assignmentsQuery = supabase
      .from('teacher_subject_assignments')
      .select(
        'id, schoolId, academicYearId, teacherId, subjectId, classId, weeklyHours, isPrimary, notes, isActive, createdAt, updatedAt'
      )
      .eq('schoolId', validSchoolId)
      .eq('isActive', true)
      .order('createdAt', { ascending: false });

    if (validYearId) assignmentsQuery = assignmentsQuery.eq('academicYearId', validYearId);
    if (validTeacherId) assignmentsQuery = assignmentsQuery.eq('teacherId', validTeacherId);
    if (validClassId) assignmentsQuery = assignmentsQuery.eq('classId', validClassId);
    if (validSubjectId) assignmentsQuery = assignmentsQuery.eq('subjectId', validSubjectId);

    const [assignRes, teachersRes, subjectsRes, classesRes] = await Promise.all([
      assignmentsQuery,
      supabase
        .from('teachers')
        .select('id, fullName, nip, maxHoursPerWeek')
        .eq('schoolId', validSchoolId),
      supabase
        .from('subjects')
        .select('id, name, code, category')
        .eq('schoolId', validSchoolId),
      supabase
        .from('classes')
        .select('id, name, major, homeroomTeacherId')
        .eq('schoolId', validSchoolId),
    ]);

    if (assignRes.error) throw handleDbError(assignRes.error);
    if (teachersRes.error) throw handleDbError(teachersRes.error);
    if (subjectsRes.error) throw handleDbError(subjectsRes.error);
    if (classesRes.error) throw handleDbError(classesRes.error);

    const teacherMap = new Map<
      string,
      { fullName: string; nip: string | null; maxHoursPerWeek: number }
    >();
    for (const t of teachersRes.data ?? []) {
      teacherMap.set(String(t.id), {
        fullName: String(t.fullName ?? 'Guru'),
        nip: t.nip ? String(t.nip) : null,
        maxHoursPerWeek: Number(t.maxHoursPerWeek) > 0 ? Number(t.maxHoursPerWeek) : 24,
      });
    }

    const subjectMap = new Map<
      string,
      { name: string; code: string | null; category: string | null }
    >();
    for (const s of (subjectsRes.data ?? []) as Record<string, unknown>[]) {
      subjectMap.set(String(s.id), {
        name: String(s.name ?? 'Mata Pelajaran'),
        code: s.code ? String(s.code) : null,
        category: s.category ? String(s.category) : null,
      });
    }

    const classMap = new Map<
      string,
      {
        name: string;
        major: string | null;
        homeroomTeacherId: string | null;
        homeroomTeacherName: string | null;
      }
    >();
    for (const c of (classesRes.data ?? []) as Record<string, unknown>[]) {
      const hrId = c.homeroomTeacherId ? String(c.homeroomTeacherId) : null;
      classMap.set(String(c.id), {
        name: String(c.name ?? 'Kelas'),
        major: c.major ? String(c.major) : null,
        homeroomTeacherId: hrId,
        homeroomTeacherName: hrId ? (teacherMap.get(hrId)?.fullName ?? null) : null,
      });
    }

    const mapped: TeacherSubjectAssignmentItem[] = (assignRes.data ?? []).map((row) => {
      const tId = String(row.teacherId);
      const sId = String(row.subjectId);
      const cId = String(row.classId);

      const tInfo = teacherMap.get(tId);
      const sInfo = subjectMap.get(sId);
      const cInfo = classMap.get(cId);

      return {
        id: String(row.id),
        schoolId: String(row.schoolId),
        academicYearId: String(row.academicYearId),
        teacherId: tId,
        subjectId: sId,
        classId: cId,
        weeklyHours: Number(row.weeklyHours ?? 2),
        isPrimary: row.isPrimary !== false,
        notes: row.notes ? String(row.notes) : null,
        isActive: row.isActive !== false,
        createdAt: row.createdAt ? String(row.createdAt) : undefined,
        updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
        teacherName: tInfo?.fullName ?? 'Guru Tidak Ditemukan',
        teacherNip: tInfo?.nip ?? null,
        teacherMaxHours: tInfo?.maxHoursPerWeek ?? 24,
        subjectName: sInfo?.name ?? 'Mapel Tidak Ditemukan',
        subjectCode: sInfo?.code ?? null,
        subjectCategory: sInfo?.category ?? null,
        className: cInfo?.name ?? 'Kelas Tidak Ditemukan',
        classMajor: cInfo?.major ?? null,
        homeroomTeacherId: cInfo?.homeroomTeacherId ?? null,
        homeroomTeacherName: cInfo?.homeroomTeacherName ?? null,
      };
    });

    return mapped.sort((a, b) => {
      const byTeacher = a.teacherName.localeCompare(b.teacherName, 'id');
      if (byTeacher !== 0) return byTeacher;
      const bySubject = a.subjectName.localeCompare(b.subjectName, 'id');
      if (bySubject !== 0) return bySubject;
      return a.className.localeCompare(b.className, 'id', { numeric: true });
    });
  },

  async assignSubjectToClasses(
    payload: AssignTeacherSubjectPayload
  ): Promise<ApiResponse<{ count: number }>> {
    const validSchoolId = assertValidUuid(payload.schoolId, 'Identitas sekolah');
    const validYearId = assertValidUuid(payload.academicYearId, 'Tahun ajaran');
    const validTeacherId = assertValidUuid(payload.teacherId, 'Guru pengampu');
    const validSubjectId = assertValidUuid(payload.subjectId, 'Mata pelajaran');

    const uniqueClassIds = Array.from(
      new Set(
        payload.classIds
          .map((cid) => (typeof cid === 'string' ? cid.trim() : ''))
          .filter((cid) => UUID_REGEX.test(cid))
      )
    );

    if (uniqueClassIds.length === 0) {
      throw new Error('Pilih minimal satu kelas / rombel tujuan.');
    }

    const safeHours = assertValidWeeklyHours(payload.weeklyHours);
    const cleanNotes = cleanNullableText(payload.notes);

    const rows = uniqueClassIds.map((classId) => ({
      schoolId: validSchoolId,
      academicYearId: validYearId,
      teacherId: validTeacherId,
      subjectId: validSubjectId,
      classId,
      weeklyHours: safeHours,
      isPrimary: payload.isPrimary ?? true,
      notes: cleanNotes,
      isActive: true,
    }));

    const { error } = await supabase
      .from('teacher_subject_assignments')
      .upsert(rows, {
        onConflict: 'schoolId,academicYearId,teacherId,subjectId,classId',
      });

    if (error) throw handleDbError(error);

    return {
      success: true,
      data: { count: rows.length },
      message: `Penugasan mata pelajaran berhasil disimpan untuk ${rows.length} kelas`,
    };
  },

  async updateSubjectAssignment(
    id: string,
    schoolId: string,
    payload: UpdateTeacherSubjectAssignmentPayload
  ): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(id, 'ID penugasan');
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const updateBody: Record<string, unknown> = {};
    if (payload.weeklyHours !== undefined) {
      updateBody.weeklyHours = assertValidWeeklyHours(payload.weeklyHours);
    }
    if (payload.isPrimary !== undefined) {
      updateBody.isPrimary = Boolean(payload.isPrimary);
    }
    if (payload.notes !== undefined) {
      updateBody.notes = cleanNullableText(payload.notes);
    }
    if (payload.isActive !== undefined) {
      updateBody.isActive = Boolean(payload.isActive);
    }

    const { error } = await supabase
      .from('teacher_subject_assignments')
      .update(updateBody)
      .eq('id', validId)
      .eq('schoolId', validSchoolId);

    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Penugasan mengajar berhasil diperbarui',
    };
  },

  async deleteSubjectAssignment(id: string, schoolId: string): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(id, 'ID penugasan');
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { error } = await supabase
      .from('teacher_subject_assignments')
      .delete()
      .eq('id', validId)
      .eq('schoolId', validSchoolId);

    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Penugasan mata pelajaran berhasil dihapus',
    };
  },

  // ==========================================================================
  // MANAJEMEN FOTO PROFIL PTK & HISTORI RETENSI (SUPABASE STORAGE + RPC)
  // ==========================================================================
  async removeStoredPhotoBestEffort(storagePath?: string | null): Promise<void> {
    if (!storagePath || storagePath.startsWith('http')) return;
    try {
      await supabase.storage.from(TEACHER_PHOTOS_BUCKET).remove([storagePath]);
    } catch {
      // Best-effort cleanup to avoid masking primary error
    }
  },

  async uploadTeacherPhoto(params: {
    schoolId: string;
    teacherId: string;
    file: File;
    schoolName?: string | null;
    teacherName?: string | null;
  }): Promise<{ publicUrl: string; storagePath: string }> {
    const validSchoolId = assertValidUuid(params.schoolId, 'Identitas sekolah');
    const validTeacherId = assertValidUuid(params.teacherId, 'ID guru');

    const authSchool = useAuthStore.getState().school;
    let resolvedSchoolName =
      params.schoolName?.trim() ||
      (authSchool?.id === validSchoolId ? authSchool.name?.trim() : '') ||
      '';
    let resolvedTeacherName = params.teacherName?.trim() || '';

    if (!resolvedSchoolName) {
      const { data: schoolRow } = await supabase
        .from('schools')
        .select('name')
        .eq('id', validSchoolId)
        .maybeSingle();
      resolvedSchoolName = schoolRow?.name?.trim() || '';
    }

    if (!resolvedTeacherName) {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('fullName')
        .eq('id', validTeacherId)
        .maybeSingle();
      resolvedTeacherName = teacherRow?.fullName?.trim() || '';
    }

    const schoolFolder = slugifyStorageSegment(
      resolvedSchoolName,
      `sekolah-${validSchoolId.slice(0, 8).toLowerCase()}`
    );
    const teacherNameSlug = slugifyStorageSegment(resolvedTeacherName, 'guru');
    const teacherFolder = `${teacherNameSlug}_${validTeacherId.slice(0, 6).toLowerCase()}`;

    const { blob, contentType, extension } = await compressTeacherPhotoFile(params.file);
    const timestamp = formatJakartaFileTimestamp();
    const shortUniqueSuffix = Math.random().toString(36).slice(2, 5);
    const fileName = `${teacherNameSlug}_${timestamp}-${shortUniqueSuffix}.${extension}`;
    const storagePath = `${schoolFolder}/${teacherFolder}/${fileName}`;

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

  async uploadAndSaveTeacherPhoto(params: {
    schoolId: string;
    teacherId: string;
    file: File;
    linkedUserId?: string | null;
    schoolName?: string | null;
    teacherName?: string | null;
  }): Promise<ApiResponse<UpdateTeacherPhotoRpcResponse>> {
    const { publicUrl, storagePath } = await this.uploadTeacherPhoto({
      schoolId: params.schoolId,
      teacherId: params.teacherId,
      file: params.file,
      schoolName: params.schoolName,
      teacherName: params.teacherName,
    });

    try {
      return await this.updateTeacherPhoto(params.teacherId, publicUrl, params.linkedUserId);
    } catch (error) {
      await this.removeStoredPhotoBestEffort(storagePath);
      throw error;
    }
  },

  async getPhotoHistory(
    teacherId: string,
    schoolId?: string
  ): Promise<ApiResponse<TeacherPhotoHistoryItem[]>> {
    const validTeacherId = assertValidUuid(teacherId);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);

    let query = supabase
      .from('teacher_photo_history')
      .select('*')
      .eq('teacherId', validTeacherId)
      .order('replacedAt', { ascending: false });

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    const { data, error } = await query;

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: (data || []) as TeacherPhotoHistoryItem[],
      message: 'Berhasil mengambil histori foto profil',
    };
  },

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

  // ==========================================================================
  // AUDIT KEAMANAN LOGIN & GANTI PASSWORD GURU (KHUSUS SUPER_ADMIN)
  // ==========================================================================
  async getTeacherSecurityAuditList(params?: {
    schoolId?: string | null;
    search?: string;
  }): Promise<ApiResponse<TeacherSecurityAuditItem[]>> {
    const validSchoolId = normalizeTeacherSchoolId(params?.schoolId);
    const cleanSearch = params?.search?.trim() || null;

    const { data, error } = await supabase.rpc('get_teacher_security_audit_list', {
      p_school_id: validSchoolId,
      p_search: cleanSearch,
    });

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: (data || []) as TeacherSecurityAuditItem[],
      message: 'Berhasil mengambil audit keamanan akun guru',
    };
  },

  async getUserSecurityAuditLogs(params?: {
    targetUserId?: string | null;
    schoolId?: string | null;
    limit?: number;
  }): Promise<ApiResponse<SecurityAuditLogEntry[]>> {
    const validUserId = normalizeTeacherSchoolId(params?.targetUserId);
    const validSchoolId = normalizeTeacherSchoolId(params?.schoolId);

    const { data, error } = await supabase.rpc('get_user_security_audit_logs', {
      p_target_user_id: validUserId,
      p_school_id: validSchoolId,
      p_limit: params?.limit ?? 100,
    });

    if (error) {
      throw handleDbError(error);
    }

    return {
      success: true,
      data: (data || []) as SecurityAuditLogEntry[],
      message: 'Berhasil mengambil log aktivitas login dan password',
    };
  },
};