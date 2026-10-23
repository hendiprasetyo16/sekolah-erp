import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Shield, ShieldAlert, Clock, CheckCircle,
  XCircle, LogIn, LogOut, AlertTriangle, Navigation,
  Loader2, RefreshCw, Info
} from 'lucide-react';
import { attendanceService } from '../services/attendance.service';
import { getCurrentPosition, calculateDistance } from '../services/gps.utils';
import { useAuthStore } from '@/modules/auth/store/auth.store';

type GpsStep = 'init' | 'loading' | 'ready' | 'mock_detected' | 'out_of_range' | 'submitting' | 'success' | 'error';

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

const DEFAULT_RADIUS = 200; // meter, override dari settings sekolah

/**
 * Halaman Absensi Guru Berbasis GPS dengan Anti-Fake GPS
 */
export function TeacherAttendancePage() {
  const { user, school } = useAuthStore();
  const [step, setStep] = useState<GpsStep>('init');
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

  // Muat koordinat sekolah dan status hari ini
  useEffect(() => {
    if (!school?.id || !user?.id) return;
    (async () => {
      try {
        const [coords, status] = await Promise.all([
          attendanceService.getSchoolCoordinates(school.id),
          attendanceService.getTeacherTodayStatus(school.id, user.id, today),
        ]);
        if (coords) {
          setSchoolCoords({
            latitude: coords.latitude ?? -6.2,
            longitude: coords.longitude ?? 106.8,
            radius: coords.attendance_radius_meters ?? DEFAULT_RADIUS,
          });
        }
        if (status) {
          setTodayStatus({
            id: status.id,
            status: status.status,
            checkInTime: status.check_in_time,
            checkOutTime: status.check_out_time,
          });
        }
      } catch {
        // Koordinat sekolah belum diset
      }
    })();
  }, [school?.id, user?.id, today]);

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
        isWithinRadius: isWithinRadius,
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
    if (!school?.id || !user?.id || !gpsState.lat || !gpsState.lng) return;
    setStep('submitting');

    try {
      const result = await attendanceService.teacherCheckIn({
        schoolId: school.id,
        teacherId: user.id,
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
          checkInTime: (result.data as any).check_in_time,
          checkOutTime: null,
        });
      } else {
        setResultMessage(result.message);
        setStep('error');
      }
    } catch (err: any) {
      setResultMessage(err.message ?? 'Terjadi kesalahan saat menyimpan absen.');
      setStep('error');
    }
  }, [school?.id, user?.id, gpsState, today]);

  const handleCheckOut = useCallback(async () => {
    if (!school?.id || !user?.id) return;
    setIsCheckingOut(true);
    try {
      // Re-check GPS untuk checkout
      const pos = await getCurrentPosition();
      const result = await attendanceService.teacherCheckOut({
        schoolId: school.id,
        teacherId: user.id,
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
      setResultMessage(err.message ?? 'Gagal melakukan check-out.');
    }
    setIsCheckingOut(false);
  }, [school?.id, user?.id, today]);

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

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Absensi Saya</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="attendance-grid">
        {/* Kartu Status Hari Ini */}
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
                  {isCheckingOut ? 'Memproses...' : 'Check-Out Sekarang'}
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

        {/* Panel GPS Check-In */}
        {!todayStatus?.checkInTime && (
          <div className="attendance-gps-card">
            <h2 className="card-section-title">Check-In dengan GPS</h2>

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
                    Sistem akan memverifikasi lokasi Anda untuk memastikan Anda berada di area sekolah.
                  </p>
                  {!schoolCoords && (
                    <div className="gps-warning-box">
                      <AlertTriangle size={14} />
                      Koordinat sekolah belum dikonfigurasi. Hubungi admin.
                    </div>
                  )}
                  <button
                    className="btn-primary w-full"
                    onClick={requestGps}
                    disabled={!schoolCoords}
                  >
                    <MapPin size={16} />
                    Mulai Deteksi GPS
                  </button>
                </motion.div>
              )}

              {step === 'loading' && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gps-loading-state">
                  <Loader2 size={48} className="spin text-primary" />
                  <p>Mendapatkan lokasi GPS...</p>
                  <p className="text-sm opacity-60">Pastikan GPS aktif dan berada di tempat terbuka</p>
                </motion.div>
              )}

              {step === 'mock_detected' && (
                <motion.div key="mock" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state danger">
                  <ShieldAlert size={64} className="text-red-400" />
                  <h3 className="gps-error-title">⚠️ GPS Palsu Terdeteksi!</h3>
                  <p className="gps-error-desc">
                    Sistem mendeteksi penggunaan aplikasi pemalsu lokasi (Mock GPS / Fake GPS).
                    Absensi tidak dapat dilakukan.
                  </p>
                  <div className="gps-info-box">
                    <Info size={14} />
                    <span>Harap matikan semua aplikasi VPN, pemalsu GPS, atau developer mode location sebelum mencoba lagi.</span>
                  </div>
                  <button className="btn-danger w-full" onClick={requestGps}>
                    <RefreshCw size={16} />
                    Coba Lagi
                  </button>
                </motion.div>
              )}

              {step === 'out_of_range' && (
                <motion.div key="out" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state warning">
                  <MapPin size={64} className="text-yellow-400" />
                  <h3 className="gps-error-title">Di Luar Area Sekolah</h3>
                  <p className="gps-error-desc">
                    Anda berada <strong>{Math.round(gpsState.distance ?? 0)} meter</strong> dari sekolah.
                    Radius yang diizinkan: <strong>{schoolCoords?.radius ?? DEFAULT_RADIUS} meter</strong>.
                  </p>
                  <div className="gps-coords-display">
                    <span>📍 {gpsState.lat?.toFixed(6)}, {gpsState.lng?.toFixed(6)}</span>
                    <span>Akurasi: ±{Math.round(gpsState.accuracy ?? 0)}m</span>
                  </div>
                  <button className="btn-warning w-full" onClick={requestGps}>
                    <RefreshCw size={16} />
                    Refresh GPS
                  </button>
                </motion.div>
              )}

              {step === 'ready' && (
                <motion.div key="ready" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-ready-state">
                  <Shield size={64} className="text-green-400" />
                  <h3 className="gps-ready-title">Lokasi Terverifikasi ✓</h3>
                  <div className="gps-details">
                    <div className="gps-detail-item">
                      <MapPin size={14} />
                      <span>{gpsState.lat?.toFixed(6)}, {gpsState.lng?.toFixed(6)}</span>
                    </div>
                    <div className="gps-detail-item success">
                      <CheckCircle size={14} />
                      <span>
                        {gpsState.distance !== null
                          ? `${Math.round(gpsState.distance)} meter dari sekolah`
                          : 'Dalam area sekolah'}
                      </span>
                    </div>
                    <div className="gps-detail-item">
                      <Info size={14} />
                      <span>Akurasi GPS: ±{Math.round(gpsState.accuracy ?? 0)} meter</span>
                    </div>
                    <div className="gps-detail-item success">
                      <Shield size={14} />
                      <span>GPS Asli Terverifikasi</span>
                    </div>
                  </div>
                  <button className="btn-success w-full" onClick={handleCheckIn}>
                    <LogIn size={16} />
                    Check-In Sekarang
                  </button>
                  <button className="btn-ghost w-full mt-2" onClick={requestGps}>
                    <RefreshCw size={14} />
                    Refresh GPS
                  </button>
                </motion.div>
              )}

              {step === 'submitting' && (
                <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="gps-loading-state">
                  <Loader2 size={48} className="spin text-primary" />
                  <p>Menyimpan absensi...</p>
                </motion.div>
              )}

              {step === 'success' && (
                <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-success-state">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                    <CheckCircle size={80} className="text-green-400" />
                  </motion.div>
                  <h3 className="gps-success-title">Check-In Berhasil!</h3>
                  <p className="gps-success-msg">{resultMessage}</p>
                </motion.div>
              )}

              {step === 'error' && (
                <motion.div key="err" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="gps-error-state danger">
                  <XCircle size={64} className="text-red-400" />
                  <h3 className="gps-error-title">Gagal</h3>
                  <p className="gps-error-desc">{gpsError ?? resultMessage}</p>
                  <button className="btn-danger w-full" onClick={requestGps}>
                    <RefreshCw size={16} />
                    Coba Lagi
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Info panduan */}
        <div className="attendance-info-card">
          <h3 className="card-section-title">Panduan Absensi GPS</h3>
          <ul className="attendance-guide-list">
            <li><span className="guide-icon">📍</span> Pastikan GPS/Lokasi aktif di HP Anda</li>
            <li><span className="guide-icon">🚫</span> Jangan gunakan aplikasi pemalsu GPS (Fake GPS, VPN)</li>
            <li><span className="guide-icon">🌐</span> Buka halaman di tempat terbuka untuk sinyal GPS terbaik</li>
            <li><span className="guide-icon">⏰</span> Check-in sebelum 07:30 untuk status HADIR</li>
            <li><span className="guide-icon">📱</span> Bisa diakses dari HP, tablet, atau komputer</li>
            <li><span className="guide-icon">🔒</span> Data GPS disimpan untuk verifikasi admin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
