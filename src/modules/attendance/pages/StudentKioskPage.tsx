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
  CloudOff,
  CloudUpload,
  RefreshCw,
  CalendarDays,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getSchoolDateString, isAfterDeadline } from '../services/gps.utils';
import { getJavaneseDateInfo } from '../utils/javaneseCalendar';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { AttendanceMap } from '@/components/map/AttendanceMap';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';
import { dispatchStudentAttendanceWhatsApp } from '../services/whatsappService';
import type { SupportedAttendanceLocale } from '../types/attendance.types';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const MIN_MINUTES_BETWEEN_IN_AND_OUT = 15; // Jeda minimal (menit) agar double-scan pagi tidak dianggap pulang
const KIOSK_RESET_DELAY_MS = 4000;        // Waktu reset layar otomatis setelah scan (milidetik)
const STUDENT_PREVIEW_DELAY_MS = 850;     // Durasi tampil profil siswa sebelum simpan otomatis (milidetik)
const CLOCK_TICK_INTERVAL_MS = 5000;      // Interval pembaruan jam layar Kiosk (5 detik)
const DEFAULT_KIOSK_SOUND_VOLUME = 0.5;   // Volume awal efek suara Kiosk (0.5 = 50%, rentang 0.0 - 1.0)
const KIOSK_SOUND_PREF_KEY = 'sekolaherp_kiosk_sound_enabled';
const KIOSK_SOUND_VOLUME_KEY = 'sekolaherp_kiosk_sound_volume';
const FALLBACK_STUDENT_START = '07:00';
const FALLBACK_STUDENT_CHECKOUT_START = '12:00';
const FALLBACK_STUDENT_END = '14:00';
const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Jakarta';
const OFFLINE_QUEUE_STORAGE_PREFIX = 'sekolaherp_kiosk_offline_queue_';
const STUDENT_CACHE_STORAGE_PREFIX = 'sekolaherp_kiosk_student_cache_';
const SCHOOL_META_STORAGE_PREFIX = 'sekolaherp_kiosk_school_meta_';

type KioskState = 'idle' | 'scanning' | 'found' | 'success' | 'already' | 'error';
type KioskScanMode = 'AUTO' | 'CHECK_IN' | 'CHECK_OUT';
type KioskSoundType = 'checkin' | 'checkout' | 'already' | 'error';

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

interface SchoolBrandMeta {
  name: string;
  logoUrl: string | null;
}

interface OfflineKioskQueueItem {
  queueId: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  nisn: string;
  className?: string;
  date: string;
  timestampIso: string;
  timeFormatted: string;
  scanMode: KioskScanMode;
  status: 'HADIR' | 'TERLAMBAT';
  notes?: string | null;
  recordedBy: string | null;
}

// ============================================================================
// GENERATOR EFEK SUARA KIOSK (WEB AUDIO API — BERFUNGSI ONLINE MAUPUN OFFLINE)
// ============================================================================
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtxClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => { });
  }
  return sharedAudioCtx;
}

function playToneStep(
  ctx: AudioContext,
  frequency: number,
  startOffsetSec: number,
  durationSec: number,
  waveType: OscillatorType = 'sine',
  peakVolume: number = DEFAULT_KIOSK_SOUND_VOLUME
) {
  if (peakVolume <= 0.005) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = waveType;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime + startOffsetSec);

  const startAt = ctx.currentTime + startOffsetSec;
  const endAt = startAt + durationSec;
  const safeGain = Math.min(0.85, Math.max(0.01, peakVolume * 0.85));

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(safeGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(endAt + 0.02);
}

function playKioskFeedbackSound(
  type: KioskSoundType,
  volume: number = DEFAULT_KIOSK_SOUND_VOLUME
) {
  try {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (type === 'checkin') {
      playToneStep(ctx, 523.25, 0, 0.13, 'sine', volume);
      playToneStep(ctx, 783.99, 0.12, 0.22, 'sine', volume);
    } else if (type === 'checkout') {
      playToneStep(ctx, 659.25, 0, 0.1, 'sine', volume);
      playToneStep(ctx, 783.99, 0.1, 0.1, 'sine', volume);
      playToneStep(ctx, 1046.5, 0.2, 0.24, 'sine', volume);
    } else if (type === 'already') {
      playToneStep(ctx, 466.16, 0, 0.11, 'triangle', volume);
      playToneStep(ctx, 466.16, 0.15, 0.14, 'triangle', volume);
    } else {
      playToneStep(ctx, 230, 0, 0.16, 'sawtooth', volume * 0.75);
      playToneStep(ctx, 175, 0.16, 0.24, 'sawtooth', volume * 0.75);
    }
  } catch {
    // Abaikan jika perangkat tidak mendukung audio
  }
}

function extractReadableError(err: unknown, fallback: string): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    const msg = (err as { message: string }).message.trim();
    if (msg.length > 0) return msg;
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message.trim();
  }
  return fallback;
}

