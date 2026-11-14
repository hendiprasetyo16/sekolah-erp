import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ApiResponse,
  ApiResponsePaginated,
  PaginatedParams,
} from '@/services/api.types';
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
  StudentParent,
  StudentEconomic,
  ParentRelation,
  OrphanType,
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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

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

// ============================================================================
// HELPER NORMALISASI & SANITASI DATA
// ============================================================================
const cleanNullableText = (value?: string | null): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeReligion = (value?: string | null): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  return upper === 'KATHOLIK' ? 'KATOLIK' : upper;
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

  // Hapus properti virtual/readonly yang tidak ada di tabel `public.students`
  delete data.id;
  delete data.className;
  delete data.gradeLevel;
  delete data.createdAt;
  delete data.updatedAt;

  if ('nis' in data) data.nis = cleanNullableText(data.nis as string | null);
  if ('nisn' in data && typeof data.nisn === 'string') data.nisn = data.nisn.trim();
  if ('nik' in data && typeof data.nik === 'string') data.nik = data.nik.trim();
  if ('noKk' in data) data.noKk = cleanNullableText(data.noKk as string | null);
  if ('fullName' in data && typeof data.fullName === 'string') {
    data.fullName = data.fullName.trim();
  }
  if ('nickname' in data) data.nickname = cleanNullableText(data.nickname as string | null);
  if ('religion' in data) data.religion = normalizeReligion(data.religion as string | null);

  const nullableStringFields = [
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
    'entryDate',
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
      data[field] = cleanNullableText(data[field] as string | null);
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
    fullName: String(parent.fullName || '').trim(),
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

  // Jika nomor kartu KIP/KKS terisi di Dapodik meski kolom centang bernilai 'Tidak', tetap pertahankan
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

  return {
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
    pipScore: economic.pipScore ?? null,
    economicCategory: economic.economicCategory ?? null,
    desil,
    scoringDetails: economic.scoringDetails ?? null,
    scoredAt: economic.scoredAt ?? null,
  };
};

