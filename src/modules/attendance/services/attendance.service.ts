// src/modules/attendance/services/attendance.service.ts
import { supabase } from '@/services/supabase.client';
import type {
  AttendanceApprovalStatus,
  AttendanceStatus,
  AttendanceSummary,
  ClassStudentAttendanceRow,
  DailyQuoteRow,
  GpsAttendanceRpcResponse,
  HolidayCategoryType,
  NationalHolidayRow,
  SchoolAttendanceSettings,
  SchoolCoordinates,
  SchoolSpecialEvent,
  SchoolWaConfig,
  SpecialEventTargetType,
  StudentAttendance,
  StudentWaRecipientResult,
  SubmitTeacherGpsAttendanceParams,
  TeacherAttendance,
  WaNotificationEventType,
  WaNotificationLog,
  WaNotificationStatus,
  WorkDaysMode,
} from '../types/attendance.types';
import { getSchoolDateString, isAfterDeadline } from './gps.utils';
import { dispatchStudentAttendanceWhatsApp } from './whatsappService';

const SIGNED_URL_EXPIRES_SECONDS = 3600;
const SELFIE_BUCKET = 'attendance-selfies';
const ATTACHMENT_BUCKET = 'attendance-attachments';

interface RawSchoolRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  attendanceRadiusMeters: number | null;
  workStartTime: string | null;
  workEndTime: string | null;
  workDaysMode: string | null;
  lateToleranceMinutes: number | null;
  requireSelfieCheckIn: boolean | null;
  requireSelfieCheckOut: boolean | null;
  allowDesktopAttendanceGlobal: boolean | null;
  studentWorkStartTime: string | null;
  studentLateToleranceMinutes: number | null;
  studentWorkEndTime: string | null;
  studentCheckOutStartTime: string | null;
  enableStudentKiosk: boolean | null;
  enableStudentClassAttendance: boolean | null;
  enableStudentCheckOut: boolean | null;
  settings: Record<string, unknown> | null;
}

interface StudentSheetAttendanceRow {
  id: string;
  studentId: string | null;
  status: AttendanceStatus;
  notes: string | null;
  checkInTime: string | null;
  time: string;
  recordedBy: string | null;
}

interface StudentSheetProfileRow {
  id: string;
  fullName: string;
  nisn: string;
  nis: string | null;
  photoUrl: string | null;
}

interface BulkStudentAttendanceInsert {
  schoolId: string;
  studentId: string;
  date: string;
  type: 'SISWA';
  status: AttendanceStatus;
  notes: string | null;
  recordedBy: string;
  checkInTime: string | null;
}

interface StudentJoinObject {
  id: string;
  fullName: string;
  nisn: string;
  nis: string | null;
  gender: string;
  photoUrl: string | null;
  classId: string | null;
  classes?:
    | {
        id: string;
        name: string;
        gradeLevel: number;
        major: string | null;
      }
    | Array<{
        id: string;
        name: string;
        gradeLevel: number;
        major: string | null;
      }>
    | null;
}

interface StudentAttendanceQueryRow {
  id: string;
  schoolId: string;
  studentId: string | null;
  teacherId: string | null;
  type: 'SISWA';
  date: string;
  endDate?: string | null;
  status: AttendanceStatus;
  leaveType?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  approvalStatus?: AttendanceApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  recordedBy?: string | null;
  checkInTime?: string | null;
  time?: string;
  checkOutTime?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInDistance?: number | null;
  checkInAccuracy?: number | null;
  isCheckInMock?: boolean | null;
  checkInSelfieUrl?: string | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutDistance?: number | null;
  checkOutAccuracy?: number | null;
  isCheckOutMock?: boolean | null;
  checkOutSelfieUrl?: string | null;
  securityFlags?: string[] | null;
  deviceTelemetry?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  students?: StudentJoinObject | StudentJoinObject[] | null;
}

interface TeacherJoinObject {
  id: string;
  fullName: string;
  nip: string | null;
  nuptk: string | null;
  position: string | null;
  photoUrl: string | null;
  allowDesktopAttendance: boolean;
}

interface TeacherAttendanceQueryRow {
  id: string;
  schoolId: string;
  studentId: string | null;
  teacherId: string | null;
  type: 'GURU';
  date: string;
  endDate?: string | null;
  status: AttendanceStatus;
  leaveType?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  approvalStatus?: AttendanceApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  recordedBy?: string | null;
  checkInTime?: string | null;
  time?: string;
  checkOutTime?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInDistance?: number | null;
  checkInAccuracy?: number | null;
  isCheckInMock?: boolean | null;
  checkInSelfieUrl?: string | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutDistance?: number | null;
  checkOutAccuracy?: number | null;
  isCheckOutMock?: boolean | null;
  checkOutSelfieUrl?: string | null;
  securityFlags?: string[] | null;
  deviceTelemetry?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  teachers?: TeacherJoinObject | TeacherJoinObject[] | null;
}

interface SummaryAttendanceRow {
  type: string;
  status: string;
  approvalStatus?: string | null;
}

