// src/modules/attendance/pages/TeacherAttendancePage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';

// ============================================================================
// PARAMETER YANG BISA KAMU SESUAIKAN DENGAN MUDAH
// ============================================================================
const WORK_START_TIME = '07:30'; // Batas jam masuk (lewat jam ini otomatis TERLAMBAT)
const WORK_END_TIME = '14:30'; // Jam pulang standar
const DEFAULT_RADIUS_METERS = 100; // Radius default jika di data sekolah belum diatur
const REQUIRE_SELFIE_ON_CHECKIN = true; // Wajib foto selfie saat Datang
const REQUIRE_SELFIE_ON_CHECKOUT = true; // Ubah ke false jika Pulang cukup GPS saja
const MIN_REASON_LENGTH = 15; // Minimal karakter alasan izin/dinas/sakit

const DAILY_QUOTES = [
  'Persiapan dan perbaikan diri akan menjadi peluang kesuksesan saat bertemu dengan kesempatan.',
  'Disiplin adalah jembatan antara cita-cita dan pencapaian nyata di ruang kelas.',
  'Keteladanan guru hari ini adalah inspirasi masa depan bagi setiap peserta didik.',
  'Langkah kecil yang konsisten setiap pagi membangun perubahan besar bagi pendidikan.',
];

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

interface SchoolGeo {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
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

// Helper tanggal lokal YYYY-MM-DD (Anti bug geser tanggal UTC pagi hari)
function getTodayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Rumus Haversine menghitung jarak meter antara 2 titik koordinat GPS
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

export function TeacherAttendancePage() {
  const { user, school } = useAuthStore();
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarOpen,
    setSidebarOpen,
  } = useUIStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // State Simulasi Super Admin
  const [simSchools, setSimSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const [simTeachers, setSimTeachers] = useState<TeacherProfile[]>([]);
  const [simTeacherId, setSimTeacherId] = useState<string>('');

  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  // Navigasi Tampilan ala Mobile App (5 Tab Seimbang)
  const [activeView, setActiveView] = useState<SubView>('beranda');

  // Jam Digital Real-Time (Jam : Menit : Detik)
  const [now, setNow] = useState<Date>(() => new Date());

  // Data Guru, Sekolah & Riwayat Absensi
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [schoolGeo, setSchoolGeo] = useState<SchoolGeo | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);

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

