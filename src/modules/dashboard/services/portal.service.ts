import { supabase } from '@/services/supabase.client';

// ============================================================================
// TIPE DATA STRICT SESUAI SKEMA SUPABASE v7.4
// ============================================================================

export interface LinkedStudentProfile {
  linkId: string;
  relationship: string;
  isPrimary: boolean;
  studentId: string;
  nis: string | null;
  nisn: string;
  fullName: string;
  nickname: string | null;
  gender: 'L' | 'P' | string;
  photoUrl: string | null;
  status: string;
  classId: string | null;
  className: string | null;
  gradeLevel: number | null;
  major: string | null;
  homeroomTeacherName: string | null;
  homeroomTeacherPhone: string | null;
}

export interface StudentAttendanceRecord {
  id: string;
  studentId: string;
  date: string;
  status: string;
  notes: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface StudentScheduleItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  subjectName: string;
  subjectCode: string | null;
  teacherName: string | null;
}

export interface StudentBillItem {
  id: string;
  title: string;
  periodMonth: number | null;
  periodYear: number | null;
  totalAmount: number;
  paidAmount: number;
  status: 'BELUM_BAYAR' | 'CICILAN' | 'LUNAS' | 'DIBATALKAN' | string;
  dueDate: string | null;
}

export interface StudentPaymentItem {
  id: string;
  billId: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
}

export interface PortalAnnouncementItem {
  id: string;
  title: string;
  content: string;
  target: string;
  isPinned: boolean;
  publishDate: string;
  expireDate: string | null;
}

// --- RAW DATABASE ROW INTERFACES ---
interface UserStudentLinkRow {
  id: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
}

interface StudentRow {
  id: string;
  nis: string | null;
  nisn: string;
  fullName: string;
  nickname: string | null;
  gender: string;
  photoUrl: string | null;
  status: string;
  classId: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  gradeLevel: number;
  major: string | null;
  homeroomTeacherId: string | null;
}

interface TeacherRow {
  id: string;
  fullName: string;
  phone: string | null;
}

interface ScheduleEntryRow {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  notes: string | null;
  subjectId: string | null;
  teacherId: string | null;
}

interface SubjectRow {
  id: string;
  code: string | null;
  name: string;
}

interface RawBillRow {
  id: string;
  title: string;
  periodMonth: number | null;
  periodYear: number | null;
  totalAmount: number | string;
  paidAmount: number | string;
  status: string;
  dueDate: string | null;
}

interface RawPaymentRow {
  id: string;
  billId: string;
  amount: number | string;
  paymentMethod: string;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
}

// ============================================================================
// FUNGSI QUERY PORTAL SISWA & ORANG TUA
// ============================================================================

/**
 * Mengambil daftar profil siswa yang terhubung dengan akun login (SISWA / ORANG_TUA)
 * melalui tabel user_student_links, lengkap dengan nama kelas dan wali kelas.
 */
export async function fetchLinkedStudents(
  schoolId: string,
  userId: string
): Promise<LinkedStudentProfile[]> {
  const { data: linksData, error: linksError } = await supabase
    .from('user_student_links')
    .select('id, studentId, relationship, isPrimary')
    .eq('schoolId', schoolId)
    .eq('userId', userId)
    .order('isPrimary', { ascending: false });

  if (linksError || !linksData || linksData.length === 0) {
    return [];
  }

  const links = linksData as UserStudentLinkRow[];
  const studentIds = links.map((l) => l.studentId);

  const { data: studentsData, error: studentsError } = await supabase
    .from('students')
    .select('id, nis, nisn, fullName, nickname, gender, photoUrl, status, classId')
    .eq('schoolId', schoolId)
    .in('id', studentIds);

  if (studentsError || !studentsData) {
    return [];
  }

  const students = studentsData as StudentRow[];
  const studentMap = new Map<string, StudentRow>(students.map((s) => [s.id, s]));

  const classIds = Array.from(
    new Set(students.map((s) => s.classId).filter((id): id is string => Boolean(id)))
  );

  const classMap = new Map<string, ClassRow>();
  const teacherMap = new Map<string, TeacherRow>();

  if (classIds.length > 0) {
    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name, gradeLevel, major, homeroomTeacherId')
      .eq('schoolId', schoolId)
      .in('id', classIds);

    const classes = (classesData as ClassRow[] | null) ?? [];
    for (const cls of classes) {
      classMap.set(cls.id, cls);
    }

    const homeroomTeacherIds = Array.from(
      new Set(
        classes.map((c) => c.homeroomTeacherId).filter((id): id is string => Boolean(id))
      )
    );

    if (homeroomTeacherIds.length > 0) {
      const { data: teachersData } = await supabase
        .from('teachers')
        .select('id, fullName, phone')
        .eq('schoolId', schoolId)
        .in('id', homeroomTeacherIds);

      const teachers = (teachersData as TeacherRow[] | null) ?? [];
      for (const tch of teachers) {
        teacherMap.set(tch.id, tch);
      }
    }
  }

  const profiles: LinkedStudentProfile[] = [];
  for (const link of links) {
    const student = studentMap.get(link.studentId);
    if (!student) continue;

    const studentClass = student.classId ? classMap.get(student.classId) : undefined;
    const homeroomTeacher = studentClass?.homeroomTeacherId
      ? teacherMap.get(studentClass.homeroomTeacherId)
      : undefined;

    profiles.push({
      linkId: link.id,
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      studentId: student.id,
      nis: student.nis,
      nisn: student.nisn,
      fullName: student.fullName,
      nickname: student.nickname,
      gender: student.gender,
      photoUrl: student.photoUrl,
      status: student.status,
      classId: student.classId,
      className: studentClass?.name ?? null,
      gradeLevel: studentClass?.gradeLevel ?? null,
      major: studentClass?.major ?? null,
      homeroomTeacherName: homeroomTeacher?.fullName ?? null,
      homeroomTeacherPhone: homeroomTeacher?.phone ?? null,
    });
  }

  return profiles;
}