const ATTENDANCE_BASE_COLUMNS = `
  id, schoolId, studentId, teacherId, type, date, endDate, status, leaveType,
  notes, attachmentUrl, approvalStatus, approvedBy, approvedAt, recordedBy,
  checkInTime, time, checkOutTime,
  checkInLat, checkInLng, checkInDistance, checkInAccuracy, isCheckInMock, checkInSelfieUrl,
  checkOutLat, checkOutLng, checkOutDistance, checkOutAccuracy, isCheckOutMock, checkOutSelfieUrl,
  securityFlags, deviceTelemetry, createdAt, updatedAt
`;

const ATTENDANCE_FALLBACK_COLUMNS = `
  id, schoolId, studentId, teacherId, type, date, status,
  notes, recordedBy, checkInTime, time, checkOutTime, createdAt, updatedAt
`;

function formatTimeInTimezone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

export const attendanceService = {
  // ==========================================================================
  // 1. KONFIGURASI SEKOLAH & PROFIL GURU (SELARAS KOLOM SQL v22.2)
  // ==========================================================================

  async getSchoolCoordinates(schoolId: string): Promise<SchoolCoordinates> {
    const { data, error } = await supabase
      .from('schools')
      .select(
        `
        id, name, latitude, longitude, attendanceRadiusMeters,
        workStartTime, workEndTime, workDaysMode, lateToleranceMinutes,
        requireSelfieCheckIn, requireSelfieCheckOut, allowDesktopAttendanceGlobal,
        studentWorkStartTime, studentLateToleranceMinutes, studentWorkEndTime,
        studentCheckOutStartTime, enableStudentKiosk, enableStudentClassAttendance,
        enableStudentCheckOut, settings
      `
      )
      .eq('id', schoolId)
      .single();

    if (error) throw error;

    const row = data as RawSchoolRow;
    const rawTimezone =
      typeof row.settings?.timezone === 'string' && row.settings.timezone.trim()
        ? row.settings.timezone.trim()
        : 'Asia/Jakarta';

    const workDaysMode: WorkDaysMode =
      row.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS';

    const settings: SchoolAttendanceSettings = {
      id: row.id,
      name: row.name,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      attendanceRadiusMeters: row.attendanceRadiusMeters ?? 200,
      workStartTime: row.workStartTime ?? '07:30',
      workEndTime: row.workEndTime ?? '14:30',
      workDaysMode,
      lateToleranceMinutes: row.lateToleranceMinutes ?? 0,
      requireSelfieCheckIn: row.requireSelfieCheckIn ?? true,
      requireSelfieCheckOut: row.requireSelfieCheckOut ?? true,
      allowDesktopAttendanceGlobal: row.allowDesktopAttendanceGlobal ?? false,
      studentWorkStartTime: row.studentWorkStartTime ?? '07:00',
      studentLateToleranceMinutes: row.studentLateToleranceMinutes ?? 15,
      studentWorkEndTime: row.studentWorkEndTime ?? '14:00',
      studentCheckOutStartTime: row.studentCheckOutStartTime ?? '12:00',
      enableStudentKiosk: row.enableStudentKiosk ?? true,
      enableStudentClassAttendance: row.enableStudentClassAttendance ?? true,
      enableStudentCheckOut: row.enableStudentCheckOut ?? true,
      timezone: rawTimezone,
    };

    return {
      latitude: settings.latitude,
      longitude: settings.longitude,
      attendanceRadiusMeters: settings.attendanceRadiusMeters,
      settings,
    };
  },

  async updateSchoolAttendanceSettings(
    schoolId: string,
    payload: Partial<
      Omit<SchoolAttendanceSettings, 'id' | 'name' | 'timezone'>
    >
  ): Promise<void> {
    const { error } = await supabase
      .from('schools')
      .update(payload)
      .eq('id', schoolId);

    if (error) throw error;
  },

  async getTeacherProfileByUser(params: {
    schoolId: string;
    userId: string;
    email?: string | null;
    fullName?: string | null;
  }) {
    const selectFields =
      'id, fullName, nip, nuptk, position, photoUrl, userId, allowDesktopAttendance';

    const { data: byUser, error: errUser } = await supabase
      .from('teachers')
      .select(selectFields)
      .eq('schoolId', params.schoolId)
      .eq('userId', params.userId)
      .eq('isActive', true)
      .maybeSingle();

    if (errUser) throw errUser;
    if (byUser) return byUser;

    if (params.email) {
      const { data: byEmail } = await supabase
        .from('teachers')
        .select(selectFields)
        .eq('schoolId', params.schoolId)
        .ilike('email', params.email.trim())
        .eq('isActive', true)
        .maybeSingle();

      if (byEmail) return byEmail;
    }

    if (params.fullName) {
      const { data: byName } = await supabase
        .from('teachers')
        .select(selectFields)
        .eq('schoolId', params.schoolId)
        .ilike('fullName', params.fullName.trim())
        .eq('isActive', true)
        .maybeSingle();

      if (byName) return byName;
    }

    return null;
  },

  async setTeacherDesktopAttendance(
    teacherId: string,
    allow: boolean
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc(
      'set_teacher_desktop_attendance',
      {
        p_teacher_id: teacherId,
        p_allow: allow,
      }
    );

    if (error) throw error;
    return Boolean(data);
  },

  async setSchoolDesktopAttendanceGlobal(
    schoolId: string,
    allow: boolean
  ): Promise<void> {
    const { error } = await supabase.rpc(
      'set_school_desktop_attendance_global',
      {
        p_school_id: schoolId,
        p_allow: allow,
      }
    );

    if (error) throw error;
  },

  // ==========================================================================
  // 2. STORAGE PRIVAT (SELFIE & LAMPIRAN SURAT IZIN)
  // ==========================================================================

  async uploadTeacherSelfie(params: {
    schoolId: string;
    teacherId: string;
    date: string;
    blob: Blob;
    suffix?: 'in' | 'out';
  }): Promise<string> {
    const tag = params.suffix ? `_${params.suffix}` : '';
    const filePath = `${params.schoolId}/${params.teacherId}/${params.date}${tag}_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(SELFIE_BUCKET)
      .upload(filePath, params.blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;
    return filePath;
  },

  async getSignedSelfieUrl(
    path: string | null | undefined
  ): Promise<string | null> {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    const { data, error } = await supabase.storage
      .from(SELFIE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_SECONDS);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  },

  async uploadAttendanceAttachment(params: {
    schoolId: string;
    ownerId: string;
    date: string;
    blob: Blob;
    extension: string;
    contentType: string;
  }): Promise<string> {
    const safeExt =
      params.extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const filePath = `${params.schoolId}/${params.ownerId}/${params.date}_${Date.now()}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(filePath, params.blob, {
        contentType: params.contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;
    return filePath;
  },

  async getSignedAttachmentUrl(
    path: string | null | undefined
  ): Promise<string | null> {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_SECONDS);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  },

  // ==========================================================================
  // 3. HELPER KHUSUS SIMULASI SUPER_ADMIN
  // ==========================================================================

  async getActiveTeachersForSimulation(schoolId: string) {
    const { data, error } = await supabase
      .from('teachers')
      .select(
        'id, fullName, nip, nuptk, position, userId, allowDesktopAttendance'
      )
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
    selfiePaths?: Array<string | null | undefined>;
  }): Promise<{ success: boolean }> {
    const pathsToDelete = [
      params.selfiePath,
      ...(params.selfiePaths ?? []),
    ].filter((p): p is string => Boolean(p && !p.startsWith('http')));

    if (pathsToDelete.length > 0) {
      await supabase.storage
        .from(SELFIE_BUCKET)
        .remove(Array.from(new Set(pathsToDelete)));
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

  // ==========================================================================
  // 4. PRESENSI SISWA (KIOSK, LEMBAR PRESENSI KELAS & AUTO NOTIFIKASI WA)
  // ==========================================================================

  async studentCheckIn(payload: {
    schoolId: string;
    studentId: string;
    date?: string;
    status?: 'HADIR' | 'TERLAMBAT';
    notes?: string;
    recordedBy?: string;
  }) {
    const schoolCfg = await this.getSchoolCoordinates(payload.schoolId);
    const now = new Date();
    const activeDate =
      payload.date || getSchoolDateString(now, schoolCfg.settings.timezone);

    const { data: existing } = await supabase
      .from('attendances')
      .select('id, status, checkInTime, time')
      .eq('schoolId', payload.schoolId)
      .eq('studentId', payload.studentId)
      .eq('date', activeDate)
      .eq('type', 'SISWA')
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: 'Siswa sudah tercatat presensi masuk hari ini.',
        data: existing,
      };
    }

    const computedStatus: 'HADIR' | 'TERLAMBAT' =
      payload.status ??
      (isAfterDeadline(
        schoolCfg.settings.studentWorkStartTime,
        now,
        schoolCfg.settings.studentLateToleranceMinutes,
        schoolCfg.settings.timezone
      )
        ? 'TERLAMBAT'
        : 'HADIR');

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        schoolId: payload.schoolId,
        studentId: payload.studentId,
        date: activeDate,
        type: 'SISWA',
        status: computedStatus,
        notes: payload.notes?.trim() || null,
        recordedBy: payload.recordedBy ?? null,
        checkInTime: now.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const timeFormatted = formatTimeInTimezone(
      now,
      schoolCfg.settings.timezone
    );
    void dispatchStudentAttendanceWhatsApp({
      studentId: payload.studentId,
      eventType: 'CHECK_IN',
      timeFormatted,
      status: computedStatus,
    });

    return {
      success: true,
      message:
        computedStatus === 'TERLAMBAT'
          ? 'Presensi masuk siswa tercatat (Terlambat).'
          : 'Presensi masuk siswa berhasil dicatat.',
      data,
    };
  },

  async studentCheckOut(payload: {
    schoolId: string;
    studentId: string;
    date?: string;
  }) {
    const schoolCfg = await this.getSchoolCoordinates(payload.schoolId);
    const now = new Date();
    const activeDate =
      payload.date || getSchoolDateString(now, schoolCfg.settings.timezone);

    const { data: existing, error: findErr } = await supabase
      .from('attendances')
      .select('id, checkInTime, checkOutTime')
      .eq('schoolId', payload.schoolId)
      .eq('studentId', payload.studentId)
      .eq('date', activeDate)
      .eq('type', 'SISWA')
      .maybeSingle();

    if (findErr) throw findErr;
    if (!existing || !existing.checkInTime) {
      return {
        success: false,
        message: 'Siswa belum melakukan presensi masuk hari ini.',
      };
    }

    if (existing.checkOutTime) {
      return {
        success: false,
        message: 'Siswa sudah tercatat presensi pulang hari ini.',
      };
    }

    const { data, error } = await supabase
      .from('attendances')
      .update({ checkOutTime: now.toISOString() })
      .eq('id', existing.id)
      .eq('schoolId', payload.schoolId)
      .select()
      .single();

    if (error) throw error;

    const timeFormatted = formatTimeInTimezone(
      now,
      schoolCfg.settings.timezone
    );
    void dispatchStudentAttendanceWhatsApp({
      studentId: payload.studentId,
      eventType: 'CHECK_OUT',
      timeFormatted,
      status: 'PULANG',
    });

    return {
      success: true,
      message: 'Presensi pulang siswa berhasil dicatat.',
      data,
    };
  },

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
        .select('id, studentId, status, notes, checkInTime, time, recordedBy')
        .eq('schoolId', params.schoolId)
        .eq('date', params.date)
        .eq('type', 'SISWA'),
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (attendancesRes.error) throw attendancesRes.error;

    const attendanceMap = new Map<string, StudentSheetAttendanceRow>();
    const typedAttendances = (attendancesRes.data ??
      []) as StudentSheetAttendanceRow[];
    for (const att of typedAttendances) {
      if (att.studentId) attendanceMap.set(att.studentId, att);
    }

    const typedStudents = (studentsRes.data ?? []) as StudentSheetProfileRow[];
    return typedStudents.map((st) => {
      const att = attendanceMap.get(st.id);
      return {
        studentId: st.id,
        fullName: st.fullName,
        nisn: st.nisn,
        nis: st.nis,
        photoUrl: st.photoUrl,
        attendanceId: att?.id,
        status: att?.status ?? null,
        checkInTime: att?.checkInTime ?? null,
        time: att?.time ?? '',
        notes: att?.notes ?? '',
        isFromKiosk: Boolean(att && !att.recordedBy),
      };
    });
  },

  async bulkStudentAttendance(payload: {
    schoolId: string;
    date: string;
    records: Array<{
      studentId: string;
      status: AttendanceStatus;
      notes?: string;
    }>;
    recordedBy: string;
  }): Promise<{ success: boolean; count: number }> {
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

    const existingMap = new Map<
      string,
      { id: string; checkInTime: string | null }
    >();
    for (const row of existingRows ?? []) {
      if (row.studentId) existingMap.set(row.studentId, row);
    }

    const toInsert: BulkStudentAttendanceInsert[] = [];
    const toUpdate: Array<{
      id: string;
      status: AttendanceStatus;
      notes: string | null;
      checkInTime: string | null;
    }> = [];
    const nowIso = new Date().toISOString();

    for (const rec of payload.records) {
      const existing = existingMap.get(rec.studentId);
      const isPresentStatus =
        rec.status === 'HADIR' || rec.status === 'TERLAMBAT';

      if (existing) {
        toUpdate.push({
          id: existing.id,
          status: rec.status,
          notes: rec.notes?.trim() ? rec.notes.trim() : null,
          checkInTime: isPresentStatus ? existing.checkInTime ?? nowIso : null,
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
          checkInTime: isPresentStatus ? nowIso : null,
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
              checkInTime: item.checkInTime,
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
    startDate?: string;
    endDate?: string;
    classId?: string;
    studentId?: string;
    status?: AttendanceStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: StudentAttendance[]; total: number }> {
    const {
      schoolId,
      date,
      startDate,
      endDate,
      classId,
      studentId,
      status,
      page = 1,
      limit = 100,
    } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const studentRelation = classId ? 'students!inner' : 'students';

    const buildQuery = (columns: string) => {
      let q = supabase
        .from('attendances')
        .select(
          `
          ${columns},
          ${studentRelation}(id, fullName, nisn, nis, gender, photoUrl, classId,
            classes(id, name, gradeLevel, major)
          )
        `,
          { count: 'exact' }
        )
        .eq('schoolId', schoolId)
        .eq('type', 'SISWA')
        .range(from, to)
        .order('date', { ascending: false })
        .order('createdAt', { ascending: false });

      if (date) q = q.eq('date', date);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
      if (studentId) q = q.eq('studentId', studentId);
      if (status) q = q.eq('status', status);
      if (classId) q = q.eq('students.classId', classId);
      return q;
    };

    let { data, error, count } = await buildQuery(ATTENDANCE_BASE_COLUMNS);

    if (error) {
      const fallbackRes = await buildQuery(ATTENDANCE_FALLBACK_COLUMNS);
      if (fallbackRes.error) throw fallbackRes.error;
      data = fallbackRes.data;
      count = fallbackRes.count;
    }

    const typedRows = (data ?? []) as unknown as StudentAttendanceQueryRow[];
    const mapped: StudentAttendance[] = typedRows.map((row) => {
      const studentObj = Array.isArray(row.students)
        ? row.students[0]
        : row.students;
      const classObj = studentObj?.classes
        ? Array.isArray(studentObj.classes)
          ? studentObj.classes[0]
          : studentObj.classes
        : null;

      return {
        id: row.id,
        schoolId: row.schoolId,
        studentId: row.studentId,
        teacherId: null,
        type: 'SISWA',
        date: row.date,
        endDate: row.endDate ?? null,
        status: row.status,
        leaveType: row.leaveType ?? null,
        notes: row.notes ?? null,
        attachmentUrl: row.attachmentUrl ?? null,
        approvalStatus: row.approvalStatus ?? 'APPROVED',
        approvedBy: row.approvedBy ?? null,
        approvedAt: row.approvedAt ?? null,
        recordedBy: row.recordedBy ?? null,
        checkInTime: row.checkInTime ?? null,
        time: row.time ?? '',
        checkOutTime: row.checkOutTime ?? null,
        checkInLat: row.checkInLat ?? null,
        checkInLng: row.checkInLng ?? null,
        checkInDistance: row.checkInDistance ?? null,
        checkInAccuracy: row.checkInAccuracy ?? null,
        isCheckInMock: row.isCheckInMock ?? null,
        checkInSelfieUrl: row.checkInSelfieUrl ?? null,
        checkOutLat: row.checkOutLat ?? null,
        checkOutLng: row.checkOutLng ?? null,
        checkOutDistance: row.checkOutDistance ?? null,
        checkOutAccuracy: row.checkOutAccuracy ?? null,
        isCheckOutMock: row.isCheckOutMock ?? null,
        checkOutSelfieUrl: row.checkOutSelfieUrl ?? null,
        securityFlags: row.securityFlags ?? [],
        deviceTelemetry: row.deviceTelemetry ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        student: studentObj
          ? {
              id: studentObj.id,
              fullName: studentObj.fullName,
              nisn: studentObj.nisn,
              nis: studentObj.nis,
              gender: studentObj.gender,
              photoUrl: studentObj.photoUrl,
              classId: studentObj.classId,
              classes: classObj
                ? {
                    id: classObj.id,
                    name: classObj.name,
                    gradeLevel: classObj.gradeLevel,
                    major: classObj.major,
                  }
                : null,
            }
          : null,
      };
    });

    return { data: mapped, total: count ?? 0 };
  },

  // ==========================================================================
  // 5. PRESENSI GPS GURU VIA SERVER RPC v22.2 & PENGAJUAN IZIN
  // ==========================================================================

  async submitTeacherGpsAttendance(
    params: SubmitTeacherGpsAttendanceParams
  ): Promise<GpsAttendanceRpcResponse> {
    const { data, error } = await supabase.rpc(
      'submit_teacher_gps_attendance',
      {
        p_mode: params.mode,
        p_lat: params.lat,
        p_lng: params.lng,
        p_accuracy: params.accuracy,
        p_selfie_path: params.selfiePath ?? null,
        p_early_reason: params.earlyReason ?? null,
        p_is_suspected_mock: Boolean(params.isSuspectedMock),
        p_security_flags: params.securityFlags ?? [],
        p_device_telemetry: params.deviceTelemetry ?? {},
        p_sim_teacher_id: params.simTeacherId ?? null,
        p_sim_school_id: params.simSchoolId ?? null,
      }
    );

    if (error) throw error;
    return data as GpsAttendanceRpcResponse;
  },

  async teacherCheckIn(payload: {
    checkInLat: number;
    checkInLng: number;
    checkInAccuracy?: number;
    isMockGps?: boolean;
    checkInSelfieUrl?: string | null;
    securityFlags?: string[];
    deviceTelemetry?: Record<string, unknown>;
    simTeacherId?: string | null;
    simSchoolId?: string | null;
  }): Promise<{
    success: boolean;
    message: string;
    data: GpsAttendanceRpcResponse;
  }> {
    const result = await this.submitTeacherGpsAttendance({
      mode: 'CHECK_IN',
      lat: payload.checkInLat,
      lng: payload.checkInLng,
      accuracy: payload.checkInAccuracy ?? 15,
      selfiePath: payload.checkInSelfieUrl ?? null,
      isSuspectedMock: Boolean(payload.isMockGps),
      securityFlags: payload.securityFlags ?? [],
      deviceTelemetry: payload.deviceTelemetry ?? {},
      simTeacherId: payload.simTeacherId ?? null,
      simSchoolId: payload.simSchoolId ?? null,
    });

    return {
      success: result.success,
      message:
        result.status === 'TERLAMBAT'
          ? `Check-in berhasil pada ${result.serverTime} (Terlambat).`
          : `Check-in berhasil pada ${result.serverTime}. Selamat bertugas!`,
      data: result,
    };
  },

  async teacherCheckOut(payload: {
    checkOutLat: number;
    checkOutLng: number;
    checkOutAccuracy?: number;
    isMockGps?: boolean;
    checkOutSelfieUrl?: string | null;
    earlyReason?: string | null;
    securityFlags?: string[];
    deviceTelemetry?: Record<string, unknown>;
    simTeacherId?: string | null;
    simSchoolId?: string | null;
  }): Promise<{
    success: boolean;
    message: string;
    data: GpsAttendanceRpcResponse;
  }> {
    const result = await this.submitTeacherGpsAttendance({
      mode: 'CHECK_OUT',
      lat: payload.checkOutLat,
      lng: payload.checkOutLng,
      accuracy: payload.checkOutAccuracy ?? 15,
      selfiePath: payload.checkOutSelfieUrl ?? null,
      earlyReason: payload.earlyReason ?? null,
      isSuspectedMock: Boolean(payload.isMockGps),
      securityFlags: payload.securityFlags ?? [],
      deviceTelemetry: payload.deviceTelemetry ?? {},
      simTeacherId: payload.simTeacherId ?? null,
      simSchoolId: payload.simSchoolId ?? null,
    });

    return {
      success: result.success,
      message: `Check-out berhasil pada ${result.serverTime}. Terima kasih atas dedikasi Anda!`,
      data: result,
    };
  },

  async teacherSubmitLeave(payload: {
    schoolId: string;
    teacherId: string;
    date: string;
    endDate?: string | null;
    status: 'IZIN' | 'SAKIT' | 'CUTI' | 'DINAS' | 'DINAS_LUAR';
    leaveType?: string | null;
    notes: string;
    attachmentUrl?: string | null;
    recordedBy: string;
  }) {
    const { data: existing } = await supabase
      .from('attendances')
      .select('id, status, approvalStatus')
      .eq('schoolId', payload.schoolId)
      .eq('teacherId', payload.teacherId)
      .eq('date', payload.date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: `Presensi tanggal ${payload.date} sudah tercatat dengan status ${existing.status}.`,
      };
    }

    const { data, error } = await supabase
      .from('attendances')
      .insert({
        schoolId: payload.schoolId,
        teacherId: payload.teacherId,
        date: payload.date,
        endDate: payload.endDate || null,
        type: 'GURU',
        status: payload.status,
        leaveType: payload.leaveType?.trim() || payload.status,
        notes: payload.notes.trim(),
        attachmentUrl: payload.attachmentUrl ?? null,
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

  async approveOrRejectAttendance(params: {
    schoolId: string;
    attendanceId: string;
    decision: 'APPROVED' | 'REJECTED';
    approvedBy?: string | null;
    notes?: string;
  }): Promise<void> {
    const updatePayload: {
      approvalStatus: AttendanceApprovalStatus;
      approvedBy?: string | null;
      approvedAt: string;
      notes?: string;
    } = {
      approvalStatus: params.decision,
      approvedAt: new Date().toISOString(),
    };

    if (params.approvedBy !== undefined) {
      updatePayload.approvedBy = params.approvedBy;
    }

    if (params.notes !== undefined) {
      updatePayload.notes = params.notes.trim();
    }

    const { error } = await supabase
      .from('attendances')
      .update(updatePayload)
      .eq('id', params.attendanceId)
      .eq('schoolId', params.schoolId);

    if (error) throw error;
  },

  async getTeacherAttendances(params: {
    schoolId: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    teacherId?: string;
    status?: AttendanceStatus;
    approvalStatus?: AttendanceApprovalStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: TeacherAttendance[]; total: number }> {
    const {
      schoolId,
      date,
      startDate,
      endDate,
      teacherId,
      status,
      approvalStatus,
      page = 1,
      limit = 100,
    } = params;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const buildQuery = (columns: string) => {
      let q = supabase
        .from('attendances')
        .select(
          `
          ${columns},
          teachers(id, fullName, nip, nuptk, position, photoUrl, allowDesktopAttendance)
        `,
          { count: 'exact' }
        )
        .eq('schoolId', schoolId)
        .eq('type', 'GURU')
        .range(from, to)
        .order('date', { ascending: false })
        .order('createdAt', { ascending: false });

      if (date) q = q.eq('date', date);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
      if (teacherId) q = q.eq('teacherId', teacherId);
      if (status) q = q.eq('status', status);
      if (approvalStatus) q = q.eq('approvalStatus', approvalStatus);
      return q;
    };

    let { data, error, count } = await buildQuery(ATTENDANCE_BASE_COLUMNS);

    if (error) {
      const fallbackRes = await buildQuery(ATTENDANCE_FALLBACK_COLUMNS);
      if (fallbackRes.error) throw fallbackRes.error;
      data = fallbackRes.data;
      count = fallbackRes.count;
    }

    const typedRows = (data ?? []) as unknown as TeacherAttendanceQueryRow[];
    const mapped: TeacherAttendance[] = typedRows.map((row) => {
      const teacherObj = Array.isArray(row.teachers)
        ? row.teachers[0]
        : row.teachers;

      return {
        id: row.id,
        schoolId: row.schoolId,
        studentId: null,
        teacherId: row.teacherId,
        type: 'GURU',
        date: row.date,
        endDate: row.endDate ?? null,
        status: row.status,
        leaveType: row.leaveType ?? null,
        notes: row.notes ?? null,
        attachmentUrl: row.attachmentUrl ?? null,
        approvalStatus: row.approvalStatus ?? 'APPROVED',
        approvedBy: row.approvedBy ?? null,
        approvedAt: row.approvedAt ?? null,
        recordedBy: row.recordedBy ?? null,
        checkInTime: row.checkInTime ?? null,
        time: row.time ?? '',
        checkOutTime: row.checkOutTime ?? null,
        checkInLat: row.checkInLat ?? null,
        checkInLng: row.checkInLng ?? null,
        checkInDistance: row.checkInDistance ?? null,
        checkInAccuracy: row.checkInAccuracy ?? null,
        isCheckInMock: row.isCheckInMock ?? null,
        checkInSelfieUrl: row.checkInSelfieUrl ?? null,
        checkOutLat: row.checkOutLat ?? null,
        checkOutLng: row.checkOutLng ?? null,
        checkOutDistance: row.checkOutDistance ?? null,
        checkOutAccuracy: row.checkOutAccuracy ?? null,
        isCheckOutMock: row.isCheckOutMock ?? null,
        checkOutSelfieUrl: row.checkOutSelfieUrl ?? null,
        securityFlags: row.securityFlags ?? [],
        deviceTelemetry: row.deviceTelemetry ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        teacher: teacherObj
          ? {
              id: teacherObj.id,
              fullName: teacherObj.fullName,
              nip: teacherObj.nip,
              nuptk: teacherObj.nuptk,
              position: teacherObj.position,
              photoUrl: teacherObj.photoUrl,
              allowDesktopAttendance: teacherObj.allowDesktopAttendance,
            }
          : null,
      };
    });

    return { data: mapped, total: count ?? 0 };
  },

  async getTeacherTodayStatus(
    schoolId: string,
    teacherId: string,
    date: string
  ) {
    const { data, error } = await supabase
      .from('attendances')
      .select(
        `
        id, status, leaveType, approvalStatus, attachmentUrl,
        checkInTime, time, checkOutTime,
        checkInDistance, checkOutDistance,
        checkInSelfieUrl, checkOutSelfieUrl,
        securityFlags, notes
      `
      )
      .eq('schoolId', schoolId)
      .eq('teacherId', teacherId)
      .eq('date', date)
      .eq('type', 'GURU')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // ==========================================================================
  // 6. RINGKASAN STATISTIK HARIAN, QUOTES & PENCARIAN KIOSK
  // ==========================================================================

  async getSummary(schoolId: string, date: string): Promise<AttendanceSummary> {
    const [attRes, totalStudentsRes, totalTeachersRes] = await Promise.all([
      supabase
        .from('attendances')
        .select('type, status, approvalStatus')
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

    const rows = (attRes.data ?? []) as SummaryAttendanceRow[];
    const students = rows.filter((r) => r.type === 'SISWA');
    const teachers = rows.filter((r) => r.type === 'GURU');

    const countStatus = (arr: SummaryAttendanceRow[], status: string) =>
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
    const teacherLeaveOrDuty = teachers.filter((r) =>
      ['CUTI', 'DINAS', 'DINAS_LUAR'].includes(r.status)
    ).length;
    const teacherAbsent = countStatus(teachers, 'ALPA');
    const teacherRecorded = teachers.length;
    const teacherUnrecorded = Math.max(0, teacherTotal - teacherRecorded);
    const teacherPendingApprovals = teachers.filter(
      (r) => r.approvalStatus === 'PENDING'
    ).length;

    return {
      date,
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
      teacherLeaveOrDuty,
      teacherAbsent,
      teacherUnrecorded,
      teacherPendingApprovals,
      teacherPercentage:
        teacherTotal > 0
          ? Math.round(((teacherPresent + teacherLate) / teacherTotal) * 100)
          : 0,
    };
  },

  async getActiveDailyQuotes(schoolId: string): Promise<DailyQuoteRow[]> {
    const { data, error } = await supabase
      .from('daily_quotes')
      .select('id, schoolId, quote, author, isActive, createdBy, createdAt, updatedAt')
      .or(`schoolId.is.null,schoolId.eq.${schoolId}`)
      .eq('isActive', true)
      .order('createdAt', { ascending: false });

    if (error) throw error;
    return (data ?? []) as DailyQuoteRow[];
  },

  async findStudentByNisOrNisn(schoolId: string, code: string) {
    const cleanCode = code.trim().replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanCode) return null;

    const { data, error } = await supabase
      .from('students')
      .select('id, fullName, nisn, nis, photoUrl, classes(id, name)')
      .eq('schoolId', schoolId)
      .or(`nisn.eq.${cleanCode},nis.eq.${cleanCode}`)
      .eq('status', 'AKTIF')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // ==========================================================================
  // 7. KELOLA HARI LIBUR & KEGIATAN KHUSUS SEKOLAH (SQL v22.2)
  // ==========================================================================

  async getNationalHolidays(
    schoolId: string,
    year: number
  ): Promise<NationalHolidayRow[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data, error } = await supabase
      .from('national_holidays')
      .select(
        'id, schoolId, date, name, type, createdBy, createdAt, updatedAt'
      )
      .or(`schoolId.is.null,schoolId.eq.${schoolId}`)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as NationalHolidayRow[];
  },

  async upsertSchoolHolidays(
    schoolId: string,
    rows: Array<{ date: string; name: string; type?: HolidayCategoryType }>,
    createdBy?: string
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const { data: existingRows, error: fetchErr } = await supabase
      .from('national_holidays')
      .select('id, date, name')
      .eq('schoolId', schoolId);

    if (fetchErr) throw fetchErr;

    const existingKeys = new Set(
      (existingRows ?? []).map(
        (r: { date: string; name: string }) =>
          `${r.date}|${r.name.trim().toLowerCase()}`
      )
    );

    const toInsert = rows
      .filter(
        (r) => !existingKeys.has(`${r.date}|${r.name.trim().toLowerCase()}`)
      )
      .map((r) => ({
        schoolId,
        date: r.date,
        name: r.name.trim(),
        type: r.type ?? 'SEKOLAH',
        createdBy: createdBy ?? null,
      }));

    if (toInsert.length === 0) return 0;

    const { error: insertErr } = await supabase
      .from('national_holidays')
      .insert(toInsert);

    if (insertErr) throw insertErr;
    return toInsert.length;
  },

  async deleteSchoolHoliday(
    schoolId: string,
    holidayId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('national_holidays')
      .delete()
      .eq('id', holidayId)
      .eq('schoolId', schoolId);

    if (error) throw error;
  },

  async getSpecialEventsByMonth(
    schoolId: string,
    year: number,
    monthOneBased: number
  ): Promise<SchoolSpecialEvent[]> {
    const mStr = String(monthOneBased).padStart(2, '0');
    const lastDay = new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
    const startDate = `${year}-${mStr}-01`;
    const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('school_special_events')
      .select(
        'id, schoolId, eventDate, reason, targetType, isActive, createdBy, createdAt, updatedAt'
      )
      .eq('schoolId', schoolId)
      .gte('eventDate', startDate)
      .lte('eventDate', endDate)
      .order('eventDate', { ascending: true });

    if (error) throw error;
    return (data ?? []) as SchoolSpecialEvent[];
  },

  async upsertSchoolSpecialEvent(payload: {
    schoolId: string;
    eventDate: string;
    reason: string;
    targetType?: SpecialEventTargetType;
    isActive?: boolean;
    createdBy?: string;
  }): Promise<SchoolSpecialEvent> {
    const targetType: SpecialEventTargetType = payload.targetType ?? 'ALL';

    const { data, error } = await supabase
      .from('school_special_events')
      .upsert(
        {
          schoolId: payload.schoolId,
          eventDate: payload.eventDate,
          reason: payload.reason.trim(),
          targetType,
          isActive: payload.isActive ?? true,
          createdBy: payload.createdBy ?? null,
        },
        { onConflict: 'schoolId,eventDate,targetType' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as SchoolSpecialEvent;
  },

  async deleteSchoolSpecialEvent(
    schoolId: string,
    eventId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('school_special_events')
      .delete()
      .eq('id', eventId)
      .eq('schoolId', schoolId);

    if (error) throw error;
  },

  async deleteArchivedAttendances(
    schoolId: string,
    beforeDateISO: string
  ): Promise<number> {
    const { data, error } = await supabase
      .from('attendances')
      .delete()
      .eq('schoolId', schoolId)
      .lt('date', beforeDateISO)
      .select('id');

    if (error) throw error;
    return data?.length ?? 0;
  },

  // ==========================================================================
  // 8. WHATSAPP GATEWAY LOGS & KONFIGURASI (SKEMA SQL v22.2)
  // ==========================================================================

  async getSchoolWaConfig(schoolId: string): Promise<SchoolWaConfig | null> {
    const { data, error } = await supabase
      .from('school_wa_configs')
      .select('*')
      .eq('schoolId', schoolId)
      .maybeSingle();

    if (error) throw error;
    return (data as SchoolWaConfig) ?? null;
  },

  async upsertSchoolWaConfig(
    schoolId: string,
    payload: Partial<
      Omit<SchoolWaConfig, 'id' | 'schoolId' | 'createdAt' | 'updatedAt'>
    >
  ): Promise<SchoolWaConfig> {
    const { data, error } = await supabase
      .from('school_wa_configs')
      .upsert(
        {
          schoolId,
          ...payload,
        },
        { onConflict: 'schoolId' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as SchoolWaConfig;
  },

  async getStudentWaRecipient(
    studentId: string
  ): Promise<StudentWaRecipientResult> {
    const { data, error } = await supabase.rpc('get_student_wa_recipient', {
      p_student_id: studentId,
    });

    if (error) throw error;
    return data as StudentWaRecipientResult;
  },

  async logWaNotification(payload: {
    schoolId: string;
    studentId?: string | null;
    recipientPhone: string;
    eventType: WaNotificationEventType;
    messageBody: string;
    status: WaNotificationStatus;
    providerResponse?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const { error } = await supabase.from('wa_notification_logs').insert({
      schoolId: payload.schoolId,
      studentId: payload.studentId ?? null,
      recipientPhone: payload.recipientPhone,
      eventType: payload.eventType,
      messageBody: payload.messageBody,
      status: payload.status,
      providerResponse: payload.providerResponse ?? null,
      errorMessage: payload.errorMessage ?? null,
    });

    if (error) throw error;
  },

  async getWaNotificationLogs(params: {
    schoolId: string;
    limit?: number;
  }): Promise<WaNotificationLog[]> {
    const { data, error } = await supabase
      .from('wa_notification_logs')
      .select('*')
      .eq('schoolId', params.schoolId)
      .order('createdAt', { ascending: false })
      .limit(params.limit ?? 50);

    if (error) throw error;
    return (data ?? []) as WaNotificationLog[];
  },
};