// ============================================================================
// ERROR HANDLER POSTGRESQL
// ============================================================================
const handleDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan pada database';

  const rowPrefixMatch = message.match(/(Impor gagal pada baris ke-\d+:)/i);
  const rowPrefix = rowPrefixMatch ? `${rowPrefixMatch[1]} ` : '';

  if (pgError?.code === '23505' || message.includes('unique constraint')) {
    if (message.includes('nisn_key')) {
      message = `${rowPrefix}NISN tersebut sudah terdaftar di sekolah ini. Silakan gunakan NISN lain.`;
    } else if (message.includes('nis_key')) {
      message = `${rowPrefix}NIS/NIPD tersebut sudah digunakan oleh siswa lain di sekolah ini.`;
    } else if (message.includes('nik_key')) {
      message = `${rowPrefix}NIK tersebut sudah digunakan oleh siswa lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data tersebut sudah terdaftar (Duplikat).`;
    }
  } else if (pgError?.code === '23502') {
    message = `${rowPrefix}Terdapat kolom wajib yang bernilai kosong (NOT NULL constraint).`;
  } else if (pgError?.code === '23503') {
    message =
      'Operasi gagal karena relasi data tidak valid atau masih terhubung dengan modul lain (kelas/tagihan/absensi).';
  } else if (pgError?.code === '23514') {
    message = `${rowPrefix}Nilai input tidak memenuhi aturan validasi database (cek Desil 1-10, Anak Ke > 0, Status, atau Jenis Kelamin).`;
  } else if (pgError?.code === '22007' || pgError?.code === '22008') {
    message = `${rowPrefix}Format tanggal tidak valid. Gunakan format YYYY-MM-DD.`;
  } else if (pgError?.code === '22P02') {
    message = `${rowPrefix}Format input angka atau ID tidak valid.`;
  } else if (pgError?.code === '42P10') {
    message =
      'Skema indeks unik database belum lengkap. Jalankan Patch SQL v7.7 pada Supabase SQL Editor.';
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.';
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

  if (yearError) throw handleDbError(yearError);
  if (!activeYear?.id) return;

  if (!classId) {
    const { error: deleteHistoryError } = await supabase
      .from('student_class_history')
      .delete()
      .eq('schoolId', schoolId)
      .eq('studentId', studentId)
      .eq('academicYearId', activeYear.id);

    if (deleteHistoryError) throw handleDbError(deleteHistoryError);
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

  if (upsertHistoryError) throw handleDbError(upsertHistoryError);
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

    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (schoolId) query = query.eq('schoolId', schoolId);

    if (search && search.trim()) {
      const safeSearch = search.trim().replace(/[,()\\]/g, '');
      if (safeSearch) {
        query = query.or(
          `fullName.ilike.%${safeSearch}%,nisn.ilike.%${safeSearch}%,nis.ilike.%${safeSearch}%,nik.ilike.%${safeSearch}%`
        );
      }
    }

    if (classId && classId !== 'all') query = query.eq('classId', classId);
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

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw handleDbError(error);

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
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        data: mappedData,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      message: 'Berhasil mengambil data siswa',
    };
  },

  async getById(id: string, schoolId?: string): Promise<ApiResponse<StudentDetail>> {
    let studentQuery = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)')
      .eq('id', id);

    if (schoolId) {
      studentQuery = studentQuery.eq('schoolId', schoolId);
    }

    const { data: studentData, error: studentError } = await studentQuery.single();
    if (studentError) throw handleDbError(studentError);

    const rawStudent = studentData as unknown as RawStudentRow;

    const [
      { data: parentsData, error: parentsError },
      { data: economicData, error: economicError },
    ] = await Promise.all([
      supabase
        .from('student_parents')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', rawStudent.schoolId),
      supabase
        .from('student_economics')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', rawStudent.schoolId)
        .maybeSingle(),
    ]);

    if (parentsError) throw handleDbError(parentsError);
    if (economicError) throw handleDbError(economicError);

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
    const { parents, economic, ...rawStudentData } = payload;
    const studentData = normalizeStudentFields(rawStudentData);

    // Biarkan database memakai DEFAULT CURRENT_DATE jika entryDate tidak diisi
    if (!studentData.entryDate) {
      delete studentData.entryDate;
    }

    const { data: createdStudent, error: studentError } = await supabase
      .from('students')
      .insert(studentData)
      .select('id, schoolId, classId')
      .single();

    if (studentError) throw handleDbError(studentError);

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
          if (parentError) throw handleDbError(parentError);
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
        if (ecoError) throw handleDbError(ecoError);
      }

      await syncActiveClassHistory(trustedSchoolId, createdStudent.id, createdStudent.classId);
    } catch (relationError) {
      await supabase.from('students').delete().eq('id', createdStudent.id);
      throw relationError;
    }

    return this.getById(createdStudent.id, trustedSchoolId);
  },

  async update(id: string, payload: UpdateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...rawStudentData } = payload;

    const studentData = normalizeStudentFields(rawStudentData);
    delete studentData.schoolId;

    // Jangan menimpa kolom `entryDate` (NOT NULL) menjadi null saat update parsial
    if (!studentData.entryDate) {
      delete studentData.entryDate;
    }

    const { data: existingStudent, error: fetchError } = await supabase
      .from('students')
      .select('id, schoolId, classId')
      .eq('id', id)
      .single();

    if (fetchError) throw handleDbError(fetchError);
    const trustedSchoolId = existingStudent.schoolId;

    if (Object.keys(studentData).length > 0) {
      const { error: updateError } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', id)
        .eq('schoolId', trustedSchoolId);

      if (updateError) throw handleDbError(updateError);
    }

    if (parents !== undefined) {
      const { data: backupParents, error: backupError } = await supabase
        .from('student_parents')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', trustedSchoolId);

      if (backupError) throw handleDbError(backupError);

      const { error: deleteParentsError } = await supabase
        .from('student_parents')
        .delete()
        .eq('studentId', id)
        .eq('schoolId', trustedSchoolId);

      if (deleteParentsError) throw handleDbError(deleteParentsError);

      const validParents = parents.filter((p) => Boolean(p.fullName?.trim()));
      if (validParents.length > 0) {
        const parentsData = validParents.map((p) => {
          const normalized = normalizeParentPayload(
            p as CreateStudentParentPayload & Record<string, unknown>
          );
          const existingSameRel = (backupParents || []).find(
            (bp) => bp.relation === normalized.relation
          );
          return {
            ...normalized,
            address: normalized.address ?? existingSameRel?.address ?? null,
            studentId: id,
            schoolId: trustedSchoolId,
          };
        });

        const { error: insertParentsError } = await supabase
          .from('student_parents')
          .insert(parentsData);

        if (insertParentsError) {
          if (backupParents && backupParents.length > 0) {
            const restoreRows = backupParents.map(({ id: _oldId, ...rest }) => rest);
            await supabase.from('student_parents').insert(restoreRows);
          }
          throw handleDbError(insertParentsError);
        }
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
            studentId: id,
            schoolId: trustedSchoolId,
          },
          { onConflict: 'studentId' }
        );

      if (ecoError) throw handleDbError(ecoError);
    }

    const nextClassId =
      'classId' in studentData
        ? (studentData.classId as string | null)
        : existingStudent.classId;
    await syncActiveClassHistory(trustedSchoolId, id, nextClassId);

    return this.getById(id, trustedSchoolId);
  },

  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    let query = supabase.from('students').delete().eq('id', id);
    if (schoolId) {
      query = query.eq('schoolId', schoolId);
    }

    const { error } = await query;
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error(
          'Siswa tidak dapat dihapus karena masih memiliki riwayat tagihan/akademik.'
        );
      }
      throw handleDbError(error);
    }

    return { success: true, data: undefined, message: 'Siswa berhasil dihapus' };
  },

  async deleteMany(ids: string[], schoolId?: string): Promise<ApiResponse<{ deleted: number }>> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { success: true, data: { deleted: 0 }, message: 'Tidak ada siswa yang dipilih' };
    }

    for (let i = 0; i < uniqueIds.length; i += BULK_DELETE_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BULK_DELETE_CHUNK_SIZE);
      let query = supabase.from('students').delete().in('id', chunk);
      if (schoolId) {
        query = query.eq('schoolId', schoolId);
      }

      const { error } = await query;
      if (error) {
        if (error.message.includes('student_bills') || error.code === '23503') {
          throw new Error(
            'Sebagian/seluruh siswa terpilih tidak dapat dihapus karena masih memiliki riwayat tagihan atau akademik.'
          );
        }
        throw handleDbError(error);
      }
    }

    return {
      success: true,
      data: { deleted: uniqueIds.length },
      message: `${uniqueIds.length} data siswa berhasil dihapus`,
    };
  },

  async exportAll(schoolId?: string): Promise<ApiResponse<StudentDetail[]>> {
    const allRows: RawStudentRow[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      let query = supabase
        .from('students')
        .select('*, classes(name, gradeLevel), student_parents(*), student_economics(*)')
        .order('fullName', { ascending: true })
        .range(from, from + batchSize - 1);

      if (schoolId) query = query.eq('schoolId', schoolId);

      const { data, error } = await query;
      if (error) throw handleDbError(error);

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
    if (!schoolId) throw new Error('School ID tidak valid');

    const { error } = await supabase.from('students').delete().eq('schoolId', schoolId);
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error(
          'Tidak bisa dikosongkan karena masih ada riwayat Tagihan/Pembayaran siswa.'
        );
      }
      throw handleDbError(error);
    }

    return { success: true, data: undefined, message: 'Seluruh data siswa dikosongkan' };
  },

  async bulkImport(
    payload: StudentBulkImportItem[]
  ): Promise<ApiResponse<StudentBulkImportResult>> {
    if (!payload || payload.length === 0) {
      throw new Error('Payload import kosong.');
    }

    const sanitizedBatch = payload.map((item) => {
      const {
        id: _id,
        rawClassName: _rawClassName,
        diffAction: _diffAction,
        diffFields: _diffFields,
        parents,
        economic,
        ...rest
      } = item;

      const normalizedCore = normalizeStudentFields(rest);

      return {
        ...normalizedCore,
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
        throw handleDbError(error);
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