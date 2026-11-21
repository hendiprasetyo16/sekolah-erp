// src/modules/attendance/pages/AttendanceDashboardPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  GraduationCap,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  Download,
  RefreshCw,
  MapPin,
  Shield,
  ShieldAlert,
  Camera,
  X,
  FlaskConical,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  ArchiveX,
  AlertTriangle,
  CheckCircle2,
  LogIn,
  LogOut,
  Search,
  Smartphone,
  CalendarDays,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { getJavaneseDateInfo } from '../utils/javaneseCalendar';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import type {
  StudentAttendance,
  TeacherAttendance,
  AttendanceSummary,
} from '../types/attendance.types';

// ============================================================================
// PARAMETER YANG BISA KAMU SESUAIKAN DENGAN MUDAH
// ============================================================================
const ARCHIVE_RETENTION_YEARS = 2; // Batas umur arsip absensi dalam tahun (default: 2 tahun)
const STORAGE_BUCKET_NAME = 'attendance-selfies'; // Bucket penyimpanan foto selfie
const ATTACHMENT_BUCKET_NAME = 'attendance-attachments'; // Bucket penyimpanan surat izin/dinas
const STORAGE_DELETE_BATCH_SIZE = 100; // Jumlah maksimal file yang dihapus per gelombang

type ActiveTab = 'overview' | 'students' | 'teachers';
type SortDirection = 'asc' | 'desc';

type TeacherSortKey =
  | 'fullName'
  | 'nip'
  | 'status'
  | 'checkInTime'
  | 'checkOutTime'
  | 'checkInDistance';

type StudentSortKey =
  | 'fullName'
  | 'className'
  | 'nisn'
  | 'status'
  | 'time'
  | 'checkOutTime';

// Memperluas tipe TeacherAttendance tanpa bentrok dengan tipe securityFlags & deviceTelemetry
type TeacherAttendanceWithCheckOut = Omit<
  TeacherAttendance,
  'deviceTelemetry' | 'securityFlags'
> & {
  teacherId?: string | null;
  teacher?: (TeacherAttendance['teacher'] & { id?: string | null }) | null;
  checkOutSelfieUrl?: string | null;
  checkOutDistance?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  attachmentUrl?: string | null;
  deviceTelemetry?: Record<string, unknown> | null;
  securityFlags?: string[] | null;
};

