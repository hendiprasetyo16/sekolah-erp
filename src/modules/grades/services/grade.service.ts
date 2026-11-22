// src/modules/grades/services/grade.service.ts
import { supabase } from '@/services/supabase.client';
import type {
  ClassRankingRow,
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
 * Struktur satu baris data pada lembar input nilai guru per mata pelajaran.
 */
export interface GradeSheetRow {
  student: StudentBasicProfile;
  grade: StudentGradeRecord;
  isManualFinalScore?: boolean;
}

/**
 * Helper internal: mengubah baris mentah tabel `students` menjadi tipe `StudentBasicProfile`.
 */
function mapStudentRow(row: Record<string, unknown>): StudentBasicProfile {
  return {
    id: String(row.id),
    nis: row.nis ? String(row.nis) : null,
    nisn: String(row.nisn ?? '-'),
    fullName: String(row.fullName ?? '-'),
    gender: String(row.gender ?? 'L'),
    birthPlace: String(row.birthPlace ?? '-'),
    birthDate: String(row.birthDate ?? ''),
    religion: row.religion ? String(row.religion) : null,
    address: String(row.address ?? '-'),
  };
}

/**
 * Helper internal: mengubah baris mentah tabel `student_grades` menjadi tipe `StudentGradeRecord`.
 */
function mapGradeRow(
  row: Record<string, unknown>,
  fallback: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
    studentId: string;
    subjectId: string;
    teacherId?: string | null;
  }
): StudentGradeRecord {
  const rawScores = Array.isArray(row.formativeScores)
    ? row.formativeScores.map((n) => Number(n)).filter((n) => !Number.isNaN(n))
    : [];

  return {
    id: row.id ? String(row.id) : undefined,
    schoolId: String(row.schoolId ?? fallback.schoolId),
    academicYearId: String(row.academicYearId ?? fallback.academicYearId),
    semesterId: String(row.semesterId ?? fallback.semesterId),
    classId: String(row.classId ?? fallback.classId),
    studentId: String(row.studentId ?? fallback.studentId),
    subjectId: String(row.subjectId ?? fallback.subjectId),
    teacherId: row.teacherId
      ? String(row.teacherId)
      : fallback.teacherId ?? null,
    formativeScores: rawScores,
    formativeAvg:
      row.formativeAvg !== null && row.formativeAvg !== undefined
        ? Number(row.formativeAvg)
        : null,
    stsScore:
      row.stsScore !== null && row.stsScore !== undefined
        ? Number(row.stsScore)
        : null,
    sasScore:
      row.sasScore !== null && row.sasScore !== undefined
        ? Number(row.sasScore)
        : null,
    finalScore:
      row.finalScore !== null && row.finalScore !== undefined
        ? Number(row.finalScore)
        : null,
    predicate: row.predicate ? String(row.predicate) : null,
    stsCompetencyDescription: row.stsCompetencyDescription
      ? String(row.stsCompetencyDescription)
      : null,
    competencyDescription: row.competencyDescription
      ? String(row.competencyDescription)
      : null,
  };
}

/**
 * Helper internal: mengubah baris mentah tabel `student_report_notes` menjadi tipe `StudentReportNoteRecord`.
 */
