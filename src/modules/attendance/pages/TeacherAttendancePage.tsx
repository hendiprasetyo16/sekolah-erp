// src/modules/attendance/pages/TeacherAttendancePage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Shield, ShieldAlert, Clock, CheckCircle,
  XCircle, LogIn, LogOut, AlertTriangle, Navigation,
  Loader2, RefreshCw, Info, UserX, Camera, RotateCcw,
  FileText, FlaskConical, Trash2
} from 'lucide-react';
import { attendanceService } from '../services/attendance.service';
import {
  getCurrentPosition,
  calculateDistance,
  getLocalDateString,
  isAfterDeadline,
  compressSelfieFromVideo,
} from '../services/gps.utils';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { AttendanceMap } from '@/components/map/AttendanceMap';
import type { AttendanceSettings } from '../types/attendance.types';

type GpsStep =
  | 'init'
  | 'loading'
  | 'ready'
  | 'mock_detected'
  | 'out_of_range'
  | 'submitting'
  | 'success'
  | 'error'
  | 'unauthorized';

type AttendanceMode = 'checkin' | 'leave';

interface GpsState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  distance: number | null;
  isMock: boolean;
  isWithinRadius: boolean;
}

interface TodayStatus {
  id: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInSelfieUrl?: string | null;
  notes?: string | null;
}

const DEFAULT_RADIUS = 200;

