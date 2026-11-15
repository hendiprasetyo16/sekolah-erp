// src/modules/attendance/services/attendance.service.ts
import { supabase } from '@/services/supabase.client';
import type {
  AttendanceStatus,
  AttendanceSettings,
  StudentAttendance,
  TeacherAttendance,
  AttendanceSummary,
  SchoolCoordinates,
  ClassStudentAttendanceRow,
} from '../types/attendance.types';
import { isAfterDeadline } from './gps.utils';

const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  checkInDeadline: '07:30',
  checkOutStart: '14:00',
  requireSelfie: false,
};

export const attendanceService = {
  // ---- KONFIGURASI & PROFIL ----

  async getSchoolCoordinates(schoolId: string): Promise<SchoolCoordinates> {
    const { data, error } = await supabase
      .from('schools')
      .select('latitude, longitude, attendanceRadiusMeters, settings')
      .eq('id', schoolId)
      .single();

    if (error) throw error;

    const rawSettings = (data?.settings as Record<string, any>) ?? {};
    const attendanceCfg = rawSettings.attendance ?? {};

    return {
      latitude: data?.latitude ?? null,
      longitude: data?.longitude ?? null,
      attendanceRadiusMeters: data?.attendanceRadiusMeters ?? 200,
      settings: {
        checkInDeadline: attendanceCfg.checkInDeadline ?? DEFAULT_ATTENDANCE_SETTINGS.checkInDeadline,
        checkOutStart: attendanceCfg.checkOutStart ?? DEFAULT_ATTENDANCE_SETTINGS.checkOutStart,
        requireSelfie: Boolean(attendanceCfg.requireSelfie ?? DEFAULT_ATTENDANCE_SETTINGS.requireSelfie),
      },
    };
  },

  /**
   * Cari profil guru/PTK berdasarkan userId (utama, sesuai RLS v17)
   * dengan fallback ke email atau fullName jika belum tertaut
   */
  async getTeacherProfileByUser(params: {
    schoolId: string;
    userId: string;
    email?: string | null;
    fullName?: string | null;
  }) {
    // 1. Prioritas utama: berdasarkan userId
    const { data: byUser, error: errUser } = await supabase
      .from('teachers')
      .select('id, fullName, nip, nuptk, position, userId')
      .eq('schoolId', params.schoolId)
      .eq('userId', params.userId)
      .eq('isActive', true)
      .maybeSingle();

    if (errUser) throw errUser;
    if (byUser) return byUser;

    // 2. Fallback: berdasarkan email
    if (params.email) {
      const { data: byEmail } = await supabase
        .from('teachers')
        .select('id, fullName, nip, nuptk, position, userId')
        .eq('schoolId', params.schoolId)
        .ilike('email', params.email.trim())
        .eq('isActive', true)
        .maybeSingle();

      if (byEmail) return byEmail;
    }

    // 3. Fallback terakhir: berdasarkan nama lengkap
    if (params.fullName) {
      const { data: byName } = await supabase
        .from('teachers')
        .select('id, fullName, nip, nuptk, position, userId')
        .eq('schoolId', params.schoolId)
        .ilike('fullName', params.fullName.trim())
        .eq('isActive', true)
        .maybeSingle();

      if (byName) return byName;
    }

    return null;
  },

  // ---- STORAGE SELFIE ----

  async uploadTeacherSelfie(params: {
    schoolId: string;
    teacherId: string;
    date: string;
    blob: Blob;
  }): Promise<string> {
    const filePath = `${params.schoolId}/${params.teacherId}/${params.date}_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('attendance-selfies')
      .upload(filePath, params.blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;
    return filePath;
  },

  async getSignedSelfieUrl(path: string): Promise<string | null> {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    const { data, error } = await supabase.storage
      .from('attendance-selfies')
      .createSignedUrl(path, 3600); // Berlaku 1 jam

    if (error) return null;
    return data.signedUrl;
  },

  // ---- HELPER KHUSUS SUPER_ADMIN TEST MODE ----

  async getActiveTeachersForSimulation(schoolId: string) {
    const { data, error } = await supabase
      .from('teachers')
      .select('id, fullName, nip, nuptk, position, userId')
      .eq('schoolId', schoolId)
      .eq('isActive', true)
      .order('fullName', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async getAllSchoolsForSimulation() {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, npsn')
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async resetTeacherAttendanceForTest(params: {
    schoolId: string;
    teacherId: string;
    date: string;
    selfiePath?: string | null;
  }) {
    if (params.selfiePath && !params.selfiePath.startsWith('http')) {
      await supabase.storage
        .from('attendance-selfies')
        .remove([params.selfiePath]);
    }

    const { error } = await supabase
      .from('attendances')
      .delete()
      .eq('schoolId', params.schoolId)
      .eq('teacherId', params.teacherId)
      .eq('date', params.date)
      .eq('type', 'GURU');

    if (error) throw error;
    return { success: true };
  },
  
  // ---- STUDENT ATTENDANCE ----

  async studentCheckIn(payload: {
    schoolId: string;
    studentId: string;
    date: string;
    status: 'HADIR' | 'TERLAMBAT';
    notes?: string;
    recordedBy?: string;
  }) {
    const { data: existing } = await supabase
      .from('attendances')
      .select('id, status')
      .eq('schoolId', payload.schoolId)
      .eq('studentId', payload.studentId)
      .eq('date', payload.date)
      .eq('type', 'SISWA')
      .maybeSingle();

    if (existing) {
      return { success: false, message: 'Siswa sudah absen hari ini.', data: existing };
    }

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        schoolId: payload.schoolId,
        studentId: payload.studentId,
        date: payload.date,
        type: 'SISWA',
        status: payload.status,
        notes: payload.notes ?? null,
        recordedBy: payload.recordedBy ?? null,
        checkInTime: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, message: 'Absen berhasil dicatat.', data };
  },

  /**
   * Mengambil daftar seluruh siswa dalam 1 kelas digabung dengan status absensi tanggal tertentu
   * Digunakan oleh Wali Kelas / Guru Piket
   */
  async getClassAttendanceSheet(params: {
    schoolId: string;
    classId: string;
    date: string;
  }): Promise<ClassStudentAttendanceRow[]> {
    const [studentsRes, attendancesRes] = await Promise.all([
      supabase
        .from('students')
        .select('id, fullName, nisn, nis, photoUrl')
        .eq('schoolId', params.schoolId)
        .eq('classId', params.classId)
        .eq('status', 'AKTIF')
        .order('fullName', { ascending: true }),
      supabase
        .from('attendances')
        .select('id, studentId, status, notes, checkInTime, recordedBy')
        .eq('schoolId', params.schoolId)
        .eq('date', params.date)
        .eq('type', 'SISWA'),
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (attendancesRes.error) throw attendancesRes.error;

    const attendanceMap = new Map<string, any>();
    for (const att of attendancesRes.data ?? []) {
      if (att.studentId) attendanceMap.set(att.studentId, att);
    }

    return (studentsRes.data ?? []).map((st: any) => {
      const att = attendanceMap.get(st.id);
      return {
        studentId: st.id,
        fullName: st.fullName,
        nisn: st.nisn,
        nis: st.nis,
        photoUrl: st.photoUrl,
        attendanceId: att?.id,
        status: (att?.status as AttendanceStatus) ?? null,
        checkInTime: att?.checkInTime ?? null,
        notes: att?.notes ?? '',
        isFromKiosk: Boolean(att && !att.recordedBy),
      };
    });
  },

  /**
   * Simpan absensi massal per kelas (aman terhadap partial unique index PostgreSQL v17)
   */
  async bulkStudentAttendance(payload: {
    schoolId: string;
    date: string;
    records: Array<{
      studentId: string;
      status: AttendanceStatus;
      notes?: string;
    }>;
    recordedBy: string;
  }) {
    if (payload.records.length === 0) return { success: true, count: 0 };

    const studentIds = payload.records.map((r) => r.studentId);

    const { data: existingRows, error: fetchErr } = await supabase
      .from('attendances')
      .select('id, studentId, checkInTime')
      .eq('schoolId', payload.schoolId)
      .eq('date', payload.date)
      .eq('type', 'SISWA')
      .in('studentId', studentIds);

    if (fetchErr) throw fetchErr;

    const existingMap = new Map<string, { id: string; checkInTime: string | null }>();
    for (const row of existingRows ?? []) {
      if (row.studentId) existingMap.set(row.studentId, row);
    }

    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; status: AttendanceStatus; notes: string | null }> = [];
    const nowIso = new Date().toISOString();

    for (const rec of payload.records) {
      const existing = existingMap.get(rec.studentId);
      if (existing) {
        toUpdate.push({
          id: existing.id,
          status: rec.status,
          notes: rec.notes?.trim() ? rec.notes.trim() : null,
        });
      } else {
        toInsert.push({
          schoolId: payload.schoolId,
          studentId: rec.studentId,
          date: payload.date,
          type: 'SISWA',
          status: rec.status,
          notes: rec.notes?.trim() ? rec.notes.trim() : null,
          recordedBy: payload.recordedBy,
          checkInTime: rec.status === 'HADIR' || rec.status === 'TERLAMBAT' ? nowIso : null,
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('attendances')
        .insert(toInsert);
      if (insertErr) throw insertErr;
    }

    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map(async (item) => {
          const { error: updErr } = await supabase
            .from('attendances')
            .update({
              status: item.status,
              notes: item.notes,
              recordedBy: payload.recordedBy,
            })
            .eq('id', item.id)
            .eq('schoolId', payload.schoolId);
          if (updErr) throw updErr;
        })
      );
    }

    return { success: true, count: payload.records.length };
  },

  async getStudentAttendances(params: {
    schoolId: string;
    date?: string;
    classId?: string;
    studentId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: StudentAttendance[]; total: number }> {
    const { schoolId, date, classId, studentId, page = 1, limit = 100 } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('attendances')
      .select(
        `
        id, schoolId, studentId, date, status, notes, recordedBy, createdAt, checkInTime,
        students!inner(fullName, nisn, nis, photoUrl, classId,
          classes(name)
        )
      `,
        { count: 'exact' }
      )
      .eq('schoolId', schoolId)
      .eq('type', 'SISWA')
      .range(from, to)
      .order('createdAt', { ascending: false });

    if (date) query = query.eq('date', date);
    if (studentId) query = query.eq('studentId', studentId);
    if (classId) query = query.eq('students.classId', classId);

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped: StudentAttendance[] = (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      date: row.date,
      status: row.status,
      notes: row.notes,
      recordedBy: row.recordedBy,
      createdAt: row.createdAt,
      time: row.checkInTime,
      student: row.students
        ? {
            fullName: row.students.fullName,
            nisn: row.students.nisn,
            nis: row.students.nis,
            photoUrl: row.students.photoUrl,
            classId: row.students.classId,
            classes: row.students.classes ? { name: row.students.classes.name } : undefined,
          }
        : undefined,
    }));

    return { data: mapped, total: count ?? 0 };
  },

  // ---- TEACHER ATTENDANCE ----

  async teacherCheckIn(payload: {
    schoolId: string;
    teacherId: string;
    date: string;
    checkInLat: number;
    checkInLng: number;
    checkInDistance: number;
    isWithinRadius: boolean;
    isMockGps: boolean;
    checkInDeadline?: string;
    checkInSelfieUrl?: string;
    notes?: string;
  }) {
    if (payload.isMockGps) {
      return {
        success: false,
        message: 'Terdeteksi GPS palsu (Mock GPS). Absen ditolak. Harap matikan aplikasi pemalsu lokasi.',
      };
    }

    if (!payload.isWithinRadius) {
      return {
        success: false,
        message: `Anda berada di luar radius sekolah (${Math.round(payload.checkInDistance)} m). Absen hanya bisa dilakukan dalam radius yang ditentukan.`,
      };
    }

    const { data: existing } = await supabase
      .from('attendances')
      .select('id, checkInTime, checkOutTime, status')
      .eq('schoolId', payload.schoolId)
      .eq('teacherId', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: `Anda sudah memiliki catatan presensi hari ini (${existing.status}).`,
        data: existing,
      };
    }

    const now = new Date();
    const isLate = isAfterDeadline(payload.checkInDeadline ?? '07:30', now);
    const status: AttendanceStatus = isLate ? 'TERLAMBAT' : 'HADIR';

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        schoolId: payload.schoolId,
        teacherId: payload.teacherId,
        date: payload.date,
        type: 'GURU',
        status,
        checkInTime: now.toISOString(),
        checkInLat: payload.checkInLat,
        checkInLng: payload.checkInLng,
        checkInDistance: payload.checkInDistance,
        isCheckInMock: false,
        checkInSelfieUrl: payload.checkInSelfieUrl ?? null,
        notes: payload.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      success: true,
      message: isLate
        ? `Check-in berhasil (Terlambat melewati batas ${payload.checkInDeadline ?? '07:30'}).`
        : 'Check-in berhasil. Selamat bertugas!',
      data,
    };
  },

  /**
   * Pengajuan Izin / Sakit mandiri untuk Guru & PTK (tanpa perlu di area sekolah)
   */
  async teacherSubmitLeave(payload: {
    schoolId: string;
    teacherId: string;
    date: string;
    status: 'IZIN' | 'SAKIT';
    notes: string;
    recordedBy: string;
  }) {
    const { data: existing } = await supabase
      .from('attendances')
      .select('id, status')
      .eq('schoolId', payload.schoolId)
      .eq('teacherId', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: `Presensi tanggal ini sudah tercatat dengan status ${existing.status}.`,
      };
    }

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        schoolId: payload.schoolId,
        teacherId: payload.teacherId,
        date: payload.date,
        type: 'GURU',
        status: payload.status,
        notes: payload.notes.trim(),
        recordedBy: payload.recordedBy,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      success: true,
      message: `Pengajuan ${payload.status} berhasil dicatat.`,
      data,
    };
  },

  async teacherCheckOut(payload: {
    schoolId: string;
    teacherId: string;
    date: string;
    isMockGps: boolean;
  }) {
    if (payload.isMockGps) {
      return {
        success: false,
        message: 'Terdeteksi GPS palsu. Check-out ditolak.',
      };
    }

    const { data, error } = await supabase
      .from('attendances')
      .update({ checkOutTime: new Date().toISOString() })
      .eq('schoolId', payload.schoolId)
      .eq('teacherId', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .select()
      .single();

    if (error) throw error;
    return { success: true, message: 'Check-out berhasil. Terima kasih atas dedikasi Anda!', data };
  },

  async getTeacherAttendances(params: {
    schoolId: string;
    date?: string;
    teacherId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: TeacherAttendance[]; total: number }> {
    const { schoolId, date, teacherId, page = 1, limit = 100 } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('attendances')
      .select(
        `
        id, schoolId, teacherId, date, status, checkInTime, checkOutTime,
        checkInLat, checkInLng, checkInDistance, isCheckInMock, checkInSelfieUrl, notes, createdAt,
        teachers!inner(fullName, nip, nuptk, position, photoUrl)
      `,
        { count: 'exact' }
      )
      .eq('schoolId', schoolId)
      .eq('type', 'GURU')
      .range(from, to)
      .order('createdAt', { ascending: false });

    if (date) query = query.eq('date', date);
    if (teacherId) query = query.eq('teacherId', teacherId);

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped: TeacherAttendance[] = (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.schoolId,
      teacherId: row.teacherId,
      date: row.date,
      status: row.status,
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      checkInLat: row.checkInLat,
      checkInLng: row.checkInLng,
      checkInDistance: row.checkInDistance,
      isCheckInMock: row.isCheckInMock,
      checkInSelfieUrl: row.checkInSelfieUrl,
      notes: row.notes,
      createdAt: row.createdAt,
      teacher: row.teachers
        ? {
            fullName: row.teachers.fullName,
            nip: row.teachers.nip,
            nuptk: row.teachers.nuptk,
            position: row.teachers.position,
            photoUrl: row.teachers.photoUrl,
          }
        : undefined,
    }));

    return { data: mapped, total: count ?? 0 };
  },

  async getTeacherTodayStatus(schoolId: string, teacherId: string, date: string) {
    const { data, error } = await supabase
      .from('attendances')
      .select('id, status, checkInTime, checkOutTime, checkInSelfieUrl, notes')
      .eq('schoolId', schoolId)
      .eq('teacherId', teacherId)
      .eq('date', date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // ---- SUMMARY (AKURAT TERHADAP POPULASI AKTIF SEKOLAH) ----

  async getSummary(schoolId: string, date: string): Promise<AttendanceSummary> {
    const [attRes, totalStudentsRes, totalTeachersRes] = await Promise.all([
      supabase
        .from('attendances')
        .select('type, status')
        .eq('schoolId', schoolId)
        .eq('date', date),
      supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('schoolId', schoolId)
        .eq('status', 'AKTIF'),
      supabase
        .from('teachers')
        .select('id', { count: 'exact', head: true })
        .eq('schoolId', schoolId)
        .eq('isActive', true),
    ]);

    if (attRes.error) throw attRes.error;

    const rows = attRes.data ?? [];
    const students = rows.filter((r: any) => r.type === 'SISWA');
    const teachers = rows.filter((r: any) => r.type === 'GURU');

    const countStatus = (arr: any[], status: string) =>
      arr.filter((r) => r.status === status).length;

    const studentTotal = totalStudentsRes.count ?? students.length;
    const studentPresent = countStatus(students, 'HADIR');
    const studentLate = countStatus(students, 'TERLAMBAT');
    const studentSick = countStatus(students, 'SAKIT');
    const studentPermission = countStatus(students, 'IZIN');
    const studentAbsent = countStatus(students, 'ALPA');
    const studentRecorded = students.length;
    const studentUnrecorded = Math.max(0, studentTotal - studentRecorded);

    const teacherTotal = totalTeachersRes.count ?? teachers.length;
    const teacherPresent = countStatus(teachers, 'HADIR');
    const teacherLate = countStatus(teachers, 'TERLAMBAT');
    const teacherSick = countStatus(teachers, 'SAKIT');
    const teacherPermission = countStatus(teachers, 'IZIN');
    const teacherAbsent = countStatus(teachers, 'ALPA');
    const teacherRecorded = teachers.length;

    return {
      studentTotal,
      studentRecorded,
      studentPresent,
      studentLate,
      studentSick,
      studentPermission,
      studentAbsent,
      studentUnrecorded,
      studentPercentage:
        studentTotal > 0
          ? Math.round(((studentPresent + studentLate) / studentTotal) * 100)
          : 0,

      teacherTotal,
      teacherRecorded,
      teacherPresent,
      teacherLate,
      teacherSick,
      teacherPermission,
      teacherAbsent,
      teacherPercentage:
        teacherTotal > 0
          ? Math.round(((teacherPresent + teacherLate) / teacherTotal) * 100)
          : 0,
    };
  },

  async findStudentByNisOrNisn(schoolId: string, code: string) {
    const cleanCode = code.trim();
    const { data, error } = await supabase
      .from('students')
      .select('id, fullName, nisn, nis, photoUrl, classes(name)')
      .eq('schoolId', schoolId)
      .or(`nisn.eq.${cleanCode},nis.eq.${cleanCode}`)
      .eq('status', 'AKTIF')
      .maybeSingle();

    if (error) throw error;
    return data;
  },
};