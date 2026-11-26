// src/modules/attendance/pages/AttendanceDashboardPage.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Sparkles,
  CalendarOff,
  Unlock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { getJavaneseDateInfo } from '../utils/javaneseCalendar';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import { useTranslation } from '@/hooks/useTranslation';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';
import type {
  StudentAttendance,
  TeacherAttendance,
  AttendanceSummary,
  SupportedAttendanceLocale,
} from '../types/attendance.types';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN DENGAN MUDAH
// ============================================================================
const ARCHIVE_RETENTION_YEARS = 2; // Batas umur arsip absensi dalam tahun (default: 2 tahun)
const STORAGE_BUCKET_NAME = 'attendance-selfies'; // Bucket penyimpanan foto selfie
const ATTACHMENT_BUCKET_NAME = 'attendance-attachments'; // Bucket penyimpanan surat izin/dinas
const STORAGE_DELETE_BATCH_SIZE = 100; // Jumlah maksimal file yang dihapus per gelombang
const IN_QUERY_CHUNK_SIZE = 100; // Batas aman ukuran array .in('id', ids) pada PostgREST URL
const FETCH_PAGE_SIZE = 500; // Ukuran halaman penarikan otomatis dari service
const MAX_FETCH_PAGES = 40; // Batas pengaman halaman maksimum (hingga 20.000 baris/hari)
const PURGE_BATCH_SIZE = 500; // Ukuran batch sinkronisasi hapus Storage & DB per iterasi
const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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
    typeof (error as { message?: unknown }).message === 'string'
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
  return (
    lower.includes('pulang awal') ||
    lower.includes('pulang lebih awal') ||
    lower.includes('early departure') ||
    lower.includes('early check-out')
  );
}

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

async function fetchAllStudentAttendances(
  schoolId: string,
  date: string
): Promise<StudentAttendanceWithCheckOut[]> {
  const collected: StudentAttendanceWithCheckOut[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= MAX_FETCH_PAGES; page++) {
    const res = await attendanceService.getStudentAttendances({
      schoolId,
      date,
      page,
      limit: FETCH_PAGE_SIZE,
    } as Parameters<typeof attendanceService.getStudentAttendances>[0]);

    const batch = (res?.data ?? []) as StudentAttendanceWithCheckOut[];
    let addedCount = 0;

    for (const row of batch) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        collected.push(row);
        addedCount++;
      }
    }

    if (batch.length < FETCH_PAGE_SIZE || addedCount === 0) {
      break;
    }
  }

  return collected;
}

async function fetchAllTeacherAttendances(
  schoolId: string,
  date: string
): Promise<TeacherAttendanceWithCheckOut[]> {
  const collected: TeacherAttendanceWithCheckOut[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; page <= MAX_FETCH_PAGES; page++) {
    const res = await attendanceService.getTeacherAttendances({
      schoolId,
      date,
      page,
      limit: FETCH_PAGE_SIZE,
    } as Parameters<typeof attendanceService.getTeacherAttendances>[0]);

    const batch = (res?.data ?? []) as TeacherAttendanceWithCheckOut[];
    let addedCount = 0;

    for (const row of batch) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        collected.push(row);
        addedCount++;
      }
    }

    if (batch.length < FETCH_PAGE_SIZE || addedCount === 0) {
      break;
    }
  }

  return collected;
}

