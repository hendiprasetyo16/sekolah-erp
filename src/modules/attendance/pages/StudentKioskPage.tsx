// src/modules/attendance/pages/StudentKioskPage.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Clock,
  Users,
  RotateCcw,
  Wifi,
  WifiOff,
  School,
  MapPin,
  LogIn,
  LogOut,
  AlertTriangle,
  Lock,
  Unlock,
  Sparkles,
  CalendarOff,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString, isAfterDeadline } from '../services/gps.utils';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { AttendanceMap } from '@/components/map/AttendanceMap';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';
import { dispatchStudentAttendanceWhatsApp } from '../services/whatsappService';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const MIN_MINUTES_BETWEEN_IN_AND_OUT = 15; // Jeda minimal (menit) agar double-scan pagi tidak dianggap pulang
const KIOSK_RESET_DELAY_MS = 4000;        // Waktu reset layar otomatis setelah scan (milidetik)
const STUDENT_PREVIEW_DELAY_MS = 850;     // Durasi tampil profil siswa sebelum simpan otomatis
const FALLBACK_STUDENT_START = '07:00';
const FALLBACK_STUDENT_CHECKOUT_START = '11:30';
const FALLBACK_STUDENT_END = '13:30';
const DEFAULT_KIOSK_SPECIAL_EVENT = 'Kegiatan Khusus Sekolah';

type KioskState = 'idle' | 'scanning' | 'found' | 'success' | 'already' | 'error';
type KioskScanMode = 'AUTO' | 'CHECK_IN' | 'CHECK_OUT';

interface FoundStudent {
  id: string;
  fullName: string;
  nisn: string;
  nis?: string;
  photoUrl?: string;
  className?: string;
}

interface StudentLookupResult {
  id: string;
  fullName: string;
  nisn: string;
  nis?: string | null;
  photoUrl?: string | null;
  classes?: { name: string } | Array<{ name: string }> | null;
}

interface StudentScheduleConfig {
  workStartTime: string;
  lateToleranceMinutes: number;
  workEndTime: string;
  checkOutStartTime: string;
  enableKiosk: boolean;
  enableCheckOut: boolean;
}

/**
 * Menambahkan menit toleransi keterlambatan ke jam masuk standar (HH:mm).
 */
