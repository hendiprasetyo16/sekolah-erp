import { supabase } from '@/services/supabase.client';
import type { StudentAttendance, TeacherAttendance, AttendanceSummary } from '../types/attendance.types';

// ============================================================
// ATTENDANCE SERVICE - Semua operasi ke tabel Supabase
// ============================================================

export const attendanceService = {

  // ---- STUDENT ATTENDANCE ----

  /**
   * Absen mandiri siswa (self check-in via kiosk/HP/barcode)
   */
  async studentCheckIn(payload: {
    schoolId: string;
    studentId: string;
    date: string;
    status: 'HADIR' | 'TERLAMBAT';
    notes?: string;
    recordedBy?: string;
  }) {
    // Cek apakah sudah absen hari ini
    const { data: existing } = await supabase
      .from('attendances')
      .select('id, status')
      .eq('school_id', payload.schoolId)
      .eq('student_id', payload.studentId)
      .eq('date', payload.date)
      .eq('type', 'SISWA')
      .maybeSingle();

    if (existing) {
      return { success: false, message: 'Siswa sudah absen hari ini.', data: existing };
    }

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        school_id: payload.schoolId,
        student_id: payload.studentId,
        date: payload.date,
        type: 'SISWA',
        status: payload.status,
        notes: payload.notes ?? null,
        recorded_by: payload.recordedBy ?? null,
        check_in_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, message: 'Absen berhasil dicatat.', data };
  },

  /**
   * Ambil data absen siswa dengan filter
   */
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
        id, school_id, student_id, date, status, notes, recorded_by, created_at, check_in_time,
        students!inner(full_name, nisn, nis, photo_url, class_id,
          classes(name)
        )
      `, { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('type', 'SISWA')
      .range(from, to)
      .order('date', { ascending: false });

    if (date) query = query.eq('date', date);
    if (studentId) query = query.eq('student_id', studentId);
    if (classId) query = query.eq('students.class_id', classId);

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped: StudentAttendance[] = (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      studentId: row.student_id,
      date: row.date,
      status: row.status,
      notes: row.notes,
      recordedBy: row.recorded_by,
      createdAt: row.created_at,
      time: row.check_in_time,
      student: row.students
        ? {
            fullName: row.students.full_name,
            nisn: row.students.nisn,
            nis: row.students.nis,
            photoUrl: row.students.photo_url,
            classes: row.students.classes ? { name: row.students.classes.name } : undefined,
          }
        : undefined,
    }));

    return { data: mapped, total: count ?? 0 };
  },

  /**
   * Admin: Input absen siswa per kelas (bulk)
   */
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
      school_id: payload.schoolId,
      student_id: r.studentId,
      date: payload.date,
      type: 'SISWA',
      status: r.status,
      notes: r.notes ?? null,
      recorded_by: payload.recordedBy,
      check_in_time: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('attendances')
      .upsert(rows, { onConflict: 'school_id,student_id,date,type' })
      .select();

    if (error) throw error;
    return { success: true, data };
  },

  // ---- TEACHER ATTENDANCE ----

  /**
   * Guru check-in dengan validasi GPS (anti fake GPS)
   */
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
    // Tolak jika terdeteksi fake GPS
    if (payload.isMockGps) {
      return {
        success: false,
        message: 'Terdeteksi GPS palsu (Mock GPS). Absen ditolak. Harap matikan aplikasi pemalsu lokasi.',
      };
    }

    // Tolak jika di luar radius sekolah
    if (!payload.isWithinRadius) {
      return {
        success: false,
        message: `Anda berada di luar radius sekolah (${Math.round(payload.checkInDistance)} m). Absen hanya bisa dilakukan dalam radius yang ditentukan.`,
      };
    }

    // Cek sudah check-in belum
    const { data: existing } = await supabase
      .from('attendances')
      .select('id, check_in_time, check_out_time, status')
      .eq('school_id', payload.schoolId)
      .eq('teacher_id', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (existing?.check_in_time) {
      return { success: false, message: 'Anda sudah melakukan check-in hari ini.', data: existing };
    }

    const now = new Date();
    // Tentukan status: TERLAMBAT jika lewat jam 07:30
    const checkInHour = now.getHours();
    const checkInMinute = now.getMinutes();
    const isLate = checkInHour > 7 || (checkInHour === 7 && checkInMinute > 30);
    const status = isLate ? 'TERLAMBAT' : 'HADIR';

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        school_id: payload.schoolId,
        teacher_id: payload.teacherId,
        date: payload.date,
        type: 'GURU',
        status,
        check_in_time: now.toISOString(),
        check_in_lat: payload.checkInLat,
        check_in_lng: payload.checkInLng,
        check_in_distance: payload.checkInDistance,
        is_check_in_mock: false,
        check_in_selfie_url: payload.checkInSelfieUrl ?? null,
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

  /**
   * Guru check-out
   */
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
      .update({ check_out_time: new Date().toISOString() })
      .eq('school_id', payload.schoolId)
      .eq('teacher_id', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .select()
      .single();

    if (error) throw error;
    return { success: true, message: 'Check-out berhasil. Sampai jumpa!', data };
  },

  /**
   * Ambil data absen guru
   */
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
        id, school_id, teacher_id, date, status, check_in_time, check_out_time,
        check_in_lat, check_in_lng, check_in_distance, is_check_in_mock, check_in_selfie_url, notes, created_at,
        teachers!inner(full_name, nip, nuptk, position, photo_url)
      `, { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('type', 'GURU')
      .range(from, to)
      .order('date', { ascending: false });

    if (date) query = query.eq('date', date);
    if (teacherId) query = query.eq('teacher_id', teacherId);

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped: TeacherAttendance[] = (data ?? []).map((row: any) => ({
      id: row.id,
      schoolId: row.school_id,
      teacherId: row.teacher_id,
      date: row.date,
      status: row.status,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      checkInLat: row.check_in_lat,
      checkInLng: row.check_in_lng,
      checkInDistance: row.check_in_distance,
      isCheckInMock: row.is_check_in_mock,
      checkInSelfieUrl: row.check_in_selfie_url,
      notes: row.notes,
      createdAt: row.created_at,
      teacher: row.teachers
        ? {
            fullName: row.teachers.full_name,
            nip: row.teachers.nip,
            nuptk: row.teachers.nuptk,
            position: row.teachers.position,
            photoUrl: row.teachers.photo_url,
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
      .eq('school_id', schoolId)
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

  /**
   * Cari siswa berdasarkan NISN atau NIS (untuk kiosk/barcode)
   */
  async findStudentByNisOrNisn(schoolId: string, code: string) {
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, nisn, nis, photo_url, classes(name)')
      .eq('school_id', schoolId)
      .or(`nisn.eq.${code},nis.eq.${code}`)
      .eq('status', 'AKTIF')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Ambil koordinat sekolah dari tabel schools
   */
  async getSchoolCoordinates(schoolId: string) {
    const { data, error } = await supabase
      .from('schools')
      .select('latitude, longitude, attendance_radius_meters')
      .eq('id', schoolId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Cek status absen guru hari ini
   */
  async getTeacherTodayStatus(schoolId: string, teacherId: string, date: string) {
    const { data } = await supabase
      .from('attendances')
      .select('id, status, check_in_time, check_out_time')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherId)
      .eq('date', date)
      .eq('type', 'GURU')
      .maybeSingle();
    return data;
  },
};