async function enrichStudentAttendanceRecords(
  schoolId: string,
  records: StudentAttendanceWithCheckOut[]
): Promise<StudentAttendanceWithCheckOut[]> {
  if (records.length === 0) return records;

  const studentAttIds = records.map((s) => s.id);
  const studentChunks = chunkArray(studentAttIds, IN_QUERY_CHUNK_SIZE);
  const studentChunkResults = await Promise.all(
    studentChunks.map((chunkIds) =>
      supabase
        .from('attendances')
        .select('id, checkInTime, checkOutTime')
        .eq('schoolId', schoolId)
        .in('id', chunkIds)
    )
  );

  const studentExtraMap = new Map<string, StudentAttendanceExtraCols>();
  for (const res of studentChunkResults) {
    if (!res.error && res.data) {
      for (const row of res.data as StudentAttendanceExtraCols[]) {
        studentExtraMap.set(row.id, row);
      }
    }
  }

  if (studentExtraMap.size === 0) return records;

  return records.map((item) => {
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

async function enrichTeacherAttendanceRecords(
  schoolId: string,
  records: TeacherAttendanceWithCheckOut[]
): Promise<TeacherAttendanceWithCheckOut[]> {
  if (records.length === 0) return records;

  const ids = records.map((teacherItem) => teacherItem.id);
  const teacherChunks = chunkArray(ids, IN_QUERY_CHUNK_SIZE);
  const extraMap = new Map<string, AttendanceExtraCols>();

  await Promise.all(
    teacherChunks.map(async (chunkIds) => {
      const primaryRes = await supabase
        .from('attendances')
        .select(
          'id, checkOutLat, checkOutLng, checkOutDistance, checkOutSelfieUrl, attachmentUrl, deviceTelemetry, securityFlags'
        )
        .eq('schoolId', schoolId)
        .in('id', chunkIds);

      if (!primaryRes.error && primaryRes.data) {
        for (const row of primaryRes.data as AttendanceExtraCols[]) {
          extraMap.set(row.id, row);
        }
        return;
      }

      const fallbackRes = await supabase
        .from('attendances')
        .select(
          'id, checkOutLat, checkOutLng, checkOutDistance, checkOutSelfieUrl, attachmentUrl'
        )
        .eq('schoolId', schoolId)
        .in('id', chunkIds);

      if (!fallbackRes.error && fallbackRes.data) {
        for (const row of fallbackRes.data as AttendanceExtraCols[]) {
          extraMap.set(row.id, row);
        }
      }
    })
  );

  if (extraMap.size === 0) return records;

  return records.map((item) => {
    const extra = extraMap.get(item.id);
    if (!extra) return item;
    return {
      ...item,
      checkOutLat: extra.checkOutLat ?? null,
      checkOutLng: extra.checkOutLng ?? null,
      checkOutDistance: extra.checkOutDistance ?? null,
      checkOutSelfieUrl: extra.checkOutSelfieUrl ?? null,
      attachmentUrl: extra.attachmentUrl ?? null,
      deviceTelemetry: extra.deviceTelemetry ?? item.deviceTelemetry ?? null,
      securityFlags: Array.isArray(extra.securityFlags)
        ? extra.securityFlags
        : item.securityFlags ?? [],
    };
  });
}

export function AttendanceDashboardPage() {
  const { t } = useTranslation();
  const currentLang: SupportedAttendanceLocale =
    t('common.language') === 'Language' ? 'en' : 'id';
  const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
  const sortLocale = currentLang === 'en' ? 'en' : 'id';

  const { user, school, hasAnyRole } = useAuthStore();
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
  const isPrivilegedRole = hasAnyRole([
    'SUPER_ADMIN',
    'ADMIN',
    'KEPALA_SEKOLAH',
  ]);
  const canDeleteRecord = hasAnyRole(['SUPER_ADMIN', 'ADMIN']);

  // State Simulasi Sekolah (Khusus SUPER_ADMIN)
  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string; npsn: string }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || user?.schoolId || ''
    : school?.id || user?.schoolId || '';

  const teacherScope = useTeacherScope(activeSchoolId);
  const isHomeroomRestricted =
    !isPrivilegedRole && Boolean(teacherScope.isElementaryHomeroomRestricted);
  const homeroomClassSet = useMemo(
    () => new Set(teacherScope.homeroomClassIds.map((id) => String(id))),
    [teacherScope.homeroomClassIds]
  );

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
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [teacherSpecialReason, setTeacherSpecialReason] = useState<string>('');

  // State Paginasi Tabel Siswa & Guru
  const [studentPage, setStudentPage] = useState<number>(1);
  const [studentPageSize, setStudentPageSize] = useState<number>(50);
  const [teacherPage, setTeacherPage] = useState<number>(1);
  const [teacherPageSize, setTeacherPageSize] = useState<number>(50);

  const loadRequestSeqRef = useRef<number>(0);
  const selfieRequestSeqRef = useRef<number>(0);

  // Status hari libur & mode kegiatan khusus siswa pada tanggal rekap terpilih
  const holidayLock = useStudentHolidayLock({
    schoolId: activeSchoolId,
    targetDate: selectedDate,
    lang: currentLang,
  });

  // Periksa agenda khusus yang aktif untuk GURU atau ALL pada tanggal terpilih
  useEffect(() => {
    if (!activeSchoolId || selectedDate.length !== 10) {
      setTeacherSpecialReason('');
      return;
    }

    let cancelled = false;
    void supabase
      .from('school_special_events')
      .select('reason, targetType, isActive')
      .eq('schoolId', activeSchoolId)
      .eq('eventDate', selectedDate)
      .eq('isActive', true)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as Array<{
          reason: string | null;
          targetType: string | null;
        }>;
        const matched =
          rows.find((r) => String(r.targetType ?? '').toUpperCase() === 'GURU') ??
          rows.find((r) => String(r.targetType ?? '').toUpperCase() === 'ALL');
        setTeacherSpecialReason(matched ? String(matched.reason ?? '').trim() : '');
      });

    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, selectedDate]);

  const defaultSpecialEventNote = t(
    'attendanceDashboard.defaultSpecialEventNote'
  );
  const isStudentSpecialEventMode = Boolean(
    holidayLock.isHoliday && holidayLock.isSpecialEventActive
  );
  const isTeacherSpecialEventMode = Boolean(
    holidayLock.isHoliday &&
    (Boolean(teacherSpecialReason) || holidayLock.isSpecialEventActive)
  );
  const isAnySpecialEventMode =
    isStudentSpecialEventMode || isTeacherSpecialEventMode;

  const specialEventNote = useMemo(() => {
    const studentReason = (holidayLock.specialEventReason ?? '').trim();
    return studentReason || teacherSpecialReason || defaultSpecialEventNote;
  }, [
    holidayLock.specialEventReason,
    teacherSpecialReason,
    defaultSpecialEventNote,
  ]);

  const resolveEffectiveNote = useCallback(
    (rawNotes?: string | null, target: 'SISWA' | 'GURU' = 'SISWA'): string | null => {
      const trimmed = (rawNotes ?? '').trim();
      if (trimmed) return trimmed;
      if (target === 'GURU' && isTeacherSpecialEventMode) {
        return teacherSpecialReason || specialEventNote;
      }
      if (target === 'SISWA' && isStudentSpecialEventMode) {
        return (holidayLock.specialEventReason ?? '').trim() || defaultSpecialEventNote;
      }
      return null;
    },
    [
      isTeacherSpecialEventMode,
      isStudentSpecialEventMode,
      teacherSpecialReason,
      specialEventNote,
      holidayLock.specialEventReason,
      defaultSpecialEventNote,
    ]
  );

  const getStatusLabel = useCallback(
    (status?: string | null): string => {
      const key = normalizeStatusKey(status);
      switch (key) {
        case 'HADIR':
          return t('attendanceDashboard.status_HADIR');
        case 'TERLAMBAT':
          return t('attendanceDashboard.status_TERLAMBAT');
        case 'SAKIT':
          return t('attendanceDashboard.status_SAKIT');
        case 'IZIN':
          return t('attendanceDashboard.status_IZIN');
        case 'ALPA':
          return t('attendanceDashboard.status_ALPA');
        case 'BELUM_ABSEN':
          return t('attendanceDashboard.status_BELUM_ABSEN');
        default:
          return key || '-';
      }
    },
    [t]
  );

  const selectedDateDisplay = useMemo(() => {
    const jv = getJavaneseDateInfo(selectedDate, currentLang);
    const [y, m, d] = selectedDate.split('-').map(Number);
    const monthNames = [
      t('attendanceDashboard.month_0'),
      t('attendanceDashboard.month_1'),
      t('attendanceDashboard.month_2'),
      t('attendanceDashboard.month_3'),
      t('attendanceDashboard.month_4'),
      t('attendanceDashboard.month_5'),
      t('attendanceDashboard.month_6'),
      t('attendanceDashboard.month_7'),
      t('attendanceDashboard.month_8'),
      t('attendanceDashboard.month_9'),
      t('attendanceDashboard.month_10'),
      t('attendanceDashboard.month_11'),
    ];
    const monthName = monthNames[(m || 1) - 1] ?? '';
    return {
      masehiWithPasaran: `${jv.hariPasaran}, ${d || 1} ${monthName} ${y || ''}`,
      javaneseCalendarLabel: `${jv.javaneseDay} ${jv.javaneseMonth} ${jv.javaneseYear} Ja (${jv.winduYearName})`,
    };
  }, [selectedDate, currentLang, t]);

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

  // State Modal Pratinjau Foto Selfie Guru
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
  const [purgeDeletedSoFar, setPurgeDeletedSoFar] = useState<number>(0);

  const cutoffDate = useMemo(
    () => getRetentionCutoffDate(ARCHIVE_RETENTION_YEARS),
    []
  );

  // Keyboard Escape handler untuk menutup modal aktif
  useEffect(() => {
    if (!deleteTarget && !purgeModalOpen && !selfieModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget && !isDeletingRow) {
        setDeleteTarget(null);
      } else if (purgeModalOpen && !isPurgingOldRecords) {
        setPurgeModalOpen(false);
      } else if (selfieModal) {
        setSelfieModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    deleteTarget,
    isDeletingRow,
    purgeModalOpen,
    isPurgingOldRecords,
    selfieModal,
  ]);

  // 1a. Sinkronkan sekolah aktif secara instan ketika sekolah di header diganti
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

  // 2. Muat Daftar Kelas untuk Filter Tab Siswa (dengan pembatasan Wali Kelas SD)
  useEffect(() => {
    if (!activeSchoolId) return;
    if (!isPrivilegedRole && teacherScope.isLoading) return;

    supabase
      .from('classes')
      .select('id, name')
      .eq('schoolId', activeSchoolId)
      .order('gradeLevel', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => {
        let loaded = (data ?? []) as Array<{ id: string; name: string }>;
        if (isHomeroomRestricted) {
          loaded = loaded.filter((cls) => homeroomClassSet.has(String(cls.id)));
        }
        setClasses(loaded);
        if (isHomeroomRestricted && loaded.length === 1) {
          setSelectedClassId(loaded[0].id);
        } else {
          setSelectedClassId('ALL');
        }
      });
  }, [
    activeSchoolId,
    isPrivilegedRole,
    teacherScope.isLoading,
    isHomeroomRestricted,
    homeroomClassSet,
  ]);

  // Reset halaman tabel saat kriteria filter / tanggal / pengurutan berubah
  useEffect(() => {
    setStudentPage(1);
  }, [
    activeSchoolId,
    selectedDate,
    selectedClassId,
    studentStatusFilter,
    searchQuery,
    studentSort,
    studentPageSize,
  ]);

  useEffect(() => {
    setTeacherPage(1);
  }, [
    activeSchoolId,
    selectedDate,
    teacherStatusFilter,
    searchQuery,
    teacherSort,
    teacherPageSize,
  ]);

  // 3. Muat Ringkasan & Data Absensi Siswa + Guru (Berpaginasi Tanpa Batas 500/200)
  const loadData = useCallback(async () => {
    if (!activeSchoolId) return;
    if (!isPrivilegedRole && teacherScope.isLoading) return;

    const currentReqSeq = ++loadRequestSeqRef.current;
    setIsLoading(true);
    try {
      const [sumRes, studentsRes, teachersRes] = await Promise.allSettled([
        attendanceService.getSummary(activeSchoolId, selectedDate),
        fetchAllStudentAttendances(activeSchoolId, selectedDate),
        fetchAllTeacherAttendances(activeSchoolId, selectedDate),
      ]);

      if (currentReqSeq !== loadRequestSeqRef.current) return;

      if (sumRes.status === 'fulfilled') {
        setSummary(sumRes.value);
      } else {
        console.error(
          '[AttendanceDashboard] Gagal memuat ringkasan:',
          sumRes.reason
        );
      }

      let rawStudents: StudentAttendanceWithCheckOut[] =
        studentsRes.status === 'fulfilled' ? studentsRes.value : [];

      if (studentsRes.status === 'rejected') {
        showToast(
          'error',
          getErrorMessage(
            studentsRes.reason,
            t('attendanceDashboard.errLoadStudents')
          )
        );
      }

      if (isHomeroomRestricted) {
        rawStudents = rawStudents.filter(
          (item) =>
            item.student?.classId &&
            homeroomClassSet.has(String(item.student.classId))
        );
      }

      let rawTeachers: TeacherAttendanceWithCheckOut[] =
        teachersRes.status === 'fulfilled' ? teachersRes.value : [];

      if (teachersRes.status === 'rejected') {
        console.error(
          '[AttendanceDashboard] Gagal memuat absensi guru:',
          teachersRes.reason
        );
      }

      if (!teacherScope.canViewAllTeacherAttendance) {
        rawTeachers = teacherScope.teacherId
          ? rawTeachers.filter(
            (item) =>
              String(item.teacherId) === teacherScope.teacherId ||
              String(item.teacher?.id) === teacherScope.teacherId
          )
          : [];
      }

      const [enrichedStudents, enrichedTeachers] = await Promise.all([
        enrichStudentAttendanceRecords(activeSchoolId, rawStudents),
        enrichTeacherAttendanceRecords(activeSchoolId, rawTeachers),
      ]);

      if (currentReqSeq === loadRequestSeqRef.current) {
        setStudentRecords(enrichedStudents);
        setTeacherRecords(enrichedTeachers);
      }
    } catch (err: unknown) {
      console.error('[AttendanceDashboard] Load error:', err);
    } finally {
      if (currentReqSeq === loadRequestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    activeSchoolId,
    selectedDate,
    isPrivilegedRole,
    teacherScope.isLoading,
    teacherScope.canViewAllTeacherAttendance,
    teacherScope.teacherId,
    isHomeroomRestricted,
    homeroomClassSet,
    showToast,
    t,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Buka Modal Pratinjau Foto Selfie Guru + Telemetri Perangkat
  const handlePreviewSelfie = async (record: TeacherAttendanceWithCheckOut) => {
    const hasCheckInPhoto = Boolean(record.checkInSelfieUrl);
    const hasCheckOutPhoto = Boolean(record.checkOutSelfieUrl);
    if (!hasCheckInPhoto && !hasCheckOutPhoto) return;

    const reqId = ++selfieRequestSeqRef.current;

    setSelfieModal({
      teacherName:
        record.teacher?.fullName ??
        t('attendanceDashboard.teacherFallbackName'),
      status: normalizeStatusKey(record.status),
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      checkInDistance: record.checkInDistance,
      checkOutDistance: record.checkOutDistance,
      notes: resolveEffectiveNote(record.notes, 'GURU'),
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

    if (reqId !== selfieRequestSeqRef.current) return;

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
      SAKIT: teacherRecords.filter((r) => normalizeStatusKey(r.status) === 'SAKIT')
        .length,
      ALPA: teacherRecords.filter((r) => normalizeStatusKey(r.status) === 'ALPA')
        .length,
    };
  }, [teacherRecords]);

  const filterAndSortStudents = useCallback(
    (source: StudentAttendanceWithCheckOut[]) => {
      const filtered = source.filter((r) => {
        const normalizedStatus = normalizeStatusKey(r.status);
        const matchesClass =
          selectedClassId === 'ALL' || r.student?.classId === selectedClassId;
        const matchesStatus =
          studentStatusFilter === 'ALL' ||
          normalizedStatus === studentStatusFilter;
        const effectiveNote = resolveEffectiveNote(r.notes, 'SISWA') ?? '';
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !q ||
          r.student?.fullName?.toLowerCase().includes(q) ||
          r.student?.nisn?.toLowerCase().includes(q) ||
          r.student?.nis?.toLowerCase().includes(q) ||
          effectiveNote.toLowerCase().includes(q);
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
                sortLocale
              ) * dir
            );
          case 'className':
            return (
              (a.student?.classes?.name ?? '').localeCompare(
                b.student?.classes?.name ?? '',
                sortLocale,
                { numeric: true }
              ) * dir
            );
          case 'nisn':
            return (
              (a.student?.nisn ?? '').localeCompare(
                b.student?.nisn ?? '',
                sortLocale,
                { numeric: true }
              ) * dir
            );
          case 'status':
            return (
              getStatusLabel(a.status).localeCompare(
                getStatusLabel(b.status),
                sortLocale
              ) * dir
            );
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
    },
    [
      selectedClassId,
      studentStatusFilter,
      searchQuery,
      studentSort,
      resolveEffectiveNote,
      sortLocale,
      getStatusLabel,
    ]
  );

  const filterAndSortTeachers = useCallback(
    (source: TeacherAttendanceWithCheckOut[]) => {
      const filtered = source.filter((r) => {
        const normalizedStatus = normalizeStatusKey(r.status);
        const matchesStatus =
          teacherStatusFilter === 'ALL' ||
          normalizedStatus === teacherStatusFilter;
        if (!matchesStatus) return false;

        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        const effectiveNote = resolveEffectiveNote(r.notes, 'GURU') ?? '';
        return (
          r.teacher?.fullName?.toLowerCase().includes(q) ||
          r.teacher?.nip?.toLowerCase().includes(q) ||
          r.teacher?.nuptk?.toLowerCase().includes(q) ||
          effectiveNote.toLowerCase().includes(q)
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
                sortLocale
              ) * dir
            );
          case 'nip': {
            const idA = a.teacher?.nip || a.teacher?.nuptk || '';
            const idB = b.teacher?.nip || b.teacher?.nuptk || '';
            return idA.localeCompare(idB, sortLocale, { numeric: true }) * dir;
          }
          case 'status':
            return (
              getStatusLabel(a.status).localeCompare(
                getStatusLabel(b.status),
                sortLocale
              ) * dir
            );
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
    },
    [
      teacherStatusFilter,
      searchQuery,
      teacherSort,
      resolveEffectiveNote,
      sortLocale,
      getStatusLabel,
    ]
  );

  const filteredStudents = useMemo(
    () => filterAndSortStudents(studentRecords),
    [filterAndSortStudents, studentRecords]
  );

  const filteredTeachers = useMemo(
    () => filterAndSortTeachers(teacherRecords),
    [filterAndSortTeachers, teacherRecords]
  );

  // Potongan Data Halaman Aktif untuk Tabel Siswa & Guru
  const studentTotalPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / studentPageSize)
  );
  const safeStudentPage = Math.min(studentPage, studentTotalPages);
  const paginatedStudents = useMemo(() => {
    const start = (safeStudentPage - 1) * studentPageSize;
    return filteredStudents.slice(start, start + studentPageSize);
  }, [filteredStudents, safeStudentPage, studentPageSize]);

  const teacherTotalPages = Math.max(
    1,
    Math.ceil(filteredTeachers.length / teacherPageSize)
  );
  const safeTeacherPage = Math.min(teacherPage, teacherTotalPages);
  const paginatedTeachers = useMemo(() => {
    const start = (safeTeacherPage - 1) * teacherPageSize;
    return filteredTeachers.slice(start, start + teacherPageSize);
  }, [filteredTeachers, safeTeacherPage, teacherPageSize]);

  // 4. Hapus 1 Baris Data Absensi beserta SELURUH Foto Selfie & Lampiran Surat
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
        t('attendanceDashboard.toastDeleteSingleSuccess', {
          name: deleteTarget.name,
          date: deleteTarget.date,
        })
      );
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(err, t('attendanceDashboard.errDeleteSingle'))
      );
    } finally {
      setIsDeletingRow(false);
    }
  };

  // 5. Hitung Jumlah Data Absensi Berumur > 2 Tahun (Khusus SUPER_ADMIN)
  const checkOldAttendanceRecords = useCallback(
    async (scope: 'CURRENT_SCHOOL' | 'ALL_SCHOOLS') => {
      if (!isSuperAdmin) return;
      if (scope === 'CURRENT_SCHOOL' && !activeSchoolId) {
        setOldRecordsCount(0);
        return;
      }

      setIsCheckingOldRecords(true);
      setOldRecordsCount(null);
      try {
        let query = supabase
          .from('attendances')
          .select('id', { count: 'exact', head: true })
          .lt('date', cutoffDate);

        if (scope === 'CURRENT_SCHOOL') {
          query = query.eq('schoolId', activeSchoolId);
        }

        const { count, error } = await query;
        if (error) throw error;
        setOldRecordsCount(count ?? 0);
      } catch (err: unknown) {
        showToast(
          'error',
          getErrorMessage(err, t('attendanceDashboard.errCheckOldRecords'))
        );
        setOldRecordsCount(0);
      } finally {
        setIsCheckingOldRecords(false);
      }
    },
    [isSuperAdmin, cutoffDate, activeSchoolId, showToast, t]
  );

  useEffect(() => {
    if (purgeModalOpen && isSuperAdmin) {
      void checkOldAttendanceRecords(purgeScope);
    }
  }, [purgeModalOpen, purgeScope, isSuperAdmin, checkOldAttendanceRecords]);

  // Ekspor Backup CSV Arsip Lama (> 2 Tahun) secara Berpaginasi
  const handleBackupOldRecordsCsv = async () => {
    if (!isSuperAdmin) return;
    if (purgeScope === 'CURRENT_SCHOOL' && !activeSchoolId) {
      showToast('error', t('attendanceDashboard.errSelectSchoolFirst'));
      return;
    }

    try {
      const allRows: Array<Record<string, unknown>> = [];
      const batchSize = 1000;
      const maxPages = 100;

      for (let page = 0; page < maxPages; page++) {
        const from = page * batchSize;
        const to = from + batchSize - 1;

        let query = supabase
          .from('attendances')
          .select('*')
          .lt('date', cutoffDate)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);

        if (purgeScope === 'CURRENT_SCHOOL') {
          query = query.eq('schoolId', activeSchoolId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const batch = (data ?? []) as Array<Record<string, unknown>>;
        allRows.push(...batch);

        if (batch.length < batchSize) break;
      }

      if (allRows.length === 0) {
        showToast('error', t('attendanceDashboard.errNoOldRecordsToBackup'));
        return;
      }

      const headers = Object.keys(allRows[0]);
      const escapeCsv = (v: unknown) =>
        `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csvLines = [
        headers.map(escapeCsv).join(','),
        ...allRows.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
      ];

      const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('attendanceDashboard.csvBackupFilePrefix')}_${cutoffDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(
        'success',
        t('attendanceDashboard.toastBackupSuccess', { count: allRows.length })
      );
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(err, t('attendanceDashboard.errBackupCsv'))
      );
    }
  };

  // Eksekusi Hapus Permanen Arsip > 2 Tahun secara Bertahap per Batch ID
  // (Sinkron antara pembersihan Storage & DELETE database agar bebas orphan files)
  const handlePurgeOldRecords = async () => {
    if (!isSuperAdmin) return;
    if (purgeScope === 'CURRENT_SCHOOL' && !activeSchoolId) {
      showToast('error', t('attendanceDashboard.errSelectSchoolFirst'));
      return;
    }

    setIsPurgingOldRecords(true);
    setPurgeDeletedSoFar(0);
    let totalDeleted = 0;

    try {
      const maxIterations = 200; // Hingga 100.000 arsip per sesi
      for (let iter = 0; iter < maxIterations; iter++) {
        let batchSelectQuery = supabase
          .from('attendances')
          .select('id, checkInSelfieUrl, checkOutSelfieUrl, attachmentUrl')
          .lt('date', cutoffDate)
          .order('date', { ascending: true })
          .limit(PURGE_BATCH_SIZE);

        if (purgeScope === 'CURRENT_SCHOOL') {
          batchSelectQuery = batchSelectQuery.eq('schoolId', activeSchoolId);
        }

        const { data: batchRows, error: fetchError } = await batchSelectQuery;
        if (fetchError) throw fetchError;

        const typedRows = (batchRows ?? []) as Array<
          AttendanceFileRow & { id: string }
        >;
        if (typedRows.length === 0) break;

        const selfiePathsToRemove = typedRows.flatMap((row) => [
          row.checkInSelfieUrl,
          row.checkOutSelfieUrl,
        ]);
        const attachmentPathsToRemove = typedRows.map(
          (row) => row.attachmentUrl
        );

        await Promise.all([
          removeFilesFromStorage(selfiePathsToRemove, STORAGE_BUCKET_NAME),
          removeFilesFromStorage(attachmentPathsToRemove, ATTACHMENT_BUCKET_NAME),
        ]);

        const batchIds = typedRows.map((row) => row.id);
        const idChunks = chunkArray(batchIds, IN_QUERY_CHUNK_SIZE);

        for (const chunkIds of idChunks) {
          let deleteChunkQuery = supabase
            .from('attendances')
            .delete()
            .in('id', chunkIds);

          if (purgeScope === 'CURRENT_SCHOOL') {
            deleteChunkQuery = deleteChunkQuery.eq('schoolId', activeSchoolId);
          }

          const { error: deleteError } = await deleteChunkQuery;
          if (deleteError) throw deleteError;
        }

        totalDeleted += typedRows.length;
        setPurgeDeletedSoFar(totalDeleted);

        if (typedRows.length < PURGE_BATCH_SIZE) break;
      }

      showToast(
        'success',
        t('attendanceDashboard.toastPurgeSuccess', {
          count: totalDeleted,
          date: cutoffDate,
        })
      );
      setPurgeModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(err, t('attendanceDashboard.errPurgeOldRecords'))
      );
    } finally {
      setIsPurgingOldRecords(false);
      setPurgeDeletedSoFar(0);
    }
  };

  const formatTime = useCallback(
    (iso?: string | null) => {
      if (!iso) return '-';
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(iso.trim())) {
        return iso.trim().slice(0, 5);
      }
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return '-';
      return parsed.toLocaleTimeString(timeLocale, {
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [timeLocale]
  );

  const renderStudentNotes = (record: StudentAttendanceWithCheckOut) => {
    const effectiveNote = resolveEffectiveNote(record.notes, 'SISWA');
    if (!effectiveNote) {
      return <span className="text-xs opacity-40">-</span>;
    }

    const expectedStudentSpecial =
      (holidayLock.specialEventReason ?? '').trim() || defaultSpecialEventNote;
    const isHolidayEventTag =
      isStudentSpecialEventMode && effectiveNote === expectedStudentSpecial;

    if (isHolidayEventTag) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <Sparkles size={11} />
          {effectiveNote}
        </span>
      );
    }

    return <span className="text-sm opacity-80">{effectiveNote}</span>;
  };

  const renderTeacherNotes = (record: TeacherAttendanceWithCheckOut) => {
    const effectiveNote = resolveEffectiveNote(record.notes, 'GURU');
    const lateMinutes = extractLateMinutesFromTelemetry(record.deviceTelemetry);
    const hasEarlyNote = isEarlyCheckoutNote(effectiveNote);
    const expectedTeacherSpecial = teacherSpecialReason || specialEventNote;
    const isHolidayEventTag =
      isTeacherSpecialEventMode && effectiveNote === expectedTeacherSpecial;

    if (!effectiveNote && lateMinutes === 0) {
      return <span className="text-xs opacity-40">-</span>;
    }

    return (
      <div className="flex flex-col items-start gap-1 max-w-60">
        {lateMinutes > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35">
            <Clock size={11} />
            {t('attendanceDashboard.lateMinutesBadge', {
              minutes: lateMinutes,
            })}
          </span>
        )}
        {hasEarlyNote && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/35">
            <AlertTriangle size={11} />
            {t('attendanceDashboard.earlyCheckoutBadge')}
          </span>
        )}
        {effectiveNote &&
          (isHolidayEventTag ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <Sparkles size={11} />
              {effectiveNote}
            </span>
          ) : (
            <span className="text-xs text-foreground/85 leading-snug">
              {effectiveNote}
            </span>
          ))}
      </div>
    );
  };

  // Ekspor Laporan CSV (Auto-Paged Fetch Lengkap + Dwibahasa + Kalender Jawa)
  const handleExportCsv = async () => {
    if (!activeSchoolId || isExportingCsv) return;

    setIsExportingCsv(true);
    try {
      const escapeCsv = (val: unknown) => {
        const str = String(val ?? '-').replace(/"/g, '""');
        return `"${str}"`;
      };

      const lines: string[] = [];

      if (activeTab === 'teachers') {
        let rawTeachers = await fetchAllTeacherAttendances(
          activeSchoolId,
          selectedDate
        );

        if (!teacherScope.canViewAllTeacherAttendance) {
          rawTeachers = teacherScope.teacherId
            ? rawTeachers.filter(
              (item) =>
                String(item.teacherId) === teacherScope.teacherId ||
                String(item.teacher?.id) === teacherScope.teacherId
            )
            : [];
        }

        const enrichedTeachers = await enrichTeacherAttendanceRecords(
          activeSchoolId,
          rawTeachers
        );
        const exportRows = filterAndSortTeachers(enrichedTeachers);

        lines.push(
          t('attendanceDashboard.csvTeacherHeaders')
            .split(',')
            .map(escapeCsv)
            .join(',')
        );

        exportRows.forEach((r, idx) => {
          const jvInfo = getJavaneseDateInfo(r.date, currentLang);
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
              getStatusLabel(r.status),
              lateMins > 0 ? lateMins : 0,
              formatTime(r.checkInTime),
              formatTime(r.checkOutTime),
              r.checkInDistance != null ? Math.round(r.checkInDistance) : '-',
              r.checkOutDistance != null ? Math.round(r.checkOutDistance) : '-',
              r.checkInTime
                ? r.isCheckInMock
                  ? t('attendanceDashboard.gpsFake')
                  : t('attendanceDashboard.gpsValid')
                : '-',
              resolveEffectiveNote(r.notes, 'GURU') ?? '-',
            ]
              .map(escapeCsv)
              .join(',')
          );
        });
      } else {
        let rawStudents = await fetchAllStudentAttendances(
          activeSchoolId,
          selectedDate
        );

        if (isHomeroomRestricted) {
          rawStudents = rawStudents.filter(
            (item) =>
              item.student?.classId &&
              homeroomClassSet.has(String(item.student.classId))
          );
        }

        const enrichedStudents = await enrichStudentAttendanceRecords(
          activeSchoolId,
          rawStudents
        );
        const exportRows = filterAndSortStudents(enrichedStudents);

        lines.push(
          t('attendanceDashboard.csvStudentHeaders')
            .split(',')
            .map(escapeCsv)
            .join(',')
        );

        exportRows.forEach((r, idx) => {
          const jvInfo = getJavaneseDateInfo(r.date, currentLang);
          lines.push(
            [
              idx + 1,
              r.date,
              jvInfo.hariPasaran,
              `${jvInfo.javaneseDay} ${jvInfo.javaneseMonth} ${jvInfo.javaneseYear} Ja`,
              r.student?.fullName ?? '-',
              r.student?.nisn ?? '-',
              r.student?.classes?.name ?? '-',
              getStatusLabel(r.status),
              formatTime(r.checkInTime || r.time),
              formatTime(r.checkOutTime),
              r.recordedBy
                ? t('attendanceDashboard.recordedByAdmin')
                : t('attendanceDashboard.recordedByKiosk'),
              resolveEffectiveNote(r.notes, 'SISWA') ?? '-',
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
        activeTab === 'teachers'
          ? t('attendanceDashboard.csvTeacherFilePrefix')
          : t('attendanceDashboard.csvStudentFilePrefix');
      link.href = url;
      link.setAttribute('download', `${prefix}_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast(
        'error',
        getErrorMessage(err, t('attendanceDashboard.errBackupCsv'))
      );
    } finally {
      setIsExportingCsv(false);
    }
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
            <span>{t('attendanceDashboard.superAdminBannerTitle')}</span>
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
              title={t('attendanceDashboard.titleArchiveRetention', {
                years: ARCHIVE_RETENTION_YEARS,
              })}
            >
              <ArchiveX size={15} />
              <span>
                {t('attendanceDashboard.btnArchiveRetention', {
                  years: ARCHIVE_RETENTION_YEARS,
                })}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header + Kalender Jawa */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('attendanceDashboard.pageTitle')}</h1>
          <p className="page-subtitle">
            {t('attendanceDashboard.pageSubtitle')}
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
            onClick={() => void loadData()}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            {t('attendanceDashboard.btnRefresh')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleExportCsv()}
            disabled={
              isLoading ||
              isExportingCsv ||
              (activeTab === 'teachers'
                ? filteredTeachers.length === 0
                : filteredStudents.length === 0)
            }
            title={
              activeTab === 'teachers'
                ? t('attendanceDashboard.titleExportTeachersCsv')
                : t('attendanceDashboard.titleExportStudentsCsv')
            }
          >
            {isExportingCsv ? (
              <RefreshCw size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            {t('attendanceDashboard.btnExportCsv')}
          </button>
        </div>
      </div>

      {/* Banner Status Hari Libur / Mode Kegiatan Khusus */}
      {isAnySpecialEventMode ? (
        <div className="mb-4 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 text-xs">
          <Unlock size={16} className="text-emerald-600 shrink-0" />
          <span>
            <strong>
              {t('attendanceDashboard.specialEventBannerPrefix')}
            </strong>{' '}
            {specialEventNote}{' '}
            {t('attendanceDashboard.specialEventBannerSuffix', {
              holiday:
                holidayLock.holidayName ||
                t('attendanceDashboard.defaultHolidayName'),
            })}
          </span>
        </div>
      ) : (
        holidayLock.isHoliday && (
          <div className="mb-4 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 flex items-center gap-2.5 text-xs">
            <CalendarOff size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>{t('attendanceDashboard.holidayBannerPrefix')}</strong>{' '}
              {holidayLock.holidayName ||
                t('attendanceDashboard.defaultHolidayName')}{' '}
              {t('attendanceDashboard.holidayBannerSuffix')}
            </span>
          </div>
        )
      )}

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
              <p className="summary-card-label">
                {t('attendanceDashboard.cardStudentPresent')}
              </p>
              <p className="summary-card-value">
                {summary.studentPresent + summary.studentLate}{' '}
                <span className="text-sm font-normal opacity-60">
                  / {summary.studentTotal}
                </span>
              </p>
              <p className="summary-card-sub text-green-500">
                {t('attendanceDashboard.cardStudentActivePct', {
                  pct: summary.studentPercentage,
                })}
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
              <p className="summary-card-label">
                {t('attendanceDashboard.cardStudentLate')}
              </p>
              <p className="summary-card-value">{summary.studentLate}</p>
              <p className="summary-card-sub">
                {t('attendanceDashboard.cardStudentSickPerm', {
                  count: summary.studentSick + summary.studentPermission,
                })}
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
              <p className="summary-card-label">
                {t('attendanceDashboard.cardStudentAbsent')}
              </p>
              <p className="summary-card-value">{summary.studentAbsent}</p>
              <p className="summary-card-sub">
                {t('attendanceDashboard.cardStudentUnrecorded', {
                  count: summary.studentUnrecorded,
                })}
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
                <p className="summary-card-label">
                  {t('attendanceDashboard.cardTeacherPresent')}
                </p>
                <p className="summary-card-value">
                  {summary.teacherPresent + summary.teacherLate}{' '}
                  <span className="text-sm font-normal opacity-60">
                    / {summary.teacherTotal}
                  </span>
                </p>
                <p className="summary-card-sub text-blue-500">
                  {t('attendanceDashboard.cardTeacherActivePct', {
                    pct: summary.teacherPercentage,
                  })}
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
              ? t('attendanceDashboard.tabOverview')
              : tab === 'students'
                ? t('attendanceDashboard.tabStudents', {
                  count: studentRecords.length,
                })
                : t('attendanceDashboard.tabTeachers', {
                  count: teacherRecords.length,
                })}
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
                    ? t('attendanceDashboard.searchStudentPlaceholder')
                    : t('attendanceDashboard.searchTeacherPlaceholder')
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
                  title={t('attendanceDashboard.titleClearSearch')}
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
                {(!isHomeroomRestricted || classes.length > 1) && (
                  <option value="ALL">
                    {t('attendanceDashboard.allClassesOption')}
                  </option>
                )}
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {t('attendanceDashboard.classOptionPrefix', {
                      name: cls.name,
                    })}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Filter Pills Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  key: 'ALL',
                  label: t('attendanceDashboard.filterAll'),
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.ALL
                      : teacherStatusCounts.ALL,
                },
                {
                  key: 'HADIR',
                  label: getStatusLabel('HADIR'),
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.HADIR
                      : teacherStatusCounts.HADIR,
                },
                {
                  key: 'TERLAMBAT',
                  label: getStatusLabel('TERLAMBAT'),
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.TERLAMBAT
                      : teacherStatusCounts.TERLAMBAT,
                },
                {
                  key: 'IZIN',
                  label: getStatusLabel('IZIN'),
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.IZIN
                      : teacherStatusCounts.IZIN,
                },
                {
                  key: 'SAKIT',
                  label: getStatusLabel('SAKIT'),
                  count:
                    activeTab === 'students'
                      ? studentStatusCounts.SAKIT
                      : teacherStatusCounts.SAKIT,
                },
                {
                  key: 'ALPA',
                  label: getStatusLabel('ALPA'),
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
                {t('attendanceDashboard.distStudentTitle', {
                  total: summary.studentTotal,
                })}
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
                        <span>{getStatusLabel(key)}</span>
                        <span className="status-dist-count">
                          {t('attendanceDashboard.distStudentUnit', { count })}
                        </span>
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
                  {t('attendanceDashboard.distTeacherTitle', {
                    total: summary.teacherTotal,
                  })}
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
                          <span>{getStatusLabel(key)}</span>
                          <span className="status-dist-count">
                            {t('attendanceDashboard.distTeacherUnit', {
                              count,
                            })}
                          </span>
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
                <RefreshCw size={24} className="spin" />{' '}
                {t('attendanceDashboard.loadingData')}
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>{t('attendanceDashboard.emptyStudents')}</p>
              </div>
            ) : (
              <>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">
                          {t('attendanceDashboard.colNo')}
                        </th>
                        <th
                          onClick={() => handleSortStudent('fullName')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colStudentName')}
                          {renderSortIcon(
                            studentSort?.key === 'fullName',
                            studentSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortStudent('className')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colClass')}
                          {renderSortIcon(
                            studentSort?.key === 'className',
                            studentSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortStudent('nisn')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colNisn')}
                          {renderSortIcon(
                            studentSort?.key === 'nisn',
                            studentSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortStudent('status')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colStatus')}
                          {renderSortIcon(
                            studentSort?.key === 'status',
                            studentSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortStudent('time')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colCheckIn')}
                          {renderSortIcon(
                            studentSort?.key === 'time',
                            studentSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortStudent('checkOutTime')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colCheckOut')}
                          {renderSortIcon(
                            studentSort?.key === 'checkOutTime',
                            studentSort?.direction
                          )}
                        </th>
                        <th>{t('attendanceDashboard.colRecordedBy')}</th>
                        <th>{t('attendanceDashboard.colNotes')}</th>
                        {canDeleteRecord && (
                          <th className="text-center">
                            {t('attendanceDashboard.colActions')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.map((record, index) => {
                        const stKey = normalizeStatusKey(record.status);
                        const rowNumber =
                          (safeStudentPage - 1) * studentPageSize + index + 1;
                        return (
                          <tr key={record.id}>
                            <td className="td-mono text-xs text-center opacity-70">
                              {rowNumber}
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
                                {getStatusLabel(stKey)}
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
                                ? t('attendanceDashboard.recordedByAdmin')
                                : t('attendanceDashboard.recordedByKiosk')}
                            </td>
                            <td>{renderStudentNotes(record)}</td>
                            {canDeleteRecord && (
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: record.id,
                                      name:
                                        record.student?.fullName ??
                                        t(
                                          'attendanceDashboard.studentFallbackName'
                                        ),
                                      date: record.date,
                                      selfiePaths: [],
                                      attachmentPaths: [],
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                                  title={t(
                                    'attendanceDashboard.titleDeleteSingleStudent'
                                  )}
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

                {/* Pagination Bar Tabel Siswa */}
                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="opacity-75">
                    {currentLang === 'en'
                      ? `Showing ${(safeStudentPage - 1) * studentPageSize + 1}–${Math.min(
                        safeStudentPage * studentPageSize,
                        filteredStudents.length
                      )} of ${filteredStudents.length} records`
                      : `Menampilkan ${(safeStudentPage - 1) * studentPageSize + 1}–${Math.min(
                        safeStudentPage * studentPageSize,
                        filteredStudents.length
                      )} dari ${filteredStudents.length} data`}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="form-input py-1 px-2 text-xs"
                      value={studentPageSize}
                      onChange={(e) =>
                        setStudentPageSize(Number(e.target.value))
                      }
                    >
                      {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {currentLang === 'en'
                            ? `${size} / page`
                            : `${size} / halaman`}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={safeStudentPage <= 1}
                      onClick={() =>
                        setStudentPage((prev) => Math.max(1, prev - 1))
                      }
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span className="font-semibold px-1.5">
                      {safeStudentPage} / {studentTotalPages}
                    </span>

                    <button
                      type="button"
                      disabled={safeStudentPage >= studentTotalPages}
                      onClick={() =>
                        setStudentPage((prev) =>
                          Math.min(studentTotalPages, prev + 1)
                        )
                      }
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Teachers Tab */}
        {activeTab === 'teachers' && (
          <div className="data-card">
            {isLoading ? (
              <div className="table-loading">
                <RefreshCw size={24} className="spin" />{' '}
                {t('attendanceDashboard.loadingData')}
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>{t('attendanceDashboard.emptyTeachers')}</p>
              </div>
            ) : (
              <>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">
                          {t('attendanceDashboard.colNo')}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('fullName')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colTeacherName')}
                          {renderSortIcon(
                            teacherSort?.key === 'fullName',
                            teacherSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('nip')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colNipNuptk')}
                          {renderSortIcon(
                            teacherSort?.key === 'nip',
                            teacherSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('status')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colStatus')}
                          {renderSortIcon(
                            teacherSort?.key === 'status',
                            teacherSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('checkInTime')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colTeacherCheckIn')}
                          {renderSortIcon(
                            teacherSort?.key === 'checkInTime',
                            teacherSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('checkOutTime')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colTeacherCheckOut')}
                          {renderSortIcon(
                            teacherSort?.key === 'checkOutTime',
                            teacherSort?.direction
                          )}
                        </th>
                        <th
                          onClick={() => handleSortTeacher('checkInDistance')}
                          className="cursor-pointer select-none hover:text-primary transition"
                        >
                          {t('attendanceDashboard.colLocationDistance')}
                          {renderSortIcon(
                            teacherSort?.key === 'checkInDistance',
                            teacherSort?.direction
                          )}
                        </th>
                        <th>{t('attendanceDashboard.colGpsValid')}</th>
                        <th>{t('attendanceDashboard.colSelfiePhoto')}</th>
                        <th>{t('attendanceDashboard.colNotesAndLog')}</th>
                        {canDeleteRecord && (
                          <th className="text-center">
                            {t('attendanceDashboard.colActions')}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTeachers.map((record, index) => {
                        const hasInPhoto = Boolean(record.checkInSelfieUrl);
                        const hasOutPhoto = Boolean(record.checkOutSelfieUrl);
                        const hasAnyPhoto = hasInPhoto || hasOutPhoto;
                        const stKey = normalizeStatusKey(record.status);
                        const rowNumber =
                          (safeTeacherPage - 1) * teacherPageSize + index + 1;

                        return (
                          <tr key={record.id}>
                            <td className="td-mono text-xs text-center opacity-70">
                              {rowNumber}
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
                                {getStatusLabel(stKey)}
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
                                    title={t(
                                      'attendanceDashboard.titleGpsCheckIn'
                                    )}
                                  >
                                    <MapPin size={12} />
                                    {record.checkInDistance != null
                                      ? `${Math.round(record.checkInDistance)}m`
                                      : t('attendanceDashboard.gpsCheckInLabel')}
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
                                      title={t(
                                        'attendanceDashboard.titleGpsCheckOut'
                                      )}
                                    >
                                      <MapPin size={12} />
                                      {record.checkOutDistance != null
                                        ? t(
                                          'attendanceDashboard.gpsCheckOutWithDist',
                                          {
                                            meters: Math.round(
                                              record.checkOutDistance
                                            ),
                                          }
                                        )
                                        : t(
                                          'attendanceDashboard.gpsCheckOutLabel'
                                        )}
                                    </a>
                                  )}
                              </div>
                            </td>
                            <td>
                              {record.checkInTime ? (
                                record.isCheckInMock ? (
                                  <span className="gps-invalid">
                                    <XCircle size={14} />{' '}
                                    {t('attendanceDashboard.gpsFake')}
                                  </span>
                                ) : (
                                  <span className="gps-valid">
                                    <Shield size={14} />{' '}
                                    {t('attendanceDashboard.gpsValid')}
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
                                      onClick={() =>
                                        void handlePreviewSelfie(record)
                                      }
                                      className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition"
                                      title={t(
                                        'attendanceDashboard.titlePhotoCheckIn'
                                      )}
                                    >
                                      <Camera size={12} />
                                      <span>
                                        {t('attendanceDashboard.btnPhotoCheckIn')}
                                      </span>
                                    </button>
                                  )}
                                  {hasOutPhoto && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handlePreviewSelfie(record)
                                      }
                                      className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition"
                                      title={t(
                                        'attendanceDashboard.titlePhotoCheckOut'
                                      )}
                                    >
                                      <Camera size={12} />
                                      <span>
                                        {t(
                                          'attendanceDashboard.btnPhotoCheckOut'
                                        )}
                                      </span>
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
                                        record.teacher?.fullName ??
                                        t(
                                          'attendanceDashboard.teacherFallbackName'
                                        ),
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
                                  title={t(
                                    'attendanceDashboard.titleDeleteSingleTeacher'
                                  )}
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

                {/* Pagination Bar Tabel Guru */}
                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="opacity-75">
                    {currentLang === 'en'
                      ? `Showing ${(safeTeacherPage - 1) * teacherPageSize + 1}–${Math.min(
                        safeTeacherPage * teacherPageSize,
                        filteredTeachers.length
                      )} of ${filteredTeachers.length} records`
                      : `Menampilkan ${(safeTeacherPage - 1) * teacherPageSize + 1}–${Math.min(
                        safeTeacherPage * teacherPageSize,
                        filteredTeachers.length
                      )} dari ${filteredTeachers.length} data`}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="form-input py-1 px-2 text-xs"
                      value={teacherPageSize}
                      onChange={(e) =>
                        setTeacherPageSize(Number(e.target.value))
                      }
                    >
                      {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {currentLang === 'en'
                            ? `${size} / page`
                            : `${size} / halaman`}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={safeTeacherPage <= 1}
                      onClick={() =>
                        setTeacherPage((prev) => Math.max(1, prev - 1))
                      }
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span className="font-semibold px-1.5">
                      {safeTeacherPage} / {teacherTotalPages}
                    </span>

                    <button
                      type="button"
                      disabled={safeTeacherPage >= teacherTotalPages}
                      onClick={() =>
                        setTeacherPage((prev) =>
                          Math.min(teacherTotalPages, prev + 1)
                        )
                      }
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
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
                  <h3 className="font-bold text-base">
                    {t('attendanceDashboard.modalDeleteTitle')}
                  </h3>
                  <p className="text-xs opacity-75 mt-1 leading-relaxed">
                    {t('attendanceDashboard.modalDeleteDescPrefix')}
                    <strong>{deleteTarget.name}</strong>
                    {t('attendanceDashboard.modalDeleteDescMid')}
                    <strong>{deleteTarget.date}</strong>
                    {t('attendanceDashboard.modalDeleteDescSuffix')}
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
                  {t('attendanceDashboard.btnCancel')}
                </button>
                <button
                  type="button"
                  disabled={isDeletingRow}
                  onClick={() => void handleConfirmDeleteSingle()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition"
                >
                  {isDeletingRow
                    ? t('attendanceDashboard.btnDeleting')
                    : t('attendanceDashboard.btnConfirmDeletePermanent')}
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
                    {t('attendanceDashboard.modalPurgeTitle', {
                      years: ARCHIVE_RETENTION_YEARS,
                    })}
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
                  {t('attendanceDashboard.modalPurgeDescPrefix')}
                  <strong className="text-amber-500">{cutoffDate}</strong>
                  {t('attendanceDashboard.modalPurgeDescMid', {
                    years: ARCHIVE_RETENTION_YEARS,
                  })}
                </p>

                <div>
                  <label className="block font-semibold mb-1.5">
                    {t('attendanceDashboard.modalPurgeScopeLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isPurgingOldRecords}
                      onClick={() => setPurgeScope('CURRENT_SCHOOL')}
                      className={`py-2 px-3 rounded-xl font-semibold border transition ${purgeScope === 'CURRENT_SCHOOL'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/40 border-border opacity-80'
                        }`}
                    >
                      {t('attendanceDashboard.modalPurgeScopeCurrent')}
                    </button>
                    <button
                      type="button"
                      disabled={isPurgingOldRecords}
                      onClick={() => setPurgeScope('ALL_SCHOOLS')}
                      className={`py-2 px-3 rounded-xl font-semibold border transition ${purgeScope === 'ALL_SCHOOLS'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/40 border-border opacity-80'
                        }`}
                    >
                      {t('attendanceDashboard.modalPurgeScopeAll')}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/50 border border-border flex items-center justify-between">
                  <span>{t('attendanceDashboard.modalPurgeFoundLabel')}</span>
                  {isCheckingOldRecords ? (
                    <span className="font-semibold flex items-center gap-1.5">
                      <RefreshCw size={13} className="spin" />{' '}
                      {t('attendanceDashboard.modalPurgeChecking')}
                    </span>
                  ) : (
                    <span className="text-sm font-extrabold text-red-500">
                      {t('attendanceDashboard.modalPurgeFoundCount', {
                        count: oldRecordsCount ?? 0,
                      })}
                    </span>
                  )}
                </div>

                {isPurgingOldRecords && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <RefreshCw size={14} className="spin shrink-0" />
                    <span>
                      {currentLang === 'en'
                        ? `Purging batch (${purgeDeletedSoFar} / ${oldRecordsCount ?? 0} records)...`
                        : `Menghapus bertahap (${purgeDeletedSoFar} / ${oldRecordsCount ?? 0} data)...`}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  disabled={
                    isPurgingOldRecords ||
                    isCheckingOldRecords ||
                    !oldRecordsCount
                  }
                  onClick={() => void handleBackupOldRecordsCsv()}
                  className="btn-secondary text-xs justify-center"
                >
                  <Download size={14} />
                  {t('attendanceDashboard.btnBackupCsvFirst')}
                </button>

                <button
                  type="button"
                  disabled={
                    isPurgingOldRecords ||
                    isCheckingOldRecords ||
                    !oldRecordsCount
                  }
                  onClick={() => void handlePurgeOldRecords()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={14} />
                  {isPurgingOldRecords
                    ? t('attendanceDashboard.btnPurging')
                    : t('attendanceDashboard.btnConfirmPurge', {
                      count: oldRecordsCount ?? 0,
                    })}
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
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-base">
                      {selfieModal.teacherName}
                    </h3>
                    {selfieModal.status && (
                      <span
                        className="status-badge text-[10px]"
                        style={{
                          background:
                            (STATUS_COLORS[selfieModal.status] ?? '#6B7280') +
                            '20',
                          color:
                            STATUS_COLORS[selfieModal.status] ?? '#6B7280',
                        }}
                      >
                        {getStatusLabel(selfieModal.status)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-70">
                    {t('attendanceDashboard.modalSelfieSubtitle')}
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
                  <span>{t('attendanceDashboard.modalSelfieLoading')}</span>
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
                          <LogIn size={14} />{' '}
                          {t('attendanceDashboard.btnPhotoCheckIn')}
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
                            alt={t('attendanceDashboard.modalSelfieInAlt', {
                              name: selfieModal.teacherName,
                            })}
                            className="w-full max-h-80 object-contain"
                          />
                        ) : (
                          <p className="text-xs text-red-400 p-4 text-center">
                            {t('attendanceDashboard.modalSelfieInError')}
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
                          <LogOut size={14} />{' '}
                          {t('attendanceDashboard.btnPhotoCheckOut')}
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
                            alt={t('attendanceDashboard.modalSelfieOutAlt', {
                              name: selfieModal.teacherName,
                            })}
                            className="w-full max-h-80 object-contain"
                          />
                        ) : (
                          <p className="text-xs text-red-400 p-4 text-center">
                            {t('attendanceDashboard.modalSelfieOutError')}
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
                        {t('attendanceDashboard.telemetryHeading')}
                      </span>
                      {selfieModal.isMock ||
                        (selfieModal.securityFlags &&
                          selfieModal.securityFlags.length > 0) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-300">
                          <ShieldAlert size={12} />{' '}
                          {t('attendanceDashboard.telemetryNeedsAudit')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                          <Shield size={12} />{' '}
                          {t('attendanceDashboard.telemetryVerified')}
                        </span>
                      )}
                    </div>

                    {selfieModal.deviceTelemetry && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] opacity-85">
                        {typeof selfieModal.deviceTelemetry.appMode ===
                          'string' && (
                            <div>
                              <span className="opacity-65">
                                {t('attendanceDashboard.telemetryAppMode')}
                              </span>
                              <strong>{selfieModal.deviceTelemetry.appMode}</strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry.platform ===
                          'string' && (
                            <div>
                              <span className="opacity-65">
                                {t('attendanceDashboard.telemetryPlatform')}
                              </span>
                              <strong>
                                {selfieModal.deviceTelemetry.platform}
                              </strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry.gpsAccuracyMeters ===
                          'number' && (
                            <div>
                              <span className="opacity-65">
                                {t('attendanceDashboard.telemetryGpsAccuracy')}
                              </span>
                              <strong>
                                ±{selfieModal.deviceTelemetry.gpsAccuracyMeters}m
                              </strong>
                            </div>
                          )}
                        {extractLateMinutesFromTelemetry(
                          selfieModal.deviceTelemetry
                        ) > 0 && (
                            <div className="text-amber-600 dark:text-amber-300">
                              <span className="opacity-75">
                                {t('attendanceDashboard.telemetryLate')}
                              </span>
                              <strong>
                                {t('attendanceDashboard.telemetryLateUnit', {
                                  minutes: extractLateMinutesFromTelemetry(
                                    selfieModal.deviceTelemetry
                                  ),
                                })}
                              </strong>
                            </div>
                          )}
                        {typeof selfieModal.deviceTelemetry.javaneseDate ===
                          'string' && (
                            <div className="col-span-2">
                              <span className="opacity-65">
                                {t('attendanceDashboard.telemetryJavaneseDate')}
                              </span>
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