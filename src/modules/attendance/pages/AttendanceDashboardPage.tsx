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

type ActiveTab = 'overview' | 'students' | 'teachers';

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

/**
 * Dashboard Rekap Absensi Admin & Pimpinan
 * Fitur: Ringkasan Populasi Aktif, Pratinjau Selfie PTK, Filter Kelas, Mode Super Admin, & Ekspor CSV
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

  // Filter Data Siswa
  const filteredStudents = useMemo(() => {
    return studentRecords.filter((r) => {
      const matchesClass =
        selectedClassId === 'ALL' || r.student?.classId === selectedClassId;
      const matchesSearch =
        !searchQuery.trim() ||
        r.student?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.student?.nisn?.includes(searchQuery.trim()) ||
        (r.student?.nis && r.student.nis.includes(searchQuery.trim()));
      return matchesClass && matchesSearch;
    });
  }, [studentRecords, selectedClassId, searchQuery]);

  // Filter Data Guru
  const filteredTeachers = useMemo(() => {
    return teacherRecords.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.teacher?.fullName?.toLowerCase().includes(q) ||
        r.teacher?.nip?.includes(searchQuery.trim()) ||
        r.teacher?.nuptk?.includes(searchQuery.trim())
      );
    });
  }, [teacherRecords, searchQuery]);

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

    // Tambahkan UTF-8 BOM (\uFEFF) agar Excel membaca karakter dengan benar
    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const prefix = activeTab === 'teachers' ? 'Rekap_Absensi_Guru' : 'Rekap_Absensi_Siswa';
    link.href = url;
    link.setAttribute('download', `${prefix}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container">
      {/* Banner Pemilih Sekolah Khusus SUPER_ADMIN */}
      {isSuperAdmin && simSchools.length > 0 && (
        <div
          className="mb-5 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
          style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderColor: 'rgba(139, 92, 246, 0.35)',
          }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-300">
            <FlaskConical size={17} />
            <span>Mode Monitoring Super Admin</span>
          </div>
          <select
            className="form-input min-w-65"
            value={simSchoolId}
            onChange={(e) => setSimSchoolId(e.target.value)}
          >
            {simSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.npsn})
              </option>
            ))}
          </select>
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
          {/* Siswa Hadir */}
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
              <p className="summary-card-sub text-green-400">
                {summary.studentPercentage}% kehadiran aktif
              </p>
            </div>
          </motion.div>

          {/* Terlambat */}
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

          {/* Alpa & Belum Absen */}
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

          {/* Guru Hadir */}
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
              <p className="summary-card-sub text-blue-400">
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
            {/* Distribusi Status Siswa */}
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

            {/* Distribusi Status Guru */}
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
                      <th>Nama Siswa</th>
                      <th>Kelas</th>
                      <th>NISN</th>
                      <th>Status</th>
                      <th>Waktu</th>
                      <th>Dicatat Oleh</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((record) => (
                      <tr key={record.id}>
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
                      </tr>
                    ))}
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
                <p>Belum ada data absensi guru untuk tanggal ini</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nama Guru / PTK</th>
                      <th>NIP / NUPTK</th>
                      <th>Status</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Lokasi & Jarak</th>
                      <th>GPS Valid</th>
                      <th>Foto Selfie</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((record) => (
                      <tr key={record.id}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

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