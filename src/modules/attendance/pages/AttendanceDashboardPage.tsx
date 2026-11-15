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
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
  StudentAttendance,
  TeacherAttendance,
  AttendanceSummary,
} from '../types/attendance.types';

// ============================================================================
// PARAMETER YANG BISA KAMU SESUAIKAN DENGAN MUDAH
// ============================================================================
const ARCHIVE_RETENTION_YEARS = 2; // Batas umur arsip absensi dalam tahun (default: 2 tahun)

type ActiveTab = 'overview' | 'students' | 'teachers';
type SortDirection = 'asc' | 'desc';

type TeacherSortKey =
  | 'fullName'
  | 'nip'
  | 'status'
  | 'checkInTime'
  | 'checkOutTime'
  | 'checkInDistance';

type StudentSortKey = 'fullName' | 'className' | 'nisn' | 'status' | 'time';

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

// Menghitung tanggal batas retensi (misal: 2 tahun lalu dari hari ini, format YYYY-MM-DD)
function getRetentionCutoffDate(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Dashboard Rekap Absensi Admin & Pimpinan
 * Fitur: Ringkasan Populasi Aktif, Kolom Nomor, Sorting Kolom, Hapus & Pembersihan Arsip > 2 Tahun (Super Admin)
 */
export function AttendanceDashboardPage() {
  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // State Simulasi Sekolah (Khusus SUPER_ADMIN)
  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string; npsn: string }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [studentRecords, setStudentRecords] = useState<StudentAttendance[]>([]);
  const [teacherRecords, setTeacherRecords] = useState<TeacherAttendance[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // State Modal Pratinjau Foto Selfie Guru
  const [selfieModal, setSelfieModal] = useState<{
    teacherName: string;
    status: string;
    checkInTime?: string | null;
    distance?: number | null;
    notes?: string | null;
    imageUrl: string | null;
    isLoading: boolean;
  } | null>(null);

  // State Modal Hapus Satuan & Pembersihan Arsip > 2 Tahun (Khusus SUPER_ADMIN)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    date: string;
    selfieUrl?: string | null;
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

  // 1. Jika SUPER_ADMIN, muat daftar sekolah
  useEffect(() => {
    if (!isSuperAdmin) return;
    attendanceService
      .getAllSchoolsForSimulation()
      .then((list) => {
        setSimSchools(list);
        if (school?.id) setSimSchoolId(school.id);
        else if (list.length > 0) setSimSchoolId(list[0].id);
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

  // 3. Muat Ringkasan & Data Absensi Siswa + Guru
  const loadData = useCallback(async () => {
    if (!activeSchoolId) return;
    setIsLoading(true);
    try {
      const [sum, students, teachers] = await Promise.all([
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
      setSummary(sum);
      setStudentRecords(students.data);
      setTeacherRecords(teachers.data);
    } catch (err) {
      console.error('[AttendanceDashboard] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSchoolId, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Buka Modal Pratinjau Foto Selfie Guru (Signed URL Private Bucket)
  const handlePreviewSelfie = async (record: TeacherAttendance) => {
    if (!record.checkInSelfieUrl) return;
    setSelfieModal({
      teacherName: record.teacher?.fullName ?? 'Guru / PTK',
      status: record.status,
      checkInTime: record.checkInTime,
      distance: record.checkInDistance,
      notes: record.notes,
      imageUrl: null,
      isLoading: true,
    });

    const signedUrl = await attendanceService.getSignedSelfieUrl(
      record.checkInSelfieUrl
    );
    setSelfieModal((prev) =>
      prev ? { ...prev, imageUrl: signedUrl, isLoading: false } : null
    );
  };

  // Fungsi Toggle Sorting Header Kolom (Klik 1: ASC ▲ -> Klik 2: DESC ▼ -> Klik 3: Reset)
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

  // Filter & Urutkan Data Siswa
  const filteredStudents = useMemo(() => {
    const filtered = studentRecords.filter((r) => {
      const matchesClass =
        selectedClassId === 'ALL' || r.student?.classId === selectedClassId;
      const matchesSearch =
        !searchQuery.trim() ||
        r.student?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.student?.nisn?.includes(searchQuery.trim()) ||
        (r.student?.nis && r.student.nis.includes(searchQuery.trim()));
      return matchesClass && matchesSearch;
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
        case 'status':
          return (
            (STATUS_LABELS[a.status] ?? a.status).localeCompare(
              STATUS_LABELS[b.status] ?? b.status,
              'id'
            ) * dir
          );
        case 'time':
          return (a.time ?? '').localeCompare(b.time ?? '') * dir;
        default:
          return 0;
      }
    });
  }, [studentRecords, selectedClassId, searchQuery, studentSort]);

  // Filter & Urutkan Data Guru
  const filteredTeachers = useMemo(() => {
    const filtered = teacherRecords.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.teacher?.fullName?.toLowerCase().includes(q) ||
        r.teacher?.nip?.includes(searchQuery.trim()) ||
        r.teacher?.nuptk?.includes(searchQuery.trim())
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
        case 'status':
          return (
            (STATUS_LABELS[a.status] ?? a.status).localeCompare(
              STATUS_LABELS[b.status] ?? b.status,
              'id'
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
  }, [teacherRecords, searchQuery, teacherSort]);

  // 4. Hapus 1 Baris Data Absensi (Khusus SUPER_ADMIN)
  const handleConfirmDeleteSingle = async () => {
    if (!deleteTarget || !isSuperAdmin) return;
    setIsDeletingRow(true);
    try {
      // Hapus file selfie dari storage jika ada
      if (deleteTarget.selfieUrl) {
        await supabase.storage
          .from('attendance-selfies')
          .remove([deleteTarget.selfieUrl]);
      }

      const { error } = await supabase
        .from('attendances')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      showToast(
        'success',
        `Data absensi ${deleteTarget.name} (${deleteTarget.date}) berhasil dihapus.`
      );
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      showToast(
        'error',
        err.message ??
        'Gagal menghapus data. Pastikan kebijakan RLS DELETE untuk SUPER_ADMIN sudah aktif.'
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
      } catch (err: any) {
        showToast('error', err.message ?? 'Gagal menghitung arsip lama.');
        setOldRecordsCount(0);
      } finally {
        setIsCheckingOldRecords(false);
      }
    },
    [isSuperAdmin, cutoffDate, activeSchoolId]
  );

  useEffect(() => {
    if (purgeModalOpen && isSuperAdmin) {
      checkOldAttendanceRecords(purgeScope);
    }
  }, [purgeModalOpen, purgeScope, isSuperAdmin, checkOldAttendanceRecords]);

  // Ekspor Backup CSV Arsip Lama (> 2 Tahun) Sebelum Dihapus
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

      const rows = data ?? [];
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
    } catch (err: any) {
      showToast('error', err.message ?? 'Gagal membuat file backup CSV.');
    }
  };

  // Eksekusi Hapus Permanen Arsip > 2 Tahun
  const handlePurgeOldRecords = async () => {
    if (!isSuperAdmin) return;
    setIsPurgingOldRecords(true);
    try {
      // 1. Ambil daftar file foto selfie / lampiran yang akan ikut dibersihkan
      let fetchFilesQuery = supabase
        .from('attendances')
        .select('checkInSelfieUrl, attachmentUrl')
        .lt('date', cutoffDate);

      if (purgeScope === 'CURRENT_SCHOOL' && activeSchoolId) {
        fetchFilesQuery = fetchFilesQuery.eq('schoolId', activeSchoolId);
      }

      const { data: oldFiles } = await fetchFilesQuery;
      const pathsToRemove = (oldFiles ?? [])
        .flatMap((row: any) => [row.checkInSelfieUrl, row.attachmentUrl])
        .filter((p): p is string => Boolean(p));

      if (pathsToRemove.length > 0) {
        await supabase.storage
          .from('attendance-selfies')
          .remove(pathsToRemove);
      }

      // 2. Hapus baris database yang lebih tua dari cutoffDate
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
        `Pembersihan selesai! ${oldRecordsCount ?? 0} arsip absensi sebelum ${cutoffDate} telah dihapus.`
      );
      setPurgeModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(
        'error',
        err.message ??
        'Gagal menghapus arsip lama. Periksa kebijakan RLS DELETE pada tabel attendances.'
      );
    } finally {
      setIsPurgingOldRecords(false);
    }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Ekspor Laporan CSV (Kompatibel dengan Microsoft Excel)
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
          'Nama Guru / PTK',
          'NIP',
          'NUPTK',
          'Status',
          'Check-In',
          'Check-Out',
          'Jarak (m)',
          'Status GPS',
          'Keterangan',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredTeachers.forEach((r, idx) => {
        lines.push(
          [
            idx + 1,
            r.date,
            r.teacher?.fullName ?? '-',
            r.teacher?.nip ?? '-',
            r.teacher?.nuptk ?? '-',
            STATUS_LABELS[r.status] ?? r.status,
            formatTime(r.checkInTime),
            formatTime(r.checkOutTime),
            r.checkInDistance != null ? Math.round(r.checkInDistance) : '-',
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
          'Nama Siswa',
          'NISN',
          'Kelas',
          'Status',
          'Waktu Masuk',
          'Metode Pencatatan',
          'Keterangan',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredStudents.forEach((r, idx) => {
        lines.push(
          [
            idx + 1,
            r.date,
            r.student?.fullName ?? '-',
            r.student?.nisn ?? '-',
            r.student?.classes?.name ?? '-',
            STATUS_LABELS[r.status] ?? r.status,
            formatTime(r.time),
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
              <span>Arsip &gt; {ARCHIVE_RETENTION_YEARS} Tahun</span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Absensi</h1>
          <p className="page-subtitle">
            Monitor kehadiran harian siswa dan guru secara real-time
          </p>
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

      {/* Toolbar Pencarian & Filter Kelas */}
      {activeTab !== 'overview' && (
        <div className="table-toolbar flex flex-wrap gap-3">
          <input
            type="text"
            placeholder={
              activeTab === 'students'
                ? 'Cari nama siswa, NISN, atau NIS...'
                : 'Cari nama guru, NIP, atau NUPTK...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input search-input flex-1 min-w-55"
          />

          {activeTab === 'students' && classes.length > 0 && (
            <select
              className="form-input min-w-45"
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
          </div>
        )}

        {/* Students Tab (Dengan Kolom No, Sorting Kolom, & Hapus Super Admin) */}
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
                        title="Klik untuk mengurutkan Nama Siswa"
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
                        title="Klik untuk mengurutkan Kelas"
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
                        title="Klik untuk mengurutkan NISN"
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
                        title="Klik untuk mengurutkan Status"
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
                        title="Klik untuk mengurutkan Waktu"
                      >
                        Waktu
                        {renderSortIcon(
                          studentSort?.key === 'time',
                          studentSort?.direction
                        )}
                      </th>
                      <th>Dicatat Oleh</th>
                      <th>Keterangan</th>
                      {isSuperAdmin && <th className="text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((record, index) => (
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
                                (STATUS_COLORS[record.status] ?? '#6B7280') +
                                '20',
                              color: STATUS_COLORS[record.status] ?? '#6B7280',
                            }}
                          >
                            {STATUS_LABELS[record.status] ?? record.status}
                          </span>
                        </td>
                        <td className="td-mono">{formatTime(record.time)}</td>
                        <td>
                          {record.recordedBy
                            ? 'Admin/Wali Kelas'
                            : 'Kiosk/Mandiri'}
                        </td>
                        <td className="text-sm opacity-75">
                          {record.notes ?? '-'}
                        </td>
                        {isSuperAdmin && (
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  id: record.id,
                                  name: record.student?.fullName ?? 'Siswa',
                                  date: record.date,
                                })
                              }
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                              title="Hapus data absensi ini (Super Admin)"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Teachers Tab (Dengan Kolom No, Sorting Kolom, & Hapus Super Admin) */}
        {activeTab === 'teachers' && (
          <div className="data-card">
            {isLoading ? (
              <div className="table-loading">
                <RefreshCw size={24} className="spin" /> Memuat data...
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>Belum ada data absensi guru untuk tanggal ini</p>
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
                        title="Klik untuk mengurutkan Nama Guru / PTK"
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
                        title="Klik untuk mengurutkan NIP / NUPTK"
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
                        title="Klik untuk mengurutkan Status"
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
                        title="Klik untuk mengurutkan jam Check-In"
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
                        title="Klik untuk mengurutkan jam Check-Out"
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
                        title="Klik untuk mengurutkan Jarak"
                      >
                        Lokasi & Jarak
                        {renderSortIcon(
                          teacherSort?.key === 'checkInDistance',
                          teacherSort?.direction
                        )}
                      </th>
                      <th>GPS Valid</th>
                      <th>Foto Selfie</th>
                      <th>Keterangan</th>
                      {isSuperAdmin && <th className="text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((record, index) => (
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
                                (STATUS_COLORS[record.status] ?? '#6B7280') +
                                '20',
                              color: STATUS_COLORS[record.status] ?? '#6B7280',
                            }}
                          >
                            {STATUS_LABELS[record.status] ?? record.status}
                          </span>
                        </td>
                        <td className="td-mono">
                          {formatTime(record.checkInTime)}
                        </td>
                        <td className="td-mono">
                          {formatTime(record.checkOutTime)}
                        </td>
                        <td className="td-mono text-xs">
                          {record.checkInLat != null &&
                            record.checkInLng != null ? (
                            <a
                              href={`https://maps.google.com/?q=${record.checkInLat},${record.checkInLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="gps-link"
                            >
                              <MapPin size={12} />
                              {record.checkInDistance != null
                                ? `${Math.round(record.checkInDistance)}m`
                                : 'Peta'}
                            </a>
                          ) : (
                            '-'
                          )}
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
                        <td>
                          {record.checkInSelfieUrl ? (
                            <button
                              type="button"
                              onClick={() => handlePreviewSelfie(record)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition"
                            >
                              <Camera size={13} />
                              Lihat Foto
                            </button>
                          ) : (
                            <span className="text-xs opacity-40">-</span>
                          )}
                        </td>
                        <td className="text-xs opacity-75">
                          {record.notes ?? '-'}
                        </td>
                        {isSuperAdmin && (
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  id: record.id,
                                  name:
                                    record.teacher?.fullName ?? 'Guru / PTK',
                                  date: record.date,
                                  selfieUrl: record.checkInSelfieUrl,
                                })
                              }
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                              title="Hapus data absensi ini (Super Admin)"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          MODAL KONFIRMASI HAPUS SATUAN (KHUSUS SUPER_ADMIN)
      ==================================================================== */}
      <AnimatePresence>
        {deleteTarget && isSuperAdmin && (
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
                    <strong>{deleteTarget.date}</strong>. Tindakan ini tidak
                    dapat dibatalkan.
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
                    Pembersihan Arsip &gt; {ARCHIVE_RETENTION_YEARS} Tahun
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
                  Fitur ini menghapus catatan absensi lama beserta lampiran foto
                  selfie yang tercatat sebelum tanggal{' '}
                  <strong className="text-amber-500">{cutoffDate}</strong>{' '}
                  (lebih dari {ARCHIVE_RETENTION_YEARS} tahun yang lalu) untuk
                  menjaga performa database tetap ringan.
                </p>

                {/* Pilihan Cakupan Pembersihan */}
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

                {/* Status Jumlah Arsip Ditemukan */}
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

              {/* Tombol Backup CSV & Hapus */}
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

      {/* Modal Pratinjau Foto Selfie Guru */}
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
              className="data-card max-w-md w-full p-5 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-base">
                    {selfieModal.teacherName}
                  </h3>
                  <p className="text-xs opacity-70">
                    Check-In: {formatTime(selfieModal.checkInTime)}
                    {selfieModal.distance != null
                      ? ` • Jarak: ${Math.round(selfieModal.distance)} m`
                      : ''}
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

              <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 min-h-65 flex items-center justify-center">
                {selfieModal.isLoading ? (
                  <div className="flex flex-col items-center gap-2 text-xs opacity-75">
                    <RefreshCw size={24} className="spin" />
                    <span>Memuat foto dari penyimpanan aman...</span>
                  </div>
                ) : selfieModal.imageUrl ? (
                  <img
                    src={selfieModal.imageUrl}
                    alt={`Selfie ${selfieModal.teacherName}`}
                    className="w-full max-h-95 object-contain"
                  />
                ) : (
                  <p className="text-xs text-red-400 p-4 text-center">
                    Foto tidak dapat dimuat atau Anda tidak memiliki hak akses
                    melihat berkas ini.
                  </p>
                )}
              </div>

              {selfieModal.notes && (
                <div className="mt-3 p-2.5 rounded-lg bg-white/5 text-xs flex items-start gap-2">
                  <FileText size={14} className="mt-0.5 opacity-70 shrink-0" />
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