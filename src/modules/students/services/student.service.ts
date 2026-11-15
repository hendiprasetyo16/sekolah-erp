// src/modules/students/services/student.service.ts
import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ApiResponse,
  ApiResponsePaginated,
  PaginatedParams,
} from '@/services/api.types';
import type { EconomicCategory } from '@/types/common.types';
import type {
  StudentListItem,
  StudentDetail,
  CreateStudentPayload,
  UpdateStudentPayload,
  CreateStudentParentPayload,
  CreateStudentEconomicPayload,
  StudentBulkImportItem,
  StudentBulkImportResult,
  StudentStatus,
  StudentSortField,
  StudentParent,
  StudentEconomic,
  ParentRelation,
  OrphanType,
  PipScoringResult,
} from '../types/student.types';

interface ClassRelationRow {
  name?: string;
  gradeLevel?: number;
}

interface RawStudentRow
  extends Omit<StudentDetail, 'className' | 'gradeLevel' | 'parents' | 'economic'> {
  classes?: ClassRelationRow | null;
  student_parents?: StudentParent[] | null;
  student_economics?: StudentEconomic | StudentEconomic[] | null;
}

interface BulkImportRpcResponse {
  success: boolean;
  inserted: number;
  updated: number;
  count: number;
  message: string;
}

export interface StudentListParams extends PaginatedParams {
  schoolId?: string;
  classId?: string;
  status?: string;
  sortBy?: StudentSortField | string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Selaras dengan role pengelola data siswa pada kebijakan akses database.
 */
export const MANAGE_STUDENT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

const ALLOWED_SORT_COLUMNS = new Set([
  'fullName',
  'nisn',
  'nis',
  'status',
  'entryDate',
  'className',
  'createdAt',
]);

const VALID_PARENT_RELATIONS = new Set<ParentRelation>(['AYAH', 'IBU', 'WALI']);
const VALID_ORPHAN_TYPES = new Set<OrphanType>([
  'YATIM',
  'PIATU',
  'YATIM_PIATU',
  'BUKAN',
]);

const BULK_IMPORT_CHUNK_SIZE = 250;
const BULK_DELETE_CHUNK_SIZE = 200;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Memvalidasi dan membersihkan string UUID sekolah agar aman dikirim ke query PostgreSQL.
 */
export const normalizeStudentSchoolId = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
};

const assertValidUuid = (id: string, label = 'ID siswa'): string => {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`${label} tidak valid.`);
  }
  return trimmed;
};