  // State Formulir Ketat Izin / Dinas Luar / Sakit
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('DINAS_LUAR');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(getTodayLocal());
  const [leaveEndDate, setLeaveEndDate] = useState<string>(getTodayLocal());
  const [leaveRefNumber, setLeaveRefNumber] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveFile, setLeaveFile] = useState<File | null>(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState<boolean>(false);

  // State Filter Laporan (Bulanan vs Tahunan)
  const [reportScope, setReportScope] = useState<'monthly' | 'yearly'>('monthly');

  // Toast Notifikasi
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Otomatis sembunyikan sidebar saat halaman presensi dibuka di layar HP (< 1024px)
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  // Tombol Toggle Sidebar (HP: Buka/Tutup Drawer | Komputer: Lebar/Perkecil)
  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // 1. Timer Jam Digital per Detik
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Mode Simulasi Super Admin: Muat Sekolah & Daftar Guru
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

  // 3. Muat Data Sekolah (Koordinat & Radius), Profil Guru, & Riwayat Presensi
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

      const currentYear = new Date().getFullYear();
      const { data: attList } = await supabase
        .from('attendances')
        .select('*')
        .eq('schoolId', activeSchoolId)
        .eq('teacherId', activeTeacher.id)
        .eq('type', 'GURU')
        .gte('date', `${currentYear}-01-01`)
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
  }, [activeSchoolId, user?.id, user?.email, isSuperAdmin, simTeacherId, simTeachers]);

  useEffect(() => {
    loadTeacherAndAttendance();
  }, [loadTeacherAndAttendance]);

  // 4. Pelacakan GPS Live (Aktif saat membuka tab Peta)
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

  // 5. Inisialisasi & Pembaruan Peta Interaktif Leaflet (Aktif untuk CHECK-IN & CHECK-OUT)
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

  // Update Pin Posisi Guru di Peta setiap koordinat berubah
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
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
  }, [userCoords, schoolGeo]);

  // Hitung Jarak & Status Radius
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

  // Status Kunci Tombol Check-In & Check-Out
  const hasCheckedIn = Boolean(todayRecord?.checkInTime);
  const hasCheckedOut = Boolean(todayRecord?.checkOutTime);
  const isOnLeaveToday = Boolean(
    todayRecord && ['IZIN', 'SAKIT'].includes(todayRecord.status)
  );

  // Tombol Check-Out HANYA aktif jika sudah absen masuk dan belum absen pulang
  const canCheckOut = hasCheckedIn && !hasCheckedOut && !isOnLeaveToday;

  const attendancePhase: 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED' | 'ON_LEAVE' =
    useMemo(() => {
      if (isOnLeaveToday) return 'ON_LEAVE';
      if (!hasCheckedIn) return 'CHECK_IN';
      if (!hasCheckedOut) return 'CHECK_OUT';
      return 'COMPLETED';
    }, [isOnLeaveToday, hasCheckedIn, hasCheckedOut]);

  // 6. Kontrol Kamera Selfie
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

  // 7. Simpan Check-In / Check-Out ke Supabase
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

      const nowIso = new Date().toISOString();

      if (mode === 'CHECK_IN') {
        const [startH, startM] = WORK_START_TIME.split(':').map(Number);
        const deadline = new Date();
        deadline.setHours(startH, startM, 59, 999);
        const status = new Date() > deadline ? 'TERLAMBAT' : 'HADIR';

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
            ? 'Check-In berhasil tercatat (Status: Terlambat).'
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

  // 8. Simpan Pengajuan Ketat Izin / Dinas Luar / Sakit (Wajib Bukti Dokumen)
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

  // 9. Perhitungan Statistik Laporan (Bulanan & Tahunan)
  const reportStats = useMemo(() => {
    const currentMonthPrefix = getTodayLocal().slice(0, 7);
    const filtered =
      reportScope === 'monthly'
        ? historyRecords.filter((r) => r.date.startsWith(currentMonthPrefix))
        : historyRecords;

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
  }, [historyRecords, reportScope]);

  // Format Waktu & Tanggal Indonesia
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

  const dailyQuote = DAILY_QUOTES[now.getDate() % DAILY_QUOTES.length];

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-28 max-w-xl mx-auto px-1">
      {/* Banner Simulasi Khusus SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="mb-4 p-3 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-300">
            <FlaskConical size={16} />
            <span>Simulasi Super Admin:</span>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              className="form-input text-xs py-1.5 flex-1 sm:w-44"
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
              className="form-input text-xs py-1.5 flex-1 sm:w-48"
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
          TAMPILAN 1: BERANDA (Desain Identik dengan Referensi Mobile App)
      ==================================================================== */}
      {activeView === 'beranda' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Header Biru Royal + Kartu Profil & Kapsul Jam Digital Vertikal */}
          <div className="relative rounded-[28px] overflow-hidden shadow-xl bg-linear-to-br from-[#1C3D6E] via-[#26508E] to-[#3468AE] p-5 text-white">
            {/* Aksen lingkaran dekoratif halus */}
            <div className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute right-12 top-24 w-28 h-28 rounded-full bg-amber-300/10" />

            {/* Bar Atas: Tombol Sidebar Toggle + Salam + Tombol Refresh */}
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
                <RefreshCw size={17} className={isLoadingData ? 'spin' : ''} />
              </button>
            </div>

            {/* Kartu Frosted Cream-White Profil + Kapsul Jam Live */}
            <div className="relative rounded-3xl bg-linear-to-br from-[#F9FAFB] via-[#F7F5F0] to-[#EFECE3] text-slate-800 p-4 shadow-lg border border-white/80 grid grid-cols-12 gap-3 items-stretch">
              {/* Kiri (8 Kolom): Identitas PTK & Tingkat Kehadiran */}
              <div className="col-span-8 flex flex-col justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Foto / Inisial dengan Bingkai Emas & Navy */}
                  <div className="relative shrink-0">
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

                  {/* Detail Guru */}
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-slate-900 truncate">
                      {teacher?.fullName ?? user?.fullName ?? 'Profil Guru Belum Tertaut'}
                    </h2>
                    <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                      {teacher?.nip || teacher?.nuptk || 'PTK Terdaftar'}
                    </p>
                    <p className="text-[11px] text-slate-600 flex items-center gap-1 truncate mt-0.5">
                      <Briefcase size={11} className="text-[#1C3D6E] shrink-0" />
                      <span className="truncate">
                        {teacher?.position || 'Guru / Tenaga Pendidik'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-600 flex items-center gap-1 truncate">
                      <Building2 size={11} className="text-amber-600 shrink-0" />
                      <span className="truncate">{schoolGeo?.name ?? 'Unit Sekolah'}</span>
                    </p>
                  </div>
                </div>

                {/* Inner Glass Card: Tingkat Kehadiran Bulan Ini */}
                <div className="rounded-2xl bg-white/80 backdrop-blur-xs border border-slate-200/80 p-3 shadow-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-lg bg-[#254E89] text-white flex items-center justify-center shrink-0">
                      <TrendingUp size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-slate-500 leading-tight">
                        Tingkat Kehadiran
                      </p>
                      <p className="text-[11px] font-semibold text-slate-700 truncate">
                        Bulan {monthYearLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mt-1">
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

              {/* Kanan (4 Kolom): Kapsul Jam Digital Vertikal Beraksen Emas */}
              <div className="col-span-4 rounded-3xl bg-linear-to-b from-[#F2F4F8] via-[#F7F3E6] to-[#EDE3C8] border border-amber-300/75 py-3 px-2 flex flex-col items-center justify-between text-center shadow-inner relative overflow-hidden">
                <div className="pointer-events-none absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-amber-300/20" />

                <div>
                  <div className="text-2xl sm:text-[26px] font-extrabold text-[#1E3F73] leading-none font-mono">
                    {hoursStr}
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-slate-400 mt-1">
                    JAM
                  </div>
                </div>

                <div className="w-9 h-px bg-amber-300/60 my-1" />

                <div>
                  <div className="text-2xl sm:text-[26px] font-extrabold text-[#1E3F73] leading-none font-mono">
                    {minutesStr}
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-slate-400 mt-1">
                    MENIT
                  </div>
                </div>

                <div className="w-9 h-px bg-amber-300/60 my-1" />

                <div>
                  <div className="text-2xl sm:text-[26px] font-extrabold text-rose-500 leading-none font-mono">
                    {secondsStr}
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-rose-400 mt-1">
                    DETIK
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dua Kartu Utama: DATANG (Navy) & PULANG (Gold — Terkunci sebelum Datang) */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* KARTU 1: DATANG (CHECK-IN) */}
            <button
              type="button"
              disabled={isOnLeaveToday}
              onClick={() => setActiveView('peta')}
              className={`text-left rounded-[26px] p-4 shadow-lg transition bg-linear-to-br from-[#475E78] via-[#3A4F68] to-[#2B3D52] text-white border border-white/15 flex flex-col justify-between min-h-43.75 ${isOnLeaveToday
                ? 'opacity-75 cursor-not-allowed'
                : 'hover:scale-[1.01] active:scale-[0.99]'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-white/10">
                    <LogIn size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-bold leading-tight">Datang</div>
                    <div className="text-[11px] text-slate-200/80">
                      {WORK_START_TIME}
                    </div>
                  </div>
                </div>
                {hasCheckedIn && (
                  <CheckCircle2 size={17} className="text-emerald-300 shrink-0" />
                )}
              </div>

              <div className="my-3 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                  {formatShortTime(todayRecord?.checkInTime)}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-slate-200/85 truncate">
                  {isOnLeaveToday
                    ? `Tercatat ${todayRecord?.status}`
                    : hasCheckedIn
                      ? 'Presensi datang tercatat'
                      : 'Ketuk untuk absen datang'}
                </p>
                <div className="text-[11px] text-slate-100 flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${hasCheckedIn ? 'bg-emerald-400' : 'bg-amber-300 animate-pulse'
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

            {/* KARTU 2: PULANG (CHECK-OUT) — TERKUNCI JIKA BELUM ABSEN MASUK */}
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
                : 'hover:scale-[1.01] active:scale-[0.99] ring-2 ring-amber-300/60'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-white/15">
                    <LogOut size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-bold leading-tight">Pulang</div>
                    <div className="text-[11px] text-amber-50/90">
                      {WORK_END_TIME}
                    </div>
                  </div>
                </div>
                {!hasCheckedIn ? (
                  <span className="p-1.5 rounded-lg bg-black/20 text-amber-100">
                    <Lock size={14} />
                  </span>
                ) : hasCheckedOut ? (
                  <CheckCircle2 size={17} className="text-emerald-200 shrink-0" />
                ) : null}
              </div>

              <div className="my-3 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight">
                  {formatShortTime(todayRecord?.checkOutTime)}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-amber-50/90 truncate">
                  {!hasCheckedIn
                    ? 'Terkunci • Absen datang dulu'
                    : hasCheckedOut
                      ? 'Presensi pulang tercatat'
                      : 'Presensi pulang belum tercatat'}
                </p>
                <div className="text-[11px] text-white flex items-center gap-1.5 font-medium">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${hasCheckedOut
                      ? 'bg-emerald-300'
                      : canCheckOut
                        ? 'bg-white animate-ping'
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
          TAMPILAN 2: PRESENSI PETA GPS (Aktif untuk CHECK-IN maupun CHECK-OUT!)
      ==================================================================== */}
      {activeView === 'peta' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-3"
        >
          {/* Header Mengambang Peta */}
          <div className="rounded-2xl bg-linear-to-r from-[#1D3554] to-[#525B44] p-4 text-white flex items-center justify-between shadow-lg">
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
                <h2 className="font-bold text-base">
                  {attendancePhase === 'CHECK_OUT'
                    ? 'Presensi Pulang (Check-Out)'
                    : attendancePhase === 'COMPLETED'
                      ? 'Presensi Hari Ini Selesai'
                      : 'Presensi Datang (Check-In)'}
                </h2>
                <p className="text-xs text-white/80">{formattedDateFull}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestGpsPosition}
              disabled={isLocating}
              className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition"
              title="Perbarui Titik GPS"
            >
              <LocateFixed size={19} className={isLocating ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Area Peta Interaktif Leaflet */}
          <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-white/15 shadow-xl bg-slate-900">
            <div ref={mapContainerRef} className="w-full h-77.5 z-10" />

            {gpsError && (
              <div className="absolute inset-x-3 top-3 z-20 p-3 rounded-xl bg-red-950/90 border border-red-500/50 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0 text-red-400" />
                <span>{gpsError}</span>
              </div>
            )}

            {/* Kartu Statistik Melayang: Jarak | Radius Sekolah | Waktu */}
            <div className="p-4 bg-white/95 text-slate-800 backdrop-blur-md">
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
                  <div className="text-[11px] text-slate-500">Waktu</div>
                </div>
              </div>

              {/* Kotak Kata Hari Ini */}
              <div className="mt-3 rounded-2xl bg-linear-to-r from-[#1D4E7A] to-[#2B8A78] p-3.5 text-center text-white">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold mb-1.5">
                  <Sparkles size={11} /> Kata Hari Ini
                </span>
                <p className="text-xs italic leading-relaxed text-white/95">
                  "{dailyQuote}"
                </p>
              </div>
            </div>
          </div>

          {/* Tombol Aksi Bawah Dinamis */}
          {!teacher ? (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-200 text-center">
              Akun Anda belum terhubung dengan data Master Guru/PTK.
            </div>
          ) : attendancePhase === 'COMPLETED' ? (
            <div className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 size={18} />
              <span>
                Presensi Lengkap (Masuk {formatShortTime(todayRecord?.checkInTime)} •
                Pulang {formatShortTime(todayRecord?.checkOutTime)})
              </span>
            </div>
          ) : attendancePhase === 'ON_LEAVE' ? (
            <div className="w-full py-3.5 px-5 rounded-2xl bg-blue-600/15 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold text-sm flex items-center justify-center gap-2">
              <FileCheck2 size={18} />
              <span>Hari Ini Tercatat {todayRecord?.status}</span>
            </div>
          ) : !isWithinRadius ? (
            <button
              type="button"
              onClick={requestGpsPosition}
              className="w-full py-4 px-5 rounded-2xl bg-[#F06464] hover:bg-[#e25555] text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition"
            >
              <XCircle size={18} />
              <span>
                Di Luar Radius ({formatDistanceLabel(distanceMeters)}) — Ketuk Refresh GPS
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openCameraModal(attendancePhase)}
              className={`w-full py-4 px-5 rounded-2xl font-bold text-sm text-white shadow-lg flex items-center justify-center gap-2 transition ${attendancePhase === 'CHECK_OUT'
                ? 'bg-linear-to-r from-amber-500 to-orange-600 hover:opacity-95'
                : 'bg-linear-to-r from-emerald-500 to-teal-600 hover:opacity-95'
                }`}
            >
              <Camera size={18} />
              <span>
                {attendancePhase === 'CHECK_OUT'
                  ? 'Check-Out Pulang Sekarang'
                  : 'Check-In Datang Sekarang'}
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
          TAMPILAN 4: LAPORAN & REKAP
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
                    ? monthYearLabel
                    : `Tahun ${now.getFullYear()}`}
                </p>
              </div>
            </div>
            <div className="flex rounded-xl bg-white/15 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setReportScope('monthly')}
                className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'monthly' ? 'bg-white text-slate-900' : 'text-white'
                  }`}
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setReportScope('yearly')}
                className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'yearly' ? 'bg-white text-slate-900' : 'text-white'
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="data-card p-3.5 text-center">
              <div className="text-2xl font-extrabold text-emerald-500">
                {reportStats.hadir}
              </div>
              <div className="text-xs opacity-75 mt-1">Hari Hadir</div>
            </div>
            <div className="data-card p-3.5 text-center">
              <div className="text-2xl font-extrabold text-amber-500">
                {reportStats.terlambat}
              </div>
              <div className="text-xs opacity-75 mt-1">Terlambat</div>
            </div>
            <div className="data-card p-3.5 text-center">
              <div className="text-2xl font-extrabold text-blue-500">
                {reportStats.izinSakit}
              </div>
              <div className="text-xs opacity-75 mt-1">Izin / Sakit</div>
            </div>
            <div className="data-card p-3.5 text-center">
              <div className="text-2xl font-extrabold text-red-500">
                {reportStats.alpa}
              </div>
              <div className="text-xs opacity-75 mt-1">Tanpa Ket.</div>
            </div>
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
          FLOATING BOTTOM NAVIGATION BAR (5 KOLOM SEIMBANG & PRESISI DI TENGAH)
          Memperhitungkan lebar Sidebar (lg:pl-60 / lg:pl-16) agar selalu di tengah!
      ==================================================================== */}
      <div
        className={`fixed bottom-4 inset-x-0 z-40 px-4 pointer-events-none transition-all duration-200 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
          }`}
      >
        <div className="max-w-md mx-auto pointer-events-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 shadow-2xl px-2 py-2 grid grid-cols-5 items-center">
          {/* Slot 1: Beranda */}
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

          {/* Slot 2: Laporan */}
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

          {/* Slot 3 (Tepat di Tengah): Tombol Sidik Jari Peta Presensi */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setActiveView('peta')}
              className={`-mt-7 w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-4 border-white dark:border-slate-900 transition ${activeView === 'peta'
                ? 'bg-emerald-500 text-white scale-105'
                : 'bg-linear-to-br from-amber-300 via-amber-500 to-amber-600 text-slate-950 hover:scale-105'
                }`}
              title="Buka Peta Presensi"
            >
              <Fingerprint size={26} />
            </button>
          </div>

          {/* Slot 4: Izin / Dinas */}
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

          {/* Slot 5: Data Log */}
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
                <h3 className="font-bold text-sm">
                  {cameraModal.mode === 'CHECK_OUT'
                    ? 'Selfie Verifikasi Check-Out'
                    : 'Selfie Verifikasi Check-In'}
                </h3>
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