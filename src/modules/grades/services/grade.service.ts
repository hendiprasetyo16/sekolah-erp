// src/modules/grades/services/grade.service.ts
import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ClassRankingRow,
  ExtracurricularItem,
  PromotionStatus,
  ReportExamMode,
  SchoolReportProfile,
  ServiceResponse,
  StudentAchievementItem,
  StudentBasicProfile,
  StudentGradeRecord,
  StudentReportNoteRecord,
  SubjectOption,
} from '../types/grade.types';

/**
 * Representasi satu baris siswa pada lembar input nilai guru
 */
export interface GradeSheetRow {
  student: StudentBasicProfile;
  grade: StudentGradeRecord;
  isManualFinalScore: boolean;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const assertValidUuid = (id: string, label = 'ID data'): string => {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`${label} tidak valid.`);
  }
  return trimmed;
};

/**
 * Error handler PostgreSQL & jaringan (selaras dengan modul siswa)
 */
export const handleGradeDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan saat memproses data nilai dan raport.';
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
    message = 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
  } else if (pgError?.code === '23505' || lowerMsg.includes('unique constraint')) {
    message = 'Data nilai atau catatan raport untuk siswa dan semester ini sudah terdaftar.';
  } else if (pgError?.code === '23503') {
    message = 'Referensi data sekolah, kelas, semester, atau mata pelajaran tidak valid.';
  } else if (pgError?.code === '23514') {
    message = 'Nilai yang dimasukkan berada di luar rentang yang diizinkan (0 - 100).';
  } else if (pgError?.code === '22P02') {
    message = 'Format angka atau ID data tidak valid.';
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk mengubah data nilai atau raport ini.';
  } else if (pgError?.code === 'PGRST116') {
    message = 'Data nilai atau raport tidak ditemukan.';
  }

  return new Error(message);
};

