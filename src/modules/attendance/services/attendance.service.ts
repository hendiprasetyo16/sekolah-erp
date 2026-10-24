import { supabase } from '@/services/supabase.client';
import type { StudentAttendance, TeacherAttendance, AttendanceSummary } from '../types/attendance.types';

// ============================================================
// ATTENDANCE SERVICE - Disesuaikan dengan DB camelCase
// ============================================================

export const attendanceService = {

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

  async getStudentAttendances(params: {
    schoolId: string;
    date?: string;
    classId?: string;
    studentId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: StudentAttendance[]; total: number }> {
    const { schoolId, date, classId, studentId, page = 1, limit = 50 } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('attendances')
      .select(`
        id, schoolId, studentId, date, status, notes, recordedBy, createdAt, checkInTime,
        students!inner(fullName, nisn, nis, photoUrl, classId,
          classes(name)
        )
      `, { count: 'exact' })
      .eq('schoolId', schoolId)
      .eq('type', 'SISWA')
      .range(from, to)
      .order('date', { ascending: false });

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
            classes: row.students.classes ? { name: row.students.classes.name } : undefined,
          }
        : undefined,
    }));

    return { data: mapped, total: count ?? 0 };
  },

  async bulkStudentAttendance(payload: {
    schoolId: string;
    date: string;
    records: Array<{
      studentId: string;
      status: 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPA';
      notes?: string;
    }>;
    recordedBy: string;
  }) {
    const rows = payload.records.map((r) => ({
      schoolId: payload.schoolId,
      studentId: r.studentId,
      date: payload.date,
      type: 'SISWA',
      status: r.status,
      notes: r.notes ?? null,
      recordedBy: payload.recordedBy,
      checkInTime: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('attendances')
      .upsert(rows, { onConflict: 'schoolId,studentId,date,type' })
      .select();

    if (error) throw error;
    return { success: true, data };
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

    if (existing?.checkInTime) {
      return { success: false, message: 'Anda sudah melakukan check-in hari ini.', data: existing };
    }

    const now = new Date();
    const checkInHour = now.getHours();
    const checkInMinute = now.getMinutes();
    const isLate = checkInHour > 7 || (checkInHour === 7 && checkInMinute > 30);
    const status = isLate ? 'TERLAMBAT' : 'HADIR';

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
      message: isLate ? 'Check-in berhasil (Terlambat).' : 'Check-in berhasil. Selamat bekerja!',
      data,
    };
  },

  async teacherCheckOut(payload: {
    schoolId: string;
    teacherId: string;
    date: string;
    checkOutLat?: number;
    checkOutLng?: number;
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
    return { success: true, message: 'Check-out berhasil. Sampai jumpa!', data };
  },

  async getTeacherAttendances(params: {
    schoolId: string;
    date?: string;
    teacherId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: TeacherAttendance[]; total: number }> {
    const { schoolId, date, teacherId, page = 1, limit = 50 } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('attendances')
      .select(`
        id, schoolId, teacherId, date, status, checkInTime, checkOutTime,
        checkInLat, checkInLng, checkInDistance, isCheckInMock, checkInSelfieUrl, notes, createdAt,
        teachers!inner(fullName, nip, nuptk, position, photoUrl)
      `, { count: 'exact' })
      .eq('schoolId', schoolId)
      .eq('type', 'GURU')
      .range(from, to)
      .order('date', { ascending: false });

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

  // ---- SUMMARY ----

  async getSummary(schoolId: string, date: string): Promise<AttendanceSummary> {
    const { data, error } = await supabase
      .from('attendances')
      .select('type, status')
      .eq('schoolId', schoolId)
      .eq('date', date);

    if (error) throw error;

    const rows = data ?? [];
    const students = rows.filter((r: any) => r.type === 'SISWA');
    const teachers = rows.filter((r: any) => r.type === 'GURU');

    const count = (arr: any[], status: string) => arr.filter((r) => r.status === status).length;

    return {
      studentTotal: students.length,
      studentPresent: count(students, 'HADIR'),
      studentLate: count(students, 'TERLAMBAT'),
      studentSick: count(students, 'SAKIT'),
      studentPermission: count(students, 'IZIN'),
      studentAbsent: count(students, 'ALPA'),
      studentPercentage: students.length > 0 ? Math.round(((count(students, 'HADIR') + count(students, 'TERLAMBAT')) / students.length) * 100) : 0,

      teacherTotal: teachers.length,
      teacherPresent: count(teachers, 'HADIR'),
      teacherLate: count(teachers, 'TERLAMBAT'),
      teacherPercentage: teachers.length > 0 ? Math.round(((count(teachers, 'HADIR') + count(teachers, 'TERLAMBAT')) / teachers.length) * 100) : 0,
    };
  },

  async findStudentByNisOrNisn(schoolId: string, code: string) {
    const { data, error } = await supabase
      .from('students')
      .select('id, fullName, nisn, nis, photoUrl, classes(name)')
      .eq('schoolId', schoolId)
      .or(`nisn.eq.${code},nis.eq.${code}`)
      .eq('status', 'AKTIF')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSchoolCoordinates(schoolId: string) {
    const { data, error } = await supabase
      .from('schools')
      .select('latitude, longitude, attendanceRadiusMeters')
      .eq('id', schoolId)
      .single();

    if (error) throw error;
    return data;
  },

  async getTeacherTodayStatus(schoolId: string, teacherId: string, date: string) {
    const { data } = await supabase
      .from('attendances')
      .select('id, status, checkInTime, checkOutTime')
      .eq('schoolId', schoolId)
      .eq('teacherId', teacherId)
      .eq('date', date)
      .eq('type', 'GURU')
      .maybeSingle();
    return data;
  }
};