function addMinutesToTime(startTime: string, toleranceMinutes: number): string {
  const [hStr, mStr] = startTime.split(':');
  const h = Number(hStr) || 7;
  const m = Number(mStr) || 0;
  const total = Math.min(23 * 60 + 59, h * 60 + m + Math.max(0, toleranceMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60
  ).padStart(2, '0')}`;
}

function isAtOrAfterScheduleTime(
  scheduleTime: string,
  now: Date,
  timeZone: string = DEFAULT_SCHOOL_TIMEZONE
): boolean {
  const [targetHStr, targetMStr] = scheduleTime.split(':');
  const targetTotalMinutes =
    (Number(targetHStr) || 0) * 60 + (Number(targetMStr) || 0);

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const curH = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const curM = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return curH * 60 + curM >= targetTotalMinutes;
  } catch {
    return now.getHours() * 60 + now.getMinutes() >= targetTotalMinutes;
  }
}

function readOfflineQueue(schoolId: string): OfflineKioskQueueItem[] {
  if (!schoolId) return [];
  try {
    const raw = localStorage.getItem(`${OFFLINE_QUEUE_STORAGE_PREFIX}${schoolId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(schoolId: string, items: OfflineKioskQueueItem[]) {
  if (!schoolId) return;
  try {
    localStorage.setItem(
      `${OFFLINE_QUEUE_STORAGE_PREFIX}${schoolId}`,
      JSON.stringify(items)
    );
  } catch (err) {
    console.warn('[KioskOfflineQueue] Gagal menyimpan antrean ke localStorage:', err);
  }
}

function readStudentDirectoryCache(schoolId: string): FoundStudent[] {
  if (!schoolId) return [];
  try {
    const raw = localStorage.getItem(`${STUDENT_CACHE_STORAGE_PREFIX}${schoolId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStudentDirectoryCache(schoolId: string, students: FoundStudent[]) {
  if (!schoolId) return;
  try {
    localStorage.setItem(
      `${STUDENT_CACHE_STORAGE_PREFIX}${schoolId}`,
      JSON.stringify(students)
    );
  } catch (err) {
    console.warn('[KioskStudentCache] Gagal menyimpan cache siswa:', err);
  }
}

function readSchoolMetaCache(schoolId: string): SchoolBrandMeta | null {
  if (!schoolId) return null;
  try {
    const raw = localStorage.getItem(`${SCHOOL_META_STORAGE_PREFIX}${schoolId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SchoolBrandMeta>;
    if (typeof parsed.name === 'string') {
      return {
        name: parsed.name,
        logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeSchoolMetaCache(schoolId: string, meta: SchoolBrandMeta) {
  if (!schoolId) return;
  try {
    localStorage.setItem(
      `${SCHOOL_META_STORAGE_PREFIX}${schoolId}`,
      JSON.stringify(meta)
    );
  } catch {
    // Abaikan jika penyimpanan lokal penuh
  }
}

export function StudentKioskPage() {
  const { t } = useTranslation();
  const currentLang: SupportedAttendanceLocale =
    t('common.language') === 'Language' ? 'en' : 'id';
  const dateLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
  const defaultSpecialEventLabel =
    currentLang === 'en' ? 'Special School Event' : 'Kegiatan Khusus Sekolah';
  const defaultHolidayLabel =
    currentLang === 'en' ? 'School Holiday' : 'Hari Libur';

  const { user, school } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string; npsn: string; logoUrl?: string | null }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  const [schoolBrand, setSchoolBrand] = useState<SchoolBrandMeta>(() => ({
    name: school?.name ?? 'SekolahERP',
    logoUrl: (school as { logoUrl?: string | null } | null)?.logoUrl ?? null,
  }));
  const [logoLoadError, setLogoLoadError] = useState<boolean>(false);

  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [schoolTimezone, setSchoolTimezone] = useState<string>(
    DEFAULT_SCHOOL_TIMEZONE
  );

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(KIOSK_SOUND_PREF_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [soundVolume, setSoundVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(KIOSK_SOUND_VOLUME_KEY);
      if (saved === null) return DEFAULT_KIOSK_SOUND_VOLUME;
      const parsed = Number(saved);
      return Number.isFinite(parsed)
        ? Math.min(1, Math.max(0, parsed))
        : DEFAULT_KIOSK_SOUND_VOLUME;
    } catch {
      return DEFAULT_KIOSK_SOUND_VOLUME;
    }
  });

  const triggerSound = useCallback(
    (type: KioskSoundType) => {
      if (!soundEnabled || soundVolume <= 0) return;
      playKioskFeedbackSound(type, soundVolume);
    },
    [soundEnabled, soundVolume]
  );

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KIOSK_SOUND_PREF_KEY, String(next));
      } catch {
        // Abaikan error storage
      }
      if (next) {
        const testVol = soundVolume > 0 ? soundVolume : DEFAULT_KIOSK_SOUND_VOLUME;
        if (soundVolume <= 0) {
          setSoundVolume(testVol);
          try {
            localStorage.setItem(KIOSK_SOUND_VOLUME_KEY, String(testVol));
          } catch {
            // Abaikan error storage
          }
        }
        playKioskFeedbackSound('checkin', testVol);
      }
      return next;
    });
  };

  const handleVolumeChange = (percentValue: number) => {
    const normalized = Math.min(1, Math.max(0, percentValue / 100));
    setSoundVolume(normalized);
    const shouldEnable = normalized > 0;
    setSoundEnabled(shouldEnable);
    try {
      localStorage.setItem(KIOSK_SOUND_VOLUME_KEY, String(normalized));
      localStorage.setItem(KIOSK_SOUND_PREF_KEY, String(shouldEnable));
    } catch {
      // Abaikan error storage
    }
  };

  useEffect(() => {
    const unlockAudio = () => {
      getAudioContext();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const today = useMemo(
    () => getSchoolDateString(nowTick, schoolTimezone),
    [nowTick, schoolTimezone]
  );

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
    lang: currentLang,
  });

  const activeSpecialEventNote = useMemo(() => {
    if (!isHoliday || !isSpecialEventActive) return null;
    return (specialEventReason ?? '').trim() || defaultSpecialEventLabel;
  }, [isHoliday, isSpecialEventActive, specialEventReason, defaultSpecialEventLabel]);

  const [specialEventInput, setSpecialEventInput] = useState<string>('');

  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [scanMode, setScanMode] = useState<KioskScanMode>('AUTO');
  const [lastActionType, setLastActionType] = useState<'CHECK_IN' | 'CHECK_OUT'>(
    'CHECK_IN'
  );
  const [lastSavedOffline, setLastSavedOffline] = useState<boolean>(false);
  const [foundStudent, setFoundStudent] = useState<FoundStudent | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [todayStats, setTodayStats] = useState({
    present: 0,
    late: 0,
    checkedOut: 0,
    total: 0,
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineKioskQueueItem[]>([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [recentList, setRecentList] = useState<
    Array<{
      name: string;
      status: string;
      action: 'DATANG' | 'PULANG';
      time: string;
      isOfflineQueued?: boolean;
    }>
  >([]);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingLockRef = useRef<boolean>(false);
  const syncLockRef = useRef<boolean>(false);

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

  const isLateNow = isAfterDeadline(
    studentConfig.workStartTime,
    nowTick,
    studentConfig.lateToleranceMinutes,
    schoolTimezone
  );

  const isCheckOutWindowOpen =
    studentConfig.enableCheckOut &&
    isAtOrAfterScheduleTime(
      studentConfig.checkOutStartTime,
      nowTick,
      schoolTimezone
    );

  const javaneseInfo = useMemo(
    () => getJavaneseDateInfo(today, currentLang),
    [today, currentLang]
  );

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (processTimerRef.current) clearTimeout(processTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        setNowTick(new Date());
      }
    }, CLOCK_TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let mounted = true;

    async function loadSimSchools() {
      try {
        const { data, error } = await supabase
          .from('schools')
          .select('id, name, npsn, logoUrl')
          .order('name', { ascending: true });

        if (error) throw error;
        if (!mounted) return;

        const list = (data ?? []) as Array<{
          id: string;
          name: string;
          npsn: string;
          logoUrl?: string | null;
        }>;
        setSimSchools(list);
        if (school?.id) setSimSchoolId(school.id);
        else if (list.length > 0) setSimSchoolId(list[0].id);
      } catch {
        attendanceService
          .getAllSchoolsForSimulation()
          .then((list) => {
            if (!mounted) return;
            setSimSchools(list);
            if (school?.id) setSimSchoolId(school.id);
            else if (list.length > 0) setSimSchoolId(list[0].id);
          })
          .catch(console.error);
      }
    }

    void loadSimSchools();
    return () => {
      mounted = false;
    };
  }, [isSuperAdmin, school?.id]);

  const storeSchoolLogo =
    (school as { logoUrl?: string | null } | null)?.logoUrl ?? null;

  useEffect(() => {
    if (!activeSchoolId) return;
    let mounted = true;

    if (school?.id === activeSchoolId) {
      const nextMeta: SchoolBrandMeta = {
        name: school.name || 'SekolahERP',
        logoUrl: storeSchoolLogo,
      };
      setSchoolBrand(nextMeta);
      setLogoLoadError(false);
      writeSchoolMetaCache(activeSchoolId, nextMeta);
    } else {
      const simMatch = simSchools.find((s) => s.id === activeSchoolId);
      if (simMatch) {
        setSchoolBrand({
          name: simMatch.name,
          logoUrl: simMatch.logoUrl ?? null,
        });
        setLogoLoadError(false);
      } else {
        const cached = readSchoolMetaCache(activeSchoolId);
        if (cached) {
          setSchoolBrand(cached);
          setLogoLoadError(false);
        }
      }
    }

    if (navigator.onLine) {
      void supabase
        .from('schools')
        .select('name, logoUrl')
        .eq('id', activeSchoolId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!mounted || error || !data) return;
          const freshMeta: SchoolBrandMeta = {
            name: data.name || 'SekolahERP',
            logoUrl: data.logoUrl ?? null,
          };
          setSchoolBrand(freshMeta);
          setLogoLoadError(false);
          writeSchoolMetaCache(activeSchoolId, freshMeta);
        });
    }

    return () => {
      mounted = false;
    };
  }, [activeSchoolId, school?.id, school?.name, storeSchoolLogo, simSchools]);

  useEffect(() => {
    if (!activeSchoolId) {
      setOfflineQueue([]);
      return;
    }
    setOfflineQueue(readOfflineQueue(activeSchoolId));
  }, [activeSchoolId]);

  const refreshStudentDirectoryCache = useCallback(async () => {
    if (!activeSchoolId || !navigator.onLine) return;
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, fullName, nisn, nis, photoUrl, classes(name)')
        .eq('schoolId', activeSchoolId)
        .eq('status', 'AKTIF')
        .limit(2500);

      if (error || !data) return;

      const mapped: FoundStudent[] = (data as StudentLookupResult[]).map((s) => ({
        id: s.id,
        fullName: s.fullName,
        nisn: s.nisn,
        nis: s.nis ?? undefined,
        photoUrl: s.photoUrl ?? undefined,
        className: Array.isArray(s.classes)
          ? s.classes[0]?.name
          : s.classes?.name,
      }));

      writeStudentDirectoryCache(activeSchoolId, mapped);
    } catch {
      // Abaikan jika gagal memperbarui cache sementara
    }
  }, [activeSchoolId]);

  useEffect(() => {
    refreshStudentDirectoryCache();
  }, [refreshStudentDirectoryCache]);

  const loadStats = useCallback(async () => {
    if (!activeSchoolId || !navigator.onLine) return;
    try {
      const [summary, checkedOutRes, recentRes] = await Promise.all([
        attendanceService.getSummary(activeSchoolId, today),
        supabase
          .from('attendances')
          .select('id', { count: 'exact', head: true })
          .eq('schoolId', activeSchoolId)
          .eq('date', today)
          .eq('type', 'SISWA')
          .not('checkOutTime', 'is', null),
        supabase
          .from('attendances')
          .select(
            'status, checkInTime, checkOutTime, updatedAt, students(fullName)'
          )
          .eq('schoolId', activeSchoolId)
          .eq('date', today)
          .eq('type', 'SISWA')
          .in('status', ['HADIR', 'TERLAMBAT'])
          .order('updatedAt', { ascending: false })
          .limit(8),
      ]);

      setTodayStats({
        present: summary.studentPresent,
        late: summary.studentLate,
        checkedOut: checkedOutRes.count ?? 0,
        total: summary.studentTotal,
      });

      if (!recentRes.error && Array.isArray(recentRes.data)) {
        const mappedRecent = recentRes.data.map((row) => {
          const r = row as {
            status: string;
            checkInTime: string | null;
            checkOutTime: string | null;
            students?: { fullName?: string } | Array<{ fullName?: string }> | null;
          };
          const stName = Array.isArray(r.students)
            ? r.students[0]?.fullName
            : r.students?.fullName;
          const isOut = Boolean(r.checkOutTime);
          const rawIso = isOut ? r.checkOutTime : r.checkInTime;
          const timeLabel = rawIso
            ? new Date(rawIso).toLocaleTimeString(dateLocale, {
              timeZone: schoolTimezone,
              hour: '2-digit',
              minute: '2-digit',
            })
            : '-';

          return {
            name: stName || '-',
            status: isOut ? t('studentKiosk.actionOut') : r.status,
            action: (isOut ? 'PULANG' : 'DATANG') as 'DATANG' | 'PULANG',
            time: timeLabel,
          };
        });
        setRecentList(mappedRecent);
      }
    } catch {
      // Abaikan error statistik sementara
    }
  }, [activeSchoolId, today, dateLocale, schoolTimezone, t]);

  const syncOfflineQueue = useCallback(async () => {
    if (!activeSchoolId || !navigator.onLine || syncLockRef.current) return;

    const currentQueue = readOfflineQueue(activeSchoolId);
    if (currentQueue.length === 0) return;

    syncLockRef.current = true;
    setIsSyncingQueue(true);

    let remaining = [...currentQueue];
    let syncedCount = 0;

    try {
      const sortedQueue = [...currentQueue].sort((a, b) =>
        a.timestampIso.localeCompare(b.timestampIso)
      );

      for (const item of sortedQueue) {
        if (!navigator.onLine) break;

        try {
          const { data: existingAtt, error: fetchErr } = await supabase
            .from('attendances')
            .select('id, status, time, checkInTime, checkOutTime')
            .eq('schoolId', item.schoolId)
            .eq('studentId', item.studentId)
            .eq('date', item.date)
            .eq('type', 'SISWA')
            .maybeSingle();

          if (fetchErr) throw fetchErr;

          if (!existingAtt) {
            if (item.scanMode !== 'CHECK_OUT') {
              const { error: insertErr } = await supabase
                .from('attendances')
                .insert({
                  schoolId: item.schoolId,
                  studentId: item.studentId,
                  type: 'SISWA',
                  date: item.date,
                  status: item.status,
                  checkInTime: item.timestampIso,
                  notes: item.notes ?? null,
                  recordedBy: item.recordedBy,
                });

              if (insertErr) throw insertErr;

              void dispatchStudentAttendanceWhatsApp({
                studentId: item.studentId,
                eventType: 'CHECK_IN',
                timeFormatted: item.timeFormatted,
                status: item.status,
              });
            }
          } else if (
            !existingAtt.checkOutTime &&
            !['IZIN', 'SAKIT'].includes(existingAtt.status) &&
            studentConfig.enableCheckOut &&
            item.scanMode !== 'CHECK_IN'
          ) {
            const recordedInIso = existingAtt.checkInTime || existingAtt.time;
            const diffMinutes = recordedInIso
              ? Math.floor(
                (new Date(item.timestampIso).getTime() -
                  new Date(recordedInIso).getTime()) /
                60000
              )
              : 999;

            if (
              item.scanMode === 'CHECK_OUT' ||
              diffMinutes >= MIN_MINUTES_BETWEEN_IN_AND_OUT
            ) {
              const { error: updateErr } = await supabase
                .from('attendances')
                .update({ checkOutTime: item.timestampIso })
                .eq('id', existingAtt.id);

              if (updateErr) throw updateErr;

              void dispatchStudentAttendanceWhatsApp({
                studentId: item.studentId,
                eventType: 'CHECK_OUT',
                timeFormatted: item.timeFormatted,
                status: existingAtt.status,
              });
            }
          }

          remaining = remaining.filter((q) => q.queueId !== item.queueId);
          writeOfflineQueue(activeSchoolId, remaining);
          setOfflineQueue(remaining);
          syncedCount += 1;
        } catch (itemErr) {
          console.warn(
            '[KioskOfflineSync] Item gagal disinkronkan, akan dicoba lagi:',
            itemErr
          );
          break;
        }
      }

      if (syncedCount > 0) {
        await loadStats();
      }
    } finally {
      syncLockRef.current = false;
      setIsSyncingQueue(false);
    }
  }, [activeSchoolId, studentConfig.enableCheckOut, loadStats]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void refreshStudentDirectoryCache();
      void syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshStudentDirectoryCache, syncOfflineQueue]);

  useEffect(() => {
    if (isOnline && activeSchoolId && offlineQueue.length > 0) {
      void syncOfflineQueue();
    }
  }, [isOnline, activeSchoolId, offlineQueue.length, syncOfflineQueue]);

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

        if (coords?.settings) {
          const cfg = coords.settings;
          setSchoolTimezone(cfg.timezone || DEFAULT_SCHOOL_TIMEZONE);
          setStudentConfig({
            workStartTime: cfg.studentWorkStartTime || FALLBACK_STUDENT_START,
            lateToleranceMinutes: Math.max(
              0,
              Number(cfg.studentLateToleranceMinutes) || 0
            ),
            workEndTime: cfg.studentWorkEndTime || FALLBACK_STUDENT_END,
            checkOutStartTime:
              cfg.studentCheckOutStartTime || FALLBACK_STUDENT_CHECKOUT_START,
            enableKiosk:
              typeof cfg.enableStudentKiosk === 'boolean'
                ? cfg.enableStudentKiosk
                : true,
            enableCheckOut:
              typeof cfg.enableStudentCheckOut === 'boolean'
                ? cfg.enableStudentCheckOut
                : true,
          });
        }
      })
      .catch(console.error);
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
    setLastSavedOffline(false);
  }, []);

  const scheduleAutoReset = useCallback(
    (delayMs: number = KIOSK_RESET_DELAY_MS) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetToIdle, delayMs);
    },
    [resetToIdle]
  );

  const handleActivateSpecialEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await activateSpecialEvent(
        specialEventInput.trim() || defaultSpecialEventLabel
      );
      setSpecialEventInput('');
      triggerSound('checkin');
    } catch (err: unknown) {
      const detail = extractReadableError(
        err,
        currentLang === 'en'
          ? 'An error occurred while processing the request.'
          : 'Terjadi kesalahan saat memproses permintaan.'
      );
      triggerSound('error');
      setResultMessage(
        t('studentKiosk.msgSpecialEventError', { detail })
      );
      setKioskState('error');
      scheduleAutoReset(6000);
    }
  };

  const enqueueOfflineScan = useCallback(
    (student: FoundStudent, now: Date, timeStr: string) => {
      const existingTodayItems = readOfflineQueue(activeSchoolId).filter(
        (q) => q.studentId === student.id && q.date === today
      );

      if (existingTodayItems.length > 0) {
        const lastQueued = existingTodayItems[existingTodayItems.length - 1];
        const diffMins = Math.floor(
          (now.getTime() - new Date(lastQueued.timestampIso).getTime()) / 60000
        );

        if (
          scanMode === 'CHECK_IN' ||
          existingTodayItems.length >= 2 ||
          diffMins < MIN_MINUTES_BETWEEN_IN_AND_OUT
        ) {
          triggerSound('already');
          setResultMessage(
            t('studentKiosk.msgOfflineAlready', {
              name: student.fullName,
              time: lastQueued.timeFormatted,
            })
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }
      }

      const checkOutOpenAtScan =
        studentConfig.enableCheckOut &&
        isAtOrAfterScheduleTime(
          studentConfig.checkOutStartTime,
          now,
          schoolTimezone
        );

      const isCheckOutAction =
        scanMode === 'CHECK_OUT' ||
        (scanMode === 'AUTO' &&
          (existingTodayItems.length === 1 || checkOutOpenAtScan));

      const lateNow = isAfterDeadline(
        studentConfig.workStartTime,
        now,
        studentConfig.lateToleranceMinutes,
        schoolTimezone
      );
      const status: 'HADIR' | 'TERLAMBAT' = lateNow ? 'TERLAMBAT' : 'HADIR';

      const newItem: OfflineKioskQueueItem = {
        queueId: `${student.id}_${now.getTime()}`,
        schoolId: activeSchoolId,
        studentId: student.id,
        studentName: student.fullName,
        nisn: student.nisn,
        className: student.className,
        date: today,
        timestampIso: now.toISOString(),
        timeFormatted: timeStr,
        scanMode: isCheckOutAction ? 'CHECK_OUT' : scanMode,
        status,
        notes: activeSpecialEventNote,
        recordedBy: user?.id ?? null,
      };

      const updatedQueue = [...readOfflineQueue(activeSchoolId), newItem];
      writeOfflineQueue(activeSchoolId, updatedQueue);
      setOfflineQueue(updatedQueue);

      const displayStatus = isCheckOutAction
        ? t('studentKiosk.actionOut')
        : status;

      triggerSound(isCheckOutAction ? 'checkout' : 'checkin');
      setLastSavedOffline(true);
      setLastActionType(isCheckOutAction ? 'CHECK_OUT' : 'CHECK_IN');
      setResultMessage(
        t('studentKiosk.msgOfflineQueued', {
          name: student.fullName,
          status: displayStatus,
          time: timeStr,
        })
      );
      setKioskState('success');

      setTodayStats((prev) => ({
        ...prev,
        present: !isCheckOutAction && !lateNow ? prev.present + 1 : prev.present,
        late: !isCheckOutAction && lateNow ? prev.late + 1 : prev.late,
        checkedOut: isCheckOutAction ? prev.checkedOut + 1 : prev.checkedOut,
      }));

      setRecentList((prev) => [
        {
          name: student.fullName,
          status: displayStatus,
          action: isCheckOutAction ? 'PULANG' : 'DATANG',
          time: timeStr,
          isOfflineQueued: true,
        },
        ...prev.slice(0, 9),
      ]);

      scheduleAutoReset();
    },
    [
      activeSchoolId,
      today,
      scanMode,
      studentConfig.enableCheckOut,
      studentConfig.checkOutStartTime,
      studentConfig.workStartTime,
      studentConfig.lateToleranceMinutes,
      schoolTimezone,
      activeSpecialEventNote,
      user?.id,
      triggerSound,
      scheduleAutoReset,
      t,
    ]
  );

  const processStudentScan = useCallback(
    async (student: FoundStudent) => {
      if (!activeSchoolId) {
        processingLockRef.current = false;
        return;
      }

      if (isHolidayLocked || isCheckingHoliday) {
        triggerSound('error');
        setResultMessage(
          t('studentKiosk.msgHolidayLocked', {
            holiday: holidayName || defaultHolidayLabel,
          })
        );
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const timeStr = now.toLocaleTimeString(dateLocale, {
        timeZone: schoolTimezone,
        hour: '2-digit',
        minute: '2-digit',
      });

      if (!navigator.onLine) {
        enqueueOfflineScan(student, now, timeStr);
        return;
      }

      try {
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
            triggerSound('error');
            setResultMessage(
              t('studentKiosk.msgNotCheckedInYet', { name: student.fullName })
            );
            setKioskState('error');
            scheduleAutoReset();
            return;
          }

          const lateNow = isAfterDeadline(
            studentConfig.workStartTime,
            now,
            studentConfig.lateToleranceMinutes,
            schoolTimezone
          );
          const status = lateNow ? 'TERLAMBAT' : 'HADIR';

          const { error: insertErr } = await supabase
            .from('attendances')
            .insert({
              schoolId: activeSchoolId,
              studentId: student.id,
              type: 'SISWA',
              date: today,
              status,
              checkInTime: nowIso,
              notes: activeSpecialEventNote,
              recordedBy: user?.id ?? null,
            });

          if (insertErr) throw insertErr;

          triggerSound('checkin');
          setLastSavedOffline(false);
          setLastActionType('CHECK_IN');
          setResultMessage(
            t('studentKiosk.msgCheckInSuccess', {
              name: student.fullName,
              status,
              time: timeStr,
            })
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
          triggerSound('already');
          setResultMessage(
            t('studentKiosk.msgRecordedLeave', {
              name: student.fullName,
              status: existingAtt.status,
            })
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        if (existingAtt.checkOutTime) {
          const outTime = new Date(existingAtt.checkOutTime).toLocaleTimeString(
            dateLocale,
            {
              timeZone: schoolTimezone,
              hour: '2-digit',
              minute: '2-digit',
            }
          );
          triggerSound('already');
          setResultMessage(
            t('studentKiosk.msgAlreadyBoth', {
              name: student.fullName,
              time: outTime,
            })
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        if (!studentConfig.enableCheckOut || scanMode === 'CHECK_IN') {
          triggerSound('already');
          setResultMessage(
            t('studentKiosk.msgAlreadyInOnly', { name: student.fullName })
          );
          setKioskState('already');
          scheduleAutoReset();
          return;
        }

        const recordedInIso = existingAtt.checkInTime || existingAtt.time;
        const minutesSinceCheckIn = recordedInIso
          ? Math.floor(
            (now.getTime() - new Date(recordedInIso).getTime()) / 60000
          )
          : 999;

        const isPastCheckOutOpen = isAtOrAfterScheduleTime(
          studentConfig.checkOutStartTime,
          now,
          schoolTimezone
        );

        if (
          scanMode === 'AUTO' &&
          (!isPastCheckOutOpen ||
            minutesSinceCheckIn < MIN_MINUTES_BETWEEN_IN_AND_OUT)
        ) {
          const inTimeLabel = recordedInIso
            ? new Date(recordedInIso).toLocaleTimeString(dateLocale, {
              timeZone: schoolTimezone,
              hour: '2-digit',
              minute: '2-digit',
            })
            : studentConfig.workStartTime;
          triggerSound('already');
          setResultMessage(
            t('studentKiosk.msgWaitCheckOutWindow', {
              name: student.fullName,
              inTime: inTimeLabel,
              openTime: studentConfig.checkOutStartTime,
            })
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

        triggerSound('checkout');
        setLastSavedOffline(false);
        setLastActionType('CHECK_OUT');
        setResultMessage(
          t('studentKiosk.msgCheckOutSuccess', {
            name: student.fullName,
            time: timeStr,
          })
        );
        setKioskState('success');

        setTodayStats((prev) => ({
          ...prev,
          checkedOut: prev.checkedOut + 1,
        }));

        setRecentList((prev) => [
          {
            name: student.fullName,
            status: t('studentKiosk.actionOut'),
            action: 'PULANG',
            time: timeStr,
          },
          ...prev.slice(0, 9),
        ]);

        void dispatchStudentAttendanceWhatsApp({
          studentId: student.id,
          eventType: 'CHECK_OUT',
          timeFormatted: timeStr,
          status: existingAtt.status,
        });

        scheduleAutoReset();
      } catch (err) {
        console.warn(
          '[Kiosk] Gagal mengirim langsung, mengalihkan ke antrean offline:',
          err
        );
        enqueueOfflineScan(student, now, timeStr);
      }
    },
    [
      activeSchoolId,
      isHolidayLocked,
      isCheckingHoliday,
      holidayName,
      defaultHolidayLabel,
      dateLocale,
      schoolTimezone,
      today,
      scanMode,
      studentConfig.workStartTime,
      studentConfig.lateToleranceMinutes,
      studentConfig.enableCheckOut,
      studentConfig.checkOutStartTime,
      activeSpecialEventNote,
      triggerSound,
      scheduleAutoReset,
      enqueueOfflineScan,
      user?.id,
      t,
    ]
  );

  const handleScan = useCallback(
    async (code: string) => {
      if (!activeSchoolId || processingLockRef.current) return;

      if (isHolidayLocked || isCheckingHoliday) {
        triggerSound('error');
        setResultMessage(
          t('studentKiosk.msgHolidayLocked', {
            holiday: holidayName || defaultHolidayLabel,
          })
        );
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      if (!studentConfig.enableKiosk) {
        triggerSound('error');
        setResultMessage(t('studentKiosk.msgKioskDisabled'));
        setKioskState('error');
        scheduleAutoReset();
        return;
      }

      const cleanCode = code.trim();
      if (!cleanCode) return;

      processingLockRef.current = true;
      setKioskState('scanning');

      const lookupFromLocalCache = (): FoundStudent | undefined => {
        const cachedList = readStudentDirectoryCache(activeSchoolId);
        return cachedList.find(
          (s) =>
            s.nisn?.trim() === cleanCode ||
            (s.nis && s.nis.trim() === cleanCode)
        );
      };

      try {
        let mappedStudent: FoundStudent | null = null;

        if (navigator.onLine) {
          try {
            const student = await attendanceService.findStudentByNisOrNisn(
              activeSchoolId,
              cleanCode
            );

            if (student) {
              const typedStudent = student as StudentLookupResult;
              const resolvedClassName = Array.isArray(typedStudent.classes)
                ? typedStudent.classes[0]?.name
                : typedStudent.classes?.name;

              mappedStudent = {
                id: typedStudent.id,
                fullName: typedStudent.fullName,
                nisn: typedStudent.nisn,
                nis: typedStudent.nis ?? undefined,
                photoUrl: typedStudent.photoUrl ?? undefined,
                className: resolvedClassName,
              };
            }
          } catch {
            mappedStudent = lookupFromLocalCache() ?? null;
          }
        } else {
          mappedStudent = lookupFromLocalCache() ?? null;
        }

        if (!mappedStudent) {
          triggerSound('error');
          setResultMessage(
            navigator.onLine
              ? t('studentKiosk.msgStudentNotFound', { code: cleanCode })
              : t('studentKiosk.msgOfflineStudentNotCached', { code: cleanCode })
          );
          setKioskState('error');
          scheduleAutoReset();
          return;
        }

        setFoundStudent(mappedStudent);
        setKioskState('found');

        if (processTimerRef.current) clearTimeout(processTimerRef.current);
        processTimerRef.current = setTimeout(
          () => processStudentScan(mappedStudent as FoundStudent),
          STUDENT_PREVIEW_DELAY_MS
        );
      } catch (err) {
        console.error('Gagal mencari data siswa:', err);
        triggerSound('error');
        setResultMessage(t('studentKiosk.msgScanError'));
        setKioskState('error');
        scheduleAutoReset();
      }
    },
    [
      activeSchoolId,
      isHolidayLocked,
      isCheckingHoliday,
      holidayName,
      defaultHolidayLabel,
      studentConfig.enableKiosk,
      triggerSound,
      processStudentScan,
      scheduleAutoReset,
      t,
    ]
  );

  const currentTime = nowTick.toLocaleTimeString(dateLocale, {
    timeZone: schoolTimezone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentDate = nowTick.toLocaleDateString(dateLocale, {
    timeZone: schoolTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeSchoolName = schoolBrand.name;
  const activeSchoolLogoUrl = schoolBrand.logoUrl;
  const hasRenderableLogo = Boolean(activeSchoolLogoUrl) && !logoLoadError;

  const isAudioActive = soundEnabled && soundVolume > 0;
  const volumePercent = Math.round((isAudioActive ? soundVolume : 0) * 100);

  return (
    <div
      className="kiosk-page"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        .kiosk-map-fill > div,
        .kiosk-map-fill .leaflet-container {
          height: 100% !important;
          min-height: 185px !important;
        }
        .kiosk-volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
        }
        .kiosk-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #34d399;
          border: 2px solid #ffffff;
          box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
          cursor: pointer;
          transition: transform 0.15s ease, background-color 0.15s ease;
        }
        .kiosk-volume-slider::-webkit-slider-thumb:hover {
          transform: scale(1.16);
          background: #6ee7b7;
        }
        .kiosk-volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #34d399;
          border: 2px solid #ffffff;
          box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
          cursor: pointer;
          transition: transform 0.15s ease, background-color 0.15s ease;
        }
        @media (max-width: 768px) {
          .kiosk-header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 0.65rem !important;
            padding: 0.75rem 0.9rem !important;
          }
          .kiosk-header-right {
            flex-wrap: wrap !important;
            justify-content: space-between !important;
            gap: 0.5rem !important;
          }
          .kiosk-clock {
            font-size: 1.35rem !important;
          }
          .kiosk-body {
            flex-direction: column !important;
            padding: 0.5rem 0.75rem 1.25rem !important;
            gap: 0.75rem !important;
          }
          .kiosk-sidebar {
            display: none !important;
          }
          .kiosk-main {
            padding: 0.25rem 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div className="kiosk-header" style={{ flexShrink: 0 }}>
        <div className="kiosk-school-info">
          {hasRenderableLogo ? (
            <div className="w-11 h-11 rounded-xl bg-white border border-border/70 p-1 shadow-xs flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={activeSchoolLogoUrl!}
                alt={activeSchoolName}
                onError={() => setLogoLoadError(true)}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <School size={28} className="kiosk-school-icon shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="kiosk-school-name truncate">{activeSchoolName}</h1>
            <p className="kiosk-date">
              {currentDate} •{' '}
              {t('studentKiosk.scheduleSummary', {
                start: studentConfig.workStartTime,
                end: studentConfig.workEndTime,
              })}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CalendarDays size={12} />
                {javaneseInfo.hariPasaran}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold">
                {javaneseInfo.javaneseDay} {javaneseInfo.javaneseMonth}{' '}
                {javaneseInfo.javaneseYear} Ja
              </span>
            </div>
          </div>
        </div>

        <div className="kiosk-header-right">
          {isSuperAdmin && simSchools.length > 0 && (
            <select
              className="form-input text-xs py-1 px-2 max-w-44"
              value={simSchoolId}
              onChange={(e) => setSimSchoolId(e.target.value)}
            >
              {simSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {t('studentKiosk.simPrefix', { name: s.name })}
                </option>
              ))}
            </select>
          )}

          {offlineQueue.length > 0 && (
            <button
              type="button"
              disabled={!isOnline || isSyncingQueue}
              onClick={() => void syncOfflineQueue()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition cursor-pointer disabled:opacity-60"
              title={
                isOnline
                  ? t('studentKiosk.offlineQueueTitleOnline')
                  : t('studentKiosk.offlineQueueTitleOffline')
              }
            >
              {isSyncingQueue ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <CloudUpload size={14} />
              )}
              <span>
                {isSyncingQueue
                  ? t('studentKiosk.offlineQueueBtnSyncing')
                  : t('studentKiosk.offlineQueueBtnLabel', {
                    count: offlineQueue.length,
                  })}
              </span>
            </button>
          )}

          {/* Kontrol Suara & Penggeser Volume */}
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-white/15 bg-slate-900/90 backdrop-blur-md shadow-sm">
            <button
              type="button"
              onClick={toggleSound}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold transition cursor-pointer ${isAudioActive
                ? 'text-emerald-400 hover:text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
                }`}
              title={
                isAudioActive
                  ? t('studentKiosk.soundTitleMute')
                  : t('studentKiosk.soundTitleUnmute')
              }
            >
              <span
                className={`p-1 rounded-lg transition ${isAudioActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-white/5 text-slate-400'
                  }`}
              >
                {isAudioActive ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </span>
              <span className="hidden md:inline tracking-tight">
                {isAudioActive
                  ? t('studentKiosk.soundLabelOn')
                  : t('studentKiosk.soundLabelOff')}
              </span>
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePercent}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              onMouseUp={() => {
                if (isAudioActive) {
                  playKioskFeedbackSound('checkin', soundVolume);
                }
              }}
              onTouchEnd={() => {
                if (isAudioActive) {
                  playKioskFeedbackSound('checkin', soundVolume);
                }
              }}
              aria-label={t('studentKiosk.soundAriaVolume')}
              title={t('studentKiosk.soundTitleVolume', {
                percent: volumePercent,
              })}
              style={{
                background: `linear-gradient(to right, #10b981 0%, #34d399 ${volumePercent}%, rgba(255, 255, 255, 0.16) ${volumePercent}%, rgba(255, 255, 255, 0.16) 100%)`,
              }}
              className="kiosk-volume-slider w-14 sm:w-20"
            />

            <span
              className={`text-[11px] font-mono font-bold min-w-8 text-right select-none ${isAudioActive ? 'text-slate-100' : 'text-slate-400'
                }`}
            >
              {volumePercent}%
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto sm:ml-0">
            <div className="kiosk-clock">{currentTime}</div>
            <div
              className={`kiosk-online-badge ${isOnline ? 'online' : 'offline'}`}
            >
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isOnline
                ? t('studentKiosk.statusOnline')
                : t('studentKiosk.statusOffline')}
            </div>
          </div>
        </div>
      </div>

      {/* Banner Informasi Mode Antrean Offline */}
      {!isOnline && (
        <div className="mx-3 sm:mx-4 mt-2.5 p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CloudOff size={16} className="shrink-0 text-amber-500" />
            <span>
              <strong>{t('studentKiosk.offlineBannerTitle')}</strong>{' '}
              {t('studentKiosk.offlineBannerDesc')}
            </span>
          </div>
          {offlineQueue.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/25 font-bold shrink-0">
              {t('studentKiosk.offlineWaitingCount', {
                count: offlineQueue.length,
              })}
            </span>
          )}
        </div>
      )}

      {/* Bilah Statistik Ringkas Khusus Layar HP (< 768px) agar Kamera Tetap di Atas */}
      <div className="grid grid-cols-3 gap-2 px-3 pt-2.5 md:hidden shrink-0">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-center">
          <div className="text-base font-extrabold text-emerald-500 leading-tight">
            {todayStats.present}
          </div>
          <div className="text-[10px] font-medium opacity-75">
            {t('studentKiosk.statPresent')}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-center">
          <div className="text-base font-extrabold text-amber-500 leading-tight">
            {todayStats.late}
          </div>
          <div className="text-[10px] font-medium opacity-75">
            {t('studentKiosk.statLate')}
          </div>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-center">
          <div className="text-base font-extrabold text-blue-500 leading-tight">
            {studentConfig.enableCheckOut
              ? todayStats.checkedOut
              : todayStats.present + todayStats.late}
          </div>
          <div className="text-[10px] font-medium opacity-75">
            {studentConfig.enableCheckOut
              ? t('studentKiosk.statCheckedOut')
              : t('studentKiosk.statTotalScan')}
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
        {/* Sidebar Desktop (>= 768px) */}
        <div className="kiosk-sidebar flex-col gap-3">
          <div className="kiosk-stat-card" style={{ flexShrink: 0 }}>
            <div className="kiosk-stat-header">
              <Users size={20} />
              <span>{t('studentKiosk.statCardTitle')}</span>
            </div>
            <div className="kiosk-stat-grid">
              <div className="kiosk-stat-item hadir">
                <span className="kiosk-stat-number">{todayStats.present}</span>
                <span className="kiosk-stat-label">
                  {t('studentKiosk.statPresent')}
                </span>
              </div>
              <div className="kiosk-stat-item terlambat">
                <span className="kiosk-stat-number">{todayStats.late}</span>
                <span className="kiosk-stat-label">
                  {t('studentKiosk.statLate')}
                </span>
              </div>
              <div className="kiosk-stat-item total">
                <span className="kiosk-stat-number">
                  {studentConfig.enableCheckOut
                    ? todayStats.checkedOut
                    : todayStats.present + todayStats.late}
                </span>
                <span className="kiosk-stat-label">
                  {studentConfig.enableCheckOut
                    ? t('studentKiosk.statCheckedOut')
                    : t('studentKiosk.statTotalScan')}
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
                <span>{t('studentKiosk.mapCardTitle')}</span>
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
              <h3 className="kiosk-recent-title">
                {t('studentKiosk.recentTitle')}
              </h3>
              <div className="kiosk-recent-list">
                {recentList.map((item, i) => (
                  <div
                    key={`${item.name}-${item.time}-${i}`}
                    className="kiosk-recent-item"
                  >
                    <div className="kiosk-recent-info">
                      <span className="kiosk-recent-name">
                        {item.name}{' '}
                        {item.isOfflineQueued && (
                          <span className="text-[10px] font-bold text-amber-500">
                            {t('studentKiosk.recentQueuedBadge')}
                          </span>
                        )}
                      </span>
                      <span className="kiosk-recent-time">
                        {item.action === 'PULANG'
                          ? t('studentKiosk.actionOut')
                          : t('studentKiosk.actionIn')}{' '}
                        • {item.time}
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

        {/* Area Utama Kamera & Pemindaian */}
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
          {isHoliday && isSpecialEventActive && (
            <div className="mb-3 w-full max-w-xl p-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-500 shrink-0" />
                <div>
                  <span className="font-bold">
                    {t('studentKiosk.specialEventActiveTitle', {
                      reason: activeSpecialEventNote ?? '',
                    })}
                  </span>
                  <p className="text-[11px] opacity-80">
                    {t('studentKiosk.specialEventActiveSub', {
                      holiday: holidayName ?? '',
                    })}
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
                  {isTogglingHoliday
                    ? t('studentKiosk.btnLocking')
                    : t('studentKiosk.btnRelock')}
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
                        <Lock size={12} /> {t('studentKiosk.lockedBadge')}
                      </span>
                      <h2 className="text-lg font-extrabold text-foreground">
                        {t('studentKiosk.lockedHolidayTitle', {
                          holiday: holidayName ?? '',
                        })}
                      </h2>
                      <p className="text-xs opacity-80 leading-relaxed">
                        {t('studentKiosk.lockedHolidayDesc')}
                      </p>
                    </div>

                    {canManageOverride ? (
                      <form
                        onSubmit={handleActivateSpecialEvent}
                        className="pt-3 border-t border-red-500/25 space-y-2.5 text-left"
                      >
                        <label className="block text-xs font-bold text-foreground">
                          {t('studentKiosk.specialEventPromptLabel')}
                        </label>
                        <input
                          type="text"
                          value={specialEventInput}
                          onChange={(e) => setSpecialEventInput(e.target.value)}
                          placeholder={t(
                            'studentKiosk.specialEventPlaceholder',
                            { defaultName: defaultSpecialEventLabel }
                          )}
                          className="form-input w-full text-xs"
                        />
                        <button
                          type="submit"
                          disabled={isTogglingHoliday}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                        >
                          <Unlock size={15} />
                          {isTogglingHoliday
                            ? t('studentKiosk.btnUnlocking')
                            : t('studentKiosk.btnActivateSpecialEvent')}
                        </button>
                      </form>
                    ) : (
                      <p className="text-[11px] opacity-70 pt-2 border-t border-red-500/20">
                        {t('studentKiosk.lockedLoginHint')}
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
                      {t('studentKiosk.kioskDisabledTitle')}
                    </h2>
                    <p className="text-xs opacity-80">
                      {t('studentKiosk.kioskDisabledDesc')}
                    </p>
                  </div>
                ) : (
                  <div className="w-full flex-1 min-h-0 flex flex-col items-center">
                    {studentConfig.enableCheckOut && (
                      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mb-2 shrink-0">
                        {(
                          [
                            {
                              id: 'AUTO',
                              label: isCheckOutWindowOpen
                                ? t('studentKiosk.modeAutoReadyOut')
                                : t('studentKiosk.modeAutoIn'),
                            },
                            {
                              id: 'CHECK_IN',
                              label: t('studentKiosk.modeCheckInOnly'),
                            },
                            {
                              id: 'CHECK_OUT',
                              label: t('studentKiosk.modeCheckOutOnly'),
                            },
                          ] as const
                        ).map((modeOpt) => (
                          <button
                            key={modeOpt.id}
                            type="button"
                            onClick={() => setScanMode(modeOpt.id)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold border transition cursor-pointer ${scanMode === modeOpt.id
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                              : 'bg-card/70 text-foreground border-border opacity-75 hover:opacity-100'
                              }`}
                          >
                            {modeOpt.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <h2 className="kiosk-idle-title text-lg sm:text-2xl leading-tight shrink-0">
                      {scanMode === 'CHECK_OUT'
                        ? t('studentKiosk.idleTitleCheckOut')
                        : isCheckOutWindowOpen && scanMode === 'AUTO'
                          ? t('studentKiosk.idleTitleAutoOut')
                          : t('studentKiosk.idleTitleDefault')}
                    </h2>
                    <p className="kiosk-idle-subtitle text-xs mt-1 mb-2.5 shrink-0">
                      {t('studentKiosk.idleSubtitle')}
                    </p>

                    <div
                      className="kiosk-scanner-area w-full"
                      style={{ padding: '0.75rem', minHeight: 'auto' }}
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
                        {t('studentKiosk.lateWarningBanner', {
                          deadline: studentDeadline,
                        })}
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
                <p className="kiosk-scanning-text">
                  {t('studentKiosk.processingText')}
                </p>
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
                  {t('studentKiosk.recordingAttendanceText')}
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
                  {lastSavedOffline ? (
                    <CloudUpload size={92} />
                  ) : lastActionType === 'CHECK_OUT' ? (
                    <LogOut size={92} />
                  ) : (
                    <CheckCircle size={92} />
                  )}
                </motion.div>
                <h2 className="kiosk-result-title">
                  {lastSavedOffline
                    ? t('studentKiosk.resultTitleOfflineSaved')
                    : lastActionType === 'CHECK_OUT'
                      ? t('studentKiosk.resultTitleCheckOutSuccess')
                      : t('studentKiosk.resultTitleCheckInSuccess')}
                </h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <p className="kiosk-result-hint">
                  {lastSavedOffline
                    ? t('studentKiosk.resultHintOffline')
                    : t('studentKiosk.resultHintOnline')}
                </p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  {t('studentKiosk.btnNextScan')}
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
                <LogIn size={76} />
                <h2 className="kiosk-result-title">
                  {t('studentKiosk.resultTitleAlready')}
                </h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  {t('studentKiosk.btnBack')}
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
                <XCircle size={76} />
                <h2 className="kiosk-result-title">
                  {t('studentKiosk.resultTitleError')}
                </h2>
                <p className="kiosk-result-message">{resultMessage}</p>
                <button className="btn-outline-kiosk" onClick={resetToIdle}>
                  <RotateCcw size={16} />
                  {t('studentKiosk.btnTryAgain')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Riwayat Aktivitas Terakhir Khusus Layar HP (< 768px) di Bawah Kamera */}
          {recentList.length > 0 && (
            <div className="w-full max-w-xl mt-3 md:hidden rounded-2xl border border-border bg-card/70 p-3">
              <h3 className="text-xs font-bold mb-2 opacity-80">
                {t('studentKiosk.recentTitle')}
              </h3>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recentList.slice(0, 4).map((item, i) => (
                  <div
                    key={`mob-${item.name}-${item.time}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-border/50 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {item.name}{' '}
                        {item.isOfflineQueued && (
                          <span className="text-[10px] font-bold text-amber-500">
                            {t('studentKiosk.recentQueuedBadge')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] opacity-70">
                        {item.action === 'PULANG'
                          ? t('studentKiosk.actionOut')
                          : t('studentKiosk.actionIn')}{' '}
                        • {item.time}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${item.status === 'TERLAMBAT'
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-emerald-500/20 text-emerald-500'
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
      </div>
    </div>
  );
}