export const gradeService = {
  /**
   * 1. Mengambil daftar siswa aktif di kelas beserta nilai mereka pada mata pelajaran tertentu
   */
  async getSubjectGradeSheet(params: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
    subjectId: string;
    teacherId?: string | null;
  }): Promise<ServiceResponse<GradeSheetRow[]>> {
    const schoolId = assertValidUuid(params.schoolId, 'ID sekolah');
    const academicYearId = assertValidUuid(params.academicYearId, 'ID tahun ajaran');
    const semesterId = assertValidUuid(params.semesterId, 'ID semester');
    const classId = assertValidUuid(params.classId, 'ID kelas');
    const subjectId = assertValidUuid(params.subjectId, 'ID mata pelajaran');
    const teacherId =
      params.teacherId && UUID_REGEX.test(params.teacherId) ? params.teacherId : null;

    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('id, nis, nisn, fullName, gender, birthPlace, birthDate, religion, address')
      .eq('schoolId', schoolId)
      .eq('classId', classId)
      .eq('status', 'AKTIF')
      .order('fullName', { ascending: true });

    if (studentError) {
      throw handleGradeDbError(studentError);
    }

    const { data: grades, error: gradeError } = await supabase
      .from('student_grades')
      .select('*')
      .eq('schoolId', schoolId)
      .eq('semesterId', semesterId)
      .eq('classId', classId)
      .eq('subjectId', subjectId);

    if (gradeError) {
      throw handleGradeDbError(gradeError);
    }

    const gradeMap = new Map<string, StudentGradeRecord>();
    (grades ?? []).forEach((row) => {
      const parsedFormative = Array.isArray(row.formativeScores)
        ? row.formativeScores.map((v: unknown) => Number(v)).filter((n: number) => !Number.isNaN(n))
        : [];

      gradeMap.set(String(row.studentId), {
        id: String(row.id),
        schoolId: String(row.schoolId),
        academicYearId: String(row.academicYearId),
        semesterId: String(row.semesterId),
        classId: String(row.classId),
        studentId: String(row.studentId),
        subjectId: String(row.subjectId),
        teacherId: row.teacherId ? String(row.teacherId) : teacherId,
        formativeScores: parsedFormative,
        formativeAvg: row.formativeAvg !== null && row.formativeAvg !== undefined ? Number(row.formativeAvg) : null,
        stsScore: row.stsScore !== null && row.stsScore !== undefined ? Number(row.stsScore) : null,
        sasScore: row.sasScore !== null && row.sasScore !== undefined ? Number(row.sasScore) : null,
        finalScore: row.finalScore !== null && row.finalScore !== undefined ? Number(row.finalScore) : null,
        predicate: row.predicate ? String(row.predicate) : null,
        stsCompetencyDescription: row.stsCompetencyDescription ? String(row.stsCompetencyDescription) : null,
        competencyDescription: row.competencyDescription ? String(row.competencyDescription) : null,
      });
    });

    const rows: GradeSheetRow[] = (students ?? []).map((st) => {
      const student: StudentBasicProfile = {
        id: String(st.id),
        nis: st.nis ? String(st.nis) : null,
        nisn: String(st.nisn ?? '-'),
        fullName: String(st.fullName ?? '-'),
        gender: String(st.gender ?? 'L'),
        birthPlace: String(st.birthPlace ?? '-'),
        birthDate: String(st.birthDate ?? ''),
        religion: st.religion ? String(st.religion) : null,
        address: String(st.address ?? '-'),
      };

      const existing = gradeMap.get(student.id);
      const defaultGrade: StudentGradeRecord = {
        schoolId,
        academicYearId,
        semesterId,
        classId,
        studentId: student.id,
        subjectId,
        teacherId,
        formativeScores: [],
        formativeAvg: null,
        stsScore: null,
        sasScore: null,
        finalScore: null,
        predicate: null,
        stsCompetencyDescription: null,
        competencyDescription: null,
      };

      return {
        student,
        grade: existing ?? defaultGrade,
        isManualFinalScore: false,
      };
    });

    return {
      success: true,
      data: rows,
      message: `Berhasil memuat ${rows.length} data nilai siswa.`,
    };
  },

  /**
   * 2. Menyimpan seluruh nilai mata pelajaran dalam 1 kelas sekaligus (Batch Upsert)
   */
  async saveSubjectGradesBatch(
    records: StudentGradeRecord[]
  ): Promise<ServiceResponse<number>> {
    if (records.length === 0) {
      return { success: true, data: 0, message: 'Tidak ada data nilai untuk disimpan.' };
    }

    const payload = records.map((item) => ({
      schoolId: item.schoolId,
      academicYearId: item.academicYearId,
      semesterId: item.semesterId,
      classId: item.classId,
      studentId: item.studentId,
      subjectId: item.subjectId,
      teacherId: item.teacherId ?? null,
      formativeScores: item.formativeScores,
      formativeAvg: item.formativeAvg,
      stsScore: item.stsScore,
      sasScore: item.sasScore,
      finalScore: item.finalScore,
      predicate: item.predicate,
      stsCompetencyDescription: item.stsCompetencyDescription,
      competencyDescription: item.competencyDescription,
    }));

    const { error } = await supabase
      .from('student_grades')
      .upsert(payload, {
        onConflict: 'schoolId,semesterId,studentId,subjectId',
      });

    if (error) {
      throw handleGradeDbError(error);
    }

    return {
      success: true,
      data: payload.length,
      message: `${payload.length} data nilai siswa berhasil disimpan.`,
    };
  },

  /**
   * 3. Mengambil catatan raport wali kelas, ekstrakurikuler, dan absensi 1 kelas
   */
  async getClassReportNotes(params: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
  }): Promise<ServiceResponse<Map<string, StudentReportNoteRecord>>> {
    const schoolId = assertValidUuid(params.schoolId, 'ID sekolah');
    const academicYearId = assertValidUuid(params.academicYearId, 'ID tahun ajaran');
    const semesterId = assertValidUuid(params.semesterId, 'ID semester');
    const classId = assertValidUuid(params.classId, 'ID kelas');

    const { data, error } = await supabase
      .from('student_report_notes')
      .select('*')
      .eq('schoolId', schoolId)
      .eq('semesterId', semesterId)
      .eq('classId', classId);

    if (error) {
      throw handleGradeDbError(error);
    }

    const noteMap = new Map<string, StudentReportNoteRecord>();
    (data ?? []).forEach((row) => {
      const rawExtra = Array.isArray(row.extracurriculars) ? row.extracurriculars : [];
      const parsedExtra: ExtracurricularItem[] = rawExtra.map((ex: Record<string, unknown>) => ({
        name: String(ex.name ?? ''),
        predicate: String(ex.predicate ?? 'Baik'),
        description: String(ex.description ?? ''),
      }));

      noteMap.set(String(row.studentId), {
        id: String(row.id),
        schoolId: String(row.schoolId),
        academicYearId: row.academicYearId ? String(row.academicYearId) : academicYearId,
        semesterId: String(row.semesterId),
        classId: String(row.classId),
        studentId: String(row.studentId),
        extracurriculars: parsedExtra,
        cocurricularNote: row.cocurricularNote ? String(row.cocurricularNote) : null,
        stsHomeroomNote: row.stsHomeroomNote ? String(row.stsHomeroomNote) : null,
        homeroomNote: row.homeroomNote ? String(row.homeroomNote) : null,
        stsSickDays: Number(row.stsSickDays ?? 0),
        stsPermissionDays: Number(row.stsPermissionDays ?? 0),
        stsAlphaDays: Number(row.stsAlphaDays ?? 0),
        sickDays: Number(row.sickDays ?? 0),
        permissionDays: Number(row.permissionDays ?? 0),
        alphaDays: Number(row.alphaDays ?? 0),
        promotionStatus: (row.promotionStatus as PromotionStatus) ?? 'PROSES',
        reportDateSts: row.reportDateSts ? String(row.reportDateSts) : null,
        reportDateSas: row.reportDateSas ? String(row.reportDateSas) : null,
        isStsPublished: Boolean(row.isStsPublished),
        isSasPublished: Boolean(row.isSasPublished),
      });
    });

    return {
      success: true,
      data: noteMap,
      message: 'Catatan raport berhasil dimuat.',
    };
  },

  /**
   * 4. Menyimpan catatan raport wali kelas per siswa
   */
  async saveStudentReportNote(
    note: StudentReportNoteRecord,
    updatedBy?: string | null
  ): Promise<ServiceResponse<null>> {
    const validUpdatedBy =
      updatedBy && UUID_REGEX.test(updatedBy) ? updatedBy : null;

    const { error } = await supabase
      .from('student_report_notes')
      .upsert(
        {
          schoolId: note.schoolId,
          academicYearId: note.academicYearId,
          semesterId: note.semesterId,
          classId: note.classId,
          studentId: note.studentId,
          extracurriculars: note.extracurriculars,
          cocurricularNote: note.cocurricularNote,
          stsHomeroomNote: note.stsHomeroomNote,
          homeroomNote: note.homeroomNote,
          stsSickDays: note.stsSickDays,
          stsPermissionDays: note.stsPermissionDays,
          stsAlphaDays: note.stsAlphaDays,
          sickDays: note.sickDays,
          permissionDays: note.permissionDays,
          alphaDays: note.alphaDays,
          promotionStatus: note.promotionStatus,
          reportDateSts: note.reportDateSts || null,
          reportDateSas: note.reportDateSas || null,
          isStsPublished: note.isStsPublished,
          isSasPublished: note.isSasPublished,
          updatedBy: validUpdatedBy,
        },
        { onConflict: 'schoolId,semesterId,studentId' }
      );

    if (error) {
      throw handleGradeDbError(error);
    }

    return {
      success: true,
      data: null,
      message: 'Catatan raport siswa berhasil disimpan.',
    };
  },

  /**
   * 5. Memanggil RPC Sinkronisasi Rekap Absensi Harian ke Raport (STS & SAS)
   */
  async syncAttendanceFromDaily(params: {
    schoolId: string;
    semesterId: string;
    classId: string;
  }): Promise<ServiceResponse<number>> {
    const schoolId = assertValidUuid(params.schoolId, 'ID sekolah');
    const semesterId = assertValidUuid(params.semesterId, 'ID semester');
    const classId = assertValidUuid(params.classId, 'ID kelas');

    const { data, error } = await supabase.rpc('sync_report_attendance_from_daily', {
      p_school_id: schoolId,
      p_semester_id: semesterId,
      p_class_id: classId,
    });

    if (error) {
      throw handleGradeDbError(error);
    }

    const affected = Number(data ?? 0);
    return {
      success: true,
      data: affected,
      message: `Rekap ketidakhadiran ${affected} siswa berhasil disinkronkan dari presensi harian.`,
    };
  },

  /**
   * 6. Memanggil RPC Peringkat Kelas (Khusus Guru/Wali Kelas)
   */
  async getClassRankings(params: {
    schoolId: string;
    semesterId: string;
    classId: string;
    examType: ReportExamMode;
  }): Promise<ServiceResponse<ClassRankingRow[]>> {
    const schoolId = assertValidUuid(params.schoolId, 'ID sekolah');
    const semesterId = assertValidUuid(params.semesterId, 'ID semester');
    const classId = assertValidUuid(params.classId, 'ID kelas');

    const { data, error } = await supabase.rpc('get_class_grade_rankings', {
      p_school_id: schoolId,
      p_semester_id: semesterId,
      p_class_id: classId,
      p_exam_type: params.examType,
    });

    if (error) {
      throw handleGradeDbError(error);
    }

    const rankings: ClassRankingRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      studentId: String(r.studentId),
      nis: r.nis ? String(r.nis) : null,
      nisn: String(r.nisn ?? '-'),
      fullName: String(r.fullName ?? '-'),
      gender: String(r.gender ?? '-'),
      gradedSubjects: Number(r.gradedSubjects ?? 0),
      totalScore: Number(r.totalScore ?? 0),
      averageScore: Number(r.averageScore ?? 0),
      rank: r.rank !== null && r.rank !== undefined ? Number(r.rank) : null,
    }));

    return {
      success: true,
      data: rankings,
      message: 'Peringkat kelas berhasil dimuat.',
    };
  },

  /**
   * 7. Mengambil paket data lengkap 1 siswa untuk dicetak ke PDF Raport (STS / SAS)
   */
  async getStudentCompleteReportBundle(params: {
    schoolId: string;
    semesterId: string;
    studentId: string;
  }): Promise<
    ServiceResponse<{
      school: SchoolReportProfile;
      subjects: SubjectOption[];
      grades: StudentGradeRecord[];
      achievements: StudentAchievementItem[];
    }>
  > {
    const schoolId = assertValidUuid(params.schoolId, 'ID sekolah');
    const semesterId = assertValidUuid(params.semesterId, 'ID semester');
    const studentId = assertValidUuid(params.studentId, 'ID siswa');

    const [schoolRes, subjectsRes, gradesRes, achievementsRes] = await Promise.all([
      supabase
        .from('schools')
        .select(
          'id, name, npsn, level, address, city, province, postalCode, phone, email, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl'
        )
        .eq('id', schoolId)
        .single(),
      supabase
        .from('subjects')
        .select('id, code, name, category, sortOrder')
        .eq('schoolId', schoolId)
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('student_grades')
        .select('*')
        .eq('schoolId', schoolId)
        .eq('semesterId', semesterId)
        .eq('studentId', studentId),
      supabase
        .from('student_achievements')
        .select('id, title, category, level, rank, year, organizer, showOnReport')
        .eq('schoolId', schoolId)
        .eq('studentId', studentId)
        .eq('showOnReport', true)
        .order('year', { ascending: false }),
    ]);

    if (schoolRes.error) throw handleGradeDbError(schoolRes.error);
    if (subjectsRes.error) throw handleGradeDbError(subjectsRes.error);
    if (gradesRes.error) throw handleGradeDbError(gradesRes.error);
    if (achievementsRes.error) throw handleGradeDbError(achievementsRes.error);

    return {
      success: true,
      data: {
        school: schoolRes.data as SchoolReportProfile,
        subjects: (subjectsRes.data ?? []) as SubjectOption[],
        grades: (gradesRes.data ?? []) as StudentGradeRecord[],
        achievements: (achievementsRes.data ?? []) as StudentAchievementItem[],
      },
      message: 'Paket data raport berhasil dimuat.',
    };
  },
};