// ============================================================================
// HELPER SKORING PRIORITAS PIP (STANDAR DAPODIK & DTKS)
// ============================================================================
export function calculatePipPriorityScore(
  eco: {
    hasKip?: boolean;
    hasPkh?: boolean;
    hasKks?: boolean;
    isDtks?: boolean;
    layakPip?: boolean;
    orphanType?: OrphanType | string | null;
    desil?: number | string | null;
    houseOwnership?: string | null;
    houseCondition?: string | null;
  },
  ayah?: { fullName?: string; monthlyIncome?: string | null } | null,
  ibu?: { fullName?: string; monthlyIncome?: string | null } | null
): PipScoringResult {
  let score = 0;
  const breakdown: Record<string, number> = {};

  if (eco.hasKip) {
    breakdown.kip = 25;
    score += 25;
  }
  if (eco.hasPkh) {
    breakdown.pkh = 20;
    score += 20;
  }
  if (eco.hasKks) {
    breakdown.kks = 15;
    score += 15;
  }
  if (eco.isDtks) {
    breakdown.dtks = 15;
    score += 15;
  }
  if (eco.layakPip) {
    breakdown.layakPipDapodik = 10;
    score += 10;
  }

  if (eco.orphanType === 'YATIM_PIATU') {
    breakdown.statusKeluarga = 15;
    score += 15;
  } else if (eco.orphanType === 'YATIM' || eco.orphanType === 'PIATU') {
    breakdown.statusKeluarga = 10;
    score += 10;
  }

  const desilNum =
    eco.desil !== null && eco.desil !== undefined && String(eco.desil).trim() !== ''
      ? Number(eco.desil)
      : NaN;
  if (!Number.isNaN(desilNum) && desilNum >= 1 && desilNum <= 10) {
    const desilPts = desilNum <= 2 ? 15 : desilNum <= 4 ? 10 : desilNum <= 6 ? 5 : 0;
    if (desilPts > 0) {
      breakdown.desil = desilPts;
      score += desilPts;
    }
  }

  if (eco.houseOwnership === 'MENUMPANG' || eco.houseOwnership === 'SEWA_KONTRAK') {
    breakdown.kepemilikanRumah = 5;
    score += 5;
  }
  if (eco.houseCondition === 'TIDAK_LAYAK' || eco.houseCondition === 'SEDERHANA') {
    breakdown.kondisiRumah = 5;
    score += 5;
  }

  const lowIncomes = new Set([
    'Tidak Berpenghasilan',
    'Kurang dari Rp 500.000',
    'Rp 500.000 - Rp 999.999',
  ]);
  if (
    (ayah?.fullName?.trim() && ayah.monthlyIncome && lowIncomes.has(ayah.monthlyIncome)) ||
    (ibu?.fullName?.trim() && ibu.monthlyIncome && lowIncomes.has(ibu.monthlyIncome))
  ) {
    breakdown.penghasilanOrtu = 10;
    score += 10;
  }

  const finalScore = Math.min(100, score);
  let category: EconomicCategory = 'REGULER';
  if (finalScore >= 70) category = 'PRIORITAS_SANGAT_TINGGI';
  else if (finalScore >= 45) category = 'PRIORITAS_TINGGI';
  else if (finalScore >= 25) category = 'PRIORITAS_SEDANG';

  return {
    pipScore: finalScore,
    economicCategory: category,
    scoringDetails: breakdown,
  };
}

// ============================================================================
// HELPER NORMALISASI & SANITASI DATA
// ============================================================================
const cleanNullableText = (value?: unknown): string | null => {
  if (value === undefined || value === null) return null;
  // Hapus tanda petik tunggal di awal (sering muncul pada ekspor Excel Dapodik untuk NISN/NIK/No. KK)
  const trimmed = String(value)
    .replace(/^'+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed || trimmed === '(tidak diisi)' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  return trimmed;
};

const normalizeDateOnly = (value?: string | null): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  return cleaned.length >= 10 ? cleaned.slice(0, 10) : cleaned;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeReligion = (value?: string | null): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KATHOLIK') return 'KATOLIK';
  if (upper === 'BUDHA') return 'BUDDHA';
  return upper;
};

const sanitizeNamaKip = (value?: string | null): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  if (['0', '1', '-', 'ya', 'tidak'].includes(cleaned.toLowerCase())) {
    return null;
  }
  return cleaned;
};

