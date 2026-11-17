// src/modules/attendance/pages/StudentKioskPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, Clock, Users, Scan,
  RotateCcw, Wifi, WifiOff, School, MapPin
} from 'lucide-react';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString, isAfterDeadline } from '../services/gps.utils';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { AttendanceMap } from '@/components/map/AttendanceMap';

type KioskState = 'idle' | 'scanning' | 'found' | 'success' | 'already' | 'error';

interface FoundStudent {
  id: string;
  fullName: string;
  nisn: string;
  nis?: string;
  photoUrl?: string;
  className?: string;
}

// Struktur hasil pencarian siswa beserta relasi tabel classes dari Supabase
interface StudentLookupResult {
  id: string;
  fullName: string;
  nisn: string;
  nis?: string | null;
  photoUrl?: string | null;
  classes?: { name: string } | Array<{ name: string }> | null;
}

export function StudentKioskPage() {
  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [simSchools, setSimSchools] = useState<Array<{ id: string; name: string; npsn: string }>>([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin ? (simSchoolId || school?.id || '') : (school?.id || '');

  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [foundStudent, setFoundStudent] = useState<FoundStudent | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [todayStats, setTodayStats] = useState({ present: 0, late: 0, total: 0 });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [recentList, setRecentList] = useState<Array<{ name: string; status: string; time: string }>>([]);
  const [autoResetTimer, setAutoResetTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [schoolCoords, setSchoolCoords] = useState<{
    latitude: number;
    longitude: number;
    radius: number;
    deadline: string;
  } | null>(null);

  const today = getLocalDateString();
  const deadline = schoolCoords?.deadline ?? '07:30';
  const isLate = isAfterDeadline(deadline);

  useEffect(() => {
    if (!isSuperAdmin) return;
    attendanceService.getAllSchoolsForSimulation().then((list) => {
      setSimSchools(list);
      if (school?.id) setSimSchoolId(school.id);
      else if (list.length > 0) setSimSchoolId(list[0].id);
    }).catch(console.error);
  }, [isSuperAdmin, school?.id]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadStats = useCallback(async () => {
    if (!activeSchoolId) return;
    try {
      const summary = await attendanceService.getSummary(activeSchoolId, today);
      setTodayStats({
        present: summary.studentPresent,
        late: summary.studentLate,
        total: summary.studentTotal,
      });
    } catch {
      // Abaikan error statistik
    }
  }, [activeSchoolId, today]);

  useEffect(() => {
    if (!activeSchoolId) return;
    attendanceService
      .getSchoolCoordinates(activeSchoolId)
      .then((coords) => {
        if (coords && coords.latitude != null && coords.longitude != null) {
          setSchoolCoords({
            latitude: coords.latitude,
            longitude: coords.longitude,
            radius: coords.attendanceRadiusMeters || 200,
            deadline: coords.settings.checkInDeadline,
          });
        } else {
          setSchoolCoords(null);
        }
      })
      .catch(console.error);
  }, [activeSchoolId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const resetToIdle = useCallback(() => {
    if (autoResetTimer) clearTimeout(autoResetTimer);
    setKioskState('idle');
    setFoundStudent(null);
    setResultMessage('');
  }, [autoResetTimer]);

  const performCheckIn = useCallback(
    async (studentId: string, studentName: string) => {
      if (!activeSchoolId) return;
      try {
        const lateNow = isAfterDeadline(deadline);
        const status = lateNow ? 'TERLAMBAT' : 'HADIR';
        const result = await attendanceService.studentCheckIn({
          schoolId: activeSchoolId,
          studentId,
          date: today,
          status,
        });

        if (!result.success) {
          setResultMessage(`${studentName} sudah absen hari ini.`);
          setKioskState('already');
        } else {
          setResultMessage(lateNow ? `${studentName} - TERLAMBAT` : `${studentName} - HADIR`);
          setKioskState('success');
          setTodayStats((prev) => ({
            ...prev,
            present: lateNow ? prev.present : prev.present + 1,
            late: lateNow ? prev.late + 1 : prev.late,
          }));
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          setRecentList((prev) => [{ name: studentName, status, time: timeStr }, ...prev.slice(0, 9)]);
        }

        const t = setTimeout(resetToIdle, 4500);
        setAutoResetTimer(t);
      } catch {
        setResultMessage('Gagal menyimpan absen. Periksa koneksi internet.');
        setKioskState('error');
        const t = setTimeout(resetToIdle, 4000);
        setAutoResetTimer(t);
      }
    },
    [activeSchoolId, deadline, today, resetToIdle]
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (!activeSchoolId) return;
      setKioskState('scanning');

      try {
        const student = await attendanceService.findStudentByNisOrNisn(activeSchoolId, code.trim());

        if (!student) {
          setResultMessage(`Siswa dengan NISN/NIS "${code}" tidak ditemukan.`);
          setKioskState('error');
          const t = setTimeout(resetToIdle, 4000);
          setAutoResetTimer(t);
          return;
        }

        const typedStudent = student as StudentLookupResult;
        const resolvedClassName = Array.isArray(typedStudent.classes)
          ? typedStudent.classes[0]?.name
          : typedStudent.classes?.name;

        setFoundStudent({
          id: typedStudent.id,
          fullName: typedStudent.fullName,
          nisn: typedStudent.nisn,
          nis: typedStudent.nis ?? undefined,
          photoUrl: typedStudent.photoUrl ?? undefined,
          className: resolvedClassName,
        });
        setKioskState('found');

        setTimeout(() => performCheckIn(typedStudent.id, typedStudent.fullName), 1200);
      } catch {
        setResultMessage('Terjadi kesalahan. Periksa koneksi internet.');
        setKioskState('error');
        const t = setTimeout(resetToIdle, 4000);
        setAutoResetTimer(t);
      }
    },
    [activeSchoolId, performCheckIn, resetToIdle]
  );

  const currentTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const currentDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeSchoolName = isSuperAdmin
    ? simSchools.find((s) => s.id === activeSchoolId)?.name ?? 'Mode Simulasi Kiosk'
    : school?.name ?? 'SekolahERP';

  return (
    <div className="kiosk-page">
      <div className="kiosk-header">
        <div className="kiosk-school-info">
          <School size={28} className="kiosk-school-icon" />
          <div>
            <h1 className="kiosk-school-name">{activeSchoolName}</h1>
            <p className="kiosk-date">{currentDate}</p>
          </div>
        </div>
        <div className="kiosk-header-right">
          {isSuperAdmin && simSchools.length > 0 && (
            <select
              className="form-input text-xs py-1 px-2"
              value={simSchoolId}
              onChange={(e) => setSimSchoolId(e.target.value)}
            >
              {simSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  Simulasi: {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="kiosk-clock">{currentTime}</div>
          <div className={`kiosk-online-badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      <div className="kiosk-body">
        <div className="kiosk-sidebar">
          <div className="kiosk-stat-card">
            <div className="kiosk-stat-header">
              <Users size={20} />
              <span>Statistik Hari Ini</span>
            </div>
            <div className="kiosk-stat-grid">
              <div className="kiosk-stat-item hadir">
                <span className="kiosk-stat-number">{todayStats.present}</span>
                <span className="kiosk-stat-label">Hadir</span>
              </div>
              <div className="kiosk-stat-item terlambat">
                <span className="kiosk-stat-number">{todayStats.late}</span>
                <span className="kiosk-stat-label">Terlambat</span>
              </div>
              <div className="kiosk-stat-item total">
                <span className="kiosk-stat-number">{todayStats.present + todayStats.late}</span>
                <span className="kiosk-stat-label">Total Absen</span>
              </div>
            </div>
          </div>

          {schoolCoords && (
            <div className="kiosk-stat-card" style={{ marginTop: '1rem' }}>
              <div className="kiosk-stat-header" style={{ marginBottom: '10px' }}>
                <MapPin size={20} />
                <span>Area Absensi Sekolah</span>
              </div>
              <div style={{ borderRadius: '0.5rem', overflow: 'hidden' }}>
                <AttendanceMap
                  schoolLat={schoolCoords.latitude}
                  schoolLng={schoolCoords.longitude}
                  userLat={null}
                  userLng={null}
                  radiusMeters={schoolCoords.radius}
                />
              </div>
            </div>
          )}

          {recentList.length > 0 && (
            <div className="kiosk-recent" style={{ marginTop: '1rem' }}>
              <h3 className="kiosk-recent-title">Absen Terakhir</h3>
              <div className="kiosk-recent-list">
                {recentList.map((item, i) => (
                  <div key={i} className="kiosk-recent-item">
                    <div className="kiosk-recent-info">
                      <span className="kiosk-recent-name">{item.name}</span>
                      <span className="kiosk-recent-time">{item.time}</span>
                    </div>
                    <span className={`kiosk-recent-badge ${item.status === 'HADIR' ? 'hadir' : 'terlambat'}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="kiosk-main">
          <AnimatePresence mode="wait">
            {kioskState === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="kiosk-idle-state"
              >
                <div className="kiosk-scan-icon">
                  <Scan size={80} />
                  <div className="kiosk-scan-pulse" />
                </div>
                <h2 className="kiosk-idle-title">Scan Kartu Pelajar</h2>
                <p className="kiosk-idle-subtitle">
                  Tempelkan kartu pelajar ke scanner, atau masukkan NISN/NIS secara manual
                </p>
                <div className="kiosk-scanner-area">
                  <BarcodeScanner onScan={handleScan} isActive={kioskState === 'idle'} />
                </div>
                {isLate && (
                  <div className="kiosk-late-warning">
                    <Clock size={16} />
                    Waktu melebihi {deadline} — Absen akan dicatat sebagai TERLAMBAT
                  </div>
                )}
              </motion.div>
            )}

            {kioskState === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-scanning-state"
              >
                <div className="kiosk-spinner" />
                <p className="kiosk-scanning-text">Memproses...</p>
              </motion.div>
            )}

            {kioskState === 'found' && foundStudent && (
              <motion.div
                key="found"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-found-state"
              >
                <div className="kiosk-student-avatar">
                  {foundStudent.photoUrl ? (
                    <img src={foundStudent.photoUrl} alt={foundStudent.fullName} />
                  ) : (
                    <div className="kiosk-avatar-placeholder">
                      {foundStudent.fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h2 className="kiosk-student-name">{foundStudent.fullName}</h2>
                <p className="kiosk-student-class">{foundStudent.className}</p>
                <p className="kiosk-student-nisn">NISN: {foundStudent.nisn}</p>
                <div className="kiosk-processing-badge">
                  <div className="kiosk-spinner-sm" />
                  Mencatat absensi...
                </div>
              </motion.div>
            )}

            {kioskState === 'success' && (
              <motion.div
                key="success"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-result-state success"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                >
                  <CheckCircle size={100} />
                </motion.div>
                <h2 className="kiosk-result-title">Absen Berhasil!</h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <p className="kiosk-result-hint">Layar akan reset otomatis...</p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  Absen Berikutnya
                </button>
              </motion.div>
            )}

            {kioskState === 'already' && (
              <motion.div
                key="already"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-result-state already"
              >
                <Clock size={80} />
                <h2 className="kiosk-result-title">Sudah Absen</h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  Kembali
                </button>
              </motion.div>
            )}

            {kioskState === 'error' && (
              <motion.div
                key="error"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-result-state error"
              >
                <XCircle size={80} />
                <h2 className="kiosk-result-title">Gagal</h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  Coba Lagi
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}