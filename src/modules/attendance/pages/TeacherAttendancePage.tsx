// src/modules/attendance/pages/TeacherAttendancePage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Home,
  FileBarChart2,
  Fingerprint,
  FileCheck2,
  History,
  Menu,
  Lock,
  MapPin,
  Clock,
  LocateFixed,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Upload,
  FileText,
  Sparkles,
  LogIn,
  LogOut,
  ShieldCheck,
  RefreshCw,
  X,
  FlaskConical,
  Briefcase,
  Building2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Settings2,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import {
  checkRedDateStatus,
  type WorkDaysMode,
} from '../utils/indonesianHolidays';

// ============================================================================
// PARAMETER CADANGAN & PENGATURAN KAMERA / FORMULIR
// ============================================================================
const FALLBACK_WORK_START_TIME = '07:30';
const FALLBACK_WORK_END_TIME = '14:30';
const DEFAULT_RADIUS_METERS = 100;
const REQUIRE_SELFIE_ON_CHECKIN = true;
const REQUIRE_SELFIE_ON_CHECKOUT = true;
const MIN_REASON_LENGTH = 15;
const FINGERPRINT_GLOW_DURATION_MS = 550; // Durasi efek cahaya menyala saat tombol sidik jari disentuh (milidetik)

const DEFAULT_DAILY_QUOTES: Array<{ quote: string; author?: string }> = [
  {
    quote:
      'Persiapan dan perbaikan diri akan menjadi peluang kesuksesan saat bertemu dengan kesempatan.',
  },
  {
    quote:
      'Disiplin adalah jembatan antara cita-cita dan pencapaian nyata di ruang kelas.',
  },
  {
    quote:
      'Keteladanan guru hari ini adalah inspirasi masa depan bagi setiap peserta didik.',
  },
  {
    quote:
      'Langkah kecil yang konsisten setiap pagi membangun perubahan besar bagi pendidikan.',
  },
];

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

const NAMA_HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

type SubView = 'beranda' | 'laporan' | 'peta' | 'izin' | 'log';
type LeaveCategory = 'DINAS_LUAR' | 'IZIN' | 'SAKIT';

interface TeacherProfile {
  id: string;
  fullName: string;
  nip?: string | null;
  nuptk?: string | null;
  position?: string | null;
  photoUrl?: string | null;
}

interface SchoolGeoAndSchedule {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  workStartTime: string;
  lateToleranceMinutes: number;
  workEndTime: string;
  workDaysMode: WorkDaysMode;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInDistance?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutDistance?: number | null;
  notes?: string | null;
  leaveType?: string | null;
  attachmentUrl?: string | null;
}

function getTodayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDeadlineWithTolerance(
  startTime: string,
  toleranceMinutes: number
): string {
  const [hStr, mStr] = startTime.split(':');
  const h = Number(hStr) || 7;
  const m = Number(mStr) || 30;
  const totalMinutes = Math.min(
    23 * 60 + 59,
    h * 60 + m + Math.max(0, toleranceMinutes)
  );
  const finalH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const finalM = String(totalMinutes % 60).padStart(2, '0');
  return `${finalH}:${finalM}`;
}