const normalizeStudentFields = <T extends Record<string, unknown>>(
  raw: T
): Record<string, unknown> => {
  const data: Record<string, unknown> = { ...raw };

  // Hapus properti virtual/readonly & metadata SmartDiff agar bersih untuk DB/RPC
  delete data.id;
  delete data.className;
  delete data.gradeLevel;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.rawClassName;
  delete data.diffAction;
  delete data.diffFields;
  delete data.classes;
  delete data.student_parents;
  delete data.student_economics;

  if ('nis' in data) data.nis = cleanNullableText(data.nis);
  if ('nisn' in data && typeof data.nisn === 'string') {
    data.nisn = data.nisn.replace(/^'+/, '').trim();
  }
  if ('nik' in data && typeof data.nik === 'string') {
    data.nik = data.nik.replace(/^'+/, '').trim();
  }
  if ('noKk' in data) data.noKk = cleanNullableText(data.noKk);
  if ('fullName' in data && typeof data.fullName === 'string') {
    data.fullName = data.fullName.replace(/\s+/g, ' ').trim();
  }
  if ('nickname' in data) data.nickname = cleanNullableText(data.nickname);
  if ('religion' in data) data.religion = normalizeReligion(data.religion as string | null);
  if ('gender' in data && typeof data.gender === 'string') {
    data.gender = data.gender.trim().toUpperCase() === 'P' ? 'P' : 'L';
  }
  if ('birthDate' in data) {
    data.birthDate = normalizeDateOnly(data.birthDate as string | null);
  }
  if ('entryDate' in data) {
    data.entryDate = normalizeDateOnly(data.entryDate as string | null);
  }

  const nullableStringFields = [
    'userId',
    'dusun',
    'rt',
    'rw',
    'kelurahan',
    'kecamatan',
    'postalCode',
    'telepon',
    'phone',
    'email',
    'photoUrl',
    'classId',
    'skhun',
    'noPesertaUn',
    'noIjazah',
    'noAktaLahir',
    'lintang',
    'bujur',
    'jenisTinggal',
    'alatTransportasi',
    'kebutuhanKhusus',
    'sekolahAsal',
    'bank',
    'noRekening',
    'namaRekening',
  ];

  for (const field of nullableStringFields) {
    if (field in data) {
      data[field] = cleanNullableText(data[field]);
    }
  }

  const nullableNumberFields = [
    'anakKe',
    'jmlSaudara',
    'beratBadan',
    'tinggiBadan',
    'lingkarKepala',
    'jarakSekolah',
  ];

  for (const field of nullableNumberFields) {
    if (field in data) {
      data[field] = normalizeNullableNumber(data[field]);
    }
  }

  return data;
};

const normalizeParentPayload = (
  parent: CreateStudentParentPayload & Record<string, unknown>
): CreateStudentParentPayload => {
  const rawRelation = String(parent.relation || 'WALI').toUpperCase() as ParentRelation;
  const relation: ParentRelation = VALID_PARENT_RELATIONS.has(rawRelation)
    ? rawRelation
    : 'WALI';

  return {
    relation,
    fullName: String(parent.fullName || '').replace(/\s+/g, ' ').trim(),
    birthYear: cleanNullableText(parent.birthYear),
    nik: cleanNullableText(parent.nik),
    phone: cleanNullableText(parent.phone),
    email: cleanNullableText(parent.email),
    education: cleanNullableText(parent.education),
    occupation: cleanNullableText(parent.occupation),
    monthlyIncome: cleanNullableText(parent.monthlyIncome),
    isAlive: parent.isAlive ?? true,
    address: cleanNullableText(parent.address),
  };
};

const normalizeEconomicPayload = (
  economic: CreateStudentEconomicPayload & Record<string, unknown>
): CreateStudentEconomicPayload => {
  const kipNumber = cleanNullableText(economic.kipNumber);
  const kksNumber = cleanNullableText(economic.kksNumber);

  const hasKip = Boolean(economic.hasKip) || Boolean(kipNumber);
  const hasKks = Boolean(economic.hasKks) || Boolean(kksNumber);
  const layakPip = Boolean(economic.layakPip);

  const rawOrphanType = cleanNullableText(economic.orphanType)?.toUpperCase() as
    | OrphanType
    | undefined;
  const orphanType: OrphanType | null =
    rawOrphanType && VALID_ORPHAN_TYPES.has(rawOrphanType) ? rawOrphanType : null;

  const isOrphan =
    Boolean(economic.isOrphan) ||
    (orphanType !== null && orphanType !== 'BUKAN');

  const rawDesil = economic.desil;
  const desil =
    typeof rawDesil === 'number' &&
    !Number.isNaN(rawDesil) &&
    rawDesil >= 1 &&
    rawDesil <= 10
      ? Math.trunc(rawDesil)
      : null;

  const normalized: CreateStudentEconomicPayload = {
    hasKip,
    kipNumber: hasKip ? kipNumber : null,
    namaKip: hasKip ? sanitizeNamaKip(economic.namaKip) : null,
    layakPip,
    alasanLayakPip: layakPip ? cleanNullableText(economic.alasanLayakPip) : null,
    hasKks,
    kksNumber: hasKks ? kksNumber : null,
    hasPkh: Boolean(economic.hasPkh),
    isDtks: Boolean(economic.isDtks),
    houseOwnership: cleanNullableText(economic.houseOwnership),
    houseCondition: cleanNullableText(economic.houseCondition),
    dependentsCount:
      typeof economic.dependentsCount === 'number' &&
      !Number.isNaN(economic.dependentsCount) &&
      economic.dependentsCount >= 0
        ? Math.trunc(economic.dependentsCount)
        : null,
    isOrphan,
    orphanType,
    desil,
  };

  if (economic.pipScore !== undefined) {
    normalized.pipScore = economic.pipScore;
  }
  if (economic.economicCategory !== undefined) {
    normalized.economicCategory = economic.economicCategory;
  }
  if (economic.scoringDetails !== undefined) {
    normalized.scoringDetails = economic.scoringDetails;
  }
  if (economic.scoredAt !== undefined) {
    normalized.scoredAt = economic.scoredAt;
  }

  return normalized;
};

// ============================================================================
// ERROR HANDLER POSTGRESQL & JARINGAN
// ============================================================================
export const handleStudentDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan saat memproses data siswa.';
  const lowerMsg = message.toLowerCase();

  const rowPrefixMatch = message.match(/(Impor gagal pada baris ke-\d+:)/i);
  const rowPrefix = rowPrefixMatch ? `${rowPrefixMatch[1]} ` : '';

  if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
    message = 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
  } else if (pgError?.code === '23505' || lowerMsg.includes('unique constraint')) {
    // Cek 'nisn' terlebih dahulu karena string 'nisn' mengandung 'nis'
    if (lowerMsg.includes('nisn')) {
      message = `${rowPrefix}NISN tersebut sudah terdaftar pada siswa lain di sekolah ini.`;
    } else if (lowerMsg.includes('nik')) {
      message = `${rowPrefix}NIK tersebut sudah digunakan oleh siswa lain di sekolah ini.`;
    } else if (lowerMsg.includes('nis')) {
      message = `${rowPrefix}NIS/NIPD tersebut sudah digunakan oleh siswa lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data siswa tersebut sudah terdaftar (Duplikat).`;
    }
  } else if (pgError?.code === '23502') {
    message = `${rowPrefix}Terdapat kolom wajib yang masih kosong. Pastikan semua data wajib sudah terisi.`;
  } else if (pgError?.code === '23503') {
    message =
      'Operasi gagal karena relasi data tidak valid atau masih terhubung dengan modul lain (kelas, tagihan, atau presensi).';
  } else if (pgError?.code === '23514') {
    message = `${rowPrefix}Nilai input tidak memenuhi aturan validasi data (cek Desil 1-10, Anak Ke > 0, Status, atau Jenis Kelamin).`;
  } else if (pgError?.code === '22007' || pgError?.code === '22008') {
    message = `${rowPrefix}Format tanggal tidak valid. Gunakan format YYYY-MM-DD.`;
  } else if (pgError?.code === '22P02') {
    message = `${rowPrefix}Format input angka atau ID data tidak valid.`;
  } else if (pgError?.code === '42P10') {
    message = 'Konfigurasi indeks unik database belum lengkap. Silakan hubungi administrator sistem.';
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.';
  } else if (pgError?.code === 'PGRST116') {
    message = 'Data peserta didik tidak ditemukan atau Anda tidak memiliki akses ke data ini.';
  }

  return new Error(message);
};

