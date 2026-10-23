import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, GraduationCap, Clock, CheckCircle, XCircle,
  AlertCircle, Calendar, Download, RefreshCw, MapPin, Shield
} from 'lucide-react';
import { attendanceService } from '../services/attendance.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { StudentAttendance, TeacherAttendance, AttendanceSummary } from '../types/attendance.types';

type ActiveTab = 'overview' | 'students' | 'teachers';

const STATUS_COLORS: Record<string, string> = {
  HADIR: '#10B981',
  TERLAMBAT: '#F59E0B',
  SAKIT: '#8B5CF6',
  IZIN: '#3B82F6',
  ALPA: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  SAKIT: 'Sakit',
  IZIN: 'Izin',
  ALPA: 'Alpa/Alpha',
};

/**
 * Dashboard Rekap Absensi Admin - Monitoring seluruh absensi siswa & guru
 */
export function AttendanceDashboardPage() {
  const { school } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [studentRecords, setStudentRecords] = useState<StudentAttendance[]>([]);
  const [teacherRecords, setTeacherRecords] = useState<TeacherAttendance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    if (!school?.id) return;
    setIsLoading(true);
    try {
      const [sum, students, teachers] = await Promise.all([
        attendanceService.getSummary(school.id, selectedDate),
        attendanceService.getStudentAttendances({ schoolId: school.id, date: selectedDate, limit: 200 }),
        attendanceService.getTeacherAttendances({ schoolId: school.id, date: selectedDate, limit: 200 }),
      ]);
      setSummary(sum);
      setStudentRecords(students.data);
      setTeacherRecords(teachers.data);
    } catch (err) {
      console.error('[AttendanceDashboard] Load error:', err);
    }
    setIsLoading(false);
  }, [school?.id, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStudents = studentRecords.filter((r) =>
    !searchQuery || r.student?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.student?.nisn?.includes(searchQuery)
  );

  const filteredTeachers = teacherRecords.filter((r) =>
    !searchQuery || r.teacher?.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (iso?: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Absensi</h1>
          <p className="page-subtitle">Monitor kehadiran siswa dan guru</p>
        </div>
        <div className="page-header-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="form-input date-picker"
          />
          <button className="btn-secondary" onClick={loadData} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
          <button className="btn-secondary">
            <Download size={16} />
            Ekspor
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="attendance-summary-grid">
          {/* Siswa */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }} className="summary-card">
            <div className="summary-card-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
              <GraduationCap size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Hadir Siswa</p>
              <p className="summary-card-value">{summary.studentPresent}</p>
              <p className="summary-card-sub text-green-400">{summary.studentPercentage}% kehadiran</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="summary-card">
            <div className="summary-card-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
              <Clock size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Terlambat</p>
              <p className="summary-card-value">{summary.studentLate}</p>
              <p className="summary-card-sub">siswa terlambat</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="summary-card">
            <div className="summary-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
              <XCircle size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Alpa</p>
              <p className="summary-card-value">{summary.studentAbsent}</p>
              <p className="summary-card-sub">siswa tidak hadir</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="summary-card">
            <div className="summary-card-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>
              <Users size={24} />
            </div>
            <div className="summary-card-content">
              <p className="summary-card-label">Hadir Guru</p>
              <p className="summary-card-value">{summary.teacherPresent}</p>
              <p className="summary-card-sub text-blue-400">{summary.teacherPercentage}% kehadiran</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-nav">
        {(['overview', 'students', 'teachers'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && <Calendar size={16} />}
            {tab === 'students' && <GraduationCap size={16} />}
            {tab === 'teachers' && <Users size={16} />}
            {tab === 'overview' ? 'Ringkasan' : tab === 'students' ? 'Absen Siswa' : 'Absen Guru'}
          </button>
        ))}
      </div>

      {/* Search (untuk tab students/teachers) */}
      {activeTab !== 'overview' && (
        <div className="table-toolbar">
          <input
            type="text"
            placeholder={activeTab === 'students' ? 'Cari nama siswa atau NISN...' : 'Cari nama guru...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input search-input"
          />
        </div>
      )}

      {/* Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && summary && (
          <div className="overview-grid">
            {/* Distribusi status siswa */}
            <div className="data-card">
              <h3 className="card-section-title">Distribusi Kehadiran Siswa</h3>
              <div className="status-distribution">
                {[
                  { key: 'HADIR', count: summary.studentPresent },
                  { key: 'TERLAMBAT', count: summary.studentLate },
                  { key: 'SAKIT', count: summary.studentSick },
                  { key: 'IZIN', count: summary.studentPermission },
                  { key: 'ALPA', count: summary.studentAbsent },
                ].map(({ key, count }) => {
                  const total = summary.studentPresent + summary.studentLate + summary.studentSick + summary.studentPermission + summary.studentAbsent;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={key} className="status-dist-item">
                      <div className="status-dist-label">
                        <span className="status-dot" style={{ background: STATUS_COLORS[key] }} />
                        <span>{STATUS_LABELS[key]}</span>
                        <span className="status-dist-count">{count} siswa</span>
                      </div>
                      <div className="status-dist-bar-bg">
                        <div
                          className="status-dist-bar"
                          style={{ width: `${pct}%`, background: STATUS_COLORS[key] }}
                        />
                      </div>
                      <span className="status-dist-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribusi status guru */}
            <div className="data-card">
              <h3 className="card-section-title">Distribusi Kehadiran Guru</h3>
              <div className="status-distribution">
                {[
                  { key: 'HADIR', count: summary.teacherPresent },
                  { key: 'TERLAMBAT', count: summary.teacherLate },
                  { key: 'ALPA', count: summary.teacherTotal - summary.teacherPresent - summary.teacherLate },
                ].map(({ key, count }) => {
                  const total = summary.teacherTotal || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={key} className="status-dist-item">
                      <div className="status-dist-label">
                        <span className="status-dot" style={{ background: STATUS_COLORS[key] }} />
                        <span>{STATUS_LABELS[key]}</span>
                        <span className="status-dist-count">{count} guru</span>
                      </div>
                      <div className="status-dist-bar-bg">
                        <div className="status-dist-bar" style={{ width: `${pct}%`, background: STATUS_COLORS[key] }} />
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
              <div className="table-loading"><RefreshCw size={24} className="spin" /> Memuat data...</div>
            ) : filteredStudents.length === 0 ? (
              <div className="table-empty">
                <AlertCircle size={40} className="opacity-30" />
                <p>Belum ada data absensi siswa untuk tanggal ini</p>
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
                        <td className="td-name">{record.student?.fullName ?? '-'}</td>
                        <td>{record.student?.classes?.name ?? '-'}</td>
                        <td className="td-mono">{record.student?.nisn ?? '-'}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              background: (STATUS_COLORS[record.status] ?? '#6B7280') + '20',
                              color: STATUS_COLORS[record.status] ?? '#6B7280',
                            }}
                          >
                            {STATUS_LABELS[record.status] ?? record.status}
                          </span>
                        </td>
                        <td className="td-mono">{formatTime(record.time)}</td>
                        <td>{record.recordedBy ? 'Admin/Wali Kelas' : 'Kiosk/Mandiri'}</td>
                        <td className="text-sm opacity-60">{record.notes ?? '-'}</td>
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
              <div className="table-loading"><RefreshCw size={24} className="spin" /> Memuat data...</div>
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
                      <th>Nama Guru</th>
                      <th>NIP</th>
                      <th>Status</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Lokasi GPS</th>
                      <th>Jarak</th>
                      <th>GPS Valid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((record) => (
                      <tr key={record.id}>
                        <td className="td-name">{record.teacher?.fullName ?? '-'}</td>
                        <td className="td-mono text-sm">{record.teacher?.nip ?? '-'}</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              background: (STATUS_COLORS[record.status] ?? '#6B7280') + '20',
                              color: STATUS_COLORS[record.status] ?? '#6B7280',
                            }}
                          >
                            {STATUS_LABELS[record.status] ?? record.status}
                          </span>
                        </td>
                        <td className="td-mono">{formatTime(record.checkInTime)}</td>
                        <td className="td-mono">{formatTime(record.checkOutTime)}</td>
                        <td className="td-mono text-xs">
                          {record.checkInLat
                            ? <a
                                href={`https://maps.google.com/?q=${record.checkInLat},${record.checkInLng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="gps-link"
                              >
                                <MapPin size={12} />
                                {record.checkInLat?.toFixed(4)}, {record.checkInLng?.toFixed(4)}
                              </a>
                            : '-'}
                        </td>
                        <td className="td-mono text-sm">
                          {record.checkInDistance != null ? `${Math.round(record.checkInDistance)}m` : '-'}
                        </td>
                        <td>
                          {record.checkInTime ? (
                            record.isCheckInMock ? (
                              <span className="gps-invalid"><XCircle size={14} /> Palsu</span>
                            ) : (
                              <span className="gps-valid"><Shield size={14} /> Valid</span>
                            )
                          ) : '-'}
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
    </div>
  );
}
