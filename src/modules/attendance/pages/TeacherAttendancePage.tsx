import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Shield, ShieldAlert, Clock, CheckCircle,
  XCircle, LogIn, LogOut, AlertTriangle, Navigation,
  Loader2, RefreshCw, Info, UserX
} from 'lucide-react';
import { attendanceService } from '../services/attendance.service';
import { getCurrentPosition, calculateDistance } from '../services/gps.utils';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { AttendanceMap } from '@/components/map/AttendanceMap';

type GpsStep = 'init' | 'loading' | 'ready' | 'mock_detected' | 'out_of_range' | 'submitting' | 'success' | 'error' | 'unauthorized';

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
}

const DEFAULT_RADIUS = 200;

export function TeacherAttendancePage() {
  const { user, school } = useAuthStore();
  const [step, setStep] = useState<GpsStep>('loading');
  const [validTeacherId, setValidTeacherId] = useState<string | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>({
    lat: null, lng: null, accuracy: null,
    distance: null, isMock: false, isWithinRadius: false,
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [schoolCoords, setSchoolCoords] = useState<{ latitude: number; longitude: number; radius: number } | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Inisialisasi awal: Cek Profil Guru & Koordinat
  useEffect(() => {
    if (!school?.id || !user?.id) return;
    (async () => {
      try {
        // 1. Validasi user terdaftar sebagai guru menggunakan NAMA LENGKAP dan ID SEKOLAH
        const teacherProfile = await attendanceService.getTeacherProfile(school.id, user.fullName || '');

        if (!teacherProfile) {
          setStep('unauthorized');
          return;
        }

        setValidTeacherId(teacherProfile.id);

        // 2. Ambil data sekolah & absensi hari ini menggunakan ID Guru (teacherProfile.id)
        const [coords, status] = await Promise.all([
          attendanceService.getSchoolCoordinates(school.id),
          attendanceService.getTeacherTodayStatus(school.id, teacherProfile.id, today),
        ]);

        if (coords) {
          setSchoolCoords({
            latitude: coords.latitude ?? -6.2,
            longitude: coords.longitude ?? 106.8,
            radius: coords.attendanceRadiusMeters ?? DEFAULT_RADIUS,
          });
        }

        if (status) {
          setTodayStatus({
            id: status.id,
            status: status.status,
            checkInTime: status.checkInTime,
            checkOutTime: status.checkOutTime,
          });
        }

        setStep('init');
      } catch (error) {
        setStep('error');
        setResultMessage('Gagal memuat data awal. Pastikan koneksi internet stabil.');
      }
    })();
  }, [school?.id, user?.id, user?.fullName, today]);

  const requestGps = useCallback(async () => {
    setStep('loading');
    setGpsError(null);
    try {
      const pos = await getCurrentPosition();

      let distance: number | null = null;
      let isWithinRadius = false;

      if (schoolCoords) {
        distance = calculateDistance(
          pos.latitude, pos.longitude,
          schoolCoords.latitude, schoolCoords.longitude
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
      } else if (schoolCoords && !isWithinRadius) {
        setStep('out_of_range');
      } else {
        setStep('ready');
      }
    } catch (err: any) {
      setGpsError(err.message ?? 'Gagal mendapatkan lokasi GPS.');
      setStep('error');
    }
  }, [schoolCoords]);

  const handleCheckIn = useCallback(async () => {
    if (!school?.id || !validTeacherId || !gpsState.lat || !gpsState.lng) return;
    setStep('submitting');

    try {
      const result = await attendanceService.teacherCheckIn({
        schoolId: school.id,
        teacherId: validTeacherId,
        date: today,
        checkInLat: gpsState.lat,
        checkInLng: gpsState.lng,
        checkInDistance: gpsState.distance ?? 0,
        isWithinRadius: gpsState.isWithinRadius,
        isMockGps: gpsState.isMock,
      });

      if (result.success) {
        setResultMessage(result.message);
        setStep('success');
        setTodayStatus({
          id: (result.data as any).id,
          status: (result.data as any).status,
          checkInTime: (result.data as any).checkInTime,
          checkOutTime: null,
        });
      } else {
        setResultMessage(result.message);
        setStep('error');
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Terjadi kesalahan saat menyimpan absen. Cek koneksi.');
      setStep('error');
    }
  }, [school?.id, validTeacherId, gpsState, today]);

  const handleCheckOut = useCallback(async () => {
    if (!school?.id || !validTeacherId) return;
    setIsCheckingOut(true);
    try {
      const pos = await getCurrentPosition();
      const result = await attendanceService.teacherCheckOut({
        schoolId: school.id,
        teacherId: validTeacherId,
        date: today,
        checkOutLat: pos.latitude,
        checkOutLng: pos.longitude,
        isMockGps: pos.isMock,
      });

      if (result.success) {
        setResultMessage(result.message);
        setTodayStatus((prev) => prev ? { ...prev, checkOutTime: new Date().toISOString() } : null);
      } else {
        setResultMessage(result.message);
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Gagal melakukan check-out. Pastikan GPS aktif.');
    }
    setIsCheckingOut(false);
  }, [school?.id, validTeacherId, today]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const statusColor: Record<string, string> = {
    HADIR: '#10B981',
    TERLAMBAT: '#F59E0B',
    IZIN: '#3B82F6',
    SAKIT: '#8B5CF6',
    ALPA: '#EF4444',
  };

  // Tampilan jika user bukan guru
  if (step === 'unauthorized') {
    return (
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <UserX size={64} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Akses Ditolak</h2>
          <p className="text-muted-foreground">Akun Anda belum terdaftar sebagai data Guru di dalam sistem. Hubungi administrator sekolah untuk memverifikasi profil Anda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Absensi Saya</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="attendance-grid">
        <div className="attendance-status-card">
          <h2 className="card-section-title">Status Absen Hari Ini</h2>
          {todayStatus ? (
            <div className="today-status-panel">
              <div
                className="today-status-badge"
                style={{ backgroundColor: statusColor[todayStatus.status] + '20', color: statusColor[todayStatus.status] }}
              >
                <span className="today-status-dot" style={{ background: statusColor[todayStatus.status] }} />
                {todayStatus.status}
              </div>
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
                <p className="mt-3 text-sm text-center opacity-70">{resultMessage}</p>
              )}
            </div>
          ) : (
            <div className="today-no-attendance">
              <Clock size={40} className="opacity-30" />
              <p>Belum ada absensi hari ini</p>
            </div>
          )}
        </div>

        {!todayStatus?.checkInTime && (
          <div className="attendance-gps-card">
            <h2 className="card-section-title">Check-In dengan GPS</h2>

            {schoolCoords && (
              <div style={{ marginBottom: '1.5rem', borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <AttendanceMap
                  schoolLat={schoolCoords.latitude}
                  schoolLng={schoolCoords.longitude}
                  userLat={gpsState.lat}
                  userLng={gpsState.lng}
                  radiusMeters={schoolCoords.radius}
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              {step === 'init' && (
                <motion.div key="init" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gps-init-state">
                  <div className="gps-icon-wrapper"><Navigation size={48} /></div>
                  <p className="gps-desc">Sistem akan memverifikasi lokasi Anda untuk memastikan Anda berada di area sekolah.</p>
                  {!schoolCoords && (
                    <div className="gps-warning-box"><AlertTriangle size={14} /> Koordinat sekolah belum dikonfigurasi. Hubungi admin.</div>
                  )}
                  <button className="btn-primary w-full" onClick={requestGps} disabled={!schoolCoords}>
                    <MapPin size={16} /> Mulai Deteksi GPS
                  </button>
                </motion.div>
              )}

              {step === 'loading' && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gps-loading-state">
                  <Loader2 size={48} className="spin text-primary" />
                  <p>Mendapatkan lokasi akurat...</p>
                  <p className="text-sm opacity-60">Pastikan GPS aktif dan berada di tempat terbuka (outdoor)</p>
                </motion.div>
              )}

              {step === 'mock_detected' && (
                <motion.div key="mock" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state danger">
                  <ShieldAlert size={64} className="text-red-400" />
                  <h3 className="gps-error-title">⚠️ GPS Palsu Terdeteksi!</h3>
                  <p className="gps-error-desc">Matikan aplikasi pemalsu lokasi (Fake GPS / VPN) atau Mode Pengembang (Developer Options) sebelum mencoba lagi.</p>
                  <button className="btn-danger w-full" onClick={requestGps}><RefreshCw size={16} /> Coba Lagi</button>
                </motion.div>
              )}

              {step === 'out_of_range' && (
                <motion.div key="out" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state warning">
                  <MapPin size={64} className="text-yellow-400" />
                  <h3 className="gps-error-title">Di Luar Area Sekolah</h3>
                  <p className="gps-error-desc">
                    Jarak Anda: <strong>{Math.round(gpsState.distance ?? 0)} m</strong>.<br />
                    Radius diizinkan: <strong>{schoolCoords?.radius ?? DEFAULT_RADIUS} m</strong>.
                  </p>
                  <button className="btn-warning w-full" onClick={requestGps}><RefreshCw size={16} /> Deteksi Ulang GPS</button>
                </motion.div>
              )}

              {step === 'ready' && (
                <motion.div key="ready" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-ready-state">
                  <Shield size={64} className="text-green-400" />
                  <h3 className="gps-ready-title">Lokasi Sangat Akurat ✓</h3>
                  <div className="gps-details">
                    <div className="gps-detail-item success">
                      <CheckCircle size={14} />
                      <span>{Math.round(gpsState.distance ?? 0)} meter dari titik tengah sekolah</span>
                    </div>
                    <div className="gps-detail-item">
                      <Info size={14} />
                      <span>Akurasi GPS: sangat presisi (±{Math.round(gpsState.accuracy ?? 0)} m)</span>
                    </div>
                  </div>
                  <button className="btn-success w-full" onClick={handleCheckIn}>
                    <LogIn size={16} /> Check-In Sekarang
                  </button>
                  <button className="btn-ghost w-full mt-2" onClick={requestGps}>
                    <RefreshCw size={14} /> Perbarui Lokasi
                  </button>
                </motion.div>
              )}

              {step === 'submitting' && (
                <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gps-loading-state">
                  <Loader2 size={48} className="spin text-primary" />
                  <p>Menyimpan data ke server...</p>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-success-state">
                  <CheckCircle size={80} className="text-green-400" />
                  <h3 className="gps-success-title">Berhasil!</h3>
                  <p className="gps-success-msg">{resultMessage}</p>
                </motion.div>
              )}

              {step === 'error' && (
                <motion.div key="err" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state danger">
                  <XCircle size={64} className="text-red-400" />
                  <h3 className="gps-error-title">Gagal Mendapatkan Lokasi</h3>
                  <p className="gps-error-desc">{gpsError ?? resultMessage}</p>
                  <button className="btn-danger w-full" onClick={requestGps}><RefreshCw size={16} /> Coba Lagi</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="attendance-info-card">
          <h3 className="card-section-title">Panduan Absensi Profesional</h3>
          <ul className="attendance-guide-list">
            <li><span className="guide-icon">📍</span> <b>Pastikan GPS Aktif:</b> Nyalakan pengaturan Lokasi di HP Anda dengan mode Akurasi Tinggi.</li>
            <li><span className="guide-icon">🌐</span> <b>Posisi di Luar Ruangan:</b> Jika gagal, keluar dari gedung sebentar agar HP langsung terhubung ke satelit.</li>
            <li><span className="guide-icon">🚫</span> <b>Larangan:</b> Dilarang menggunakan VPN atau Fake GPS. Sistem memiliki pendeteksi keamanan bawaan.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}