// ============================================================================
// SINKRONISASI RIWAYAT KELAS AKTIF
// ============================================================================
const syncActiveClassHistory = async (
  schoolId: string,
  studentId: string,
  classId?: string | null
): Promise<void> => {
  if (!schoolId || !studentId) return;

  const { data: activeYear, error: yearError } = await supabase
    .from('academic_years')
    .select('id')
    .eq('schoolId', schoolId)
    .eq('isActive', true)
    .maybeSingle();

  if (yearError) throw handleStudentDbError(yearError);
  if (!activeYear?.id) return;

  if (!classId) {
    const { error: deleteHistoryError } = await supabase
      .from('student_class_history')
      .delete()
      .eq('schoolId', schoolId)
      .eq('studentId', studentId)
      .eq('academicYearId', activeYear.id);

    if (deleteHistoryError) throw handleStudentDbError(deleteHistoryError);
    return;
  }

  const { error: upsertHistoryError } = await supabase
    .from('student_class_history')
    .upsert(
      {
        schoolId,
        studentId,
        academicYearId: activeYear.id,
        classId,
      },
      { onConflict: 'studentId,academicYearId' }
    );

  if (upsertHistoryError) throw handleStudentDbError(upsertHistoryError);
};

// ============================================================================
// SERVICE UTAMA MODUL SISWA
// ============================================================================
export const studentService = {
  async list(params: StudentListParams): Promise<ApiResponsePaginated<StudentListItem>> {
    const {
      page = 1,
      limit = 10,
      search,
      schoolId,
      classId,
      status,
      sortBy = 'fullName',
      sortOrder = 'asc',
    } = params;

    const validSchoolId = normalizeStudentSchoolId(schoolId);
    const validClassId = classId && classId !== 'all' ? normalizeStudentSchoolId(classId) : null;
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    if (search && search.trim()) {
      const safeSearch = search
        .trim()
        .replace(/[,()\\]/g, '')
        .replace(/[%_]/g, '\\$&');
      if (safeSearch) {
        query = query.or(
          `fullName.ilike.%${safeSearch}%,nisn.ilike.%${safeSearch}%,nis.ilike.%${safeSearch}%,nik.ilike.%${safeSearch}%`
        );
      }
    }

    if (validClassId) query = query.eq('classId', validClassId);
    if (status && status !== 'all') query = query.eq('status', status);

    const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'fullName';
    const isAsc = sortOrder === 'asc';

    if (safeSortBy === 'className') {
      query = query
        .order('name', { referencedTable: 'classes', ascending: isAsc, nullsFirst: false })
        .order('fullName', { ascending: true, nullsFirst: false });
    } else {
      query = query.order(safeSortBy, { ascending: isAsc, nullsFirst: false });
    }

    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw handleStudentDbError(error);

    const rows = (data || []) as unknown as RawStudentRow[];
    const mappedData: StudentListItem[] = rows.map((item) => ({
      id: item.id,
      nis: item.nis ?? null,
      nisn: item.nisn,
      nik: item.nik,
      fullName: item.fullName,
      gender: item.gender,
      className: item.classes?.name || '-',
      classId: item.classId ?? null,
      gradeLevel: item.classes?.gradeLevel || 0,
      status: item.status as StudentStatus,
      photoUrl: item.photoUrl ?? null,
      phone: item.phone ?? null,
      entryDate: item.entryDate ?? null,
      birthPlace: item.birthPlace,
      birthDate: item.birthDate,
      religion: item.religion ?? null,
      address: item.address,
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
      message: 'Berhasil mengambil data siswa',
    };
  },

  async getById(id: string, schoolId?: string): Promise<ApiResponse<StudentDetail>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeStudentSchoolId(schoolId);

    let studentQuery = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)')
      .eq('id', validId);

    if (validSchoolId) {
      studentQuery = studentQuery.eq('schoolId', validSchoolId);
    }

    const { data: studentData, error: studentError } = await studentQuery.single();
    if (studentError) throw handleStudentDbError(studentError);

    const rawStudent = studentData as unknown as RawStudentRow;

    const [
      { data: parentsData, error: parentsError },
      { data: economicData, error: economicError },
    ] = await Promise.all([
      supabase
        .from('student_parents')
        .select('*')
        .eq('studentId', validId)
        .eq('schoolId', rawStudent.schoolId)
        .order('relation', { ascending: true }),
      supabase
        .from('student_economics')
        .select('*')
        .eq('studentId', validId)
        .eq('schoolId', rawStudent.schoolId)
        .maybeSingle(),
    ]);

    if (parentsError) throw handleStudentDbError(parentsError);
    // Role ORANG_TUA & SISWA dibatasi dari tabel student_economics (42501)
    if (economicError && economicError.code !== '42501') {
      throw handleStudentDbError(economicError);
    }

    const mappedData: StudentDetail = {
      ...rawStudent,
      nis: rawStudent.nis ?? null,
      entryDate: rawStudent.entryDate ?? null,
      className: rawStudent.classes?.name || '-',
      classId: rawStudent.classId ?? null,
      gradeLevel: rawStudent.classes?.gradeLevel || 0,
      parents: (parentsData as StudentParent[]) || [],
      economic: (economicData as StudentEconomic | null) ?? null,
    };

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil detail siswa',
    };
  },

  async create(payload: CreateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const validSchoolId = normalizeStudentSchoolId(payload.schoolId);
    if (!validSchoolId) {
      throw new Error('Identitas sekolah tujuan tidak valid.');
    }

    const { parents, economic, ...rawStudentData } = payload;
    const studentData = normalizeStudentFields(rawStudentData);
    studentData.schoolId = validSchoolId;

    if (!studentData.entryDate) {
      delete studentData.entryDate;
    }

    const { data: createdStudent, error: studentError } = await supabase
      .from('students')
      .insert(studentData)
      .select('id, schoolId, classId')
      .single();

    if (studentError) throw handleStudentDbError(studentError);

    const trustedSchoolId = createdStudent.schoolId;

    try {
      if (parents && parents.length > 0) {
        const parentsData = parents
          .filter((p) => Boolean(p.fullName?.trim()))
          .map((p) => ({
            ...normalizeParentPayload(p as CreateStudentParentPayload & Record<string, unknown>),
            studentId: createdStudent.id,
            schoolId: trustedSchoolId,
          }));

        if (parentsData.length > 0) {
          const { error: parentError } = await supabase
            .from('student_parents')
            .insert(parentsData);
          if (parentError) throw handleStudentDbError(parentError);
        }
      }

      if (economic) {
        const normalizedEco = normalizeEconomicPayload(
          economic as CreateStudentEconomicPayload & Record<string, unknown>
        );
        const { error: ecoError } = await supabase.from('student_economics').insert({
          ...normalizedEco,
          studentId: createdStudent.id,
          schoolId: trustedSchoolId,
        });
        if (ecoError) throw handleStudentDbError(ecoError);
      }

      await syncActiveClassHistory(trustedSchoolId, createdStudent.id, createdStudent.classId);
    } catch (relationError) {
      await supabase.from('students').delete().eq('id', createdStudent.id);
      throw relationError;
    }

    return this.getById(createdStudent.id, trustedSchoolId);
  },

  async update(
    id: string,
    payload: UpdateStudentPayload,
    schoolId?: string
  ): Promise<ApiResponse<StudentDetail>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeStudentSchoolId(schoolId);
    const { parents, economic, ...rawStudentData } = payload;

    const studentData = normalizeStudentFields(rawStudentData);
    delete studentData.schoolId;

    if (!studentData.entryDate) {
      delete studentData.entryDate;
    }

    let existingQuery = supabase
      .from('students')
      .select('id, schoolId, classId')
      .eq('id', validId);

    if (validSchoolId) {
      existingQuery = existingQuery.eq('schoolId', validSchoolId);
    }

    const { data: existingStudent, error: fetchError } = await existingQuery.single();
    if (fetchError) throw handleStudentDbError(fetchError);

    const trustedSchoolId = existingStudent.schoolId;

    if (Object.keys(studentData).length > 0) {
      const { error: updateError } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', validId)
        .eq('schoolId', trustedSchoolId);

      if (updateError) throw handleStudentDbError(updateError);
    }

    if (parents !== undefined) {
      const validParents = parents.filter((p) => Boolean(p.fullName?.trim()));
      const normalizedParents = validParents.map((p) =>
        normalizeParentPayload(
          p as CreateStudentParentPayload & Record<string, unknown>
        )
      );

      if (normalizedParents.length === 0) {
        const { error: deleteAllParentsError } = await supabase
          .from('student_parents')
          .delete()
          .eq('studentId', validId)
          .eq('schoolId', trustedSchoolId);

        if (deleteAllParentsError) throw handleStudentDbError(deleteAllParentsError);
      } else {
        const activeRelations = normalizedParents.map((p) => p.relation);
        const { error: deleteRemovedError } = await supabase
          .from('student_parents')
          .delete()
          .eq('studentId', validId)
          .eq('schoolId', trustedSchoolId)
          .not('relation', 'in', `(${activeRelations.join(',')})`);

        if (deleteRemovedError) throw handleStudentDbError(deleteRemovedError);

        const parentsData = normalizedParents.map((p) => ({
          ...p,
          studentId: validId,
          schoolId: trustedSchoolId,
        }));

        const { error: upsertParentsError } = await supabase
          .from('student_parents')
          .upsert(parentsData, { onConflict: 'studentId,relation' });

        if (upsertParentsError) throw handleStudentDbError(upsertParentsError);
      }
    }

    if (economic !== undefined && economic !== null) {
      const normalizedEco = normalizeEconomicPayload(
        economic as CreateStudentEconomicPayload & Record<string, unknown>
      );
      const { error: ecoError } = await supabase
        .from('student_economics')
        .upsert(
          {
            ...normalizedEco,
            studentId: validId,
            schoolId: trustedSchoolId,
          },
          { onConflict: 'studentId' }
        );

      if (ecoError) throw handleStudentDbError(ecoError);
    }

    const nextClassId =
      'classId' in studentData
        ? (studentData.classId as string | null)
        : existingStudent.classId;
    await syncActiveClassHistory(trustedSchoolId, validId, nextClassId);

    return this.getById(validId, trustedSchoolId);
  },

  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeStudentSchoolId(schoolId);

    let query = supabase.from('students').delete().eq('id', validId);
    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    // Gunakan .select('id') untuk memastikan baris benar-benar terhapus & tidak ditolak RLS
    const { data, error } = await query.select('id');
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error(
          'Siswa tidak dapat dihapus karena masih memiliki riwayat tagihan atau akademik.'
        );
      }
      throw handleStudentDbError(error);
    }

    if (!data || data.length === 0) {
      throw new Error(
        'Data siswa gagal dihapus. Pastikan data masih ada atau Anda memiliki peran Admin / Kepala Sekolah.'
      );
    }

    return { success: true, data: undefined, message: 'Siswa berhasil dihapus' };
  },

  async deleteMany(ids: string[], schoolId?: string): Promise<ApiResponse<{ deleted: number }>> {
    const validSchoolId = normalizeStudentSchoolId(schoolId);
    const uniqueIds = Array.from(
      new Set(
        ids
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => UUID_REGEX.test(item))
      )
    );

    if (uniqueIds.length === 0) {
      return { success: true, data: { deleted: 0 }, message: 'Tidak ada siswa valid yang dipilih' };
    }

    let totalDeleted = 0;

    for (let i = 0; i < uniqueIds.length; i += BULK_DELETE_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BULK_DELETE_CHUNK_SIZE);
      let query = supabase.from('students').delete().in('id', chunk);
      if (validSchoolId) {
        query = query.eq('schoolId', validSchoolId);
      }

      const { data, error } = await query.select('id');
      if (error) {
        if (error.message.includes('student_bills') || error.code === '23503') {
          throw new Error(
            'Sebagian atau seluruh siswa terpilih tidak dapat dihapus karena masih memiliki riwayat tagihan atau akademik.'
          );
        }
        throw handleStudentDbError(error);
      }
      totalDeleted += data?.length ?? 0;
    }

    if (totalDeleted === 0) {
      throw new Error(
        'Tidak ada data siswa yang berhasil dihapus. Periksa hak akses Anda (khusus Admin / Kepala Sekolah).'
      );
    }

    return {
      success: true,
      data: { deleted: totalDeleted },
      message: `${totalDeleted} data siswa berhasil dihapus`,
    };
  },

  async exportAll(schoolId?: string): Promise<ApiResponse<StudentDetail[]>> {
    const validSchoolId = normalizeStudentSchoolId(schoolId);
    const allRows: RawStudentRow[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      let query = supabase
        .from('students')
        .select('*, classes(name, gradeLevel), student_parents(*), student_economics(*)')
        .order('fullName', { ascending: true })
        .range(from, from + batchSize - 1);

      if (validSchoolId) query = query.eq('schoolId', validSchoolId);

      const { data, error } = await query;
      if (error) throw handleStudentDbError(error);

      if (data && data.length > 0) {
        allRows.push(...(data as unknown as RawStudentRow[]));
      }
      if (!data || data.length < batchSize) break;
    }

    const mappedData: StudentDetail[] = allRows.map((item) => {
      const rawEconomic = Array.isArray(item.student_economics)
        ? (item.student_economics[0] ?? null)
        : (item.student_economics ?? null);

      return {
        ...item,
        nis: item.nis ?? null,
        entryDate: item.entryDate ?? null,
        className: item.classes?.name || '-',
        classId: item.classId ?? null,
        gradeLevel: item.classes?.gradeLevel || 0,
        parents: item.student_parents || [],
        economic: rawEconomic,
      };
    });

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil semua data siswa lengkap',
    };
  },

  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { error } = await supabase.from('students').delete().eq('schoolId', validSchoolId);
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error(
          'Data siswa tidak dapat dikosongkan karena masih ada riwayat tagihan atau pembayaran siswa.'
        );
      }
      throw handleStudentDbError(error);
    }

    return { success: true, data: undefined, message: 'Seluruh data siswa dikosongkan' };
  },

  async bulkImport(
    payload: StudentBulkImportItem[]
  ): Promise<ApiResponse<StudentBulkImportResult>> {
    if (!payload || payload.length === 0) {
      throw new Error('Data impor siswa kosong.');
    }

    const sanitizedBatch = payload.map((item, idx) => {
      const validItemSchoolId = normalizeStudentSchoolId(item.schoolId);
      if (!validItemSchoolId) {
        throw new Error(`Impor gagal pada baris ke-${idx + 1}: Identitas sekolah tidak valid.`);
      }

      const { parents, economic, ...rest } = item;
      const normalizedCore = normalizeStudentFields(rest);

      return {
        ...normalizedCore,
        schoolId: validItemSchoolId,
        parents: parents
          ? parents
              .filter((p) => Boolean(p.fullName?.trim()))
              .map((p) =>
                normalizeParentPayload(
                  p as CreateStudentParentPayload & Record<string, unknown>
                )
              )
          : undefined,
        economic: economic
          ? normalizeEconomicPayload(
              economic as CreateStudentEconomicPayload & Record<string, unknown>
            )
          : undefined,
      };
    });

    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < sanitizedBatch.length; i += BULK_IMPORT_CHUNK_SIZE) {
      const chunk = sanitizedBatch.slice(i, i + BULK_IMPORT_CHUNK_SIZE);

      const { data, error } = await supabase.rpc('bulk_import_students', {
        batch_data: chunk,
      });

      if (error) {
        throw handleStudentDbError(error);
      }

      const result = data as BulkImportRpcResponse;
      totalInserted += result?.inserted ?? 0;
      totalUpdated += result?.updated ?? 0;
    }

    return {
      success: true,
      data: {
        inserted: totalInserted,
        updated: totalUpdated,
      },
      message: `${totalInserted} data baru ditambahkan, ${totalUpdated} data diperbarui`,
    };
  },
};