export function TeacherAttendancePage() {
  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // State khusus Super Admin Simulation
  const [simSchools, setSimSchools] = useState<Array<{ id: string; name: string; npsn: string }>>([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const [simTeachers, setSimTeachers] = useState<Array<{ id: string; fullName: string; nip?: string | null; position?: string | null }>>([]);
  const [isResettingTest, setIsResettingTest] = useState(false);

  const activeSchoolId = isSuperAdmin ? (simSchoolId || school?.id || '') : (school?.id || '');

  const [step, setStep] = useState<GpsStep>('loading');
  const [mode, setMode] = useState<AttendanceMode>('checkin');
  const [validTeacherId, setValidTeacherId] = useState<string | null>(null);
  const [validTeacherName, setValidTeacherName] = useState<string>('');

  const [gpsState, setGpsState] = useState<GpsState>({
    lat: null,
    lng: null,
    accuracy: null,
    distance: null,
    isMock: false,
    isWithinRadius: false,
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [signedSelfiePreview, setSignedSelfiePreview] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  const [schoolCoords, setSchoolCoords] = useState<{
    latitude: number | null;
    longitude: number | null;
    radius: number;
    settings: AttendanceSettings;
  } | null>(null);

  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // State Kamera Selfie
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // State Pengajuan Izin / Sakit
  const [leaveType, setLeaveType] = useState<'IZIN' | 'SAKIT'>('IZIN');
  const [leaveNotes, setLeaveNotes] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  const today = getLocalDateString();

  // Bersihkan kamera saat komponen unmount
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // 1. Jika SUPER_ADMIN, muat daftar sekolah untuk simulasi
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const schoolsList = await attendanceService.getAllSchoolsForSimulation();
        setSimSchools(schoolsList);
        if (school?.id) {
          setSimSchoolId(school.id);
        } else if (schoolsList.length > 0) {
          setSimSchoolId(schoolsList[0].id);
        } else {
          setStep('error');
          setResultMessage('Belum ada data sekolah di database untuk diuji.');
        }
      } catch {
        setStep('error');
        setResultMessage('Gagal memuat daftar sekolah.');
      }
    })();
  }, [isSuperAdmin, school?.id]);

  // 2. Muat data sekolah & daftar guru (jika Super Admin) atau profil guru login
  useEffect(() => {
    if (!activeSchoolId || !user?.id) return;

    (async () => {
      setStep('loading');
      try {
        const coords = await attendanceService.getSchoolCoordinates(activeSchoolId);
        setSchoolCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
          radius: coords.attendanceRadiusMeters ?? DEFAULT_RADIUS,
          settings: coords.settings,
        });

        if (isSuperAdmin) {
          const teachersList = await attendanceService.getActiveTeachersForSimulation(activeSchoolId);
          setSimTeachers(teachersList);
          if (teachersList.length > 0) {
            const first = teachersList[0];
            setValidTeacherId(first.id);
            setValidTeacherName(first.fullName);
          } else {
            setValidTeacherId(null);
            setValidTeacherName('');
            setStep('unauthorized');
          }
        } else {
          const teacherProfile = await attendanceService.getTeacherProfileByUser({
            schoolId: activeSchoolId,
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
          });

          if (!teacherProfile) {
            setStep('unauthorized');
            return;
          }

          setValidTeacherId(teacherProfile.id);
          setValidTeacherName(teacherProfile.fullName);
        }
      } catch {
        setStep('error');
        setResultMessage('Gagal memuat data awal. Pastikan koneksi internet stabil.');
      }
    })();
  }, [activeSchoolId, user?.id, user?.email, user?.fullName, isSuperAdmin]);

  // 3. Muat status absensi hari ini setiap kali validTeacherId atau activeSchoolId berubah
  const loadTodayStatus = useCallback(async () => {
    if (!activeSchoolId || !validTeacherId) return;
    try {
      const status = await attendanceService.getTeacherTodayStatus(
        activeSchoolId,
        validTeacherId,
        today
      );

      if (status) {
        setTodayStatus({
          id: status.id,
          status: status.status,
          checkInTime: status.checkInTime,
          checkOutTime: status.checkOutTime,
          checkInSelfieUrl: status.checkInSelfieUrl,
          notes: status.notes,
        });

        if (status.checkInSelfieUrl) {
          const url = await attendanceService.getSignedSelfieUrl(status.checkInSelfieUrl);
          setSignedSelfiePreview(url);
        } else {
          setSignedSelfiePreview(null);
        }
      } else {
        setTodayStatus(null);
        setSignedSelfiePreview(null);
      }

      setStep('init');
      setResultMessage('');
    } catch {
      setStep('error');
      setResultMessage('Gagal memeriksa status presensi hari ini.');
    }
  }, [activeSchoolId, validTeacherId, today]);

  useEffect(() => {
    if (validTeacherId) {
      loadTodayStatus();
    }
  }, [validTeacherId, loadTodayStatus]);

  // Kamera Selfie Handlers
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
      }, 100);
    } catch {
      setCameraError('Kamera tidak dapat diakses. Izinkan akses kamera pada browser Anda.');
    }
  };

  const captureSelfie = async () => {
    if (!videoRef.current) return;
    try {
      const blob = await compressSelfieFromVideo(videoRef.current, 640, 0.65);
      setSelfieBlob(blob);
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      setSelfiePreviewUrl(URL.createObjectURL(blob));
      stopCamera();
    } catch (err: any) {
      setCameraError(err.message ?? 'Gagal mengambil foto.');
    }
  };

  const retakeSelfie = () => {
    setSelfieBlob(null);
    if (selfiePreviewUrl) {
      URL.revokeObjectURL(selfiePreviewUrl);
      setSelfiePreviewUrl(null);
    }
    startCamera();
  };

  // GPS Detection
  const requestGps = useCallback(async () => {
    setStep('loading');
    setGpsError(null);
    try {
      const pos = await getCurrentPosition();

      let distance: number | null = null;
      let isWithinRadius = false;

      if (schoolCoords?.latitude != null && schoolCoords?.longitude != null) {
        distance = calculateDistance(
          pos.latitude,
          pos.longitude,
          schoolCoords.latitude,
          schoolCoords.longitude
        );
        isWithinRadius = distance <= schoolCoords.radius;
      }

      setGpsState({
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        distance,
        isMock: pos.isMock,
        isWithinRadius,
      });

      if (pos.isMock) {
        setStep('mock_detected');
      } else if (
        schoolCoords?.latitude != null &&
        schoolCoords?.longitude != null &&
        !isWithinRadius
      ) {
        setStep('out_of_range');
      } else {
        setStep('ready');
      }
    } catch (err: any) {
      setGpsError(err.message ?? 'Gagal mendapatkan lokasi GPS.');
      setStep('error');
    }
  }, [schoolCoords]);

  // Check-In Action
  const handleCheckIn = useCallback(async () => {
    if (!activeSchoolId || !validTeacherId || gpsState.lat == null || gpsState.lng == null) return;

    if (schoolCoords?.settings.requireSelfie && !selfieBlob) {
      setCameraError('Sekolah mewajibkan foto selfie sebelum Check-In.');
      return;
    }

    setStep('submitting');
    try {
      let uploadedSelfiePath: string | undefined;
      if (selfieBlob) {
        uploadedSelfiePath = await attendanceService.uploadTeacherSelfie({
          schoolId: activeSchoolId,
          teacherId: validTeacherId,
          date: today,
          blob: selfieBlob,
        });
      }

      const result = await attendanceService.teacherCheckIn({
        schoolId: activeSchoolId,
        teacherId: validTeacherId,
        date: today,
        checkInLat: gpsState.lat,
        checkInLng: gpsState.lng,
        checkInDistance: gpsState.distance ?? 0,
        isWithinRadius: gpsState.isWithinRadius,
        isMockGps: gpsState.isMock,
        checkInDeadline: schoolCoords?.settings.checkInDeadline,
        checkInSelfieUrl: uploadedSelfiePath,
      });

      if (result.success) {
        setResultMessage(result.message);
        setStep('success');
        stopCamera();
        await loadTodayStatus();
      } else {
        setResultMessage(result.message);
        setStep('error');
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Terjadi kesalahan saat menyimpan absen.');
      setStep('error');
    }
  }, [
    activeSchoolId,
    validTeacherId,
    gpsState,
    schoolCoords,
    selfieBlob,
    today,
    stopCamera,
    loadTodayStatus,
  ]);

  // Check-Out Action
  const handleCheckOut = useCallback(async () => {
    if (!activeSchoolId || !validTeacherId) return;
    setIsCheckingOut(true);
    try {
      const pos = await getCurrentPosition();
      const result = await attendanceService.teacherCheckOut({
        schoolId: activeSchoolId,
        teacherId: validTeacherId,
        date: today,
        isMockGps: pos.isMock,
      });

      setResultMessage(result.message);
      if (result.success) {
        await loadTodayStatus();
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Gagal melakukan check-out. Pastikan GPS aktif.');
    }
    setIsCheckingOut(false);
  }, [activeSchoolId, validTeacherId, today, loadTodayStatus]);

  // Submit Izin / Sakit PTK
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchoolId || !validTeacherId || !user?.id) return;
    if (!leaveNotes.trim()) {
      setResultMessage('Alasan / keterangan wajib diisi.');
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const res = await attendanceService.teacherSubmitLeave({
        schoolId: activeSchoolId,
        teacherId: validTeacherId,
        date: today,
        status: leaveType,
        notes: leaveNotes,
        recordedBy: user.id,
      });

      setResultMessage(res.message);
      if (res.success) {
        setLeaveNotes('');
        await loadTodayStatus();
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Gagal menyimpan pengajuan.');
    }
    setIsSubmittingLeave(false);
  };

  // Reset Data Test (Khusus Super Admin)
  const handleResetTest = async () => {
    if (!activeSchoolId || !validTeacherId) return;
    setIsResettingTest(true);
    try {
      await attendanceService.resetTeacherAttendanceForTest({
        schoolId: activeSchoolId,
        teacherId: validTeacherId,
        date: today,
        selfiePath: todayStatus?.checkInSelfieUrl,
      });
      setSelfieBlob(null);
      setSelfiePreviewUrl(null);
      setGpsState({
        lat: null,
        lng: null,
        accuracy: null,
        distance: null,
        isMock: false,
        isWithinRadius: false,
      });
      await loadTodayStatus();
      setResultMessage('Data presensi hari ini berhasil direset untuk pengujian ulang.');
    } catch (err: any) {
      setResultMessage(err.message ?? 'Gagal mereset data test.');
    }
    setIsResettingTest(false);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusColor: Record<string, string> = {
    HADIR: '#10B981',
    TERLAMBAT: '#F59E0B',
    IZIN: '#3B82F6',
    SAKIT: '#8B5CF6',
    ALPA: '#EF4444',
  };

  const hasSchoolCoords =
    schoolCoords?.latitude != null && schoolCoords?.longitude != null;

  const isLatePreview = isAfterDeadline(schoolCoords?.settings.checkInDeadline ?? '07:30');

  if (step === 'unauthorized' && !isSuperAdmin) {
    return (
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <UserX size={64} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Akses Ditolak</h2>
          <p className="text-muted-foreground">
            Akun Anda belum terhubung dengan data Guru/PTK aktif. Hubungi Operator atau Admin Sekolah untuk menautkan akun Anda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Banner Simulasi Khusus SUPER_ADMIN */}
      {isSuperAdmin && (
        <div
          className="mb-6 p-4 rounded-xl border"
          style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderColor: 'rgba(139, 92, 246, 0.35)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 font-semibold text-purple-300">
              <FlaskConical size={18} />
              <span>Mode Simulasi & Pengujian Presensi PTK (Super Admin)</span>
            </div>
            {todayStatus && validTeacherId && (
              <button
                type="button"
                className="btn-danger text-xs py-1.5 px-3"
                onClick={handleResetTest}
                disabled={isResettingTest}
              >
                {isResettingTest ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                Reset Presensi Hari Ini
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs opacity-75 mb-1">Pilih Sekolah Simulasi</label>
              <select
                className="form-input w-full"
                value={simSchoolId}
                onChange={(e) => {
                  setSimSchoolId(e.target.value);
                  setValidTeacherId(null);
                  setTodayStatus(null);
                }}
              >
                {simSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.npsn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs opacity-75 mb-1">Pilih Guru / PTK yang Diuji</label>
              <select
                className="form-input w-full"
                value={validTeacherId ?? ''}
                onChange={(e) => {
                  const selected = simTeachers.find((t) => t.id === e.target.value);
                  setValidTeacherId(e.target.value);
                  setValidTeacherName(selected?.fullName ?? '');
                }}
              >
                {simTeachers.length === 0 ? (
                  <option value="">Belum ada data guru aktif di sekolah ini</option>
                ) : (
                  simTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} {t.position ? `(${t.position})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isSuperAdmin ? `Simulasi Absensi: ${validTeacherName || 'Pilih PTK'}` : 'Absensi Saya'}
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            • Batas Masuk: <strong>{schoolCoords?.settings.checkInDeadline ?? '07:30'}</strong>
          </p>
        </div>
      </div>

      <div className="attendance-grid">
        {/* KARTU 1: STATUS ABSEN HARI INI */}
        <div className="attendance-status-card">
          <h2 className="card-section-title">Status Presensi Hari Ini</h2>
          {todayStatus ? (
            <div className="today-status-panel">
              <div
                className="today-status-badge"
                style={{
                  backgroundColor: (statusColor[todayStatus.status] ?? '#6B7280') + '20',
                  color: statusColor[todayStatus.status] ?? '#6B7280',
                }}
              >
                <span
                  className="today-status-dot"
                  style={{ background: statusColor[todayStatus.status] ?? '#6B7280' }}
                />
                {todayStatus.status}
              </div>

              {(todayStatus.status === 'HADIR' || todayStatus.status === 'TERLAMBAT') ? (
                <div className="today-time-grid">
                  <div className="today-time-item">
                    <LogIn size={16} className="text-green-400" />
                    <div>
                      <p className="today-time-label">Check-In</p>
                      <p className="today-time-value">{formatTime(todayStatus.checkInTime)}</p>
                    </div>
                  </div>
                  <div className="today-time-item">
                    <LogOut size={16} className="text-blue-400" />
                    <div>
                      <p className="today-time-label">Check-Out</p>
                      <p className="today-time-value">{formatTime(todayStatus.checkOutTime)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 p-3 rounded-lg bg-white/5 text-sm">
                  <p className="opacity-70 text-xs mb-1">Keterangan:</p>
                  <p>{todayStatus.notes || '-'}</p>
                </div>
              )}

              {signedSelfiePreview && (
                <div className="mt-4">
                  <p className="text-xs opacity-70 mb-1.5">Bukti Foto Check-In:</p>
                  <img
                    src={signedSelfiePreview}
                    alt="Bukti Check-In"
                    className="w-32 h-32 object-cover rounded-lg border border-white/10"
                  />
                </div>
              )}

              {todayStatus.checkInTime && !todayStatus.checkOutTime && (
                <button
                  className="btn-primary w-full mt-4"
                  onClick={handleCheckOut}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? <Loader2 size={16} className="spin" /> : <LogOut size={16} />}
                  {isCheckingOut ? 'Memproses Lokasi...' : 'Check-Out Sekarang'}
                </button>
              )}

              {resultMessage && (
                <p className="mt-3 text-sm text-center text-emerald-400">{resultMessage}</p>
              )}
            </div>
          ) : (
            <div className="today-no-attendance">
              <Clock size={40} className="opacity-30" />
              <p>Belum ada catatan presensi hari ini</p>
              {isLatePreview && (
                <span className="text-xs text-amber-400 mt-1">
                  Saat ini sudah melewati jam masuk ({schoolCoords?.settings.checkInDeadline ?? '07:30'})
                </span>
              )}
            </div>
          )}
        </div>

        {/* KARTU 2: FORM CHECK-IN GPS + SELFIE ATAU PENGAJUAN IZIN/SAKIT */}
        {!todayStatus && validTeacherId && (
          <div className="attendance-gps-card">
            {/* Switch Mode: Check-In GPS vs Izin/Sakit */}
            <div className="flex gap-2 mb-4 p-1 rounded-lg bg-black/20">
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition ${mode === 'checkin' ? 'bg-primary text-white' : 'opacity-70 hover:opacity-100'
                  }`}
                onClick={() => {
                  setMode('checkin');
                  setResultMessage('');
                }}
              >
                <MapPin size={15} />
                Hadir (GPS)
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition ${mode === 'leave' ? 'bg-primary text-white' : 'opacity-70 hover:opacity-100'
                  }`}
                onClick={() => {
                  setMode('leave');
                  stopCamera();
                  setResultMessage('');
                }}
              >
                <FileText size={15} />
                Izin / Sakit
              </button>
            </div>

            {mode === 'leave' ? (
              <form onSubmit={handleLeaveSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Jenis Ketidakhadiran</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['IZIN', 'SAKIT'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setLeaveType(item)}
                        className={`py-2.5 px-4 rounded-lg border text-sm font-semibold transition ${leaveType === item
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-white/10 opacity-70'
                          }`}
                      >
                        {item === 'IZIN' ? 'Izin / Dinas Luar' : 'Sakit'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Keterangan / Alasan <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-input w-full"
                    placeholder="Contoh: Mengikuti Bimtek di Dinas Pendidikan / Sedang demam..."
                    value={leaveNotes}
                    onChange={(e) => setLeaveNotes(e.target.value)}
                    required
                  />
                </div>

                {resultMessage && (
                  <p className="text-sm text-amber-400">{resultMessage}</p>
                )}

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={isSubmittingLeave || !leaveNotes.trim()}
                >
                  {isSubmittingLeave ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
                  {isSubmittingLeave ? 'Menyimpan...' : `Kirim Pengajuan ${leaveType}`}
                </button>
              </form>
            ) : (
              <>
                <h2 className="card-section-title">Check-In dengan GPS</h2>

                {hasSchoolCoords && (
                  <div
                    style={{
                      marginBottom: '1.25rem',
                      borderRadius: '0.75rem',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <AttendanceMap
                      schoolLat={schoolCoords!.latitude!}
                      schoolLng={schoolCoords!.longitude!}
                      userLat={gpsState.lat}
                      userLng={gpsState.lng}
                      radiusMeters={schoolCoords!.radius}
                    />
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {step === 'init' && (
                    <motion.div
                      key="init"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="gps-init-state"
                    >
                      <div className="gps-icon-wrapper">
                        <Navigation size={48} />
                      </div>
                      <p className="gps-desc">
                        Sistem akan memverifikasi posisi GPS Anda terhadap titik koordinat sekolah.
                      </p>
                      {!hasSchoolCoords && (
                        <div className="gps-warning-box">
                          <AlertTriangle size={14} /> Koordinat sekolah belum diatur. Hubungi Admin Sekolah.
                        </div>
                      )}
                      <button
                        className="btn-primary w-full"
                        onClick={requestGps}
                        disabled={!hasSchoolCoords}
                      >
                        <MapPin size={16} /> Mulai Deteksi GPS
                      </button>
                    </motion.div>
                  )}

                  {step === 'loading' && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="gps-loading-state"
                    >
                      <Loader2 size={48} className="spin text-primary" />
                      <p>Mendapatkan lokasi akurat...</p>
                      <p className="text-sm opacity-60">
                        Pastikan GPS aktif dan berada di area terbuka
                      </p>
                    </motion.div>
                  )}

                  {step === 'mock_detected' && (
                    <motion.div
                      key="mock"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="gps-error-state danger"
                    >
                      <ShieldAlert size={64} className="text-red-400" />
                      <h3 className="gps-error-title">GPS Palsu Terdeteksi!</h3>
                      <p className="gps-error-desc">
                        Matikan aplikasi pemalsu lokasi (Fake GPS) atau opsi pengembang sebelum mencoba lagi.
                      </p>
                      <button className="btn-danger w-full" onClick={requestGps}>
                        <RefreshCw size={16} /> Coba Lagi
                      </button>
                    </motion.div>
                  )}

                  {step === 'out_of_range' && (
                    <motion.div
                      key="out"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="gps-error-state warning"
                    >
                      <MapPin size={64} className="text-yellow-400" />
                      <h3 className="gps-error-title">Di Luar Area Sekolah</h3>
                      <p className="gps-error-desc">
                        Jarak Anda: <strong>{Math.round(gpsState.distance ?? 0)} m</strong>.
                        <br />
                        Radius diizinkan: <strong>{schoolCoords?.radius ?? DEFAULT_RADIUS} m</strong>.
                      </p>
                      <button className="btn-warning w-full" onClick={requestGps}>
                        <RefreshCw size={16} /> Deteksi Ulang GPS
                      </button>
                    </motion.div>
                  )}

                  {step === 'ready' && (
                    <motion.div
                      key="ready"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="gps-ready-state"
                    >
                      <Shield size={52} className="text-green-400" />
                      <h3 className="gps-ready-title">Lokasi Terverifikasi</h3>
                      <div className="gps-details">
                        <div className="gps-detail-item success">
                          <CheckCircle size={14} />
                          <span>{Math.round(gpsState.distance ?? 0)} meter dari titik sekolah</span>
                        </div>
                        <div className="gps-detail-item">
                          <Info size={14} />
                          <span>Akurasi GPS: ±{Math.round(gpsState.accuracy ?? 0)} m</span>
                        </div>
                      </div>

                      {/* Bagian Kamera Selfie (Wajib jika requireSelfie=true, Opsional jika false) */}
                      <div className="w-full my-4 p-3 rounded-xl border border-white/10 bg-black/20 text-left">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            <Camera size={14} />
                            Foto Selfie Kehadiran{' '}
                            {schoolCoords?.settings.requireSelfie ? (
                              <span className="text-red-400">(Wajib)</span>
                            ) : (
                              <span className="opacity-60">(Opsional)</span>
                            )}
                          </span>
                          {selfieBlob && (
                            <span className="text-xs text-emerald-400">
                              Siap ({Math.round(selfieBlob.size / 1024)} KB)
                            </span>
                          )}
                        </div>

                        {selfiePreviewUrl ? (
                          <div className="space-y-2">
                            <img
                              src={selfiePreviewUrl}
                              alt="Preview Selfie"
                              className="w-full max-h-56 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              className="btn-secondary w-full text-xs"
                              onClick={retakeSelfie}
                            >
                              <RotateCcw size={14} /> Ambil Ulang Foto
                            </button>
                          </div>
                        ) : isCameraOn ? (
                          <div className="space-y-2">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full max-h-56 object-cover rounded-lg bg-black"
                              style={{ transform: 'scaleX(-1)' }}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-primary flex-1 text-xs"
                                onClick={captureSelfie}
                              >
                                <Camera size={14} /> Jepret Foto
                              </button>
                              <button
                                type="button"
                                className="btn-ghost text-xs"
                                onClick={stopCamera}
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary w-full text-xs"
                            onClick={startCamera}
                          >
                            <Camera size={14} /> Buka Kamera Selfie
                          </button>
                        )}

                        {cameraError && (
                          <p className="text-xs text-red-400 mt-2">{cameraError}</p>
                        )}
                      </div>

                      <button
                        className="btn-success w-full"
                        onClick={handleCheckIn}
                        disabled={Boolean(schoolCoords?.settings.requireSelfie && !selfieBlob)}
                      >
                        <LogIn size={16} /> Check-In Sekarang
                      </button>
                      <button className="btn-ghost w-full mt-2" onClick={requestGps}>
                        <RefreshCw size={14} /> Perbarui Lokasi
                      </button>
                    </motion.div>
                  )}

                  {step === 'submitting' && (
                    <motion.div
                      key="submitting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="gps-loading-state"
                    >
                      <Loader2 size={48} className="spin text-primary" />
                      <p>Menyimpan presensi ke server...</p>
                    </motion.div>
                  )}

                  {step === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="gps-success-state"
                    >
                      <CheckCircle size={80} className="text-green-400" />
                      <h3 className="gps-success-title">Berhasil!</h3>
                      <p className="gps-success-msg">{resultMessage}</p>
                    </motion.div>
                  )}

                  {step === 'error' && (
                    <motion.div
                      key="err"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="gps-error-state danger"
                    >
                      <XCircle size={64} className="text-red-400" />
                      <h3 className="gps-error-title">Gagal</h3>
                      <p className="gps-error-desc">{gpsError ?? resultMessage}</p>
                      <button className="btn-danger w-full" onClick={requestGps}>
                        <RefreshCw size={16} /> Coba Lagi
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        )}

        {/* KARTU 3: PANDUAN */}
        <div className="attendance-info-card">
          <h3 className="card-section-title">Panduan Presensi PTK</h3>
          <ul className="attendance-guide-list">
            <li>
              <span className="guide-icon">📍</span> <b>Pastikan GPS Aktif:</b> Nyalakan pengaturan Lokasi di HP Anda dengan mode Akurasi Tinggi.
            </li>
            <li>
              <span className="guide-icon">📸</span> <b>Foto Selfie Terkompresi:</b> Foto otomatis dikompres menjadi ~45 KB agar cepat diunggah dan hemat kuota.
            </li>
            <li>
              <span className="guide-icon">📝</span> <b>Izin & Sakit:</b> Gunakan tab <i>Izin / Sakit</i> jika berhalangan hadir atau sedang dinas luar.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}