/**
 * Mengambil riwayat presensi siswa dari tabel attendances (type = 'SISWA').
 */
export async function fetchStudentAttendances(
  schoolId: string,
  studentId: string
): Promise<StudentAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendances')
    .select('id, studentId, date, status, notes, checkInTime, checkOutTime')
    .eq('schoolId', schoolId)
    .eq('studentId', studentId)
    .eq('type', 'SISWA')
    .order('date', { ascending: false })
    .limit(180);

  if (error || !data) return [];
  return data as StudentAttendanceRecord[];
}

/**
 * Mengambil jadwal pelajaran aktif untuk kelas siswa.
 */
export async function fetchClassSchedules(
  schoolId: string,
  classId: string | null,
  academicYearId?: string | null
): Promise<StudentScheduleItem[]> {
  if (!classId) return [];

  let query = supabase
    .from('schedule_entries')
    .select('id, dayOfWeek, startTime, endTime, room, notes, subjectId, teacherId')
    .eq('schoolId', schoolId)
    .eq('classId', classId)
    .eq('isActive', true)
    .order('dayOfWeek', { ascending: true })
    .order('startTime', { ascending: true });

  if (academicYearId) {
    query = query.eq('academicYearId', academicYearId);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return [];

  const entries = data as ScheduleEntryRow[];

  const subjectIds = Array.from(
    new Set(entries.map((e) => e.subjectId).filter((id): id is string => Boolean(id)))
  );
  const teacherIds = Array.from(
    new Set(entries.map((e) => e.teacherId).filter((id): id is string => Boolean(id)))
  );

  const [subjectsRes, teachersRes] = await Promise.all([
    subjectIds.length > 0
      ? supabase.from('subjects').select('id, code, name').eq('schoolId', schoolId).in('id', subjectIds)
      : Promise.resolve({ data: [] as SubjectRow[] }),
    teacherIds.length > 0
      ? supabase.from('teachers').select('id, fullName, phone').eq('schoolId', schoolId).in('id', teacherIds)
      : Promise.resolve({ data: [] as TeacherRow[] }),
  ]);

  const subjectMap = new Map<string, SubjectRow>(
    ((subjectsRes.data as SubjectRow[] | null) ?? []).map((s) => [s.id, s])
  );
  const teacherMap = new Map<string, TeacherRow>(
    ((teachersRes.data as TeacherRow[] | null) ?? []).map((t) => [t.id, t])
  );

  return entries.map((entry) => {
    const subj = entry.subjectId ? subjectMap.get(entry.subjectId) : undefined;
    const tch = entry.teacherId ? teacherMap.get(entry.teacherId) : undefined;
    return {
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      room: entry.room,
      notes: entry.notes,
      subjectName: subj?.name ?? 'Mata Pelajaran',
      subjectCode: subj?.code ?? null,
      teacherName: tch?.fullName ?? null,
    };
  });
}

/**
 * Mengambil tagihan dan riwayat pembayaran siswa.
 */
export async function fetchStudentFinance(
  schoolId: string,
  studentId: string
): Promise<{ bills: StudentBillItem[]; payments: StudentPaymentItem[] }> {
  const [billsRes, paymentsRes] = await Promise.all([
    supabase
      .from('student_bills')
      .select('id, title, periodMonth, periodYear, totalAmount, paidAmount, status, dueDate')
      .eq('schoolId', schoolId)
      .eq('studentId', studentId)
      .neq('status', 'DIBATALKAN')
      .order('dueDate', { ascending: true }),
    supabase
      .from('payment_transactions')
      .select('id, billId, amount, paymentMethod, paymentDate, reference, notes')
      .eq('schoolId', schoolId)
      .eq('studentId', studentId)
      .eq('status', 'BERHASIL')
      .order('paymentDate', { ascending: false })
      .limit(60),
  ]);

  const bills: StudentBillItem[] = ((billsRes.data as RawBillRow[] | null) ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    periodMonth: b.periodMonth,
    periodYear: b.periodYear,
    totalAmount: Number(b.totalAmount) || 0,
    paidAmount: Number(b.paidAmount) || 0,
    status: b.status,
    dueDate: b.dueDate,
  }));

  const payments: StudentPaymentItem[] = ((paymentsRes.data as RawPaymentRow[] | null) ?? []).map(
    (p) => ({
      id: p.id,
      billId: p.billId,
      amount: Number(p.amount) || 0,
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate,
      reference: p.reference,
      notes: p.notes,
    })
  );

  return { bills, payments };
}

/**
 * Mengambil pengumuman sekolah aktif untuk target tertentu (SISWA / ORANG_TUA / SEMUA).
 */
export async function fetchPortalAnnouncements(
  schoolId: string,
  roleTarget: 'SISWA' | 'ORANG_TUA'
): Promise<PortalAnnouncementItem[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, target, isPinned, publishDate, expireDate')
    .eq('schoolId', schoolId)
    .in('target', ['SEMUA', roleTarget])
    .order('isPinned', { ascending: false })
    .order('publishDate', { ascending: false })
    .limit(6);

  if (error || !data) return [];

  const now = Date.now();
  return (data as PortalAnnouncementItem[]).filter(
    (item) => !item.expireDate || new Date(item.expireDate).getTime() > now
  );
}