function mapReportNoteRow(
  row: Record<string, unknown>
): StudentReportNoteRecord {
  return {
    id: row.id ? String(row.id) : undefined,
    schoolId: String(row.schoolId),
    academicYearId: String(row.academicYearId),
    semesterId: String(row.semesterId),
    classId: String(row.classId),
    studentId: String(row.studentId),
    extracurriculars: Array.isArray(row.extracurriculars)
      ? row.extracurriculars
      : [],
    cocurricularNote: row.cocurricularNote
      ? String(row.cocurricularNote)
      : null,
    stsHomeroomNote: row.stsHomeroomNote ? String(row.stsHomeroomNote) : null,
    homeroomNote: row.homeroomNote ? String(row.homeroomNote) : null,
    stsSickDays: Number(row.stsSickDays ?? 0),
    stsPermissionDays: Number(row.stsPermissionDays ?? 0),
    stsAlphaDays: Number(row.stsAlphaDays ?? 0),
    sickDays: Number(row.sickDays ?? 0),
    permissionDays: Number(row.permissionDays ?? 0),
    alphaDays: Number(row.alphaDays ?? 0),
    promotionStatus:
      (row.promotionStatus as StudentReportNoteRecord['promotionStatus']) ??
      'PROSES',
    reportDateSts: row.reportDateSts ? String(row.reportDateSts) : null,
    reportDateSas: row.reportDateSas ? String(row.reportDateSas) : null,
    isStsPublished: Boolean(row.isStsPublished),
    isSasPublished: Boolean(row.isSasPublished),
  };
}