export function TeacherAttendancePage() {
  const navigate = useNavigate();
  const { user, school } = useAuthStore();
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarOpen,
    setSidebarOpen,
  } = useUIStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminOrSuperAdmin =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  // State Simulasi Super Admin
  const [simSchools, setSimSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const [simTeachers, setSimTeachers] = useState<TeacherProfile[]>([]);
  const [simTeacherId, setSimTeacherId] = useState<string>('');

  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  const [activeView, setActiveView] = useState<SubView>('beranda');
  const [now, setNow] = useState<Date>(() => new Date());

  // State Efek Menyala Tombol Sidik Jari
  const [isFingerprintGlowing, setIsFingerprintGlowing] = useState<boolean>(false);
  const glowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data Guru, Pengaturan Sekolah (GPS + Jam Kerja + Toleransi + 5/6 Hari), & Riwayat
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [schoolGeo, setSchoolGeo] = useState<SchoolGeoAndSchedule | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

  // State Kata Hari Ini (Quotes) dari Database
  const [activeQuotes, setActiveQuotes] =
    useState<Array<{ quote: string; author?: string }>>(DEFAULT_DAILY_QUOTES);
  const [quoteOffset, setQuoteOffset] = useState<number>(0);

  // State Kalender Laporan & Hari Libur dari Database
  const [calendarYear, setCalendarYear] = useState<number>(() =>
    new Date().getFullYear()
  );
  const [calendarMonth, setCalendarMonth] = useState<number>(() =>
    new Date().getMonth()
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() =>
    getTodayLocal()
  );
  const [dbHolidaysMap, setDbHolidaysMap] = useState<Record<string, string>>({});

  // State GPS & Peta Leaflet
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  // State Kamera Selfie Modal
  const [cameraModal, setCameraModal] = useState<{
    open: boolean;
    mode: 'CHECK_IN' | 'CHECK_OUT';
  }>({ open: false, mode: 'CHECK_IN' });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState<boolean>(false);

  // State Formulir Izin / Dinas Luar / Sakit
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('DINAS_LUAR');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(getTodayLocal());
  const [leaveEndDate, setLeaveEndDate] = useState<string>(getTodayLocal());
  const [leaveRefNumber, setLeaveRefNumber] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveFile, setLeaveFile] = useState<File | null>(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState<boolean>(false);

  // Filter Laporan
  const [reportScope, setReportScope] = useState<'monthly' | 'yearly'>('monthly');

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Fungsi memicu cahaya menyala pada tombol sidik jari saat disentuh
  const triggerFingerprintGlow = () => {
    setIsFingerprintGlowing(true);
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
    }
    glowTimeoutRef.current = setTimeout(() => {
      setIsFingerprintGlowing(false);
    }, FINGERPRINT_GLOW_DURATION_MS);
  };

  useEffect(() => {
    return () => {
      if (glowTimeoutRef.current) {
        clearTimeout(glowTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Muat Hari Libur Nasional & Sekolah dari Tabel national_holidays di Supabase
  const loadDatabaseHolidays = useCallback(async () => {
    try {
      let query = supabase
        .from('national_holidays')
        .select('date, name, schoolId')
        .gte('date', `${calendarYear}-01-01`)
        .lte('date', `${calendarYear}-12-31`);

      if (activeSchoolId) {
        query = query.or(`schoolId.eq.${activeSchoolId},schoolId.is.null`);
      } else {
        query = query.is('schoolId', null);
      }

      const { data, error } = await query;
      if (!error && data) {
        const mapped: Record<string, string> = {};
        for (const row of data) {
          if (!mapped[row.date] || row.schoolId !== null) {
            mapped[row.date] = row.name;
          }
        }
        setDbHolidaysMap(mapped);
      }
    } catch {
      setDbHolidaysMap({});
    }
  }, [calendarYear, activeSchoolId]);

  useEffect(() => {
    loadDatabaseHolidays();
  }, [loadDatabaseHolidays]);

  // Muat Kata Hari Ini (Quotes) Aktif dari Supabase
  const loadActiveQuotes = useCallback(async () => {
    try {
      let query = supabase
        .from('daily_quotes')
        .select('quote, author')
        .eq('isActive', true)
        .order('createdAt', { ascending: false });

      if (activeSchoolId) {
        query = query.or(`schoolId.eq.${activeSchoolId},schoolId.is.null`);
      } else {
        query = query.is('schoolId', null);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setActiveQuotes(
          data.map((d: any) => ({
            quote: d.quote,
            author: d.author ?? undefined,
          }))
        );
      } else {
        setActiveQuotes(DEFAULT_DAILY_QUOTES);
      }
    } catch {
      setActiveQuotes(DEFAULT_DAILY_QUOTES);
    }
  }, [activeSchoolId]);

  useEffect(() => {
    loadActiveQuotes();
  }, [loadActiveQuotes]);

  // Mode Simulasi Super Admin
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase
      .from('schools')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        const list = data ?? [];
        setSimSchools(list);
        if (school?.id) setSimSchoolId(school.id);
        else if (list.length > 0) setSimSchoolId(list[0].id);
      });
  }, [isSuperAdmin, school?.id]);

  useEffect(() => {
    if (!isSuperAdmin || !activeSchoolId) return;
    supabase
      .from('teachers')
      .select('id, fullName, nip, nuptk, position, photoUrl')
      .eq('schoolId', activeSchoolId)
      .eq('isActive', true)
      .order('fullName')
      .then(({ data }) => {
        const list = data ?? [];
        setSimTeachers(list);
        if (list.length > 0) setSimTeacherId(list[0].id);
        else setSimTeacherId('');
      });
  }, [isSuperAdmin, activeSchoolId]);

  // Muat Data Sekolah (GPS, Jam Masuk/Pulang, Toleransi, 5/6 Hari Kerja), Profil Guru, & Riwayat
  const loadTeacherAndAttendance = useCallback(async () => {
    if (!activeSchoolId || !user?.id) return;
    setIsLoadingData(true);
    try {
      const { data: schData } = await supabase
        .from('schools')
        .select('*')
        .eq('id', activeSchoolId)
        .maybeSingle();

      if (schData) {
        setSchoolGeo({
          id: schData.id,
          name: schData.name ?? 'Sekolah',
          latitude: Number(schData.latitude ?? schData.lat ?? -7.7956),
          longitude: Number(schData.longitude ?? schData.lng ?? 110.3695),
          radius: Number(
            schData.attendanceRadius ??
            schData.gpsRadius ??
            schData.radius ??
            DEFAULT_RADIUS_METERS
          ),
          workStartTime: schData.workStartTime || FALLBACK_WORK_START_TIME,
          lateToleranceMinutes: Math.max(
            0,
            Number(schData.lateToleranceMinutes) || 0
          ),
          workEndTime: schData.workEndTime || FALLBACK_WORK_END_TIME,
          workDaysMode:
            schData.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS',
        });
      }

      let activeTeacher: TeacherProfile | null = null;
      if (isSuperAdmin && simTeacherId) {
        activeTeacher =
          simTeachers.find((t) => t.id === simTeacherId) ?? null;
      } else {
        const { data: tByUser } = await supabase
          .from('teachers')
          .select('id, fullName, nip, nuptk, position, photoUrl')
          .eq('schoolId', activeSchoolId)
          .or(`userId.eq.${user.id},email.eq.${user.email ?? ''}`)
          .limit(1)
          .maybeSingle();
        activeTeacher = tByUser;
      }

      setTeacher(activeTeacher);

      if (!activeTeacher) {
        setTodayRecord(null);
        setHistoryRecords([]);
        return;
      }

      const targetYear = Math.min(new Date().getFullYear(), calendarYear);
      const { data: attList } = await supabase
        .from('attendances')
        .select('*')
        .eq('schoolId', activeSchoolId)
        .eq('teacherId', activeTeacher.id)
        .eq('type', 'GURU')
        .gte('date', `${targetYear}-01-01`)
        .order('date', { ascending: false });

      const records = (attList ?? []) as AttendanceRecord[];
      setHistoryRecords(records);

      const todayStr = getTodayLocal();
      const foundToday = records.find((r) => r.date === todayStr) ?? null;
      setTodayRecord(foundToday);
    } catch (err) {
      console.error('[TeacherAttendance] Gagal memuat data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [
    activeSchoolId,
    user?.id,
    user?.email,
    isSuperAdmin,
    simTeacherId,
    simTeachers,
    calendarYear,
  ]);

  useEffect(() => {
    loadTeacherAndAttendance();
  }, [loadTeacherAndAttendance]);

  const effectiveWorkStartTime =
    schoolGeo?.workStartTime || FALLBACK_WORK_START_TIME;
  const effectiveToleranceMinutes = schoolGeo?.lateToleranceMinutes ?? 0;
  const effectiveWorkEndTime =
    schoolGeo?.workEndTime || FALLBACK_WORK_END_TIME;
  const effectiveWorkDaysMode: WorkDaysMode =
    schoolGeo?.workDaysMode || 'SIX_DAYS';
  const effectiveDeadlineStr = useMemo(
    () =>
      formatDeadlineWithTolerance(
        effectiveWorkStartTime,
        effectiveToleranceMinutes
      ),
    [effectiveWorkStartTime, effectiveToleranceMinutes]
  );

  // Pelacakan GPS Live
  const requestGpsPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Perangkat/browser ini tidak mendukung GPS.');
      return;
    }
    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setGpsError('Izin lokasi ditolak. Aktifkan izin GPS pada browser Anda.');
        } else {
          setGpsError('Gagal mendeteksi titik GPS. Pastikan GPS perangkat aktif.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (activeView === 'peta') {
      requestGpsPosition();
    }
  }, [activeView, requestGpsPosition]);

  // Inisialisasi Peta Leaflet
  useEffect(() => {
    if (activeView !== 'peta' || !mapContainerRef.current || !schoolGeo) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([schoolGeo.latitude, schoolGeo.longitude], 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.circle([schoolGeo.latitude, schoolGeo.longitude], {
      radius: schoolGeo.radius,
      color: '#10B981',
      fillColor: '#10B981',
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);

    L.circleMarker([schoolGeo.latitude, schoolGeo.longitude], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#0F172A',
      fillOpacity: 1,
    })
      .bindPopup(`<b>${schoolGeo.name}</b><br/>Radius: ${schoolGeo.radius}m`)
      .addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeView, schoolGeo]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userCoords || !schoolGeo) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    const marker = L.circleMarker([userCoords.lat, userCoords.lng], {
      radius: 9,
      color: '#FFFFFF',
      weight: 3,
      fillColor: '#EF4444',
      fillOpacity: 1,
    })
      .bindPopup('Posisi Anda Saat Ini')
      .addTo(map);

    userMarkerRef.current = marker;

    const bounds = L.latLngBounds([
      [schoolGeo.latitude, schoolGeo.longitude],
      [userCoords.lat, userCoords.lng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }, [userCoords, schoolGeo]);

  const distanceMeters = useMemo(() => {
    if (!userCoords || !schoolGeo) return null;
    return calculateDistanceMeters(
      userCoords.lat,
      userCoords.lng,
      schoolGeo.latitude,
      schoolGeo.longitude
    );
  }, [userCoords, schoolGeo]);

  const isWithinRadius = useMemo(() => {
    if (distanceMeters === null || !schoolGeo) return false;
    return distanceMeters <= schoolGeo.radius;
  }, [distanceMeters, schoolGeo]);

  const formatDistanceLabel = (meters: number | null) => {
    if (meters === null) return 'Menghitung...';
    if (meters >= 1000) return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
    return `${Math.round(meters)} m`;
  };

  // Status Kehadiran Hari Ini & Aturan Kunci Kartu Datang / Pulang
  const hasCheckedIn = Boolean(todayRecord?.checkInTime);
  const hasCheckedOut = Boolean(todayRecord?.checkOutTime);
  const isOnLeaveToday = Boolean(
    todayRecord && ['IZIN', 'SAKIT'].includes(todayRecord.status)
  );

  // Kartu Datang terkunci jika sudah absen datang ATAU sedang izin/sakit
  const isCheckInLocked = hasCheckedIn || isOnLeaveToday;
  // Kartu Pulang aktif hanya jika sudah absen datang dan belum absen pulang
  const canCheckOut = hasCheckedIn && !hasCheckedOut && !isOnLeaveToday;

  const attendancePhase: 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED' | 'ON_LEAVE' =
    useMemo(() => {
      if (isOnLeaveToday) return 'ON_LEAVE';
      if (!hasCheckedIn) return 'CHECK_IN';
      if (!hasCheckedOut) return 'CHECK_OUT';
      return 'COMPLETED';
    }, [isOnLeaveToday, hasCheckedIn, hasCheckedOut]);

  const openCameraModal = async (mode: 'CHECK_IN' | 'CHECK_OUT') => {
    const needSelfie =
      mode === 'CHECK_IN' ? REQUIRE_SELFIE_ON_CHECKIN : REQUIRE_SELFIE_ON_CHECKOUT;

    if (!needSelfie) {
      await submitGpsAttendance(mode, null);
      return;
    }

    setCapturedBlob(null);
    setCapturedPreview(null);
    setCameraModal({ open: true, mode });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      showToast('error', 'Kamera tidak dapat diakses. Izinkan akses kamera di browser.');
      setCameraModal({ open: false, mode });
    }
  };

  const closeCameraModal = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraModal((prev) => ({ ...prev, open: false }));
  };

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedPreview(URL.createObjectURL(blob));
        }
      },
      'image/jpeg',
      0.82
    );
  };

  // Aksi utama ketika tombol Sidik Jari ditekan
  const handleFingerprintAction = () => {
    triggerFingerprintGlow();

    // 1. Jika sedang di luar halaman Peta -> buka halaman Peta & muat GPS
    if (activeView !== 'peta') {
      setActiveView('peta');
      requestGpsPosition();
      return;
    }

    // 2. Jika sudah berada di dalam halaman Peta -> jalankan proses presensi
    if (!teacher) {
      showToast('error', 'Akun Anda belum terhubung dengan data Master Guru/PTK.');
      return;
    }

    if (attendancePhase === 'COMPLETED') {
      showToast(
        'success',
        `Presensi hari ini sudah lengkap (Masuk ${formatShortTime(
          todayRecord?.checkInTime
        )} • Pulang ${formatShortTime(todayRecord?.checkOutTime)}).`
      );
      return;
    }

    if (attendancePhase === 'ON_LEAVE') {
      showToast('success', `Hari ini Anda tercatat ${todayRecord?.status}.`);
      return;
    }

    if (isLocating || !userCoords || distanceMeters === null) {
      requestGpsPosition();
      showToast(
        'error',
        'Sedang mendeteksi titik GPS Anda. Tunggu sebentar lalu ketuk sidik jari kembali.'
      );
      return;
    }

    if (!isWithinRadius) {
      requestGpsPosition();
      showToast(
        'error',
        `Anda masih di luar radius sekolah (${formatDistanceLabel(
          distanceMeters
        )}). Lokasi GPS diperbarui.`
      );
      return;
    }

    // Berada di dalam radius -> buka kamera verifikasi Check-In atau Check-Out
    openCameraModal(attendancePhase);
  };

  // Simpan Check-In / Check-Out ke Supabase menggunakan Jam Masuk + Toleransi Keterlambatan
  const submitGpsAttendance = async (
    mode: 'CHECK_IN' | 'CHECK_OUT',
    selfieBlob: Blob | null
  ) => {
    if (!teacher || !activeSchoolId || !userCoords || distanceMeters === null) return;
    setIsSubmittingAttendance(true);
    try {
      let uploadedPath: string | null = null;
      const todayStr = getTodayLocal();

      if (selfieBlob) {
        const fileName = `${activeSchoolId}/${teacher.id}/${todayStr}_${mode}_${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('attendance-selfies')
          .upload(fileName, selfieBlob, { contentType: 'image/jpeg', upsert: true });

        if (!uploadErr) {
          uploadedPath = fileName;
        }
      }

      const nowObj = new Date();
      const nowIso = nowObj.toISOString();

      if (mode === 'CHECK_IN') {
        const [startH, startM] = effectiveWorkStartTime.split(':').map(Number);
        const deadline = new Date();
        deadline.setHours(
          startH || 7,
          (startM ?? 30) + effectiveToleranceMinutes,
          59,
          999
        );
        const status = nowObj > deadline ? 'TERLAMBAT' : 'HADIR';

        const { error } = await supabase.from('attendances').insert({
          schoolId: activeSchoolId,
          teacherId: teacher.id,
          type: 'GURU',
          date: todayStr,
          status,
          checkInTime: nowIso,
          checkInLat: userCoords.lat,
          checkInLng: userCoords.lng,
          checkInDistance: Math.round(distanceMeters),
          isCheckInMock: false,
          checkInSelfieUrl: uploadedPath,
        });

        if (error) throw error;
        showToast(
          'success',
          status === 'TERLAMBAT'
            ? effectiveToleranceMinutes > 0
              ? `Check-In tercatat (Status: Terlambat — lewat batas toleransi ${effectiveDeadlineStr}).`
              : `Check-In tercatat (Status: Terlambat — batas masuk ${effectiveWorkStartTime}).`
            : 'Check-In Datang berhasil tercatat!'
        );
      } else {
        if (!todayRecord?.id) {
          throw new Error('Anda belum melakukan Check-In masuk hari ini.');
        }

        const { error } = await supabase
          .from('attendances')
          .update({
            checkOutTime: nowIso,
            checkOutLat: userCoords.lat,
            checkOutLng: userCoords.lng,
            checkOutDistance: Math.round(distanceMeters),
          })
          .eq('id', todayRecord.id);

        if (error) throw error;
        showToast('success', 'Check-Out Pulang berhasil tercatat! Hati-hati di jalan.');
      }

      closeCameraModal();
      await loadTeacherAndAttendance();
      setActiveView('beranda');
    } catch (err: any) {
      showToast('error', err.message ?? 'Gagal menyimpan presensi.');
    } finally {
      setIsSubmittingAttendance(false);
    }
  };

  // Simpan Pengajuan Ketat Izin / Dinas Luar / Sakit
  const handleSubmitStrictLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher || !activeSchoolId) return;

    if (!leaveFile) {
      showToast(
        'error',
        'Wajib mengunggah foto/PDF bukti surat tugas atau surat keterangan dokter!'
      );
      return;
    }

    if (leaveReason.trim().length < MIN_REASON_LENGTH) {
      showToast(
        'error',
        `Keterangan harus jelas (minimal ${MIN_REASON_LENGTH} karakter).`
      );
      return;
    }

    if (leaveEndDate < leaveStartDate) {
      showToast('error', 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const ext = leaveFile.name.split('.').pop() || 'pdf';
      const storagePath = `${activeSchoolId}/leave-docs/${teacher.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('attendance-selfies')
        .upload(storagePath, leaveFile, { upsert: true });

      if (upErr) throw new Error(`Gagal mengunggah bukti lampiran: ${upErr.message}`);

      const datesToInsert: string[] = [];
      const cursor = new Date(`${leaveStartDate}T00:00:00`);
      const last = new Date(`${leaveEndDate}T00:00:00`);
      while (cursor <= last) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const d = String(cursor.getDate()).padStart(2, '0');
        datesToInsert.push(`${y}-${m}-${d}`);
        cursor.setDate(cursor.getDate() + 1);
      }

      const dbStatus = leaveCategory === 'SAKIT' ? 'SAKIT' : 'IZIN';
      const categoryLabel =
        leaveCategory === 'DINAS_LUAR'
          ? 'Dinas Luar'
          : leaveCategory === 'SAKIT'
            ? 'Sakit'
            : 'Izin Pribadi';
      const formattedNote = `[${categoryLabel}]${leaveRefNumber.trim() ? ` No. Surat: ${leaveRefNumber.trim()} —` : ''
        } ${leaveReason.trim()}`;

      for (const dt of datesToInsert) {
        const existing = historyRecords.find((r) => r.date === dt);
        if (existing) {
          await supabase
            .from('attendances')
            .update({
              status: dbStatus,
              notes: formattedNote,
              leaveType: leaveCategory,
              attachmentUrl: storagePath,
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('attendances').insert({
            schoolId: activeSchoolId,
            teacherId: teacher.id,
            type: 'GURU',
            date: dt,
            status: dbStatus,
            notes: formattedNote,
            leaveType: leaveCategory,
            endDate: leaveEndDate,
            attachmentUrl: storagePath,
          });
        }
      }

      setLeaveRefNumber('');
      setLeaveReason('');
      setLeaveFile(null);
      await loadTeacherAndAttendance();
      showToast(
        'success',
        `Pengajuan ${categoryLabel} (${datesToInsert.length} hari) berhasil dicatat beserta bukti lampiran.`
      );
      setActiveView('beranda');
    } catch (err: any) {
      showToast('error', err.message ?? 'Gagal mengirim pengajuan izin/dinas.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Perhitungan Statistik Laporan
  const selectedMonthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
  const selectedMonthLabel = `${NAMA_BULAN_ID[calendarMonth]} ${calendarYear}`;

  const reportStats = useMemo(() => {
    const filtered =
      reportScope === 'monthly'
        ? historyRecords.filter((r) => r.date.startsWith(selectedMonthPrefix))
        : historyRecords.filter((r) =>
          r.date.startsWith(String(calendarYear))
        );

    const hadir = filtered.filter((r) => r.status === 'HADIR').length;
    const terlambat = filtered.filter((r) => r.status === 'TERLAMBAT').length;
    const izinSakit = filtered.filter((r) =>
      ['IZIN', 'SAKIT'].includes(r.status)
    ).length;
    const alpa = filtered.filter((r) => r.status === 'ALPA').length;
    const totalEfektif = Math.max(filtered.length, 1);
    const pct = Math.round(((hadir + terlambat) / totalEfektif) * 100);

    return {
      list: filtered,
      hadir,
      terlambat,
      izinSakit,
      alpa,
      totalRecorded: filtered.length,
      percentage: filtered.length === 0 ? 0 : pct,
    };
  }, [historyRecords, reportScope, selectedMonthPrefix, calendarYear]);

  // Generator Grid Kalender Bulanan
  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const rec of historyRecords) {
      map.set(rec.date, rec);
    }
    return map;
  }, [historyRecords]);

  const calendarDaysGrid = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const cells: Array<{
      dateStr: string | null;
      dayNum: number | null;
      isRedDate: boolean;
      holidayName: string | null;
      record?: AttendanceRecord;
    }> = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({
        dateStr: null,
        dayNum: null,
        isRedDate: false,
        holidayName: null,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const redStatus = checkRedDateStatus(
        dateStr,
        dbHolidaysMap,
        effectiveWorkDaysMode
      );
      cells.push({
        dateStr,
        dayNum: d,
        isRedDate: redStatus.isRedDate,
        holidayName: redStatus.holidayName,
        record: recordsByDate.get(dateStr),
      });
    }

    return cells;
  }, [
    calendarYear,
    calendarMonth,
    dbHolidaysMap,
    effectiveWorkDaysMode,
    recordsByDate,
  ]);

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  const selectedDateInfo = useMemo(() => {
    if (!selectedCalendarDate) return null;
    const redStatus = checkRedDateStatus(
      selectedCalendarDate,
      dbHolidaysMap,
      effectiveWorkDaysMode
    );
    const record = recordsByDate.get(selectedCalendarDate);
    const dateObj = new Date(`${selectedCalendarDate}T00:00:00`);
    const label = dateObj.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return {
      dateStr: selectedCalendarDate,
      label,
      ...redStatus,
      record,
    };
  }, [
    selectedCalendarDate,
    dbHolidaysMap,
    effectiveWorkDaysMode,
    recordsByDate,
  ]);

  const formattedDateFull = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const monthYearLabel = now.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
  const hoursStr = String(now.getHours()).padStart(2, '0');
  const minutesStr = String(now.getMinutes()).padStart(2, '0');
  const secondsStr = String(now.getSeconds()).padStart(2, '0');

  const formatShortTime = (iso?: string | null) => {
    if (!iso) return '00:00';
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeQuoteItem =
    activeQuotes[(now.getDate() + quoteOffset) % activeQuotes.length] ??
    DEFAULT_DAILY_QUOTES[0];

  const todayStr = getTodayLocal();
  const isOnMapView = activeView === 'peta';
  const isCheckOutPhase = attendancePhase === 'CHECK_OUT';

  // Penentuan warna & aura cahaya tombol Sidik Jari:
  // - Di luar Peta -> Oranye (untuk masuk ke menu Peta Presensi)
  // - Di dalam Peta saat Absen Masuk -> Hijau
  // - Di dalam Peta saat Absen Pulang -> Merah
  const fingerprintButtonStyle = useMemo(() => {
    if (!isOnMapView) {
      return isFingerprintGlowing
        ? 'bg-linear-to-br from-amber-300 via-orange-400 to-orange-600 text-slate-950 scale-110 ring-4 ring-orange-300/90 shadow-[0_0_30px_rgba(249,115,22,0.95)]'
        : 'bg-linear-to-br from-amber-300 via-amber-500 to-orange-500 text-slate-950 shadow-xl hover:scale-105';
    }

    if (attendancePhase === 'CHECK_OUT') {
      return isFingerprintGlowing
        ? 'bg-linear-to-br from-rose-400 via-red-500 to-red-700 text-white scale-110 ring-4 ring-red-400/90 shadow-[0_0_32px_rgba(239,68,68,0.95)]'
        : 'bg-linear-to-br from-rose-500 via-red-600 to-red-700 text-white shadow-[0_6px_22px_rgba(220,38,38,0.65)] hover:scale-105';
    }

    if (attendancePhase === 'COMPLETED' || attendancePhase === 'ON_LEAVE') {
      return isFingerprintGlowing
        ? 'bg-slate-600 text-white scale-105 ring-4 ring-slate-400/70 shadow-[0_0_24px_rgba(148,163,184,0.85)]'
        : 'bg-linear-to-br from-slate-500 to-slate-700 text-white/90 shadow-lg';
    }

    // Default di dalam Peta untuk Absen Masuk (CHECK_IN) -> Hijau
    return isFingerprintGlowing
      ? 'bg-linear-to-br from-emerald-300 via-emerald-400 to-teal-500 text-white scale-110 ring-4 ring-emerald-300/90 shadow-[0_0_32px_rgba(16,185,129,0.95)]'
      : 'bg-linear-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white shadow-[0_6px_22px_rgba(16,185,129,0.65)] hover:scale-105';
  }, [isOnMapView, attendancePhase, isFingerprintGlowing]);

  const fingerprintAuraColor = !isOnMapView
    ? 'bg-orange-400'
    : attendancePhase === 'CHECK_OUT'
      ? 'bg-red-500'
      : 'bg-emerald-400';

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-28 max-w-xl mx-auto px-1">
      {/* Banner Simulasi Khusus SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="mb-4 p-3 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-300">
              <FlaskConical size={16} />
              <span>Simulasi Super Admin:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  navigate('/academic/master-data', { state: { tab: 'presensi' } })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
              >
                <Settings2 size={12} />
                Jam & Libur
              </button>
              <button
                type="button"
                onClick={() => navigate('/attendance/quotes')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
              >
                <Sparkles size={12} />
                Quotes
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full">
            <select
              className="form-input text-xs py-1.5 flex-1 min-w-40"
              value={simSchoolId}
              onChange={(e) => setSimSchoolId(e.target.value)}
            >
              {simSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className="form-input text-xs py-1.5 flex-1 min-w-44"
              value={simTeacherId}
              onChange={(e) => setSimTeacherId(e.target.value)}
            >
              {simTeachers.length === 0 ? (
                <option value="">Tidak ada data PTK</option>
              ) : (
                simTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`mb-4 p-3.5 rounded-2xl border text-xs font-medium flex items-center gap-2.5 shadow-lg ${toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-red-600 text-white border-red-500'
              }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0" />
            ) : (
              <AlertTriangle size={18} className="shrink-0" />
            )}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====================================================================
          TAMPILAN 1: BERANDA
      ==================================================================== */}
      {activeView === 'beranda' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="relative rounded-[28px] overflow-hidden shadow-xl bg-linear-to-br from-[#1C3D6E] via-[#26508E] to-[#3468AE] p-5 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute right-12 top-24 w-28 h-28 rounded-full bg-amber-300/10" />

            <div className="relative flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleSidebar}
                  className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                  title="Tampilkan / Sembunyikan Menu Sidebar"
                  aria-label="Toggle Sidebar"
                >
                  <Menu size={18} />
                </button>
                <div>
                  <h1 className="text-xl font-bold tracking-tight leading-tight">
                    Selamat Datang!
                  </h1>
                  <p className="text-xs text-blue-100/85 mt-0.5">
                    {formattedDateFull}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadTeacherAndAttendance}
                className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                title="Segarkan Data"
              >
                <RefreshCw size={17} className={isLoadingData ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* KARTU PROFIL & JAM */}
            <div className="relative rounded-3xl bg-linear-to-br from-[#F9FAFB] via-[#F7F5F0] to-[#EFECE3] text-slate-800 p-4 shadow-lg border border-white/80 space-y-3">
              {/* Baris Atas: Profil Guru Melebar Penuh */}
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 mt-0.5">
                  <div className="p-0.5 rounded-2xl bg-linear-to-br from-amber-400 to-[#1E447A]">
                    {teacher?.photoUrl ? (
                      <img
                        src={teacher.photoUrl}
                        alt={teacher.fullName}
                        className="w-14 h-14 rounded-[14px] object-cover bg-white"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-[14px] bg-linear-to-br from-[#1C3D6E] to-[#2E62A8] text-white flex items-center justify-center text-lg font-bold">
                        {(teacher?.fullName ?? user?.fullName ?? 'G').charAt(0)}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center shadow border border-white">
                    <ShieldCheck size={12} />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-[15px] sm:text-base text-slate-900 leading-snug wrap-break-word">
                    {teacher?.fullName ??
                      user?.fullName ??
                      'Profil Guru Belum Tertaut'}
                  </h2>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {teacher?.nip || teacher?.nuptk || 'PTK Terdaftar'}
                  </p>
                  <p className="text-[11px] text-slate-600 flex items-start gap-1.5 mt-1 leading-snug">
                    <Briefcase
                      size={12}
                      className="text-[#1C3D6E] shrink-0 mt-0.5"
                    />
                    <span>{teacher?.position || 'Guru / Tenaga Pendidik'}</span>
                  </p>
                  <p className="text-[11px] text-slate-600 flex items-start gap-1.5 mt-0.5 leading-snug">
                    <Building2
                      size={12}
                      className="text-amber-600 shrink-0 mt-0.5"
                    />
                    <span>{schoolGeo?.name ?? 'Unit Sekolah'}</span>
                  </p>
                </div>
              </div>

              {/* Baris Bawah: Tingkat Kehadiran & Jam Digital */}
              <div className="grid grid-cols-12 gap-2.5 items-stretch">
                <div className="col-span-7 rounded-2xl bg-white/85 backdrop-blur-xs border border-slate-200/80 p-3 shadow-xs flex flex-col justify-between">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#254E89] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <TrendingUp size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-slate-500 leading-tight">
                        Tingkat Kehadiran
                      </p>
                      <p className="text-[11px] font-semibold text-slate-700 leading-snug mt-0.5">
                        {monthYearLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-extrabold text-slate-900">
                        {reportStats.percentage}%
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {reportStats.hadir + reportStats.terlambat} hari hadir
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200 mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-amber-400 to-emerald-500 transition-all duration-500"
                        style={{ width: `${reportStats.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-5 rounded-2xl bg-linear-to-b from-[#F2F4F8] via-[#F7F3E6] to-[#EDE3C8] border border-amber-300/75 py-2.5 px-2 flex flex-col items-center justify-between text-center shadow-inner relative overflow-hidden">
                  <div className="pointer-events-none absolute -bottom-4 -right-4 w-16 h-16 rounded-full bg-amber-300/20" />

                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <span className="text-xl font-extrabold text-[#1E3F73] leading-none font-mono">
                      {hoursStr}
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-slate-400">
                      JAM
                    </span>
                  </div>

                  <div className="w-full h-px bg-amber-300/60 my-1" />

                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <span className="text-xl font-extrabold text-[#1E3F73] leading-none font-mono">
                      {minutesStr}
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-slate-400">
                      MNT
                    </span>
                  </div>

                  <div className="w-full h-px bg-amber-300/60 my-1" />

                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <span className="text-xl font-extrabold text-rose-500 leading-none font-mono">
                      {secondsStr}
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-rose-400">
                      DTK
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dua Kartu Utama: DATANG (Terkunci jika sudah absen masuk) & PULANG */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* KARTU DATANG */}
            <button
              type="button"
              disabled={isCheckInLocked}
              onClick={() => {
                if (isCheckInLocked) return;
                setActiveView('peta');
              }}
              title={
                hasCheckedIn
                  ? 'Presensi datang sudah tercatat dan terkunci.'
                  : isOnLeaveToday
                    ? `Hari ini tercatat ${todayRecord?.status}.`
                    : 'Ketuk untuk melakukan presensi datang di peta'
              }
              className={`text-left rounded-[26px] p-4 shadow-lg transition bg-linear-to-br from-[#475E78] via-[#3A4F68] to-[#2B3D52] text-white border border-white/15 flex flex-col justify-between min-h-43.75 ${isCheckInLocked
                ? 'opacity-65 cursor-not-allowed saturate-75'
                : 'hover:scale-[1.01] active:scale-[0.99] ring-2 ring-emerald-400/70'
                }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-white/10">
                    <LogIn size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-bold leading-tight">Datang</div>
                    <div className="text-[10px] font-semibold text-emerald-300">
                      Check-In
                    </div>
                  </div>
                </div>
                {isCheckInLocked && (
                  <div className="flex items-center gap-1 shrink-0">
                    {hasCheckedIn && (
                      <CheckCircle2 size={15} className="text-emerald-300" />
                    )}
                    <span
                      className="p-1.5 rounded-lg bg-black/25 text-slate-200"
                      title="Terkunci"
                    >
                      <Lock size={13} />
                    </span>
                  </div>
                )}
              </div>

              <div className="my-3 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                  {formatShortTime(todayRecord?.checkInTime)}
                </div>
                <div className="text-[10px] text-slate-200/80 mt-1">
                  Jadwal {effectiveWorkStartTime}
                  {effectiveToleranceMinutes > 0
                    ? ` (+${effectiveToleranceMinutes}m)`
                    : ''}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-slate-200/85 truncate">
                  {isOnLeaveToday
                    ? `Terkunci • ${todayRecord?.status}`
                    : hasCheckedIn
                      ? 'Terkunci • Sudah absen datang'
                      : effectiveToleranceMinutes > 0
                        ? `Batas toleransi ${effectiveDeadlineStr}`
                        : 'Ketuk untuk absen datang'}
                </p>
                <div className="text-[11px] text-slate-100 flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${hasCheckedIn
                      ? 'bg-emerald-400'
                      : 'bg-amber-300 animate-pulse'
                      }`}
                  />
                  <span className="truncate">
                    {hasCheckedIn
                      ? `Status: ${todayRecord?.status}`
                      : 'Menunggu presensi datang'}
                  </span>
                </div>
              </div>
            </button>

            {/* KARTU PULANG */}
            <button
              type="button"
              disabled={!canCheckOut}
              onClick={() => {
                if (!canCheckOut) return;
                setActiveView('peta');
              }}
              title={
                !hasCheckedIn
                  ? 'Tombol Pulang terkunci. Lakukan absensi Datang terlebih dahulu.'
                  : hasCheckedOut
                    ? 'Anda sudah melakukan presensi pulang hari ini.'
                    : 'Ketuk untuk melakukan presensi pulang di peta'
              }
              className={`text-left rounded-[26px] p-4 shadow-lg transition bg-linear-to-br from-[#D6B16B] via-[#C59D52] to-[#AD8438] text-white border border-white/20 flex flex-col justify-between min-h-43.75 ${!canCheckOut
                ? 'opacity-65 cursor-not-allowed saturate-75'
                : 'hover:scale-[1.01] active:scale-[0.99] ring-2 ring-red-400/70'
                }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-white/15">
                    <LogOut size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-bold leading-tight">Pulang</div>
                    <div className="text-[10px] font-semibold text-red-100">
                      Check-Out
                    </div>
                  </div>
                </div>
                {!canCheckOut && (
                  <div className="flex items-center gap-1 shrink-0">
                    {hasCheckedOut && (
                      <CheckCircle2 size={15} className="text-emerald-200" />
                    )}
                    <span
                      className="p-1.5 rounded-lg bg-black/25 text-amber-100"
                      title="Terkunci"
                    >
                      <Lock size={13} />
                    </span>
                  </div>
                )}
              </div>

              <div className="my-3 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                  {formatShortTime(todayRecord?.checkOutTime)}
                </div>
                <div className="text-[10px] text-amber-50/90 mt-1">
                  Jadwal {effectiveWorkEndTime}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-amber-50/90 truncate">
                  {!hasCheckedIn
                    ? 'Terkunci • Absen datang dulu'
                    : hasCheckedOut
                      ? 'Terkunci • Sudah absen pulang'
                      : 'Presensi pulang belum tercatat'}
                </p>
                <div className="text-[11px] text-white flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${hasCheckedOut
                      ? 'bg-emerald-300'
                      : canCheckOut
                        ? 'bg-red-400 animate-ping'
                        : 'bg-amber-100/60'
                      }`}
                  />
                  <span className="truncate">
                    {!hasCheckedIn
                      ? 'Aktif setelah absen masuk'
                      : hasCheckedOut
                        ? 'Selesai hari ini'
                        : 'Ketuk untuk absen pulang'}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </motion.div>
      )}

      {/* ====================================================================
          TAMPILAN 2: PRESENSI PETA GPS + KATA HARI INI
      ==================================================================== */}
      {activeView === 'peta' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-3"
        >
          {/* Header Peta dengan tulisan Check-In / Check-Out di bawah */}
          <div className="rounded-2xl bg-linear-to-r from-[#1D3554] to-[#525B44] p-4 text-white flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
                title="Toggle Sidebar"
              >
                <Menu size={17} />
              </button>
              <div>
                <h2 className="font-bold text-base leading-tight">
                  {attendancePhase === 'CHECK_OUT'
                    ? 'Presensi Pulang'
                    : attendancePhase === 'COMPLETED'
                      ? 'Presensi Hari Ini Selesai'
                      : attendancePhase === 'ON_LEAVE'
                        ? `Status ${todayRecord?.status}`
                        : 'Presensi Datang'}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${attendancePhase === 'CHECK_OUT'
                      ? 'bg-red-500/85 text-white'
                      : 'bg-emerald-500/85 text-white'
                      }`}
                  >
                    {attendancePhase === 'CHECK_OUT'
                      ? 'Check-Out'
                      : attendancePhase === 'COMPLETED'
                        ? 'Selesai'
                        : attendancePhase === 'ON_LEAVE'
                          ? 'Izin / Sakit'
                          : 'Check-In'}
                  </span>
                  <span className="text-[11px] text-white/80">
                    • {formattedDateFull}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={requestGpsPosition}
              disabled={isLocating}
              className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
              title="Perbarui Titik GPS"
            >
              <LocateFixed size={19} className={isLocating ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-white/15 shadow-xl bg-slate-900">
            <div ref={mapContainerRef} className="w-full h-56 sm:h-72 z-10" />

            {gpsError && (
              <div className="absolute inset-x-3 top-3 z-20 p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-red-400" />
                <span>{gpsError}</span>
              </div>
            )}

            <div className="p-3.5 sm:p-4 bg-white/95 text-slate-800 backdrop-blur-md">
              <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b border-slate-200">
                <div>
                  <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <MapPin size={16} />
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {formatDistanceLabel(distanceMeters)}
                  </div>
                  <div className="text-[11px] text-slate-500">Jarak</div>
                </div>

                <div>
                  <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <LocateFixed size={16} />
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {schoolGeo?.radius ?? DEFAULT_RADIUS_METERS} m
                  </div>
                  <div className="text-[11px] text-slate-500">Radius Sekolah</div>
                </div>

                <div>
                  <div className="w-8 h-8 mx-auto mb-1 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Clock size={16} />
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 font-mono">
                    {hoursStr}:{minutesStr}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Batas {effectiveDeadlineStr}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-linear-to-r from-[#1D4E7A] to-[#2B8A78] p-3 text-center text-white relative">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold">
                    <Sparkles size={11} /> Kata Hari Ini
                  </span>
                  {activeQuotes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setQuoteOffset((prev) => prev + 1)}
                      className="p-1 rounded-full bg-white/15 hover:bg-white/25 transition"
                      title="Ganti kutipan berikutnya"
                    >
                      <RefreshCw size={10} />
                    </button>
                  )}
                  {isAdminOrSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => navigate('/attendance/quotes')}
                      className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold hover:bg-amber-300 transition"
                      title="Buka Menu Kata Hari Ini"
                    >
                      Kelola
                    </button>
                  )}
                </div>
                <p className="text-xs italic leading-relaxed text-white/95">
                  "{activeQuoteItem.quote}"
                </p>
                {activeQuoteItem.author && (
                  <p className="text-[10px] text-amber-200 font-semibold mt-1">
                    — {activeQuoteItem.author}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Kartu Petunjuk Status & Instruksi Ketuk Tombol Sidik Jari */}
          {!teacher ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-200 text-center">
              Akun Anda belum terhubung dengan data Master Guru/PTK.
            </div>
          ) : attendancePhase === 'COMPLETED' ? (
            <div className="w-full py-3 px-4 rounded-2xl bg-emerald-600/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 text-center">
              <CheckCircle2 size={17} className="shrink-0" />
              <span>
                Presensi Lengkap (Masuk {formatShortTime(todayRecord?.checkInTime)} •
                Pulang {formatShortTime(todayRecord?.checkOutTime)})
              </span>
            </div>
          ) : attendancePhase === 'ON_LEAVE' ? (
            <div className="w-full py-3 px-4 rounded-2xl bg-blue-600/15 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold text-xs flex items-center justify-center gap-2">
              <FileCheck2 size={17} className="shrink-0" />
              <span>Hari Ini Tercatat {todayRecord?.status}</span>
            </div>
          ) : !isWithinRadius ? (
            <button
              type="button"
              onClick={requestGpsPosition}
              className="w-full py-3 px-4 rounded-2xl bg-[#F06464] hover:bg-[#e25555] text-white font-bold text-xs shadow-lg flex flex-col items-center justify-center gap-0.5 transition"
            >
              <div className="flex items-center gap-1.5">
                <XCircle size={16} />
                <span>Di Luar Radius ({formatDistanceLabel(distanceMeters)})</span>
              </div>
              <span className="text-[10px] font-normal text-red-100">
                Ketuk di sini untuk memperbarui lokasi GPS
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFingerprintAction}
              className={`w-full py-3 px-4 rounded-2xl font-bold text-white shadow-lg flex flex-col items-center justify-center transition ${isCheckOutPhase
                ? 'bg-linear-to-r from-rose-600 to-red-700 hover:opacity-95'
                : 'bg-linear-to-r from-emerald-500 to-teal-600 hover:opacity-95'
                }`}
            >
              <span className="text-sm flex items-center gap-1.5">
                <Fingerprint size={17} />
                {isCheckOutPhase ? 'Presensi Pulang' : 'Presensi Datang'}
              </span>
              <span className="text-[11px] font-medium text-white/90 mt-0.5">
                {isCheckOutPhase
                  ? 'Check-Out • Ketuk tombol sidik jari merah di bawah'
                  : 'Check-In • Ketuk tombol sidik jari hijau di bawah'}
              </span>
            </button>
          )}
        </motion.div>
      )}

      {/* ====================================================================
          TAMPILAN 3: FORMULIR KETAT IZIN / DINAS LUAR / SAKIT
      ==================================================================== */}
      {activeView === 'izin' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="data-card space-y-4"
        >
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <FileCheck2 size={18} className="text-amber-500" />
                Pengajuan Dinas Luar, Izin, & Sakit
              </h2>
              <p className="text-xs opacity-70 mt-0.5">
                Wajib melampirkan bukti surat tugas, undangan dinas, atau surat keterangan dokter.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleSidebar}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition"
              title="Toggle Sidebar"
            >
              <Menu size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmitStrictLeave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Jenis Ketidakhadiran *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'DINAS_LUAR', label: 'Dinas Luar' },
                    { value: 'IZIN', label: 'Izin Pribadi' },
                    { value: 'SAKIT', label: 'Sakit' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setLeaveCategory(item.value)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${leaveCategory === item.value
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-muted/50 border-border opacity-80 hover:opacity-100'
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Tanggal Mulai *
                </label>
                <input
                  type="date"
                  required
                  value={leaveStartDate}
                  onChange={(e) => {
                    setLeaveStartDate(e.target.value);
                    if (leaveEndDate < e.target.value) {
                      setLeaveEndDate(e.target.value);
                    }
                  }}
                  className="form-input w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Tanggal Selesai *
                </label>
                <input
                  type="date"
                  required
                  min={leaveStartDate}
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  className="form-input w-full text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                {leaveCategory === 'DINAS_LUAR'
                  ? 'Nomor Surat Tugas / Instansi Tujuan *'
                  : 'Nomor Surat / Nama Fasilitas Kesehatan (Opsional)'}
              </label>
              <input
                type="text"
                required={leaveCategory === 'DINAS_LUAR'}
                value={leaveRefNumber}
                onChange={(e) => setLeaveRefNumber(e.target.value)}
                placeholder={
                  leaveCategory === 'DINAS_LUAR'
                    ? 'Contoh: 800/124/2026 — Dinas Pendidikan Kab. Sleman'
                    : 'Contoh: Puskesmas Berbah / RSUD'
                }
                className="form-input w-full text-xs"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-semibold">Keterangan / Uraian Kegiatan *</label>
                <span
                  className={
                    leaveReason.trim().length >= MIN_REASON_LENGTH
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }
                >
                  {leaveReason.trim().length}/{MIN_REASON_LENGTH} karakter
                </span>
              </div>
              <textarea
                rows={3}
                required
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Tuliskan rincian kegiatan dinas luar, keperluan izin, atau keterangan sakit secara jelas..."
                className="form-input w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Unggah Bukti Surat / Foto Dokumen (Wajib: JPG, PNG, PDF) *
              </label>
              <label className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-border hover:border-emerald-500/60 bg-muted/30 cursor-pointer transition">
                <Upload size={22} className="text-emerald-500 mb-1.5" />
                <span className="text-xs font-medium text-center">
                  {leaveFile
                    ? `Terpilih: ${leaveFile.name}`
                    : 'Klik untuk memilih foto surat dokter / surat tugas'}
                </span>
                <span className="text-[11px] opacity-60 mt-0.5">
                  Maksimal ukuran berkas 5 MB
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      showToast('error', 'Ukuran file maksimal 5 MB.');
                      return;
                    }
                    setLeaveFile(file);
                  }}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmittingLeave || !teacher}
              className="btn-primary w-full py-3 justify-center font-bold"
            >
              <FileText size={16} />
              {isSubmittingLeave
                ? 'Mengunggah Bukti & Menyimpan...'
                : 'Kirim Pengajuan Resmi'}
            </button>
          </form>
        </motion.div>
      )}

      {/* ====================================================================
          TAMPILAN 4: LAPORAN & KALENDER TANGGAL MERAH
      ==================================================================== */}
      {activeView === 'laporan' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="rounded-3xl bg-linear-to-r from-[#16365C] to-[#275A96] p-5 text-white shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition"
                title="Toggle Sidebar"
              >
                <Menu size={17} />
              </button>
              <div>
                <h2 className="text-lg font-bold">
                  {reportScope === 'monthly' ? 'Laporan Presensi' : 'Rekap Presensi'}
                </h2>
                <p className="text-xs text-blue-100/80">
                  {reportScope === 'monthly'
                    ? selectedMonthLabel
                    : `Tahun ${calendarYear}`}
                </p>
              </div>
            </div>
            <div className="flex rounded-xl bg-white/15 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setReportScope('monthly')}
                className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'monthly'
                  ? 'bg-white text-slate-900'
                  : 'text-white'
                  }`}
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setReportScope('yearly')}
                className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'yearly'
                  ? 'bg-white text-slate-900'
                  : 'text-white'
                  }`}
              >
                Tahunan
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-linear-to-r from-[#1E3B5C] via-[#3A5357] to-[#8C7A3E] p-5 text-white shadow-md flex items-center justify-between">
            <div>
              <p className="text-xs text-white/80">Tingkat Kehadiran</p>
              <p className="text-3xl font-extrabold mt-1">{reportStats.percentage}%</p>
              <p className="text-xs text-amber-200 mt-1">
                {reportStats.percentage >= 80
                  ? 'Pertahankan kedisiplinan yang baik!'
                  : 'Perlu ditingkatkan'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
              <CheckCircle2 size={26} className="text-amber-300" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            <div className="data-card p-3 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-500">
                {reportStats.hadir}
              </div>
              <div className="text-[11px] opacity-75 mt-1">Hari Hadir</div>
            </div>
            <div className="data-card p-3 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-amber-500">
                {reportStats.terlambat}
              </div>
              <div className="text-[11px] opacity-75 mt-1">Terlambat</div>
            </div>
            <div className="data-card p-3 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-blue-500">
                {reportStats.izinSakit}
              </div>
              <div className="text-[11px] opacity-75 mt-1">Izin / Sakit</div>
            </div>
            <div className="data-card p-3 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-red-500">
                {reportStats.alpa}
              </div>
              <div className="text-[11px] opacity-75 mt-1">Tanpa Ket.</div>
            </div>
          </div>

          {/* KALENDER / TANGGALAN PRESENSI */}
          <div className="data-card p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-primary" />
                <div>
                  <h3 className="font-bold text-sm">{selectedMonthLabel}</h3>
                  <p className="text-[10px] opacity-65">
                    Mode:{' '}
                    {effectiveWorkDaysMode === 'FIVE_DAYS'
                      ? '5 Hari Kerja (Sabtu & Minggu Libur)'
                      : '6 Hari Kerja (Minggu Libur)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    setCalendarYear(d.getFullYear());
                    setCalendarMonth(d.getMonth());
                    setSelectedCalendarDate(getTodayLocal());
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-muted hover:bg-muted/80 transition"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {NAMA_HARI_SINGKAT.map((hari, idx) => (
                <div
                  key={hari}
                  className={`text-[11px] font-bold py-1 ${idx === 0
                    ? 'text-red-500'
                    : idx === 6 && effectiveWorkDaysMode === 'FIVE_DAYS'
                      ? 'text-red-500'
                      : 'opacity-65'
                    }`}
                >
                  {hari}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDaysGrid.map((cell, idx) => {
                if (!cell.dateStr || !cell.dayNum) {
                  return <div key={`empty-${idx}`} className="h-11" />;
                }

                const isToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedCalendarDate;
                const status = cell.record?.status;

                const statusDotColor =
                  status === 'HADIR'
                    ? 'bg-emerald-500'
                    : status === 'TERLAMBAT'
                      ? 'bg-amber-500'
                      : status === 'IZIN' || status === 'SAKIT'
                        ? 'bg-blue-500'
                        : status === 'ALPA'
                          ? 'bg-red-500'
                          : null;

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedCalendarDate(cell.dateStr!)}
                    title={cell.holidayName ?? cell.dateStr}
                    className={`h-11 rounded-xl flex flex-col items-center justify-center relative transition border ${isSelected
                      ? 'border-primary ring-2 ring-primary/30 font-extrabold'
                      : isToday
                        ? 'border-amber-400 font-bold'
                        : 'border-transparent'
                      } ${cell.isRedDate
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                        : 'bg-muted/35 hover:bg-muted/70'
                      }`}
                  >
                    <span className="text-xs leading-none">{cell.dayNum}</span>

                    <div className="mt-1.5 h-1.5 flex items-center justify-center gap-0.5">
                      {statusDotColor ? (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`}
                        />
                      ) : cell.isRedDate ? (
                        <span className="w-1 h-1 rounded-full bg-red-400/70" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-[10px] opacity-80">
              <span className="flex items-center gap-1 text-red-500 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Tanggal Merah
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Hadir
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Terlambat
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Izin/Sakit
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600" /> Alpa
              </span>
            </div>

            {selectedDateInfo && (
              <div
                className={`p-3 rounded-2xl border text-xs space-y-1 ${selectedDateInfo.isRedDate
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/40 border-border'
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{selectedDateInfo.label}</span>
                  {selectedDateInfo.isRedDate && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      Tanggal Merah
                    </span>
                  )}
                </div>

                {selectedDateInfo.holidayName && (
                  <p className="text-[11px] font-semibold text-red-600 dark:text-red-300">
                    Keterangan Libur: {selectedDateInfo.holidayName}
                  </p>
                )}

                {selectedDateInfo.record ? (
                  <p className="text-[11px] opacity-85">
                    Status: <strong>{selectedDateInfo.record.status}</strong>
                    {selectedDateInfo.record.checkInTime
                      ? ` • Masuk ${formatShortTime(selectedDateInfo.record.checkInTime)} • Pulang ${formatShortTime(selectedDateInfo.record.checkOutTime)}`
                      : selectedDateInfo.record.notes
                        ? ` • ${selectedDateInfo.record.notes}`
                        : ''}
                  </p>
                ) : (
                  <p className="text-[11px] opacity-65">
                    {selectedDateInfo.isRedDate
                      ? 'Tidak ada jadwal presensi pada hari libur.'
                      : 'Belum ada catatan presensi pada tanggal ini.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ====================================================================
          TAMPILAN 5: DATA LOG PRESENSI HARIAN
      ==================================================================== */}
      {activeView === 'log' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="data-card space-y-3"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <History size={18} className="text-emerald-500" />
                Data Log Kehadiran
              </h2>
              <p className="text-xs opacity-70">
                Catatan waktu check-in, check-out, dan jarak GPS Anda
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleSidebar}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition"
              title="Toggle Sidebar"
            >
              <Menu size={16} />
            </button>
          </div>

          {historyRecords.length === 0 ? (
            <p className="text-xs opacity-60 text-center py-8">
              Belum ada log presensi tercatat.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-105 overflow-y-auto pr-1">
              {historyRecords.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-muted/40 border border-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold">{item.date}</div>
                    <div className="text-[11px] opacity-75 mt-0.5 truncate">
                      {item.checkInTime
                        ? `Masuk ${formatShortTime(item.checkInTime)} (${item.checkInDistance ?? 0
                        }m) • Pulang ${formatShortTime(item.checkOutTime)}`
                        : item.notes || '-'}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${item.status === 'HADIR'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : item.status === 'TERLAMBAT'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                        : item.status === 'ALPA'
                          ? 'bg-red-500/15 text-red-600 dark:text-red-300'
                          : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                      }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ====================================================================
          FLOATING BOTTOM NAVIGATION BAR (TOMBOL SIDIK JARI ADAPTIF)
      ==================================================================== */}
      <div
        className={`fixed bottom-4 inset-x-0 z-40 px-4 pointer-events-none transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
          }`}
      >
        <div className="max-w-md mx-auto pointer-events-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 shadow-2xl px-2 py-2 grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => setActiveView('beranda')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'beranda'
              ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <Home size={17} />
            <span>Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('laporan')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'laporan'
              ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <FileBarChart2 size={17} />
            <span>Laporan</span>
          </button>

          {/* TOMBOL PRESENSI SIDIK JARI:
              - Oranye saat di halaman Beranda / lainnya
              - Hijau saat di halaman Peta untuk Absen Masuk
              - Merah saat di halaman Peta untuk Absen Pulang */}
          <div className="flex flex-col items-center justify-center relative">
            {/* Aura Cahaya Menyala saat Disentuh */}
            {isFingerprintGlowing && (
              <span
                className={`pointer-events-none absolute -top-7 w-16 h-16 rounded-full animate-ping opacity-75 ${fingerprintAuraColor}`}
              />
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onPointerDown={triggerFingerprintGlow}
              onClick={handleFingerprintAction}
              className={`-mt-7 w-15 h-15 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-900 transition-all duration-200 select-none ${fingerprintButtonStyle}`}
              title={
                !isOnMapView
                  ? 'Buka Peta Presensi'
                  : isCheckOutPhase
                    ? 'Presensi Pulang (Check-Out)'
                    : 'Presensi Datang (Check-In)'
              }
              aria-label={
                !isOnMapView
                  ? 'Buka Peta Presensi'
                  : isCheckOutPhase
                    ? 'Tombol Sidik Jari Presensi Pulang'
                    : 'Tombol Sidik Jari Presensi Datang'
              }
            >
              <Fingerprint
                size={28}
                className={`transition-transform duration-150 ${isFingerprintGlowing
                  ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]'
                  : ''
                  }`}
              />
            </motion.button>
          </div>

          <button
            type="button"
            onClick={() => setActiveView('izin')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'izin'
              ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <FileCheck2 size={17} />
            <span>Izin / Dinas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('log')}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl text-[10px] font-semibold transition ${activeView === 'log'
              ? 'bg-linear-to-b from-amber-300 to-amber-500 text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <History size={17} />
            <span>Data Log</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          MODAL KAMERA SELFIE (CHECK-IN & CHECK-OUT)
      ==================================================================== */}
      <AnimatePresence>
        {cameraModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          >
            <div className="data-card max-w-sm w-full p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">
                    {cameraModal.mode === 'CHECK_OUT'
                      ? 'Selfie Verifikasi Pulang'
                      : 'Selfie Verifikasi Datang'}
                  </h3>
                  <p className="text-[11px] opacity-70">
                    {cameraModal.mode === 'CHECK_OUT' ? 'Check-Out' : 'Check-In'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCameraModal}
                  className="p-1 rounded-lg hover:bg-muted"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden bg-black aspect-square relative">
                {capturedPreview ? (
                  <img
                    src={capturedPreview}
                    alt="Hasil Selfie"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}
              </div>

              {!capturedPreview ? (
                <button
                  type="button"
                  onClick={handleTakeSnapshot}
                  className="btn-primary w-full justify-center py-3"
                >
                  <Camera size={18} />
                  Ambil Foto Selfie
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedBlob(null);
                      setCapturedPreview(null);
                    }}
                    className="btn-secondary justify-center"
                    disabled={isSubmittingAttendance}
                  >
                    Ulangi Foto
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      submitGpsAttendance(cameraModal.mode, capturedBlob)
                    }
                    className="btn-primary justify-center"
                    disabled={isSubmittingAttendance}
                  >
                    {isSubmittingAttendance ? 'Menyimpan...' : 'Kirim Presensi'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}