function addMinutesToTime(startTime: string, toleranceMinutes: number): string {
  const [hStr, mStr] = startTime.split(':');
  const h = Number(hStr) || 7;
  const m = Number(mStr) || 0;
  const total = Math.min(23 * 60 + 59, h * 60 + m + Math.max(0, toleranceMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60
  ).padStart(2, '0')}`;
}

export function StudentKioskPage() {
  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string; npsn: string }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  const today = getLocalDateString();

  // Hook terpusat pengunci hari libur & mode kegiatan khusus
  const {
    isLocked: isHolidayLocked,
    isHoliday,
    holidayName,
    isSpecialEventActive,
    specialEventReason,
    canManageOverride,
    isLoading: isCheckingHoliday,
    isToggling: isTogglingHoliday,
    activateSpecialEvent,
    deactivateSpecialEvent,
  } = useStudentHolidayLock({
    schoolId: activeSchoolId,
    targetDate: today,
  });

  const [specialEventInput, setSpecialEventInput] = useState<string>('');
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [scanMode, setScanMode] = useState<KioskScanMode>('AUTO');
  const [lastActionType, setLastActionType] = useState<'CHECK_IN' | 'CHECK_OUT'>(
    'CHECK_IN'
  );
  const [foundStudent, setFoundStudent] = useState<FoundStudent | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [todayStats, setTodayStats] = useState({
    present: 0,
    late: 0,
    checkedOut: 0,
    total: 0,
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [recentList, setRecentList] = useState<
    Array<{
      name: string;
      status: string;
      action: 'DATANG' | 'PULANG';
      time: string;
    }>
  >([]);

  // Ref aman untuk timer & kunci anti double-scan (penting untuk APK Android & scanner cepat)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingLockRef = useRef<boolean>(false);

  const [schoolCoords, setSchoolCoords] = useState<{
    latitude: number;
    longitude: number;
    radius: number;
  } | null>(null);

  const [studentConfig, setStudentConfig] = useState<StudentScheduleConfig>({
    workStartTime: FALLBACK_STUDENT_START,
    lateToleranceMinutes: 0,
    workEndTime: FALLBACK_STUDENT_END,
    checkOutStartTime: FALLBACK_STUDENT_CHECKOUT_START,
    enableKiosk: true,
    enableCheckOut: true,
  });

  const studentDeadline = useMemo(
    () =>
      addMinutesToTime(
        studentConfig.workStartTime,
        studentConfig.lateToleranceMinutes
      ),
    [studentConfig.workStartTime, studentConfig.lateToleranceMinutes]
  );

  const isLateNow = isAfterDeadline(studentDeadline);
  const isCheckOutWindowOpen =
    studentConfig.enableCheckOut &&
    isAfterDeadline(studentConfig.checkOutStartTime);

  // Bersihkan seluruh timer saat komponen ditutup / pindah halaman
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (processTimerRef.current) clearTimeout(processTimerRef.current);
    };
  }, []);

  // Pembaruan jam layar Kiosk setiap 30 detik (hemat daya saat APK di-background)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        setNowTick(new Date());
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Muat statistik siswa hari ini (termasuk jumlah yang sudah pulang)
  const loadStats = useCallback(async () => {
    if (!activeSchoolId) return;
    try {
      const [summary, checkedOutRes] = await Promise.all([
        attendanceService.getSummary(activeSchoolId, today),
        supabase
          .from('attendances')
          .select('id', { count: 'exact', head: true })
          .eq('schoolId', activeSchoolId)
          .eq('date', today)
          .eq('type', 'SISWA')
          .not('checkOutTime', 'is', null),
      ]);

      setTodayStats({
        present: summary.studentPresent,
        late: summary.studentLate,
        checkedOut: checkedOutRes.count ?? 0,
        total: summary.studentTotal,
      });
    } catch {
      // Abaikan error statistik sementara
    }
  }, [activeSchoolId, today]);

  // Muat koordinat sekolah + jadwal khusus siswa dari tabel schools
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
          });
        } else {
          setSchoolCoords(null);
        }
      })
      .catch(console.error);

    supabase
      .from('schools')
      .select('*')
      .eq('id', activeSchoolId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setStudentConfig({
          workStartTime: data.studentWorkStartTime || FALLBACK_STUDENT_START,
          lateToleranceMinutes: Math.max(
            0,
            Number(data.studentLateToleranceMinutes) || 0
          ),
          workEndTime: data.studentWorkEndTime || FALLBACK_STUDENT_END,
          checkOutStartTime:
            data.studentCheckOutStartTime || FALLBACK_STUDENT_CHECKOUT_START,
          enableKiosk:
            typeof data.enableStudentKiosk === 'boolean'
              ? data.enableStudentKiosk
              : true,
          enableCheckOut:
            typeof data.enableStudentCheckOut === 'boolean'
              ? data.enableStudentCheckOut
              : true,
        });
      });
  }, [activeSchoolId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const resetToIdle = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (processTimerRef.current) clearTimeout(processTimerRef.current);
    processingLockRef.current = false;
    setKioskState('idle');
    setFoundStudent(null);
    setResultMessage('');
  }, []);

  const scheduleAutoReset = useCallback(
    (delayMs: number = KIOSK_RESET_DELAY_MS) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, delayMs);
    },
    [resetToIdle]
  );

  // Aktivasi Mode Kegiatan Khusus di Kiosk
  const handleActivateSpecialEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await activateSpecialEvent(
        specialEventInput.trim() || DEFAULT_KIOSK_SPECIAL_EVENT
      );
      setSpecialEventInput('');
    } catch {
      setResultMessage('Gagal mengaktifkan mode kegiatan khusus.');
      setKioskState('error');
      scheduleAutoReset();
    }
  };

  // Proses Pencatatan Datang (Check-In) atau Pulang (Check-Out)
  const processStudentScan = useCallback(
    async (student: FoundStudent) => {
      if (!activeSchoolId) {
        processingLockRef.current = false;
        return;
      }

      if (isHolidayLocked) {
        setResultMessage(
          `Kiosk terkunci karena ${holidayName || 'Hari Libur'}.`
        );
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
          now.getMinutes()
        ).padStart(2, '0')}`;

        // Cek apakah siswa sudah punya data absensi hari ini
        const { data: existingAtt, error: fetchErr } = await supabase
          .from('attendances')
          .select('id, status, time, checkInTime, checkOutTime')
          .eq('schoolId', activeSchoolId)
          .eq('studentId', student.id)
          .eq('date', today)
          .eq('type', 'SISWA')
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        // ==================================================================
        // SKENARIO 1: SISWA BELUM ABSEN DATANG HARI INI
        // ==================================================================
        if (!existingAtt) {
          if (scanMode === 'CHECK_OUT') {
            setResultMessage(
              `${student.fullName} belum tercatat absen datang hari ini.`
            );
            setKioskState('error');
            scheduleAutoReset();
            return;
          }

          const lateNow = isAfterDeadline(studentDeadline);
          const status = lateNow ? 'TERLAMBAT' : 'HADIR';

          // CATATAN: Kolom "time" tidak dikirim karena bertipe GENERATED ALWAYS
          // di PostgreSQL (otomatis dihitung dari "checkInTime" zona Asia/Jakarta).
          const { error: insertErr } = await supabase
            .from('attendances')
            .insert({
              schoolId: activeSchoolId,
              studentId: student.id,
              type: 'SISWA',
              date: today,
              status,
              checkInTime: nowIso,
              recordedBy: user?.id ?? null,
            });

          if (insertErr) throw insertErr;

          setLastActionType('CHECK_IN');
          setResultMessage(
            `${student.fullName} — ABSEN DATANG (${status}) pukul ${timeStr}`
          );
          setKioskState('success');

          setTodayStats((prev) => ({
            ...prev,
            present: lateNow ? prev.present : prev.present + 1,
            late: lateNow ? prev.late + 1 : prev.late,
          }));

          setRecentList((prev) => [
            {
              name: student.fullName,
              status,
              action: 'DATANG',
              time: timeStr,
            },
            ...prev.slice(0, 9),
          ]);

          // Kirim notifikasi WhatsApp secara non-blocking agar antrean Kiosk tetap cepat
          void dispatchStudentAttendanceWhatsApp({
            studentId: student.id,
            eventType: 'CHECK_IN',
            timeFormatted: timeStr,
            status,
          });

          scheduleAutoReset();
          return;
        }

        // ==================================================================
        // SKENARIO 2: SISWA SUDAH PUNYA CATATAN HARI INI
        // ==================================================================
        if (['IZIN', 'SAKIT'].includes(existingAtt.status)) {
          setResultMessage(
            `${student.fullName} tercatat ${existingAtt.status} hari ini.`
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        if (existingAtt.checkOutTime) {
          const outTime = new Date(existingAtt.checkOutTime).toLocaleTimeString(
            'id-ID',
            { hour: '2-digit', minute: '2-digit' }
          );
          setResultMessage(
            `${student.fullName} sudah absen datang & pulang (pukul ${outTime}) hari ini.`
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        // Jika fitur absen pulang dimatikan atau operator mengunci mode khusus DATANG
        if (!studentConfig.enableCheckOut || scanMode === 'CHECK_IN') {
          setResultMessage(`${student.fullName} sudah absen datang hari ini.`);
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        // Pengaman Double-Scan: Cek apakah sudah masuk waktu buka absen pulang
        const recordedInIso = existingAtt.checkInTime || existingAtt.time;
        const minutesSinceCheckIn = recordedInIso
          ? Math.floor(
            (now.getTime() - new Date(recordedInIso).getTime()) / 60000
          )
          : 999;

        const isPastCheckOutOpen = isAfterDeadline(
          studentConfig.checkOutStartTime
        );

        if (
          scanMode === 'AUTO' &&
          (!isPastCheckOutOpen ||
            minutesSinceCheckIn < MIN_MINUTES_BETWEEN_IN_AND_OUT)
        ) {
          const inTimeLabel = recordedInIso
            ? new Date(recordedInIso).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })
            : '-';
          setResultMessage(
            `${student.fullName} sudah absen datang pukul ${inTimeLabel}. Absen pulang dibuka mulai pukul ${studentConfig.checkOutStartTime}.`
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        // ==================================================================
        // EKSEKUSI ABSEN PULANG (CHECK-OUT) SISWA
        // ==================================================================
        const { error: updateErr } = await supabase
          .from('attendances')
          .update({
            checkOutTime: nowIso,
          })
          .eq('id', existingAtt.id);

        if (updateErr) throw updateErr;

        setLastActionType('CHECK_OUT');
        setResultMessage(
          `${student.fullName} — ABSEN PULANG tercatat pukul ${timeStr}`
        );
        setKioskState('success');

        setTodayStats((prev) => ({
          ...prev,
          checkedOut: prev.checkedOut + 1,
        }));

        setRecentList((prev) => [
          {
            name: student.fullName,
            status: 'PULANG',
            action: 'PULANG',
            time: timeStr,
          },
          ...prev.slice(0, 9),
        ]);

        // Kirim notifikasi WhatsApp pulang secara non-blocking
        void dispatchStudentAttendanceWhatsApp({
          studentId: student.id,
          eventType: 'CHECK_OUT',
          timeFormatted: timeStr,
          status: existingAtt.status,
        });

        scheduleAutoReset();
      } catch (err) {
        console.error('Gagal menyimpan absen siswa:', err);
        const detail =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Periksa koneksi internet.';
        setResultMessage(`Gagal menyimpan absen: ${detail}`);
        setKioskState('error');
        scheduleAutoReset();
      }
    },
    [
      activeSchoolId,
      isHolidayLocked,
      holidayName,
      today,
      scanMode,
      studentDeadline,
      studentConfig.enableCheckOut,
      studentConfig.checkOutStartTime,
      scheduleAutoReset,
      user?.id,
    ]
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (!activeSchoolId || processingLockRef.current) return;

      if (isHolidayLocked) {
        setResultMessage(
          `Kiosk terkunci karena ${holidayName || 'Hari Libur'}.`
        );
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      if (!studentConfig.enableKiosk) {
        setResultMessage(
          'Mode Kiosk Siswa sedang dinonaktifkan oleh Admin Sekolah.'
        );
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      processingLockRef.current = true;
      setKioskState('scanning');

      try {
        const student = await attendanceService.findStudentByNisOrNisn(
          activeSchoolId,
          code.trim()
        );

        if (!student) {
          setResultMessage(`Siswa dengan NISN/NIS "${code}" tidak ditemukan.`);
          setKioskState('error');
          scheduleAutoReset();
          return;
        }

        const typedStudent = student as StudentLookupResult;
        const resolvedClassName = Array.isArray(typedStudent.classes)
          ? typedStudent.classes[0]?.name
          : typedStudent.classes?.name;

        const mappedStudent: FoundStudent = {
          id: typedStudent.id,
          fullName: typedStudent.fullName,
          nisn: typedStudent.nisn,
          nis: typedStudent.nis ?? undefined,
          photoUrl: typedStudent.photoUrl ?? undefined,
          className: resolvedClassName,
        };

        setFoundStudent(mappedStudent);
        setKioskState('found');

        if (processTimerRef.current) clearTimeout(processTimerRef.current);
        processTimerRef.current = setTimeout(
          () => processStudentScan(mappedStudent),
          STUDENT_PREVIEW_DELAY_MS
        );
      } catch (err) {
        console.error('Gagal mencari data siswa:', err);
        setResultMessage(
          'Terjadi kesalahan saat mencari data siswa. Periksa koneksi internet.'
        );
        setKioskState('error');
        scheduleAutoReset();
      }
    },
    [
      activeSchoolId,
      isHolidayLocked,
      holidayName,
      studentConfig.enableKiosk,
      processStudentScan,
      scheduleAutoReset,
    ]
  );

  const currentTime = nowTick.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentDate = nowTick.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeSchoolName = isSuperAdmin
    ? simSchools.find((s) => s.id === activeSchoolId)?.name ??
    'Mode Simulasi Kiosk'
    : school?.name ?? 'SekolahERP';

  return (
    <div
      className="kiosk-page"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* CSS Responsif untuk Menyeimbangkan Peta & Kamera di Semua Ukuran Monitor */}
      <style>{`
        .kiosk-map-fill > div,
        .kiosk-map-fill .leaflet-container {
          height: 100% !important;
          min-height: 185px !important;
        }
      `}</style>

      <div className="kiosk-header" style={{ flexShrink: 0 }}>
        <div className="kiosk-school-info">
          <School size={28} className="kiosk-school-icon" />
          <div>
            <h1 className="kiosk-school-name">{activeSchoolName}</h1>
            <p className="kiosk-date">
              {currentDate} • Masuk {studentConfig.workStartTime} • Pulang{' '}
              {studentConfig.workEndTime}
            </p>
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

      <div
        className="kiosk-body"
        style={{
          flex: 1,
          alignItems: 'stretch',
          paddingTop: '0.75rem',
          paddingBottom: '0.85rem',
        }}
      >
        <div
          className="kiosk-sidebar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div className="kiosk-stat-card" style={{ flexShrink: 0 }}>
            <div className="kiosk-stat-header">
              <Users size={20} />
              <span>Statistik Siswa Hari Ini</span>
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
                <span className="kiosk-stat-number">
                  {studentConfig.enableCheckOut
                    ? todayStats.checkedOut
                    : todayStats.present + todayStats.late}
                </span>
                <span className="kiosk-stat-label">
                  {studentConfig.enableCheckOut ? 'Sudah Pulang' : 'Total Absen'}
                </span>
              </div>
            </div>
          </div>

          {schoolCoords && (
            <div
              className="kiosk-stat-card"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: '210px',
              }}
            >
              <div
                className="kiosk-stat-header"
                style={{ marginBottom: '8px', flexShrink: 0 }}
              >
                <MapPin size={20} />
                <span>Area Absensi Sekolah</span>
              </div>
              <div
                className="kiosk-map-fill"
                style={{
                  flex: 1,
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
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
            <div
              className="kiosk-recent"
              style={{
                flexShrink: 0,
                maxHeight: '135px',
                overflowY: 'auto',
              }}
            >
              <h3 className="kiosk-recent-title">Aktivitas Terakhir</h3>
              <div className="kiosk-recent-list">
                {recentList.map((item, i) => (
                  <div
                    key={`${item.name}-${item.time}-${i}`}
                    className="kiosk-recent-item"
                  >
                    <div className="kiosk-recent-info">
                      <span className="kiosk-recent-name">{item.name}</span>
                      <span className="kiosk-recent-time">
                        {item.action} • {item.time}
                      </span>
                    </div>
                    <span
                      className={`kiosk-recent-badge ${item.status === 'TERLAMBAT' ? 'terlambat' : 'hadir'
                        }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="kiosk-main"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: '0.25rem',
          }}
        >
          {/* Banner Mode Kegiatan Khusus Aktif */}
          {isHoliday && isSpecialEventActive && (
            <div className="mb-3 w-full max-w-xl p-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-500 shrink-0" />
                <div>
                  <span className="font-bold">
                    Mode Kegiatan Khusus Aktif: {specialEventReason}
                  </span>
                  <p className="text-[11px] opacity-80">
                    Pengecualian untuk jadwal libur ({holidayName})
                  </p>
                </div>
              </div>
              {canManageOverride && (
                <button
                  type="button"
                  disabled={isTogglingHoliday}
                  onClick={deactivateSpecialEvent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition cursor-pointer disabled:opacity-50"
                >
                  <Lock size={13} />
                  {isTogglingHoliday ? 'Mengunci...' : 'Kunci Kembali'}
                </button>
              )}
            </div>
          )}

          <AnimatePresence mode="wait">
            {kioskState === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="kiosk-idle-state w-full max-w-xl mx-auto flex-1 min-h-0 flex flex-col items-center text-center"
                style={{ marginTop: 0, paddingTop: 0 }}
              >
                {isHolidayLocked ? (
                  <div className="p-6 sm:p-7 rounded-2xl border border-red-500/40 bg-red-500/10 text-center space-y-4 max-w-lg w-full my-auto">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                      <CalendarOff size={36} />
                    </div>
                    <div className="space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-500/20 text-red-600 dark:text-red-300">
                        <Lock size={12} /> Kiosk Presensi Terkunci
                      </span>
                      <h2 className="text-lg font-extrabold text-foreground">
                        Hari Libur: {holidayName}
                      </h2>
                      <p className="text-xs opacity-80 leading-relaxed">
                        Presensi mandiri siswa melalui Kiosk dikunci otomatis
                        pada hari libur.
                      </p>
                    </div>

                    {canManageOverride ? (
                      <form
                        onSubmit={handleActivateSpecialEvent}
                        className="pt-3 border-t border-red-500/25 space-y-2.5 text-left"
                      >
                        <label className="block text-xs font-bold text-foreground">
                          Ada Kegiatan Khusus Sekolah Hari Ini?
                        </label>
                        <input
                          type="text"
                          value={specialEventInput}
                          onChange={(e) => setSpecialEventInput(e.target.value)}
                          placeholder="Contoh: Kegiatan Pramuka / Class Meeting / Lomba..."
                          className="form-input w-full text-xs"
                        />
                        <button
                          type="submit"
                          disabled={isTogglingHoliday}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                        >
                          <Unlock size={15} />
                          {isTogglingHoliday
                            ? 'Membuka Kunci...'
                            : 'Aktifkan Presensi Kegiatan Khusus'}
                        </button>
                      </form>
                    ) : (
                      <p className="text-[11px] opacity-70 pt-2 border-t border-red-500/20">
                        Untuk membuka kunci karena kegiatan khusus, silakan
                        Guru, Wali Kelas, atau Admin masuk (login) terlebih
                        dahulu atau aktifkan melalui menu Absensi Kelas.
                      </p>
                    )}
                  </div>
                ) : !studentConfig.enableKiosk ? (
                  <div className="p-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-center space-y-2 max-w-md my-auto">
                    <AlertTriangle
                      size={44}
                      className="mx-auto text-amber-500"
                    />
                    <h2 className="text-base font-bold">
                      Kiosk Siswa Dinonaktifkan
                    </h2>
                    <p className="text-xs opacity-80">
                      Admin sekolah sedang menonaktifkan absensi mandiri lewat
                      Kiosk. Silakan hubungi Wali Kelas atau Operator Sekolah.
                    </p>
                  </div>
                ) : (
                  <div className="w-full flex-1 min-h-0 flex flex-col items-center">
                    {/* Bar Tombol Mode Scan: Sejajar di tengah atas */}
                    {studentConfig.enableCheckOut && (
                      <div className="flex flex-wrap items-center justify-center gap-2 mb-2 shrink-0">
                        {(
                          [
                            {
                              id: 'AUTO',
                              label: isCheckOutWindowOpen
                                ? 'Mode Otomatis (Siap Pulang)'
                                : 'Mode Otomatis (Datang)',
                            },
                            { id: 'CHECK_IN', label: 'Khusus Datang' },
                            { id: 'CHECK_OUT', label: 'Khusus Pulang' },
                          ] as const
                        ).map((modeOpt) => (
                          <button
                            key={modeOpt.id}
                            type="button"
                            onClick={() => setScanMode(modeOpt.id)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${scanMode === modeOpt.id
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                              : 'bg-card/70 text-foreground border-border opacity-75 hover:opacity-100'
                              }`}
                          >
                            {modeOpt.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <h2 className="kiosk-idle-title text-xl sm:text-2xl leading-tight shrink-0">
                      {scanMode === 'CHECK_OUT'
                        ? 'Scan Kartu — Absen Pulang'
                        : isCheckOutWindowOpen && scanMode === 'AUTO'
                          ? 'Scan Kartu Pelajar (Datang / Pulang)'
                          : 'Scan Kartu Pelajar'}
                    </h2>
                    <p className="kiosk-idle-subtitle text-xs mt-1 mb-2.5 shrink-0">
                      Arahkan kartu ke kamera, gunakan scanner USB, atau ketik
                      NISN/NIS
                    </p>

                    <div
                      className="kiosk-scanner-area w-full"
                      style={{ padding: '0.85rem', minHeight: 'auto' }}
                    >
                      <BarcodeScanner
                        onScanSuccess={(code) => {
                          void handleScan(code);
                        }}
                        isPaused={
                          kioskState !== 'idle' ||
                          isHolidayLocked ||
                          isCheckingHoliday ||
                          !studentConfig.enableKiosk
                        }
                      />
                    </div>

                    {isLateNow && !isCheckOutWindowOpen && (
                      <div className="kiosk-late-warning mt-2 shrink-0">
                        <Clock size={16} />
                        Waktu melebihi {studentDeadline} — Absen datang dicatat
                        TERLAMBAT
                      </div>
                    )}
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
                className="kiosk-scanning-state my-auto"
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
                className="kiosk-found-state my-auto"
              >
                <div className="kiosk-student-avatar">
                  {foundStudent.photoUrl ? (
                    <img
                      src={foundStudent.photoUrl}
                      alt={foundStudent.fullName}
                    />
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
                  Mencatat presensi...
                </div>
              </motion.div>
            )}

            {kioskState === 'success' && (
              <motion.div
                key="success"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kiosk-result-state success my-auto"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                >
                  {lastActionType === 'CHECK_OUT' ? (
                    <LogOut size={100} />
                  ) : (
                    <CheckCircle size={100} />
                  )}
                </motion.div>
                <h2 className="kiosk-result-title">
                  {lastActionType === 'CHECK_OUT'
                    ? 'Absen Pulang Berhasil!'
                    : 'Absen Datang Berhasil!'}
                </h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <p className="kiosk-result-hint">
                  Layar akan kembali otomatis...
                </p>
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
                className="kiosk-result-state already my-auto"
              >
                <LogIn size={80} />
                <h2 className="kiosk-result-title">Informasi Presensi</h2>
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
                className="kiosk-result-state error my-auto"
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