export const gradeService = {
  /**
   * 1. Mengambil lembar nilai siswa dalam 1 kelas untuk 1 mata pelajaran.
   */
  async getSubjectGradeSheet(params: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
    subjectId: string;
    teacherId?: string | null;
  }): Promise<ServiceResponse<GradeSheetRow[]>> {
    const {
      schoolId,
      academicYearId,
      semesterId,
      classId,
      subjectId,
      teacherId,
    } = params;

    const [studentsRes, gradesRes] = await Promise.all([
      supabase
        .from('students')
        .select(
          'id, nis, nisn, fullName, gender, birthPlace, birthDate, religion, address'
        )
        .eq('schoolId', schoolId)
        .eq('classId', classId)
        .eq('status', 'AKTIF')
        .order('fullName', { ascending: true }),
      supabase
        .from('student_grades')
        .select('*')
        .eq('schoolId', schoolId)
        .eq('semesterId', semesterId)
        .eq('classId', classId)
        .eq('subjectId', subjectId),
    ]);

    if (studentsRes.error) {
      throw new Error(`Gagal memuat data siswa: ${studentsRes.error.message}`);
    }
    if (gradesRes.error) {
      throw new Error(`Gagal memuat data nilai: ${gradesRes.error.message}`);
    }

    const gradeByStudent = new Map<string, Record<string, unknown>>();
    (gradesRes.data ?? []).forEach((g: Record<string, unknown>) => {
      gradeByStudent.set(String(g.studentId), g);
    });

    const rows: GradeSheetRow[] = (studentsRes.data ?? []).map(
      (stRow: Record<string, unknown>) => {
        const student = mapStudentRow(stRow);
        const existing = gradeByStudent.get(student.id);

        const grade: StudentGradeRecord = existing
          ? mapGradeRow(existing, {
              schoolId,
              academicYearId,
              semesterId,
              classId,
              studentId: student.id,
              subjectId,
              teacherId,
            })
          : {
              schoolId,
              academicYearId,
              semesterId,
              classId,
              studentId: student.id,
              subjectId,
              teacherId: teacherId ?? null,
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
          grade,
          isManualFinalScore: false,
        };
      }
    );

    return {
      success: true,
      data: rows,
      message: 'Lembar nilai berhasil dimuat.',
    };
  },

  /**
   * 2. Menyimpan nilai satu kelas secara massal (update baris lama & insert baris baru).
   */
  async saveSubjectGradesBatch(
    records: StudentGradeRecord[]
  ): Promise<ServiceResponse<null>> {
    const meaningfulRecords = records.filter(
      (r) =>
        Boolean(r.id) ||
        r.formativeScores.length > 0 ||
        r.stsScore !== null ||
        r.sasScore !== null ||
        r.finalScore !== null ||
        Boolean(r.stsCompetencyDescription?.trim()) ||
        Boolean(r.competencyDescription?.trim())
    );

    if (meaningfulRecords.length === 0) {
      return {
        success: true,
        data: null,
        message: 'Tidak ada perubahan nilai untuk disimpan.',
      };
    }

    const toUpdate = meaningfulRecords.filter((r) => Boolean(r.id));
    const toInsert = meaningfulRecords.filter((r) => !r.id);

    for (const item of toUpdate) {
      const { error } = await supabase
        .from('student_grades')
        .update({
          teacherId: item.teacherId ?? null,
          formativeScores: item.formativeScores,
          formativeAvg: item.formativeAvg,
          stsScore: item.stsScore,
          sasScore: item.sasScore,
          finalScore: item.finalScore,
          predicate: item.predicate,
          stsCompetencyDescription:
            item.stsCompetencyDescription?.trim() || null,
          competencyDescription: item.competencyDescription?.trim() || null,
        })
        .eq('id', item.id!);

      if (error) {
        throw new Error(`Gagal memperbarui nilai siswa: ${error.message}`);
      }
    }

    if (toInsert.length > 0) {
      const insertPayload = toInsert.map((item) => ({
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
        stsCompetencyDescription:
          item.stsCompetencyDescription?.trim() || null,
        competencyDescription: item.competencyDescription?.trim() || null,
      }));

      const { error } = await supabase
        .from('student_grades')
        .insert(insertPayload);

      if (error) {
        throw new Error(`Gagal menyimpan nilai baru: ${error.message}`);
      }
    }

    return {
      success: true,
      data: null,
      message: `${meaningfulRecords.length} data nilai siswa berhasil disimpan.`,
    };
  },

  /**
   * 3. Mengambil seluruh catatan wali kelas & status publikasi raport satu kelas.
   */
  async getClassReportNotes(params: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
  }): Promise<ServiceResponse<Map<string, StudentReportNoteRecord>>> {
    const { data, error } = await supabase
      .from('student_report_notes')
      .select('*')
      .eq('schoolId', params.schoolId)
      .eq('academicYearId', params.academicYearId)
      .eq('semesterId', params.semesterId)
      .eq('classId', params.classId);

    if (error) {
      throw new Error(`Gagal memuat catatan raport: ${error.message}`);
    }

    const map = new Map<string, StudentReportNoteRecord>();
    (data ?? []).forEach((row: Record<string, unknown>) => {
      const mapped = mapReportNoteRow(row);
      map.set(mapped.studentId, mapped);
    });

    return {
      success: true,
      data: map,
      message: 'Catatan wali kelas berhasil dimuat.',
    };
  },

  /**
   * 4. Menyimpan catatan wali kelas, ekskul, absensi, dan status publikasi untuk 1 siswa.
   */
  async saveStudentReportNote(
    note: StudentReportNoteRecord,
    updatedBy?: string
  ): Promise<ServiceResponse<StudentReportNoteRecord>> {
    const payload = {
      schoolId: note.schoolId,
      academicYearId: note.academicYearId,
      semesterId: note.semesterId,
      classId: note.classId,
      studentId: note.studentId,
      extracurriculars: note.extracurriculars.filter((ex) => ex.name.trim()),
      cocurricularNote: note.cocurricularNote?.trim() || null,
      stsHomeroomNote: note.stsHomeroomNote?.trim() || null,
      homeroomNote: note.homeroomNote?.trim() || null,
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
      updatedBy: updatedBy ?? null,
    };

    let targetId = note.id;
    if (!targetId) {
      const { data: existing } = await supabase
        .from('student_report_notes')
        .select('id')
        .eq('semesterId', note.semesterId)
        .eq('studentId', note.studentId)
        .maybeSingle();

      if (existing?.id) {
        targetId = String(existing.id);
      }
    }

    if (targetId) {
      const { data, error } = await supabase
        .from('student_report_notes')
        .update(payload)
        .eq('id', targetId)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Gagal memperbarui catatan raport: ${error.message}`);
      }

      return {
        success: true,
        data: mapReportNoteRow(data as Record<string, unknown>),
        message: 'Catatan raport siswa berhasil diperbarui.',
      };
    }

    const { data, error } = await supabase
      .from('student_report_notes')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Gagal menyimpan catatan raport: ${error.message}`);
    }

    return {
      success: true,
      data: mapReportNoteRow(data as Record<string, unknown>),
      message: 'Catatan raport siswa berhasil disimpan.',
    };
  },

  /**
   * 5. Publikasi atau tarik publikasi raport STS / SAS untuk seluruh siswa dalam 1 kelas.
   */
  async publishClassReportsBatch(params: {
    schoolId: string;
    academicYearId: string;
    semesterId: string;
    classId: string;
    studentIds: string[];
    existingNotesMap: Map<string, StudentReportNoteRecord>;
    mode: ReportExamMode;
    isPublished: boolean;
    updatedBy?: string;
  }): Promise<ServiceResponse<null>> {
    const today = new Date().toISOString().slice(0, 10);

    for (const studentId of params.studentIds) {
      const current = params.existingNotesMap.get(studentId) ?? {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        semesterId: params.semesterId,
        classId: params.classId,
        studentId,
        extracurriculars: [],
        cocurricularNote: null,
        stsHomeroomNote: null,
        homeroomNote: null,
        stsSickDays: 0,
        stsPermissionDays: 0,
        stsAlphaDays: 0,
        sickDays: 0,
        permissionDays: 0,
        alphaDays: 0,
        promotionStatus: 'PROSES' as const,
        reportDateSts: today,
        reportDateSas: today,
        isStsPublished: false,
        isSasPublished: false,
      };

      const updated: StudentReportNoteRecord = {
        ...current,
        isStsPublished:
          params.mode === 'STS' ? params.isPublished : current.isStsPublished,
        isSasPublished:
          params.mode === 'SAS' ? params.isPublished : current.isSasPublished,
      };

      await this.saveStudentReportNote(updated, params.updatedBy);
    }

    return {
      success: true,
      data: null,
      message: `Raport ${params.mode} untuk ${params.studentIds.length} siswa berhasil ${
        params.isPublished ? 'dipublikasikan' : 'disembunyikan'
      }.`,
    };
  },

  /**
   * 6. Menyinkronkan rekap ketidakhadiran (Sakit, Izin, Alpha) dari absensi harian.
   */
  async syncAttendanceFromDaily(params: {
    schoolId: string;
    semesterId: string;
    classId: string;
  }): Promise<ServiceResponse<number>> {
    const { data: semRow, error: semErr } = await supabase
      .from('semesters')
      .select('academicYearId, startDate, endDate')
      .eq('id', params.semesterId)
      .single();

    if (semErr || !semRow) {
      throw new Error('Data periode semester tidak ditemukan.');
    }

    const { data: students, error: stErr } = await supabase
      .from('students')
      .select('id')
      .eq('schoolId', params.schoolId)
      .eq('classId', params.classId)
      .eq('status', 'AKTIF');

    if (stErr) {
      throw new Error(`Gagal memuat siswa kelas: ${stErr.message}`);
    }

    const studentIds = (students ?? []).map((s) => String(s.id));
    if (studentIds.length === 0) {
      return {
        success: true,
        data: 0,
        message: 'Tidak ada siswa aktif di kelas ini.',
      };
    }

    const { data: attRows, error: attErr } = await supabase
      .from('attendances')
      .select('studentId, status, date')
      .eq('schoolId', params.schoolId)
      .in('studentId', studentIds)
      .gte('date', String(semRow.startDate))
      .lte('date', String(semRow.endDate));

    if (attErr) {
      throw new Error(`Gagal membaca tabel absensi harian: ${attErr.message}`);
    }

    const counter = new Map<
      string,
      { sick: number; permission: number; alpha: number }
    >();
    studentIds.forEach((id) =>
      counter.set(id, { sick: 0, permission: 0, alpha: 0 })
    );

    (attRows ?? []).forEach((row: Record<string, unknown>) => {
      const stId = String(row.studentId);
      const status = String(row.status ?? '').toUpperCase();
      const entry = counter.get(stId);
      if (!entry) return;

      if (status === 'SAKIT' || status === 'S') entry.sick += 1;
      else if (status === 'IZIN' || status === 'I') entry.permission += 1;
      else if (status === 'ALPHA' || status === 'ALPA' || status === 'A')
        entry.alpha += 1;
    });

    const notesRes = await this.getClassReportNotes({
      schoolId: params.schoolId,
      academicYearId: String(semRow.academicYearId),
      semesterId: params.semesterId,
      classId: params.classId,
    });

    const today = new Date().toISOString().slice(0, 10);
    for (const stId of studentIds) {
      const counts = counter.get(stId) ?? { sick: 0, permission: 0, alpha: 0 };
      const existing = notesRes.data.get(stId);

      await this.saveStudentReportNote({
        id: existing?.id,
        schoolId: params.schoolId,
        academicYearId: String(semRow.academicYearId),
        semesterId: params.semesterId,
        classId: params.classId,
        studentId: stId,
        extracurriculars: existing?.extracurriculars ?? [],
        cocurricularNote: existing?.cocurricularNote ?? null,
        stsHomeroomNote: existing?.stsHomeroomNote ?? null,
        homeroomNote: existing?.homeroomNote ?? null,
        stsSickDays: existing?.stsSickDays ?? counts.sick,
        stsPermissionDays: existing?.stsPermissionDays ?? counts.permission,
        stsAlphaDays: existing?.stsAlphaDays ?? counts.alpha,
        sickDays: counts.sick,
        permissionDays: counts.permission,
        alphaDays: counts.alpha,
        promotionStatus: existing?.promotionStatus ?? 'PROSES',
        reportDateSts: existing?.reportDateSts ?? today,
        reportDateSas: existing?.reportDateSas ?? today,
        isStsPublished: existing?.isStsPublished ?? false,
        isSasPublished: existing?.isSasPublished ?? false,
      });
    }

    return {
      success: true,
      data: studentIds.length,
      message: `Rekap ketidakhadiran ${studentIds.length} siswa berhasil disinkronkan dari absensi harian.`,
    };
  },

  /**
   * 7. Menghitung peringkat kelas internal (khusus Guru / Wali Kelas / Kepsek).
   */
  async getClassRankings(params: {
    schoolId: string;
    semesterId: string;
    classId: string;
    examType: ReportExamMode;
  }): Promise<ServiceResponse<ClassRankingRow[]>> {
    const [studentsRes, gradesRes] = await Promise.all([
      supabase
        .from('students')
        .select('id, nis, nisn, fullName, gender')
        .eq('schoolId', params.schoolId)
        .eq('classId', params.classId)
        .eq('status', 'AKTIF'),
      supabase
        .from('student_grades')
        .select('studentId, formativeAvg, stsScore, finalScore')
        .eq('schoolId', params.schoolId)
        .eq('semesterId', params.semesterId)
        .eq('classId', params.classId),
    ]);

    if (studentsRes.error) {
      throw new Error(`Gagal memuat siswa: ${studentsRes.error.message}`);
    }
    if (gradesRes.error) {
      throw new Error(`Gagal memuat nilai: ${gradesRes.error.message}`);
    }

    const scoreMap = new Map<string, number[]>();
    (gradesRes.data ?? []).forEach((g: Record<string, unknown>) => {
      const stId = String(g.studentId);
      const rawScore =
        params.examType === 'STS'
          ? g.stsScore ?? g.formativeAvg
          : g.finalScore;

      if (rawScore !== null && rawScore !== undefined) {
        const list = scoreMap.get(stId) ?? [];
        list.push(Number(rawScore));
        scoreMap.set(stId, list);
      }
    });

    const rows: ClassRankingRow[] = (studentsRes.data ?? []).map(
      (st: Record<string, unknown>) => {
        const stId = String(st.id);
        const scores = scoreMap.get(stId) ?? [];
        const total = scores.reduce((acc, v) => acc + v, 0);
        const avg = scores.length > 0 ? total / scores.length : 0;

        return {
          studentId: stId,
          nis: st.nis ? String(st.nis) : null,
          nisn: String(st.nisn ?? '-'),
          fullName: String(st.fullName ?? '-'),
          gender: String(st.gender ?? 'L'),
          gradedSubjects: scores.length,
          totalScore: Math.round(total * 100) / 100,
          averageScore: Math.round(avg * 100) / 100,
          rank: null,
        };
      }
    );

    rows.sort((a, b) => b.averageScore - a.averageScore);

    let currentRank = 1;
    rows.forEach((row, idx) => {
      if (row.gradedSubjects === 0) {
        row.rank = null;
        return;
      }
      if (idx > 0 && row.averageScore < rows[idx - 1].averageScore) {
        currentRank = idx + 1;
      }
      row.rank = currentRank;
    });

    return {
      success: true,
      data: rows,
      message: 'Peringkat kelas berhasil dihitung.',
    };
  },

  /**
   * 8. Mengambil paket lengkap data raport 1 siswa (untuk Portal Siswa & Cetak PDF).
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
    const [schoolRes, subjectsRes, gradesRes, achRes] = await Promise.all([
      supabase
        .from('schools')
        .select(
          'id, name, npsn, level, address, city, province, postalCode, phone, email, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl'
        )
        .eq('id', params.schoolId)
        .single(),
      supabase
        .from('subjects')
        .select('id, code, name, category, sortOrder')
        .eq('schoolId', params.schoolId)
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('student_grades')
        .select('*')
        .eq('schoolId', params.schoolId)
        .eq('semesterId', params.semesterId)
        .eq('studentId', params.studentId),
      supabase
        .from('student_achievements')
        .select(
          'id, title, category, level, rank, year, organizer, showOnReport'
        )
        .eq('schoolId', params.schoolId)
        .eq('studentId', params.studentId)
        .eq('showOnReport', true)
        .order('year', { ascending: false }),
    ]);

    if (schoolRes.error || !schoolRes.data) {
      throw new Error('Data profil sekolah tidak ditemukan.');
    }
    if (subjectsRes.error) {
      throw new Error(
        `Gagal memuat mata pelajaran: ${subjectsRes.error.message}`
      );
    }
    if (gradesRes.error) {
      throw new Error(`Gagal memuat nilai siswa: ${gradesRes.error.message}`);
    }

    const subjects: SubjectOption[] = (subjectsRes.data ?? []).map(
      (s: Record<string, unknown>) => ({
        id: String(s.id),
        code: s.code ? String(s.code) : null,
        name: String(s.name),
        category: String(s.category ?? 'UMUM'),
        sortOrder: Number(s.sortOrder ?? 100),
      })
    );

    const grades: StudentGradeRecord[] = (gradesRes.data ?? []).map(
      (g: Record<string, unknown>) =>
        mapGradeRow(g, {
          schoolId: params.schoolId,
          academicYearId: String(g.academicYearId ?? ''),
          semesterId: params.semesterId,
          classId: String(g.classId ?? ''),
          studentId: params.studentId,
          subjectId: String(g.subjectId ?? ''),
        })
    );

    const achievements: StudentAchievementItem[] = (achRes.data ?? []).map(
      (a: Record<string, unknown>) => ({
        id: String(a.id),
        title: String(a.title),
        category: String(a.category ?? 'NON_AKADEMIK'),
        level: String(a.level ?? 'KABUPATEN'),
        rank: a.rank ? String(a.rank) : null,
        year: Number(a.year ?? new Date().getFullYear()),
        organizer: a.organizer ? String(a.organizer) : null,
        showOnReport: Boolean(a.showOnReport ?? true),
      })
    );

    return {
      success: true,
      data: {
        school: schoolRes.data as SchoolReportProfile,
        subjects,
        grades,
        achievements,
      },
      message: 'Paket data raport siswa berhasil dimuat.',
    };
  },

  /**
   * 9. Mengambil paket lengkap data raport seluruh siswa dalam 1 kelas (untuk Cetak PDF Batch).
   */
  async getClassCompleteReportBundles(params: {
    schoolId: string;
    semesterId: string;
    classId: string;
    studentIds: string[];
  }): Promise<
    ServiceResponse<{
      school: SchoolReportProfile;
      subjects: SubjectOption[];
      gradesByStudent: Map<string, StudentGradeRecord[]>;
      achievementsByStudent: Map<string, StudentAchievementItem[]>;
    }>
  > {
    const [schoolRes, subjectsRes, gradesRes, achRes] = await Promise.all([
      supabase
        .from('schools')
        .select(
          'id, name, npsn, level, address, city, province, postalCode, phone, email, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl'
        )
        .eq('id', params.schoolId)
        .single(),
      supabase
        .from('subjects')
        .select('id, code, name, category, sortOrder')
        .eq('schoolId', params.schoolId)
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('student_grades')
        .select('*')
        .eq('schoolId', params.schoolId)
        .eq('semesterId', params.semesterId)
        .eq('classId', params.classId),
      params.studentIds.length > 0
        ? supabase
            .from('student_achievements')
            .select(
              'id, studentId, title, category, level, rank, year, organizer, showOnReport'
            )
            .eq('schoolId', params.schoolId)
            .in('studentId', params.studentIds)
            .eq('showOnReport', true)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (schoolRes.error || !schoolRes.data) {
      throw new Error('Data profil sekolah tidak ditemukan.');
    }
    if (subjectsRes.error) {
      throw new Error(
        `Gagal memuat mata pelajaran: ${subjectsRes.error.message}`
      );
    }
    if (gradesRes.error) {
      throw new Error(`Gagal memuat nilai kelas: ${gradesRes.error.message}`);
    }

    const subjects: SubjectOption[] = (subjectsRes.data ?? []).map(
      (s: Record<string, unknown>) => ({
        id: String(s.id),
        code: s.code ? String(s.code) : null,
        name: String(s.name),
        category: String(s.category ?? 'UMUM'),
        sortOrder: Number(s.sortOrder ?? 100),
      })
    );

    const gradesByStudent = new Map<string, StudentGradeRecord[]>();
    (gradesRes.data ?? []).forEach((g: Record<string, unknown>) => {
      const stId = String(g.studentId);
      const list = gradesByStudent.get(stId) ?? [];
      list.push(
        mapGradeRow(g, {
          schoolId: params.schoolId,
          academicYearId: String(g.academicYearId ?? ''),
          semesterId: params.semesterId,
          classId: params.classId,
          studentId: stId,
          subjectId: String(g.subjectId ?? ''),
        })
      );
      gradesByStudent.set(stId, list);
    });

    const achievementsByStudent = new Map<string, StudentAchievementItem[]>();
    (achRes.data ?? []).forEach((a: Record<string, unknown>) => {
      const stId = String(a.studentId);
      const list = achievementsByStudent.get(stId) ?? [];
      list.push({
        id: String(a.id),
        title: String(a.title),
        category: String(a.category ?? 'NON_AKADEMIK'),
        level: String(a.level ?? 'KABUPATEN'),
        rank: a.rank ? String(a.rank) : null,
        year: Number(a.year ?? new Date().getFullYear()),
        organizer: a.organizer ? String(a.organizer) : null,
        showOnReport: Boolean(a.showOnReport ?? true),
      });
      achievementsByStudent.set(stId, list);
    });

    return {
      success: true,
      data: {
        school: schoolRes.data as SchoolReportProfile,
        subjects,
        gradesByStudent,
        achievementsByStudent,
      },
      message: 'Paket data raport satu kelas berhasil dimuat.',
    };
  },
};