// Memperluas tipe StudentAttendance agar mencakup kolom Jam Masuk & Jam Pulang
type StudentAttendanceWithCheckOut = StudentAttendance & {
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

interface AttendanceExtraCols {
  id: string;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutDistance?: number | null;
  checkOutSelfieUrl?: string | null;
  attachmentUrl?: string | null;
  deviceTelemetry?: Record<string, unknown> | null;
  securityFlags?: string[] | null;
}

interface StudentAttendanceExtraCols {
  id: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

interface AttendanceFileRow {
  checkInSelfieUrl?: string | null;
  checkOutSelfieUrl?: string | null;
  attachmentUrl?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  HADIR: '#10B981',
  TERLAMBAT: '#F59E0B',
  SAKIT: '#8B5CF6',
  IZIN: '#3B82F6',
  ALPA: '#EF4444',
  BELUM_ABSEN: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  SAKIT: 'Sakit',
  IZIN: 'Izin',
  ALPA: 'Alpa',
  BELUM_ABSEN: 'Belum Absen',
};

const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// Normalisasi status agar variasi penulisan ALPHA tetap terbaca sebagai ALPA
function normalizeStatusKey(status?: string | null): string {
  const upper = (status ?? '').toUpperCase();
  return upper === 'ALPHA' ? 'ALPA' : upper;
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallbackMessage;
}

function getRetentionCutoffDate(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function removeFilesFromStorage(
  paths: Array<string | null | undefined>,
  bucketName: string = STORAGE_BUCKET_NAME
) {
  const validPaths = Array.from(
    new Set(paths.filter((p): p is string => Boolean(p && p.trim())))
  );
  if (validPaths.length === 0) return;

  for (let i = 0; i < validPaths.length; i += STORAGE_DELETE_BATCH_SIZE) {
    const chunk = validPaths.slice(i, i + STORAGE_DELETE_BATCH_SIZE);
    const { error } = await supabase.storage.from(bucketName).remove(chunk);

    if (error) {
      console.warn(
        `[StorageCleanup:${bucketName}] Sebagian file gagal dihapus:`,
        error.message
      );
    }
  }
}

function isEarlyCheckoutNote(notes?: string | null): boolean {
  if (!notes) return false;
  const lower = notes.toLowerCase();
  return lower.includes('pulang awal') || lower.includes('pulang lebih awal');
}

/**
 * Mengambil menit keterlambatan yang tercatat pada telemetri (jika ada)
 */
function extractLateMinutesFromTelemetry(
  telemetry?: Record<string, unknown> | null
): number {
  if (!telemetry || typeof telemetry !== 'object') return 0;
  const raw = telemetry.lateMinutes;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  return 0;
}

/**
 * Memformat tanggal YYYY-MM-DD menjadi label Masehi + Kalender Jawa lengkap
 */
function formatFullDateWithJavanese(dateStr: string): {
  masehiWithPasaran: string;
  javaneseCalendarLabel: string;
} {
  const jv = getJavaneseDateInfo(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  const monthName = NAMA_BULAN_ID[(m || 1) - 1] ?? '';
  return {
    masehiWithPasaran: `${jv.hariPasaran}, ${d || 1} ${monthName} ${y || ''}`,
    javaneseCalendarLabel: `${jv.javaneseDay} ${jv.javaneseMonth} ${jv.javaneseYear} Ja (${jv.winduYearName})`,
  };
}

export function AttendanceDashboardPage() {
  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // Peran yang diizinkan menghapus baris data presensi satuan (bisa ditambah 'WALI_KELAS' bila perlu)
  const canDeleteRecord =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  // State Simulasi Sekolah (Khusus SUPER_ADMIN)
  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string; npsn: string }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || user?.schoolId || ''
    : school?.id || user?.schoolId || '';

  const teacherScope = useTeacherScope(activeSchoolId);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [studentRecords, setStudentRecords] = useState<
    StudentAttendanceWithCheckOut[]
  >([]);
  const [teacherRecords, setTeacherRecords] = useState<
    TeacherAttendanceWithCheckOut[]
  >([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<string>('ALL');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Label Kalender Masehi + Pasaran Jawa untuk tanggal terpilih
  const selectedDateDisplay = useMemo(
    () => formatFullDateWithJavanese(selectedDate),
    [selectedDate]
  );

  // State Pengurutan (Sorting) Tabel Guru & Siswa
  const [teacherSort, setTeacherSort] = useState<{
    key: TeacherSortKey;
    direction: SortDirection;
  } | null>(null);

  const [studentSort, setStudentSort] = useState<{
    key: StudentSortKey;
    direction: SortDirection;
  } | null>(null);

  // State Toast Notifikasi
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4500);
    },
    []
  );

  // State Modal Pratinjau Foto Selfie Guru (Datang, Pulang, & Telemetri Perangkat)
  const [selfieModal, setSelfieModal] = useState<{
    teacherName: string;
    status: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    checkInDistance?: number | null;
    checkOutDistance?: number | null;
    notes?: string | null;
    deviceTelemetry?: Record<string, unknown> | null;
    securityFlags?: string[] | null;
    isMock?: boolean;
    hasCheckInPhoto: boolean;
    hasCheckOutPhoto: boolean;
    checkInImageUrl: string | null;
    checkOutImageUrl: string | null;
    isLoading: boolean;
  } | null>(null);

  // State Modal Hapus Satuan & Pembersihan Arsip > 2 Tahun
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    date: string;
    selfiePaths: string[];
    attachmentPaths: string[];
  } | null>(null);
  const [isDeletingRow, setIsDeletingRow] = useState<boolean>(false);

  const [purgeModalOpen, setPurgeModalOpen] = useState<boolean>(false);
  const [purgeScope, setPurgeScope] = useState<'CURRENT_SCHOOL' | 'ALL_SCHOOLS'>(
    'CURRENT_SCHOOL'
  );
  const [oldRecordsCount, setOldRecordsCount] = useState<number | null>(null);
  const [isCheckingOldRecords, setIsCheckingOldRecords] = useState<boolean>(false);
  const [isPurgingOldRecords, setIsPurgingOldRecords] = useState<boolean>(false);

  const cutoffDate = useMemo(
    () => getRetentionCutoffDate(ARCHIVE_RETENTION_YEARS),
    []
  );

  // 1a. Sinkronkan sekolah aktif secara instan ketika tombol "Ganti Sekolah" di header diklik
  useEffect(() => {
    if (isSuperAdmin && school?.id) {
      setSimSchoolId(school.id);
    }
  }, [isSuperAdmin, school?.id]);

  // 1b. Jika SUPER_ADMIN, muat daftar sekolah
  useEffect(() => {
    if (!isSuperAdmin) return;
    attendanceService
      .getAllSchoolsForSimulation()
      .then((list) => {
        setSimSchools(list);
        if (school?.id) setSimSchoolId(school.id);
        else if (list.length > 0) setSimSchoolId((prev) => prev || list[0].id);
      })
      .catch(console.error);
  }, [isSuperAdmin, school?.id]);

  // 2. Muat Daftar Kelas untuk Filter Tab Siswa
  useEffect(() => {
    if (!activeSchoolId) return;
    supabase
      .from('classes')
      .select('id, name')
      .eq('schoolId', activeSchoolId)
      .order('gradeLevel', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => {
        setClasses(data ?? []);
        setSelectedClassId('ALL');
      });
  }, [activeSchoolId]);

  // 3. Muat Ringkasan & Data Absensi Siswa + Guru secara independen (Promise.allSettled)
  const loadData = useCallback(async () => {
    if (!activeSchoolId) return;
    setIsLoading(true);
    try {
      const [sumRes, studentsRes, teachersRes] = await Promise.allSettled([
        attendanceService.getSummary(activeSchoolId, selectedDate),
        attendanceService.getStudentAttendances({
          schoolId: activeSchoolId,
          date: selectedDate,
          limit: 500,
        }),
        attendanceService.getTeacherAttendances({
          schoolId: activeSchoolId,
          date: selectedDate,
          limit: 200,
        }),
      ]);

      if (sumRes.status === 'fulfilled') {
        setSummary(sumRes.value);
      } else {
        console.error(
          '[AttendanceDashboard] Gagal memuat ringkasan:',
          sumRes.reason
        );
      }

      let enrichedStudents: StudentAttendanceWithCheckOut[] =
        studentsRes.status === 'fulfilled'
          ? (studentsRes.value.data as StudentAttendanceWithCheckOut[])
          : [];

      if (studentsRes.status === 'rejected') {
        showToast(
          'error',
          getErrorMessage(
            studentsRes.reason,
            'Gagal memuat rekap absensi siswa.'
          )
        );
      }

      let enrichedTeachers: TeacherAttendanceWithCheckOut[] =
        teachersRes.status === 'fulfilled'
          ? (teachersRes.value.data as TeacherAttendanceWithCheckOut[])
          : [];

      if (teachersRes.status === 'rejected') {
        console.error(
          '[AttendanceDashboard] Gagal memuat absensi guru:',
          teachersRes.reason
        );
      }

      if (enrichedStudents.length > 0) {
        const studentAttIds = enrichedStudents.map((s) => s.id);
        const { data: studentExtraCols, error: studentExtraErr } = await supabase
          .from('attendances')
          .select('id, checkInTime, checkOutTime')
          .in('id', studentAttIds);

        if (!studentExtraErr && studentExtraCols) {
          const typedStudentCols =
            studentExtraCols as StudentAttendanceExtraCols[];
          const studentExtraMap = new Map(
            typedStudentCols.map((row) => [row.id, row])
          );
          enrichedStudents = enrichedStudents.map((item) => {
            const extra = studentExtraMap.get(item.id);
            return extra
              ? {
                ...item,
                checkInTime: extra.checkInTime ?? item.time ?? null,
                checkOutTime: extra.checkOutTime ?? null,
              }
              : item;
          });
        }
      }

      if (enrichedTeachers.length > 0) {
        const ids = enrichedTeachers.map((t) => t.id);

        // Ambil kolom tambahan + telemetri perangkat (dengan fallback aman)
        let extraRows: AttendanceExtraCols[] | null = null;
        const primaryRes = await supabase
          .from('attendances')
          .select(
            'id, checkOutLat, checkOutLng, checkOutDistance, checkOutSelfieUrl, attachmentUrl, deviceTelemetry, securityFlags'
          )
          .in('id', ids);

        if (!primaryRes.error && primaryRes.data) {
          extraRows = primaryRes.data as AttendanceExtraCols[];
        } else {
          const fallbackRes = await supabase
            .from('attendances')
            .select(
              'id, checkOutLat, checkOutLng, checkOutDistance, checkOutSelfieUrl, attachmentUrl'
            )
            .in('id', ids);
          if (!fallbackRes.error && fallbackRes.data) {
            extraRows = fallbackRes.data as AttendanceExtraCols[];
          }
        }

        if (extraRows) {
          const extraMap = new Map(extraRows.map((row) => [row.id, row]));
          enrichedTeachers = enrichedTeachers.map((item) => {
            const extra = extraMap.get(item.id);
            if (!extra) return item;
            return {
              ...item,
              checkOutLat: extra.checkOutLat ?? null,
              checkOutLng: extra.checkOutLng ?? null,
              checkOutDistance: extra.checkOutDistance ?? null,
              checkOutSelfieUrl: extra.checkOutSelfieUrl ?? null,
              attachmentUrl: extra.attachmentUrl ?? null,
              deviceTelemetry:
                extra.deviceTelemetry ?? item.deviceTelemetry ?? null,
              securityFlags: Array.isArray(extra.securityFlags)
                ? extra.securityFlags
                : item.securityFlags ?? [],
            };
          });
        }
      }

      // Hanya Kepala Sekolah, Admin, dan Super Admin yang melihat semua guru
      if (!teacherScope.canViewAllTeacherAttendance) {
        enrichedTeachers = teacherScope.teacherId
          ? enrichedTeachers.filter(
            (item) =>
              String(item.teacherId) === teacherScope.teacherId ||
              String(item.teacher?.id) === teacherScope.teacherId
          )
          : [];
      }

      setStudentRecords(enrichedStudents);
      setTeacherRecords(enrichedTeachers);
    } catch (err: unknown) {
      console.error('[AttendanceDashboard] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeSchoolId,
    selectedDate,
    showToast,
    teacherScope.canViewAllTeacherAttendance,
    teacherScope.teacherId,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Buka Modal Pratinjau Foto Selfie Guru + Telemetri Perangkat
  const handlePreviewSelfie = async (record: TeacherAttendanceWithCheckOut) => {
    const hasCheckInPhoto = Boolean(record.checkInSelfieUrl);
    const hasCheckOutPhoto = Boolean(record.checkOutSelfieUrl);
    if (!hasCheckInPhoto && !hasCheckOutPhoto) return;

    setSelfieModal({
      teacherName: record.teacher?.fullName ?? 'Guru / PTK',
      status: record.status,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      checkInDistance: record.checkInDistance,
      checkOutDistance: record.checkOutDistance,
      notes: record.notes,
      deviceTelemetry: record.deviceTelemetry ?? null,
      securityFlags: record.securityFlags ?? [],
      isMock: Boolean(record.isCheckInMock),
      hasCheckInPhoto,
      hasCheckOutPhoto,
      checkInImageUrl: null,
      checkOutImageUrl: null,
      isLoading: true,
    });

    const [signedInUrl, signedOutUrl] = await Promise.all([
      record.checkInSelfieUrl
        ? attendanceService.getSignedSelfieUrl(record.checkInSelfieUrl)
        : Promise.resolve(null),
      record.checkOutSelfieUrl
        ? attendanceService.getSignedSelfieUrl(record.checkOutSelfieUrl)
        : Promise.resolve(null),
    ]);

    setSelfieModal((prev) =>
      prev
        ? {
          ...prev,
          checkInImageUrl: signedInUrl,
          checkOutImageUrl: signedOutUrl,
          isLoading: false,
        }
        : null
    );
  };

  // Fungsi Toggle Sorting Header Kolom
  const handleSortTeacher = (key: TeacherSortKey) => {
    setTeacherSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const handleSortStudent = (key: StudentSortKey) => {
    setStudentSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const renderSortIcon = (isActive: boolean, direction?: SortDirection) => {
    if (!isActive || !direction) {
      return <ArrowUpDown size={13} className="inline ml-1 opacity-40" />;
    }
    return direction === 'asc' ? (
      <ArrowUp size={13} className="inline ml-1 text-primary" />
    ) : (
      <ArrowDown size={13} className="inline ml-1 text-primary" />
    );
  };

  // Hitung statistik status siswa berdasarkan kelas terpilih
  const studentStatusCounts = useMemo(() => {
    const classScoped = studentRecords.filter(
      (r) => selectedClassId === 'ALL' || r.student?.classId === selectedClassId
    );
    return {
      ALL: classScoped.length,
      HADIR: classScoped.filter((r) => normalizeStatusKey(r.status) === 'HADIR')
        .length,
      TERLAMBAT: classScoped.filter(
        (r) => normalizeStatusKey(r.status) === 'TERLAMBAT'
      ).length,
      IZIN: classScoped.filter((r) => normalizeStatusKey(r.status) === 'IZIN')
        .length,
      SAKIT: classScoped.filter((r) => normalizeStatusKey(r.status) === 'SAKIT')
        .length,
      ALPA: classScoped.filter((r) => normalizeStatusKey(r.status) === 'ALPA')
        .length,
    };
  }, [studentRecords, selectedClassId]);

  // Hitung statistik status guru
  const teacherStatusCounts = useMemo(() => {
    return {
      ALL: teacherRecords.length,
      HADIR: teacherRecords.filter(
        (r) => normalizeStatusKey(r.status) === 'HADIR'
      ).length,
      TERLAMBAT: teacherRecords.filter(
        (r) => normalizeStatusKey(r.status) === 'TERLAMBAT'
      ).length,
      IZIN: teacherRecords.filter((r) => normalizeStatusKey(r.status) === 'IZIN')
        .length,
      SAKIT: teacherRecords.filter(
        (r) => normalizeStatusKey(r.status) === 'SAKIT'
      ).length,
      ALPA: teacherRecords.filter((r) => normalizeStatusKey(r.status) === 'ALPA')
        .length,
    };
  }, [teacherRecords]);

  // Filter & Urutkan Data Siswa
  const filteredStudents = useMemo(() => {
    const filtered = studentRecords.filter((r) => {
      const normalizedStatus = normalizeStatusKey(r.status);
      const matchesClass =
        selectedClassId === 'ALL' || r.student?.classId === selectedClassId;
      const matchesStatus =
        studentStatusFilter === 'ALL' ||
        normalizedStatus === studentStatusFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        r.student?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.student?.nisn?.includes(searchQuery.trim()) ||
        (r.student?.nis && r.student.nis.includes(searchQuery.trim()));
      return matchesClass && matchesStatus && matchesSearch;
    });

    if (!studentSort) return filtered;

    const dir = studentSort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (studentSort.key) {
        case 'fullName':
          return (
            (a.student?.fullName ?? '').localeCompare(
              b.student?.fullName ?? '',
              'id'
            ) * dir
          );
        case 'className':
          return (
            (a.student?.classes?.name ?? '').localeCompare(
              b.student?.classes?.name ?? '',
              'id',
              { numeric: true }
            ) * dir
          );
        case 'nisn':
          return (
            (a.student?.nisn ?? '').localeCompare(
              b.student?.nisn ?? '',
              'id',
              { numeric: true }
            ) * dir
          );
        case 'status': {
          const stA = normalizeStatusKey(a.status);
          const stB = normalizeStatusKey(b.status);
          return (
            (STATUS_LABELS[stA] ?? stA).localeCompare(
              STATUS_LABELS[stB] ?? stB,
              'id'
            ) * dir
          );
        }
        case 'time': {
          const inA = a.checkInTime || a.time || '';
          const inB = b.checkInTime || b.time || '';
          return inA.localeCompare(inB) * dir;
        }
        case 'checkOutTime':
          return (
            (a.checkOutTime ?? '').localeCompare(b.checkOutTime ?? '') * dir
          );
        default:
          return 0;
      }
    });
  }, [
    studentRecords,
    selectedClassId,
    studentStatusFilter,
    searchQuery,
    studentSort,
  ]);

  // Filter & Urutkan Data Guru
  const filteredTeachers = useMemo(() => {
    const filtered = teacherRecords.filter((r) => {
      const normalizedStatus = normalizeStatusKey(r.status);
      const matchesStatus =
        teacherStatusFilter === 'ALL' ||
        normalizedStatus === teacherStatusFilter;
      if (!matchesStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.teacher?.fullName?.toLowerCase().includes(q) ||
        r.teacher?.nip?.includes(searchQuery.trim()) ||
        r.teacher?.nuptk?.includes(searchQuery.trim()) ||
        r.notes?.toLowerCase().includes(q)
      );
    });

    if (!teacherSort) return filtered;

    const dir = teacherSort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (teacherSort.key) {
        case 'fullName':
          return (
            (a.teacher?.fullName ?? '').localeCompare(
              b.teacher?.fullName ?? '',
              'id'
            ) * dir
          );
        case 'nip': {
          const idA = a.teacher?.nip || a.teacher?.nuptk || '';
          const idB = b.teacher?.nip || b.teacher?.nuptk || '';
          return idA.localeCompare(idB, 'id', { numeric: true }) * dir;
        }
        case 'status': {
          const stA = normalizeStatusKey(a.status);
          const stB = normalizeStatusKey(b.status);
          return (
            (STATUS_LABELS[stA] ?? stA).localeCompare(
              STATUS_LABELS[stB] ?? stB,
              'id'
            ) * dir
          );
        }
        case 'checkInTime':
          return (
            (a.checkInTime ?? '').localeCompare(b.checkInTime ?? '') * dir
          );
        case 'checkOutTime':
          return (
            (a.checkOutTime ?? '').localeCompare(b.checkOutTime ?? '') * dir
          );
        case 'checkInDistance': {
          const distA = a.checkInDistance ?? Number.MAX_SAFE_INTEGER;
          const distB = b.checkInDistance ?? Number.MAX_SAFE_INTEGER;
          return (distA - distB) * dir;
        }
        default:
          return 0;
      }
    });
  }, [teacherRecords, teacherStatusFilter, searchQuery, teacherSort]);

  // 4. Hapus 1 Baris Data Absensi beserta SELURUH Foto Selfie & Lampiran Surat (SUPER_ADMIN & ADMIN)
  const handleConfirmDeleteSingle = async () => {
    if (!deleteTarget || !canDeleteRecord || !activeSchoolId) return;
    setIsDeletingRow(true);
    try {
      const { data: latestRow } = await supabase
        .from('attendances')
        .select('checkInSelfieUrl, checkOutSelfieUrl, attachmentUrl')
        .eq('id', deleteTarget.id)
        .eq('schoolId', activeSchoolId)
        .maybeSingle();

      const typedLatestRow = latestRow as AttendanceFileRow | null;

      const selfiePathsToDelete = [
        ...deleteTarget.selfiePaths,
        typedLatestRow?.checkInSelfieUrl,
        typedLatestRow?.checkOutSelfieUrl,
      ];

      const attachmentPathsToDelete = [
        ...deleteTarget.attachmentPaths,
        typedLatestRow?.attachmentUrl,
      ];

      await Promise.all([
        removeFilesFromStorage(selfiePathsToDelete, STORAGE_BUCKET_NAME),
        removeFilesFromStorage(attachmentPathsToDelete, ATTACHMENT_BUCKET_NAME),
      ]);

      const { error } = await supabase
        .from('attendances')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('schoolId', activeSchoolId);

      if (error) throw error;

      showToast(
        'success',
        `Data absensi ${deleteTarget.name} (${deleteTarget.date}) beserta lampirannya berhasil dihapus.`
      );
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(
          err,
          'Gagal menghapus data. Pastikan kebijakan RLS DELETE untuk Super Admin / Admin sudah aktif.'
        )
      );
    } finally {
      setIsDeletingRow(false);
    }
  };

  // 5. Hitung Jumlah Data Absensi Berumur > 2 Tahun (Khusus SUPER_ADMIN)
  const checkOldAttendanceRecords = useCallback(
    async (scope: 'CURRENT_SCHOOL' | 'ALL_SCHOOLS') => {
      if (!isSuperAdmin) return;
      setIsCheckingOldRecords(true);
      setOldRecordsCount(null);
      try {
        let query = supabase
          .from('attendances')
          .select('id', { count: 'exact', head: true })
          .lt('date', cutoffDate);

        if (scope === 'CURRENT_SCHOOL' && activeSchoolId) {
          query = query.eq('schoolId', activeSchoolId);
        }

        const { count, error } = await query;
        if (error) throw error;
        setOldRecordsCount(count ?? 0);
      } catch (err: unknown) {
        showToast('error', getErrorMessage(err, 'Gagal menghitung arsip lama.'));
        setOldRecordsCount(0);
      } finally {
        setIsCheckingOldRecords(false);
      }
    },
    [isSuperAdmin, cutoffDate, activeSchoolId, showToast]
  );

  useEffect(() => {
    if (purgeModalOpen && isSuperAdmin) {
      checkOldAttendanceRecords(purgeScope);
    }
  }, [purgeModalOpen, purgeScope, isSuperAdmin, checkOldAttendanceRecords]);

  // Ekspor Backup CSV Arsip Lama (> 2 Tahun)
  const handleBackupOldRecordsCsv = async () => {
    if (!isSuperAdmin) return;
    try {
      let query = supabase
        .from('attendances')
        .select('*')
        .lt('date', cutoffDate)
        .order('date', { ascending: true })
        .limit(10000);

      if (purgeScope === 'CURRENT_SCHOOL' && activeSchoolId) {
        query = query.eq('schoolId', activeSchoolId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        showToast('error', 'Tidak ada data arsip lama untuk diunduh.');
        return;
      }

      const headers = Object.keys(rows[0]);
      const escapeCsv = (v: unknown) =>
        `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csvLines = [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
      ];

      const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_Arsip_Absensi_Sebelum_${cutoffDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(
        'success',
        `File backup (${rows.length} baris) berhasil diunduh.`
      );
    } catch (err: unknown) {
      showToast('error', getErrorMessage(err, 'Gagal membuat file backup CSV.'));
    }
  };

  // Eksekusi Hapus Permanen Arsip > 2 Tahun
  const handlePurgeOldRecords = async () => {
    if (!isSuperAdmin) return;
    setIsPurgingOldRecords(true);
    try {
      let fetchFilesQuery = supabase
        .from('attendances')
        .select('checkInSelfieUrl, checkOutSelfieUrl, attachmentUrl')
        .lt('date', cutoffDate)
        .limit(10000);

      if (purgeScope === 'CURRENT_SCHOOL' && activeSchoolId) {
        fetchFilesQuery = fetchFilesQuery.eq('schoolId', activeSchoolId);
      }

      const { data: oldFiles } = await fetchFilesQuery;
      const typedOldFiles = (oldFiles ?? []) as AttendanceFileRow[];
      const selfiePathsToRemove = typedOldFiles.flatMap((row) => [
        row.checkInSelfieUrl,
        row.checkOutSelfieUrl,
      ]);
      const attachmentPathsToRemove = typedOldFiles.map(
        (row) => row.attachmentUrl
      );

      await Promise.all([
        removeFilesFromStorage(selfiePathsToRemove, STORAGE_BUCKET_NAME),
        removeFilesFromStorage(attachmentPathsToRemove, ATTACHMENT_BUCKET_NAME),
      ]);

      let deleteQuery = supabase
        .from('attendances')
        .delete()
        .lt('date', cutoffDate);

      if (purgeScope === 'CURRENT_SCHOOL' && activeSchoolId) {
        deleteQuery = deleteQuery.eq('schoolId', activeSchoolId);
      }

      const { error } = await deleteQuery;
      if (error) throw error;

      showToast(
        'success',
        `Pembersihan selesai! ${oldRecordsCount ?? 0} arsip absensi sebelum ${cutoffDate} beserta foto datang, pulang & lampirannya telah dihapus.`
      );
      setPurgeModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(
          err,
          'Gagal menghapus arsip lama. Periksa kebijakan RLS DELETE pada tabel attendances.'
        )
      );
    } finally {
      setIsPurgingOldRecords(false);
    }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '-';
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(iso.trim())) {
      return iso.trim().slice(0, 5);
    }
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render Kolom Keterangan Guru dengan Penanda Khusus "Pulang Awal" & Menit Terlambat
  const renderTeacherNotes = (record: TeacherAttendanceWithCheckOut) => {
    const notes = record.notes;
    const lateMinutes = extractLateMinutesFromTelemetry(record.deviceTelemetry);
    const hasEarlyNote = isEarlyCheckoutNote(notes);

    if ((!notes || !notes.trim()) && lateMinutes === 0) {
      return <span className="text-xs opacity-40">-</span>;
    }

    return (
      <div className="flex flex-col items-start gap-1 max-w-60">
        {lateMinutes > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35">
            <Clock size={11} />
            Terlambat {lateMinutes} menit
          </span>
        )}
        {hasEarlyNote && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/35">
            <AlertTriangle size={11} />
            Pulang Awal
          </span>
        )}
        {notes && notes.trim() && (
          <span className="text-xs text-foreground/85 leading-snug">
            {notes}
          </span>
        )}
      </div>
    );
  };

  // Ekspor Laporan CSV (Kompatibel dengan Microsoft Excel + Kalender Jawa)
  const handleExportCsv = () => {
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? '-').replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];

    if (activeTab === 'teachers') {
      lines.push(
        [
          'No',
          'Tanggal',
          'Hari & Pasaran',
          'Penanggalan Jawa',
          'Nama Guru / PTK',
          'NIP',
          'NUPTK',
          'Status',
          'Keterlambatan (Menit)',
          'Check-In',
          'Check-Out',
          'Jarak Datang (m)',
          'Jarak Pulang (m)',
          'Status GPS',
          'Keterangan',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredTeachers.forEach((r, idx) => {
        const st = normalizeStatusKey(r.status);
        const jvInfo = getJavaneseDateInfo(r.date);
        const lateMins = extractLateMinutesFromTelemetry(r.deviceTelemetry);
        lines.push(
          [
            idx + 1,
            r.date,
            jvInfo.hariPasaran,
            `${jvInfo.javaneseDay} ${jvInfo.javaneseMonth} ${jvInfo.javaneseYear} Ja`,
            r.teacher?.fullName ?? '-',
            r.teacher?.nip ?? '-',
            r.teacher?.nuptk ?? '-',
            STATUS_LABELS[st] ?? st,
            lateMins > 0 ? lateMins : 0,
            formatTime(r.checkInTime),
            formatTime(r.checkOutTime),
            r.checkInDistance != null ? Math.round(r.checkInDistance) : '-',
            r.checkOutDistance != null ? Math.round(r.checkOutDistance) : '-',
            r.checkInTime ? (r.isCheckInMock ? 'Palsu' : 'Valid') : '-',
            r.notes ?? '-',
          ]
            .map(escapeCsv)
            .join(',')
        );
      });
    } else {
      lines.push(
        [
          'No',
          'Tanggal',
          'Hari & Pasaran',
          'Penanggalan Jawa',
          'Nama Siswa',
          'NISN',
          'Kelas',
          'Status',
          'Jam Masuk',
          'Jam Pulang',
          'Metode Pencatatan',
          'Keterangan',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredStudents.forEach((r, idx) => {
        const st = normalizeStatusKey(r.status);
        const jvInfo = getJavaneseDateInfo(r.date);
        lines.push(
          [
            idx + 1,
            r.date,
            jvInfo.hariPasaran,
            `${jvInfo.javaneseDay} ${jvInfo.javaneseMonth} ${jvInfo.javaneseYear} Ja`,
            r.student?.fullName ?? '-',
            r.student?.nisn ?? '-',
            r.student?.classes?.name ?? '-',
            STATUS_LABELS[st] ?? st,
            formatTime(r.checkInTime || r.time),
            formatTime(r.checkOutTime),
            r.recordedBy ? 'Wali Kelas / Admin' : 'Kiosk / Mandiri',
            r.notes ?? '-',
          ]
            .map(escapeCsv)
            .join(',')
        );
      });
    }

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const prefix =
      activeTab === 'teachers' ? 'Rekap_Absensi_Guru' : 'Rekap_Absensi_Siswa';
    link.href = url;
    link.setAttribute('download', `${prefix}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            className={`mb-4 p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 shadow-lg ${toast.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
              }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle size={18} className="shrink-0 text-red-500" />
            )}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Banner Pemilih Sekolah & Pembersihan Arsip Khusus SUPER_ADMIN */}
      {isSuperAdmin && (
        <div
          className="mb-5 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
          style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderColor: 'rgba(139, 92, 246, 0.35)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-600 dark:text-purple-300">
            <FlaskConical size={17} />
            <span>Mode Monitoring Super Admin</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {simSchools.length > 0 && (
              <select
                className="form-input min-w-60 text-xs"
                value={simSchoolId}
                onChange={(e) => setSimSchoolId(e.target.value)}
              >
                {simSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.npsn})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setPurgeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30 hover:bg-red-500/25 transition"
              title={`Kelola & hapus arsip absensi yang berumur lebih dari ${ARCHIVE_RETENTION_YEARS} tahun`}
            >
              <ArchiveX size={15} />
              <span>
                Arsip {'>'} {ARCHIVE_RETENTION_YEARS} Tahun
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header + Kalender Jawa */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Absensi</h1>
          <p className="page-subtitle">
            Monitor kehadiran harian siswa dan guru secara real-time
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary font-semibold">
              <CalendarDays size={13} />
              {selectedDateDisplay.masehiWithPasaran}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
              {selectedDateDisplay.javaneseCalendarLabel}
            </span>
          </div>
        </div>
        <div className="page-header-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="form-input date-picker"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            disabled={
              isLoading ||
              (activeTab === 'teachers'
                ? filteredTeachers.length === 0
                : filteredStudents.length === 0)
            }
            title={
              activeTab === 'teachers'
                ? 'Unduh laporan absensi guru (CSV)'
                : 'Unduh laporan absensi siswa (CSV)'
            }
          >
            <Download size={16} />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="attendance-summary-grid">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            className="summary-card"
          >
            <div
              className="summary-card-icon"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
            >
              <GraduationCap size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Hadir Siswa</p>
              <p className="summary-card-value">
                {summary.studentPresent + summary.studentLate}{' '}
                <span className="text-sm font-normal opacity-60">
                  / {summary.studentTotal}
                </span>
              </p>
              <p className="summary-card-sub text-green-500">
                {summary.studentPercentage}% kehadiran aktif
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="summary-card"
          >
            <div
              className="summary-card-icon"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
            >
              <Clock size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Siswa Terlambat</p>
              <p className="summary-card-value">{summary.studentLate}</p>
              <p className="summary-card-sub">
                {summary.studentSick + summary.studentPermission} izin/sakit
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="summary-card"
          >
            <div
              className="summary-card-icon"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
            >
              <XCircle size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Alpa Siswa</p>
              <p className="summary-card-value">{summary.studentAbsent}</p>
              <p className="summary-card-sub">
                {summary.studentUnrecorded} belum diabsen
              </p>
            </div>
          </motion.div>

          {teacherScope.canViewAllTeacherAttendance && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="summary-card"
            >
              <div
                className="summary-card-icon"
                style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}
              >
                <Users size={24} />
              </div>
              <div className="summary-card-content">
                <p className="summary-card-label">Hadir Guru & PTK</p>
                <p className="summary-card-value">
                  {summary.teacherPresent + summary.teacherLate}{' '}
                  <span className="text-sm font-normal opacity-60">
                    / {summary.teacherTotal}
                  </span>
                </p>
                <p className="summary-card-sub text-blue-500">
                  {summary.teacherPercentage}% kehadiran PTK
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tab-nav">
        {(['overview', 'students', 'teachers'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              setSearchQuery('');
              setStudentStatusFilter('ALL');
              setTeacherStatusFilter('ALL');
            }}
          >
            {tab === 'overview' && <Calendar size={16} />}
            {tab === 'students' && <GraduationCap size={16} />}
            {tab === 'teachers' && <Users size={16} />}
            {tab === 'overview'
              ? 'Ringkasan'
              : tab === 'students'
                ? `Absen Siswa (${studentRecords.length})`
                : `Absen Guru (${teacherRecords.length})`}
          </button>
        ))}
      </div>

      {/* Toolbar Pencarian, Filter Kelas, & Filter Status (Siswa & Guru) */}
      {activeTab !== 'overview' && (
        <div className="table-toolbar flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 w-full">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 flex-1 min-w-60 focus-within:ring-2 focus-within:ring-primary/40">
              <Search
                size={15}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder={
                  activeTab === 'students'
                    ? 'Cari nama siswa, NISN, atau NIS...'
                    : 'Cari nama guru, NIP, NUPTK, atau keterangan (mis. Pulang Awal)...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 rounded-md text-muted-foreground hover:text-foreground shrink-0"
                  title="Bersihkan pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {activeTab === 'students' && classes.length > 0 && (
              <select
                className="form-input min-w-45 text-xs"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="ALL">Semua Kelas</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    Kelas {cls.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Filter Pills Status (Berfungsi untuk Tab Siswa maupun Tab Guru) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  key: 'ALL',
                  label: 'Semua',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.ALL
                      : teacherStatusCounts.ALL,
                },
                {
                  key: 'HADIR',
                  label: 'Hadir',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.HADIR
                      : teacherStatusCounts.HADIR,
                },
                {
                  key: 'TERLAMBAT',
                  label: 'Terlambat',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.TERLAMBAT
                      : teacherStatusCounts.TERLAMBAT,
                },
                {
                  key: 'IZIN',
                  label: 'Izin',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.IZIN
                      : teacherStatusCounts.IZIN,
                },
                {
                  key: 'SAKIT',
                  label: 'Sakit',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.SAKIT
                      : teacherStatusCounts.SAKIT,
                },
                {
                  key: 'ALPA',
                  label: 'Alpa',
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.ALPA
                      : teacherStatusCounts.ALPA,
                },
              ] as const
            ).map((pill) => {
              const currentFilter =
                activeTab === 'students'
                  ? studentStatusFilter
                  : teacherStatusFilter;
              const isSelected = currentFilter === pill.key;
              const badgeColor =
                pill.key === 'ALL'
                  ? '#10B981'
                  : STATUS_COLORS[pill.key] ?? '#6B7280';

              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => {
                    if (activeTab === 'students') {
                      setStudentStatusFilter(pill.key);
                    } else {
                      setTeacherStatusFilter(pill.key);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${isSelected
                      ? 'text-white shadow-xs'
                      : 'bg-card/60 border-border opacity-75 hover:opacity-100'
                    }`}
                  style={
                    isSelected
                      ? {
                        backgroundColor: badgeColor,
                        borderColor: badgeColor,
                      }
                      : undefined
                  }
                >
                  {pill.label} ({pill.count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && summary && (
          <div className="overview-grid">
            <div className="data-card">
              <h3 className="card-section-title">
                Distribusi Kehadiran Siswa ({summary.studentTotal} Siswa Aktif)
              </h3>
              <div className="status-distribution">
                {[
                  { key: 'HADIR', count: summary.studentPresent },
                  { key: 'TERLAMBAT', count: summary.studentLate },
                  { key: 'SAKIT', count: summary.studentSick },
                  { key: 'IZIN', count: summary.studentPermission },
                  { key: 'ALPA', count: summary.studentAbsent },
                  { key: 'BELUM_ABSEN', count: summary.studentUnrecorded },
                ].map(({ key, count }) => {
                  const total = summary.studentTotal || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={key} className="status-dist-item">
                      <div className="status-dist-label">
                        <span
                          className="status-dot"
                          style={{ background: STATUS_COLORS[key] }}
                        />
                        <span>{STATUS_LABELS[key]}</span>
                        <span className="status-dist-count">{count} siswa</span>
                      </div>
                      <div className="status-dist-bar-bg">
                        <div
                          className="status-dist-bar"
                          style={{
                            width: `${pct}%`,
                            background: STATUS_COLORS[key],
                          }}
                        />
                      </div>
                      <span className="status-dist-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {teacherScope.canViewAllTeacherAttendance && (
              <div className="data-card">
                <h3 className="card-section-title">
                  Distribusi Kehadiran Guru & PTK ({summary.teacherTotal} PTK Aktif)
                </h3>
                <div className="status-distribution">
                  {[
                    { key: 'HADIR', count: summary.teacherPresent },
                    { key: 'TERLAMBAT', count: summary.teacherLate },
                    { key: 'SAKIT', count: summary.teacherSick },
                    { key: 'IZIN', count: summary.teacherPermission },
                    { key: 'ALPA', count: summary.teacherAbsent },
                    {
                      key: 'BELUM_ABSEN',
                      count: Math.max(
                        0,
                        summary.teacherTotal - summary.teacherRecorded
                      ),
                    },
                  ].map(({ key, count }) => {
                    const total = summary.teacherTotal || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={key} className="status-dist-item">
                        <div className="status-dist-label">
                          <span
                            className="status-dot"
                            style={{ background: STATUS_COLORS[key] }}
                          />
                          <span>{STATUS_LABELS[key]}</span>
                          <span className="status-dist-count">{count} PTK</span>
                        </div>
                        <div className="status-dist-bar-bg">
                          <div
                            className="status-dist-bar"
                            style={{
                              width: `${pct}%`,
                              background: STATUS_COLORS[key],
                            }}
                          />
                        </div>
                        <span className="status-dist-pct">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="data-card">
            {isLoading ? (
              <div className="table-loading">
                <RefreshCw size={24} className="spin" /> Memuat data...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>Belum ada data absensi siswa untuk tanggal/filter ini</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">No</th>
                      <th
                        onClick={() => handleSortStudent('fullName')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Nama Siswa
                        {renderSortIcon(
                          studentSort?.key === 'fullName',
                          studentSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortStudent('className')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Kelas
                        {renderSortIcon(
                          studentSort?.key === 'className',
                          studentSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortStudent('nisn')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        NISN
                        {renderSortIcon(
                          studentSort?.key === 'nisn',
                          studentSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortStudent('status')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Status
                        {renderSortIcon(
                          studentSort?.key === 'status',
                          studentSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortStudent('time')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Jam Masuk
                        {renderSortIcon(
                          studentSort?.key === 'time',
                          studentSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortStudent('checkOutTime')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Jam Pulang
                        {renderSortIcon(
                          studentSort?.key === 'checkOutTime',
                          studentSort?.direction
                        )}
                      </th>
                      <th>Dicatat Oleh</th>
                      <th>Keterangan</th>
                      {canDeleteRecord && <th className="text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((record, index) => {
                      const stKey = normalizeStatusKey(record.status);
                      return (
                        <tr key={record.id}>
                          <td className="td-mono text-xs text-center opacity-70">
                            {index + 1}
                          </td>
                          <td className="td-name">
                            {record.student?.fullName ?? '-'}
                          </td>
                          <td>{record.student?.classes?.name ?? '-'}</td>
                          <td className="td-mono">
                            {record.student?.nisn ?? '-'}
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{
                                background:
                                  (STATUS_COLORS[stKey] ?? '#6B7280') + '20',
                                color: STATUS_COLORS[stKey] ?? '#6B7280',
                              }}
                            >
                              {STATUS_LABELS[stKey] ?? stKey}
                            </span>
                          </td>
                          <td className="td-mono">
                            {formatTime(record.checkInTime || record.time)}
                          </td>
                          <td className="td-mono">
                            {record.checkOutTime ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
                                {formatTime(record.checkOutTime)}
                              </span>
                            ) : (
                              <span className="opacity-40">-</span>
                            )}
                          </td>
                          <td>
                            {record.recordedBy
                              ? 'Admin/Wali Kelas'
                              : 'Kiosk/Mandiri'}
                          </td>
                          <td className="text-sm opacity-75">
                            {record.notes ?? '-'}
                          </td>
                          {canDeleteRecord && (
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: record.id,
                                    name: record.student?.fullName ?? 'Siswa',
                                    date: record.date,
                                    selfiePaths: [],
                                    attachmentPaths: [],
                                  })
                                }
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                                title="Hapus data absensi ini (Super Admin / Admin)"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Teachers Tab */}
        {activeTab === 'teachers' && (
          <div className="data-card">
            {isLoading ? (
              <div className="table-loading">
                <RefreshCw size={24} className="spin" /> Memuat data...
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>Belum ada data absensi guru untuk tanggal/filter ini</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">No</th>
                      <th
                        onClick={() => handleSortTeacher('fullName')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Nama Guru / PTK
                        {renderSortIcon(
                          teacherSort?.key === 'fullName',
                          teacherSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortTeacher('nip')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        NIP / NUPTK
                        {renderSortIcon(
                          teacherSort?.key === 'nip',
                          teacherSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortTeacher('status')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Status
                        {renderSortIcon(
                          teacherSort?.key === 'status',
                          teacherSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortTeacher('checkInTime')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Check-In
                        {renderSortIcon(
                          teacherSort?.key === 'checkInTime',
                          teacherSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortTeacher('checkOutTime')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Check-Out
                        {renderSortIcon(
                          teacherSort?.key === 'checkOutTime',
                          teacherSort?.direction
                        )}
                      </th>
                      <th
                        onClick={() => handleSortTeacher('checkInDistance')}
                        className="cursor-pointer select-none hover:text-primary transition"
                      >
                        Lokasi & Jarak
                        {renderSortIcon(
                          teacherSort?.key === 'checkInDistance',
                          teacherSort?.direction
                        )}
                      </th>
                      <th>GPS Valid</th>
                      <th>Foto Selfie</th>
                      <th>Keterangan & Log</th>
                      {canDeleteRecord && <th className="text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((record, index) => {
                      const hasInPhoto = Boolean(record.checkInSelfieUrl);
                      const hasOutPhoto = Boolean(record.checkOutSelfieUrl);
                      const hasAnyPhoto = hasInPhoto || hasOutPhoto;
                      const stKey = normalizeStatusKey(record.status);

                      return (
                        <tr key={record.id}>
                          <td className="td-mono text-xs text-center opacity-70">
                            {index + 1}
                          </td>
                          <td className="td-name">
                            <div>{record.teacher?.fullName ?? '-'}</div>
                            {record.teacher?.position && (
                              <div className="text-xs opacity-60">
                                {record.teacher.position}
                              </div>
                            )}
                          </td>
                          <td className="td-mono text-xs">
                            {record.teacher?.nip ||
                              record.teacher?.nuptk ||
                              '-'}
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{
                                background:
                                  (STATUS_COLORS[stKey] ?? '#6B7280') + '20',
                                color: STATUS_COLORS[stKey] ?? '#6B7280',
                              }}
                            >
                              {STATUS_LABELS[stKey] ?? stKey}
                            </span>
                          </td>
                          <td className="td-mono">
                            {formatTime(record.checkInTime)}
                          </td>
                          <td className="td-mono">
                            {formatTime(record.checkOutTime)}
                          </td>
                          <td className="td-mono text-xs">
                            <div className="flex flex-col gap-1">
                              {record.checkInLat != null &&
                                record.checkInLng != null ? (
                                <a
                                  href={`https://maps.google.com/?q=${record.checkInLat},${record.checkInLng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="gps-link"
                                  title="Titik GPS Datang"
                                >
                                  <MapPin size={12} />
                                  {record.checkInDistance != null
                                    ? `${Math.round(record.checkInDistance)}m`
                                    : 'Datang'}
                                </a>
                              ) : (
                                '-'
                              )}
                              {record.checkOutLat != null &&
                                record.checkOutLng != null && (
                                  <a
                                    href={`https://maps.google.com/?q=${record.checkOutLat},${record.checkOutLng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="gps-link text-amber-600 dark:text-amber-400"
                                    title="Titik GPS Pulang"
                                  >
                                    <MapPin size={12} />
                                    {record.checkOutDistance != null
                                      ? `Pulang ${Math.round(record.checkOutDistance)}m`
                                      : 'Pulang'}
                                  </a>
                                )}
                            </div>
                          </td>
                          <td>
                            {record.checkInTime ? (
                              record.isCheckInMock ? (
                                <span className="gps-invalid">
                                  <XCircle size={14} /> Palsu
                                </span>
                              ) : (
                                <span className="gps-valid">
                                  <Shield size={14} /> Valid
                                </span>
                              )
                            ) : (
                              '-'
                            )}
                          </td>

                          {/* 1 Kolom Foto Selfie */}
                          <td>
                            {hasAnyPhoto ? (
                              <div className="flex flex-col gap-1.5 items-start min-w-28">
                                {hasInPhoto && (
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewSelfie(record)}
                                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition"
                                    title="Lihat foto selfie datang & telemetri perangkat"
                                  >
                                    <Camera size={12} />
                                    <span>Foto Datang</span>
                                  </button>
                                )}
                                {hasOutPhoto && (
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewSelfie(record)}
                                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition"
                                    title="Lihat foto selfie pulang & telemetri perangkat"
                                  >
                                    <Camera size={12} />
                                    <span>Foto Pulang</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs opacity-40">-</span>
                            )}
                          </td>

                          <td>{renderTeacherNotes(record)}</td>

                          {canDeleteRecord && (
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: record.id,
                                    name:
                                      record.teacher?.fullName ?? 'Guru / PTK',
                                    date: record.date,
                                    selfiePaths: [
                                      record.checkInSelfieUrl,
                                      record.checkOutSelfieUrl,
                                    ].filter((p): p is string => Boolean(p)),
                                    attachmentPaths: [
                                      record.attachmentUrl,
                                    ].filter((p): p is string => Boolean(p)),
                                  })
                                }
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                                title="Hapus data absensi beserta foto datang & pulang (Super Admin / Admin)"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          MODAL KONFIRMASI HAPUS SATUAN (SUPER_ADMIN & ADMIN)
      ==================================================================== */}
      <AnimatePresence>
        {deleteTarget && canDeleteRecord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            onClick={() => !isDeletingRow && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="data-card max-w-sm w-full p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/15 text-red-500 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base">Hapus Data Absensi?</h3>
                  <p className="text-xs opacity-75 mt-1 leading-relaxed">
                    Anda akan menghapus catatan absensi milik{' '}
                    <strong>{deleteTarget.name}</strong> pada tanggal{' '}
                    <strong>{deleteTarget.date}</strong> beserta seluruh foto
                    selfie (Datang & Pulang) dan lampirannya dari penyimpanan.
                    Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={isDeletingRow}
                  onClick={() => setDeleteTarget(null)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isDeletingRow}
                  onClick={handleConfirmDeleteSingle}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition"
                >
                  {isDeletingRow ? 'Menghapus...' : 'Ya, Hapus Permanen'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          MODAL PEMBERSIHAN ARSIP ABSENSI > 2 TAHUN (KHUSUS SUPER_ADMIN)
      ==================================================================== */}
      <AnimatePresence>
        {purgeModalOpen && isSuperAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            onClick={() => !isPurgingOldRecords && setPurgeModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="data-card max-w-md w-full p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ArchiveX size={19} className="text-red-500" />
                  <h3 className="font-bold text-base">
                    Pembersihan Arsip {'>'} {ARCHIVE_RETENTION_YEARS} Tahun
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isPurgingOldRecords}
                  onClick={() => setPurgeModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-muted"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <p className="opacity-80 leading-relaxed">
                  Fitur ini menghapus catatan absensi lama beserta seluruh foto
                  selfie datang, foto selfie pulang, dan lampiran surat yang
                  tercatat sebelum tanggal{' '}
                  <strong className="text-amber-500">{cutoffDate}</strong>{' '}
                  (lebih dari {ARCHIVE_RETENTION_YEARS} tahun yang lalu) untuk
                  menjaga performa database dan kapasitas galeri tetap ringan.
                </p>

                <div>
                  <label className="block font-semibold mb-1.5">
                    Cakupan Data yang Dibersihkan:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPurgeScope('CURRENT_SCHOOL')}
                      className={`py-2 px-3 rounded-xl font-semibold border transition ${purgeScope === 'CURRENT_SCHOOL'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/40 border-border opacity-80'
                        }`}
                    >
                      Sekolah Terpilih Saja
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurgeScope('ALL_SCHOOLS')}
                      className={`py-2 px-3 rounded-xl font-semibold border transition ${purgeScope === 'ALL_SCHOOLS'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/40 border-border opacity-80'
                        }`}
                    >
                      Semua Sekolah
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/50 border border-border flex items-center justify-between">
                  <span>Arsip lama ditemukan:</span>
                  {isCheckingOldRecords ? (
                    <span className="font-semibold flex items-center gap-1.5">
                      <RefreshCw size={13} className="spin" /> Menghitung...
                    </span>
                  ) : (
                    <span className="text-sm font-extrabold text-red-500">
                      {oldRecordsCount ?? 0} data absensi
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  disabled={
                    isPurgingOldRecords ||
                    isCheckingOldRecords ||
                    !oldRecordsCount
                  }
                  onClick={handleBackupOldRecordsCsv}
                  className="btn-secondary text-xs justify-center"
                >
                  <Download size={14} />
                  Backup CSV Dulu
                </button>

                <button
                  type="button"
                  disabled={
                    isPurgingOldRecords ||
                    isCheckingOldRecords ||
                    !oldRecordsCount
                  }
                  onClick={handlePurgeOldRecords}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} />
                  {isPurgingOldRecords
                    ? 'Membersihkan...'
                    : `Hapus ${oldRecordsCount ?? 0} Arsip`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          MODAL PRATINJAU FOTO SELFIE GURU (DATANG, PULANG & TELEMETRI PERANGKAT)
      ==================================================================== */}
      <AnimatePresence>
        {selfieModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            onClick={() => setSelfieModal(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className={`data-card w-full p-5 relative max-h-[90vh] overflow-y-auto ${selfieModal.hasCheckInPhoto && selfieModal.hasCheckOutPhoto
                  ? 'max-w-2xl'
                  : 'max-w-md'
                }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-base">
                    {selfieModal.teacherName}
                  </h3>
                  <p className="text-xs opacity-70">
                    Dokumentasi Selfie & Audit Telemetri Presensi
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelfieModal(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {selfieModal.isLoading ? (
                <div className="rounded-xl bg-black/40 border border-white/10 min-h-65 flex flex-col items-center justify-center gap-2 text-xs opacity-75">
                  <RefreshCw size={24} className="spin" />
                  <span>Memuat foto dari penyimpanan aman...</span>
                </div>
              ) : (
                <div
                  className={`grid gap-3.5 ${selfieModal.hasCheckInPhoto && selfieModal.hasCheckOutPhoto
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1'
                    }`}
                >
                  {/* KARTU FOTO DATANG (CHECK-IN) */}
                  {selfieModal.hasCheckInPhoto && (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-300">
                          <LogIn size={14} /> Foto Datang
                        </span>
                        <span className="font-mono opacity-80">
                          {formatTime(selfieModal.checkInTime)}
                          {selfieModal.checkInDistance != null
                            ? ` • ${Math.round(selfieModal.checkInDistance)}m`
                            : ''}
                        </span>
                      </div>

                      <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 min-h-56 flex items-center justify-center">
                        {selfieModal.checkInImageUrl ? (
                          <img
                            src={selfieModal.checkInImageUrl}
                            alt={`Selfie Datang ${selfieModal.teacherName}`}
                            className="w-full max-h-80 object-contain"
                          />
                        ) : (
                          <p className="text-xs text-red-400 p-4 text-center">
                            Foto datang tidak dapat dimuat.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* KARTU FOTO PULANG (CHECK-OUT) */}
                  {selfieModal.hasCheckOutPhoto && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-300">
                          <LogOut size={14} /> Foto Pulang
                        </span>
                        <span className="font-mono opacity-80">
                          {formatTime(selfieModal.checkOutTime)}
                          {selfieModal.checkOutDistance != null
                            ? ` • ${Math.round(selfieModal.checkOutDistance)}m`
                            : ''}
                        </span>
                      </div>

                      <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 min-h-56 flex items-center justify-center">
                        {selfieModal.checkOutImageUrl ? (
                          <img
                            src={selfieModal.checkOutImageUrl}
                            alt={`Selfie Pulang ${selfieModal.teacherName}`}
                            className="w-full max-h-80 object-contain"
                          />
                        ) : (
                          <p className="text-xs text-red-400 p-4 text-center">
                            Foto pulang tidak dapat dimuat.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PANEL DETAIL TELEMETRI PERANGKAT & VALIDASI KEAMANAN */}
              {(selfieModal.deviceTelemetry ||
                (selfieModal.securityFlags &&
                  selfieModal.securityFlags.length > 0)) && (
                  <div className="mt-3 p-3.5 rounded-xl border border-border bg-muted/40 text-xs space-y-2">
                    <div className="flex items-center justify-between font-bold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Smartphone size={14} className="text-primary" />
                        Telemetri Perangkat & GPS
                      </span>
                      {selfieModal.isMock ||
                        (selfieModal.securityFlags &&
                          selfieModal.securityFlags.length > 0) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-300">
                          <ShieldAlert size={12} /> Perlu Audit
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                          <Shield size={12} /> Terverifikasi
                        </span>
                      )}
                    </div>

                    {selfieModal.deviceTelemetry && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] opacity-85">
                        {typeof selfieModal.deviceTelemetry.appMode ===
                          'string' && (
                            <div>
                              <span className="opacity-65">Mode Aplikasi: </span>
                              <strong>{selfieModal.deviceTelemetry.appMode}</strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry.platform ===
                          'string' && (
                            <div>
                              <span className="opacity-65">Platform: </span>
                              <strong>
                                {selfieModal.deviceTelemetry.platform}
                              </strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry
                          .gpsAccuracyMeters === 'number' && (
                            <div>
                              <span className="opacity-65">Akurasi GPS: </span>
                              <strong>
                                ±{selfieModal.deviceTelemetry.gpsAccuracyMeters}m
                              </strong>
                            </div>
                          )}
                        {extractLateMinutesFromTelemetry(
                          selfieModal.deviceTelemetry
                        ) > 0 && (
                            <div className="text-amber-600 dark:text-amber-300">
                              <span className="opacity-75">Keterlambatan: </span>
                              <strong>
                                {extractLateMinutesFromTelemetry(
                                  selfieModal.deviceTelemetry
                                )}{' '}
                                menit
                              </strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry.javaneseDate ===
                          'string' && (
                            <div className="col-span-2">
                              <span className="opacity-65">Penanggalan Jawa: </span>
                              <strong>
                                {selfieModal.deviceTelemetry.javaneseDate}
                              </strong>
                            </div>
                          )}
                      </div>
                    )}

                    {selfieModal.securityFlags &&
                      selfieModal.securityFlags.length > 0 && (
                        <div className="pt-1.5 border-t border-border/60 flex flex-wrap gap-1">
                          {selfieModal.securityFlags.map((flag) => (
                            <span
                              key={flag}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-red-500/15 text-red-600 dark:text-red-300"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                )}

              {selfieModal.notes && (
                <div
                  className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2 ${isEarlyCheckoutNote(selfieModal.notes)
                      ? 'bg-amber-500/15 border-amber-500/35 text-amber-800 dark:text-amber-200 font-medium'
                      : 'bg-muted/50 border-border'
                    }`}
                >
                  <FileText size={14} className="mt-0.5 shrink-0" />
                  <span>{selfieModal.notes}</span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}