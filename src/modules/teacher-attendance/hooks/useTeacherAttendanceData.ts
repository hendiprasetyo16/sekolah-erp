// src/modules/teacher-attendance/hooks/useTeacherAttendanceData.ts
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import {
  checkRedDateStatus,
  type WorkDaysMode,
} from '@/modules/attendance/utils/indonesianHolidays';
import {
  getJavaneseDateInfo,
  getJavaneseMonthRangeLabel,
} from '@/modules/attendance/utils/javaneseCalendar';
import { getSchoolDateString } from '@/modules/attendance/services/gps.utils';
import { detectDevicePlatform } from '@/utils/devicePlatform';
import { useTeacherHolidayLock } from '@/modules/attendance/hooks/useTeacherHolidayLock';
import type { SupportedAttendanceLocale } from '@/modules/attendance/types/attendance.types';
import {
  ALLOW_LEAVE_ON_HOLIDAY,
  CHECKOUT_TOLERANCE_MINUTES,
  DEFAULT_RADIUS_METERS,
  DEFAULT_SCHOOL_TIMEZONE,
  FALLBACK_REQUIRE_SELFIE_CHECKIN,
  FALLBACK_REQUIRE_SELFIE_CHECKOUT,
  FALLBACK_WORK_END_TIME,
  FALLBACK_WORK_START_TIME,
  MIN_REASON_LENGTH,
} from '../constants/teacherAttendance.constants';
import type {
  AttendanceRecord,
  CheckOutTimingStatus,
  DailyQuoteDbRow,
  DailyQuoteItem,
  LeaveCategory,
  SchoolDbRow,
  SchoolGeoAndSchedule,
  SubView,
  TeacherDbRow,
  TeacherProfile,
} from '../types/teacherAttendance.types';
import {
  buildTeacherFolderName,
  calculateLateMinutes,
  evaluateCheckOutTiming,
  extractErrorMessage,
  formatDeadlineWithTolerance,
  formatTeacherIdentityLabel,
  getClockPartsInTimezone,
  getTimeStampTagInTimezone,
  mapTeacherDbRowToProfile,
  sanitizeStorageSegment,
} from '../utils/teacherAttendance.helpers';

interface UseTeacherAttendanceDataParams {
  setActiveView: (view: SubView) => void;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export function useTeacherAttendanceData({
  setActiveView,
  showToast,
}: UseTeacherAttendanceDataParams) {
  const { t } = useTranslation();
  const currentLang: SupportedAttendanceLocale =
    t('common.language') === 'Language' ? 'en' : 'id';
  const dateLocale = currentLang === 'en' ? 'en-US' : 'id-ID';

  const { user, school, hasAnyRole } = useAuthStore();
  const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
  const isAdminOrSuperAdmin = hasAnyRole(['SUPER_ADMIN', 'ADMIN']);

  const devicePlatform = useMemo(() => detectDevicePlatform(), []);

  const defaultDailyQuotes = useMemo<DailyQuoteItem[]>(
    () => [
      { quote: t('teacherAttendance.quoteDefault1') },
      { quote: t('teacherAttendance.quoteDefault2') },
      { quote: t('teacherAttendance.quoteDefault3') },
      { quote: t('teacherAttendance.quoteDefault4') },
    ],
    [t]
  );

  const monthNames = useMemo(
    () => [
      t('teacherAttendance.month_0'),
      t('teacherAttendance.month_1'),
      t('teacherAttendance.month_2'),
      t('teacherAttendance.month_3'),
      t('teacherAttendance.month_4'),
      t('teacherAttendance.month_5'),
      t('teacherAttendance.month_6'),
      t('teacherAttendance.month_7'),
      t('teacherAttendance.month_8'),
      t('teacherAttendance.month_9'),
      t('teacherAttendance.month_10'),
      t('teacherAttendance.month_11'),
    ],
    [t]
  );

  const shortDayNames = useMemo(
    () => [
      t('teacherAttendance.dayShort_0'),
      t('teacherAttendance.dayShort_1'),
      t('teacherAttendance.dayShort_2'),
      t('teacherAttendance.dayShort_3'),
      t('teacherAttendance.dayShort_4'),
      t('teacherAttendance.dayShort_5'),
      t('teacherAttendance.dayShort_6'),
    ],
    [t]
  );

  const formatDurationMinutes = useCallback(
    (totalMinutes: number): string => {
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      if (hours > 0) {
        return mins > 0
          ? t('teacherAttendance.durHoursAndMins', { hours, mins })
          : t('teacherAttendance.durHoursOnly', { hours });
      }
      return t('teacherAttendance.durMinsOnly', { mins });
    },
    [t]
  );

  const formatStatusLabel = useCallback(
    (status?: string | null): string => {
      const upper = (status ?? '').toUpperCase();
      switch (upper) {
        case 'HADIR':
          return t('teacherAttendance.status_HADIR');
        case 'TERLAMBAT':
          return t('teacherAttendance.status_TERLAMBAT');
        case 'IZIN':
          return t('teacherAttendance.status_IZIN');
        case 'SAKIT':
          return t('teacherAttendance.status_SAKIT');
        case 'ALPA':
        case 'ALPHA':
          return t('teacherAttendance.status_ALPA');
        default:
          return upper || '-';
      }
    },
    [t]
  );

  const formatDistanceLabel = useCallback(
    (meters: number | null): string => {
      if (meters === null) return t('teacherAttendance.distanceCalculating');
      if (meters >= 1000) {
        const kmStr = (meters / 1000).toFixed(2);
        return currentLang === 'en'
          ? `${kmStr} km`
          : `${kmStr.replace('.', ',')} km`;
      }
      return `${Math.round(meters)} m`;
    },
    [currentLang, t]
  );

  // State Simulasi Super Admin
  const [simSchools, setSimSchools] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [simSchoolId, setSimSchoolId] = useState<string>('');
  const [simTeachers, setSimTeachers] = useState<TeacherProfile[]>([]);
  const [simTeacherId, setSimTeacherId] = useState<string>('');
  const [isLoadingSimTeachers, setIsLoadingSimTeachers] =
    useState<boolean>(false);

  const activeSchoolId = isSuperAdmin
    ? simSchoolId || school?.id || ''
    : school?.id || '';

  // Jam Real-time (1 detik)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Data Guru, Pengaturan Sekolah, & Riwayat Presensi
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [schoolGeo, setSchoolGeo] = useState<SchoolGeoAndSchedule | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const loadSeqRef = useRef<number>(0);
  const hasSyncedInitialTimezoneDatesRef = useRef<boolean>(false);

  const resolvedTeacherPhotoUrl = useMemo(() => {
    if (teacher?.photoUrl && teacher.photoUrl.trim().length > 0) {
      return teacher.photoUrl.trim();
    }
    if (
      !isSuperAdmin &&
      teacher &&
      teacher.userId &&
      teacher.userId === user?.id &&
      user?.avatarUrl &&
      user.avatarUrl.trim().length > 0
    ) {
      return user.avatarUrl.trim();
    }
    return null;
  }, [teacher, isSuperAdmin, user?.id, user?.avatarUrl]);

  const schoolTimezone = schoolGeo?.timezone || DEFAULT_SCHOOL_TIMEZONE;
  const todayStr = useMemo(
    () => getSchoolDateString(now, schoolTimezone),
    [now, schoolTimezone]
  );

  const formatShortTime = useCallback(
    (iso?: string | null) => {
      if (!iso) return '00:00';
      return new Date(iso).toLocaleTimeString(dateLocale, {
        timeZone: schoolTimezone,
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [dateLocale, schoolTimezone]
  );

  // Informasi Kalender Jawa & Pasaran untuk hari ini
  const todayJavaneseInfo = useMemo(
    () => getJavaneseDateInfo(todayStr, currentLang),
    [todayStr, currentLang]
  );

  // State Kata Hari Ini (Quotes)
  const [customQuotes, setCustomQuotes] = useState<DailyQuoteItem[] | null>(
    null
  );
  const activeQuotes = customQuotes ?? defaultDailyQuotes;
  const [quoteOffset, setQuoteOffset] = useState<number>(0);

  // State Kalender Laporan & Hari Libur
  const [calendarYear, setCalendarYear] = useState<number>(() =>
    new Date().getFullYear()
  );
  const [calendarMonth, setCalendarMonth] = useState<number>(() =>
    new Date().getMonth()
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() =>
    getSchoolDateString(new Date(), DEFAULT_SCHOOL_TIMEZONE)
  );
  const [dbHolidaysMap, setDbHolidaysMap] = useState<Record<string, string>>(
    {}
  );

  // State Kontrol Pembuka Kunci Kegiatan Khusus Guru (Admin / Super Admin)
  const [specialEventTitleInput, setSpecialEventTitleInput] =
    useState<string>('');
  const [isTogglingHolidayLock, setIsTogglingHolidayLock] =
    useState<boolean>(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState<boolean>(false);

  // State Formulir Izin / Dinas Luar / Sakit
  const [leaveCategory, setLeaveCategory] =
    useState<LeaveCategory>('DINAS_LUAR');
  const [leaveStartDate, setLeaveStartDate] = useState<string>(() =>
    getSchoolDateString(new Date(), DEFAULT_SCHOOL_TIMEZONE)
  );
  const [leaveEndDate, setLeaveEndDate] = useState<string>(() =>
    getSchoolDateString(new Date(), DEFAULT_SCHOOL_TIMEZONE)
  );
  const [leaveRefNumber, setLeaveRefNumber] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveFile, setLeaveFile] = useState<File | null>(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState<boolean>(false);

  // Selaraskan tanggal awal kalender & form izin sekali saat zona waktu sekolah terdeteksi
  useEffect(() => {
    if (!schoolGeo?.timezone || hasSyncedInitialTimezoneDatesRef.current) return;
    hasSyncedInitialTimezoneDatesRef.current = true;

    const zonedToday = getSchoolDateString(new Date(), schoolGeo.timezone);
    const [yStr, mStr] = zonedToday.split('-');
    const parsedYear = Number(yStr);
    const parsedMonth = Number(mStr) - 1;

    if (Number.isFinite(parsedYear) && Number.isFinite(parsedMonth)) {
      setCalendarYear(parsedYear);
      setCalendarMonth(parsedMonth);
    }
    setSelectedCalendarDate(zonedToday);
    setLeaveStartDate(zonedToday);
    setLeaveEndDate(zonedToday);
  }, [schoolGeo?.timezone]);

  // Filter Laporan
  const [reportScope, setReportScope] = useState<'monthly' | 'yearly'>(
    'monthly'
  );

  // Muat Hari Libur Nasional & Sekolah dari Supabase
  const loadDatabaseHolidays = useCallback(async () => {
    try {
      const currentSchoolYear = Number(todayStr.slice(0, 4)) || calendarYear;
      const minYear = Math.min(calendarYear, currentSchoolYear);
      const maxYear = Math.max(calendarYear, currentSchoolYear);

      let query = supabase
        .from('national_holidays')
        .select('date, name, schoolId')
        .gte('date', `${minYear}-01-01`)
        .lte('date', `${maxYear}-12-31`);

      if (activeSchoolId) {
        query = query.or(`schoolId.eq.${activeSchoolId},schoolId.is.null`);
      } else {
        query = query.is('schoolId', null);
      }

      const { data, error } = await query;
      if (!error && data) {
        const mapped: Record<string, string> = {};
        for (const row of data as Array<{
          date: string;
          name: string;
          schoolId: string | null;
        }>) {
          if (!mapped[row.date] || row.schoolId !== null) {
            mapped[row.date] = row.name;
          }
        }
        setDbHolidaysMap(mapped);
      }
    } catch {
      setDbHolidaysMap({});
    }
  }, [calendarYear, todayStr, activeSchoolId]);

  useEffect(() => {
    void loadDatabaseHolidays();
  }, [loadDatabaseHolidays]);

  // Muat Kata Hari Ini (Quotes)
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
        const typedQuotes = data as DailyQuoteDbRow[];
        setCustomQuotes(
          typedQuotes.map((d) => ({
            quote: d.quote,
            author: d.author ?? undefined,
          }))
        );
      } else {
        setCustomQuotes(null);
      }
    } catch {
      setCustomQuotes(null);
    }
  }, [activeSchoolId]);

  useEffect(() => {
    void loadActiveQuotes();
  }, [loadActiveQuotes]);

  // Mode Simulasi Super Admin: Muat Sekolah
  useEffect(() => {
    if (!isSuperAdmin) return;
    let isCancelled = false;

    const loadSimSchools = async () => {
      const { data } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');
      if (isCancelled) return;
      const list = (data ?? []) as Array<{ id: string; name: string }>;
      setSimSchools(list);
      if (school?.id) setSimSchoolId(school.id);
      else if (list.length > 0) setSimSchoolId(list[0].id);
    };

    void loadSimSchools();

    return () => {
      isCancelled = true;
    };
  }, [isSuperAdmin, school?.id]);

  // Mode Simulasi Super Admin: Muat Guru di Sekolah Terpilih
  useEffect(() => {
    if (!isSuperAdmin || !activeSchoolId) return;
    let isCancelled = false;

    const loadSimTeachers = async () => {
      setIsLoadingSimTeachers(true);
      setSimTeachers([]);
      setSimTeacherId('');

      try {
        const { data } = await supabase
          .from('teachers')
          .select('*')
          .eq('schoolId', activeSchoolId)
          .eq('isActive', true)
          .order('fullName');

        if (isCancelled) return;
        const rows = (data ?? []) as TeacherDbRow[];
        const list: TeacherProfile[] = rows.map(mapTeacherDbRowToProfile);
        setSimTeachers(list);
        setSimTeacherId(list.length > 0 ? list[0].id : '');
      } finally {
        if (!isCancelled) {
          setIsLoadingSimTeachers(false);
        }
      }
    };

    void loadSimTeachers();

    return () => {
      isCancelled = true;
    };
  }, [isSuperAdmin, activeSchoolId]);

  // Muat Data Sekolah, Profil Guru, & Riwayat Presensi
  const loadTeacherAndAttendance = useCallback(async () => {
    if (!activeSchoolId || !user?.id) return;
    if (isSuperAdmin && isLoadingSimTeachers) return;

    const currentSeq = ++loadSeqRef.current;
    setIsLoadingData(true);
    try {
      const { data: schRaw } = await supabase
        .from('schools')
        .select('*')
        .eq('id', activeSchoolId)
        .maybeSingle();

      if (currentSeq !== loadSeqRef.current) return;

      const schData = schRaw as SchoolDbRow | null;
      const resolvedTimezone =
        typeof schData?.settings?.timezone === 'string' &&
        schData.settings.timezone.trim()
          ? schData.settings.timezone.trim()
          : DEFAULT_SCHOOL_TIMEZONE;

      if (schData) {
        setSchoolGeo({
          id: schData.id,
          name: schData.name ?? t('teacherAttendance.defaultSchoolName'),
          latitude: Number(schData.latitude ?? schData.lat ?? -7.7956),
          longitude: Number(schData.longitude ?? schData.lng ?? 110.3695),
          radius: Number(
            schData.attendanceRadiusMeters ??
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
          requireSelfieCheckIn:
            typeof schData.requireSelfieCheckIn === 'boolean'
              ? schData.requireSelfieCheckIn
              : FALLBACK_REQUIRE_SELFIE_CHECKIN,
          requireSelfieCheckOut:
            typeof schData.requireSelfieCheckOut === 'boolean'
              ? schData.requireSelfieCheckOut
              : FALLBACK_REQUIRE_SELFIE_CHECKOUT,
          timezone: resolvedTimezone,
        });
      }

      let activeTeacher: TeacherProfile | null = null;
      if (isSuperAdmin) {
        activeTeacher = simTeacherId
          ? simTeachers.find((item) => item.id === simTeacherId) ?? null
          : null;
      } else {
        const cleanEmail = user.email?.trim() ?? '';
        let teacherQuery = supabase
          .from('teachers')
          .select('*')
          .eq('schoolId', activeSchoolId);

        if (cleanEmail) {
          const escapedEmail = cleanEmail.replace(/"/g, '\\"');
          teacherQuery = teacherQuery.or(
            `userId.eq.${user.id},email.eq."${escapedEmail}"`
          );
        } else {
          teacherQuery = teacherQuery.eq('userId', user.id);
        }

        const { data: tRows } = await teacherQuery.limit(5);

        if (currentSeq !== loadSeqRef.current) return;

        const candidates = (tRows ?? []) as Array<
          TeacherDbRow & { isActive?: boolean | null }
        >;

        if (candidates.length > 0) {
          const prioritized =
            candidates.find(
              (c) => c.userId === user.id && c.isActive !== false
            ) ??
            candidates.find((c) => c.userId === user.id) ??
            candidates.find((c) => c.isActive !== false) ??
            candidates[0];

          activeTeacher = mapTeacherDbRowToProfile(prioritized);
        }
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

      if (currentSeq !== loadSeqRef.current) return;

      const records = (attList ?? []) as AttendanceRecord[];
      setHistoryRecords(records);

      const currentSchoolDate = getSchoolDateString(
        new Date(),
        resolvedTimezone
      );
      const foundToday =
        records.find((r) => r.date === currentSchoolDate) ?? null;
      setTodayRecord(foundToday);
    } catch (err: unknown) {
      console.error(
        '[TeacherAttendance] Gagal memuat data:',
        extractErrorMessage(err, 'Unknown error')
      );
    } finally {
      if (currentSeq === loadSeqRef.current) {
        setIsLoadingData(false);
      }
    }
  }, [
    activeSchoolId,
    user?.id,
    user?.email,
    isSuperAdmin,
    isLoadingSimTeachers,
    simTeacherId,
    simTeachers,
    calendarYear,
    t,
  ]);

  useEffect(() => {
    void loadTeacherAndAttendance();
  }, [loadTeacherAndAttendance]);

  // Cek apakah akses presensi melalui komputer terkunci untuk guru ini
  const isDesktopBlockedForTeacher = useMemo(() => {
    if (isSuperAdmin) return false;
    if (!devicePlatform.isDesktop) return false;
    if (!teacher) return false;
    return !teacher.allowDesktopAttendance;
  }, [isSuperAdmin, devicePlatform.isDesktop, teacher]);

  const effectiveWorkStartTime =
    schoolGeo?.workStartTime || FALLBACK_WORK_START_TIME;
  const effectiveToleranceMinutes = schoolGeo?.lateToleranceMinutes ?? 0;
  const effectiveWorkEndTime =
    schoolGeo?.workEndTime || FALLBACK_WORK_END_TIME;
  const effectiveWorkDaysMode: WorkDaysMode =
    schoolGeo?.workDaysMode || 'SIX_DAYS';
  const effectiveSelfieCheckIn =
    schoolGeo?.requireSelfieCheckIn ?? FALLBACK_REQUIRE_SELFIE_CHECKIN;
  const effectiveSelfieCheckOut =
    schoolGeo?.requireSelfieCheckOut ?? FALLBACK_REQUIRE_SELFIE_CHECKOUT;

  // Penguncian Hari Libur & Kegiatan Khusus Guru
  const {
    loading: isHolidayLoading,
    isLocked: isHolidayLocked,
    isHoliday,
    reason: holidayReason,
    enableTeacherSpecialEvent,
    disableTeacherSpecialEvent,
  } = useTeacherHolidayLock({
    schoolId: activeSchoolId,
    targetDate: todayStr,
    dbHolidaysMap,
    workDaysMode: effectiveWorkDaysMode,
    lang: currentLang,
  });

  const isLeaveFormLocked = !ALLOW_LEAVE_ON_HOLIDAY && isHolidayLocked;

  const handleOpenHolidayModal = useCallback(() => {
    if (!specialEventTitleInput.trim()) {
      setSpecialEventTitleInput(t('teacherAttendance.defaultSpecialEventTitle'));
    }
    setIsHolidayModalOpen(true);
  }, [specialEventTitleInput, t]);

  const handleEnableSpecialEvent = useCallback(async () => {
    if (isTogglingHolidayLock) return;
    setIsTogglingHolidayLock(true);
    try {
      const eventTitle =
        specialEventTitleInput.trim() ||
        t('teacherAttendance.defaultSpecialEventTitle');
      await enableTeacherSpecialEvent(eventTitle, user?.id ?? null);
      setIsHolidayModalOpen(false);
      showToast(
        'success',
        t('teacherAttendance.toastSpecialEventOpened', { title: eventTitle })
      );
    } catch (err: unknown) {
      showToast(
        'error',
        extractErrorMessage(err, t('teacherAttendance.errOpenSpecialEvent'))
      );
    } finally {
      setIsTogglingHolidayLock(false);
    }
  }, [
    isTogglingHolidayLock,
    specialEventTitleInput,
    t,
    enableTeacherSpecialEvent,
    user?.id,
    showToast,
  ]);

  const handleDisableSpecialEvent = useCallback(async () => {
    if (isTogglingHolidayLock) return;
    setIsTogglingHolidayLock(true);
    try {
      await disableTeacherSpecialEvent();
      setIsHolidayModalOpen(false);
      showToast('success', t('teacherAttendance.toastSpecialEventClosed'));
    } catch (err: unknown) {
      showToast(
        'error',
        extractErrorMessage(err, t('teacherAttendance.errCloseSpecialEvent'))
      );
    } finally {
      setIsTogglingHolidayLock(false);
    }
  }, [isTogglingHolidayLock, disableTeacherSpecialEvent, showToast, t]);

  const effectiveDeadlineStr = useMemo(
    () =>
      formatDeadlineWithTolerance(
        effectiveWorkStartTime,
        effectiveToleranceMinutes
      ),
    [effectiveWorkStartTime, effectiveToleranceMinutes]
  );

  const currentLateMinutes = useMemo(() => {
    if (todayRecord?.checkInTime) {
      return calculateLateMinutes(
        new Date(todayRecord.checkInTime),
        effectiveWorkStartTime,
        effectiveToleranceMinutes,
        schoolTimezone
      );
    }
    return calculateLateMinutes(
      now,
      effectiveWorkStartTime,
      effectiveToleranceMinutes,
      schoolTimezone
    );
  }, [
    todayRecord?.checkInTime,
    now,
    effectiveWorkStartTime,
    effectiveToleranceMinutes,
    schoolTimezone,
  ]);

  // Status Kehadiran Hari Ini & Penguncian Tombol Datang / Pulang
  const hasCheckedIn = Boolean(todayRecord?.checkInTime);
  const hasCheckedOut = Boolean(todayRecord?.checkOutTime);
  const isOnLeaveToday = Boolean(
    todayRecord &&
      ['IZIN', 'SAKIT'].includes((todayRecord.status ?? '').toUpperCase())
  );

  const todayCheckOutTimingInfo = useMemo(() => {
    if (!todayRecord?.checkOutTime) {
      return {
        status: 'ON_TIME' as CheckOutTimingStatus,
        isEarly: false,
        isOvertime: false,
        diffMinutes: 0,
      };
    }
    return evaluateCheckOutTiming(
      new Date(todayRecord.checkOutTime),
      effectiveWorkEndTime,
      CHECKOUT_TOLERANCE_MINUTES,
      schoolTimezone
    );
  }, [todayRecord?.checkOutTime, effectiveWorkEndTime, schoolTimezone]);

  const isCheckInLocked =
    hasCheckedIn || isOnLeaveToday || isHolidayLoading || isHolidayLocked;
  const canCheckOut =
    hasCheckedIn &&
    !hasCheckedOut &&
    !isOnLeaveToday &&
    !isHolidayLoading &&
    !isHolidayLocked;

  const attendancePhase: 'CHECK_IN' | 'CHECK_OUT' | 'COMPLETED' | 'ON_LEAVE' =
    useMemo(() => {
      if (isOnLeaveToday) return 'ON_LEAVE';
      if (!hasCheckedIn) return 'CHECK_IN';
      if (!hasCheckedOut) return 'CHECK_OUT';
      return 'COMPLETED';
    }, [isOnLeaveToday, hasCheckedIn, hasCheckedOut]);

  // Simpan Pengajuan Ketat Izin / Dinas Luar / Sakit
  const handleSubmitStrictLeave = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!teacher || !activeSchoolId) return;

      if (isLeaveFormLocked) {
        showToast(
          'error',
          t('teacherAttendance.toastHolidayError', { reason: holidayReason })
        );
        return;
      }

      if (!leaveFile) {
        showToast('error', t('teacherAttendance.errLeaveFileRequired'));
        return;
      }

      if (leaveReason.trim().length < MIN_REASON_LENGTH) {
        showToast(
          'error',
          t('teacherAttendance.errLeaveReasonMin', { min: MIN_REASON_LENGTH })
        );
        return;
      }

      if (leaveEndDate < leaveStartDate) {
        showToast('error', t('teacherAttendance.errLeaveEndBeforeStart'));
        return;
      }

      setIsSubmittingLeave(true);
      let uploadedAttachmentPath: string | null = null;

      try {
        const nameParts = leaveFile.name.split('.');
        const rawExt = nameParts.length > 1 ? nameParts.pop() : undefined;
        const ext = rawExt ? sanitizeStorageSegment(rawExt) : 'pdf';

        const schoolFolder = schoolGeo?.name
          ? sanitizeStorageSegment(schoolGeo.name)
          : activeSchoolId;
        const teacherFolder = buildTeacherFolderName(teacher);
        const timeTag = getTimeStampTagInTimezone(new Date(), schoolTimezone);
        const storagePath = `${schoolFolder}/Surat_Izin_Dinas/${teacherFolder}_${leaveStartDate}_${timeTag}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('attendance-attachments')
          .upload(storagePath, leaveFile, { upsert: true });

        if (upErr) {
          throw new Error(
            t('teacherAttendance.errUploadAttachment', { msg: upErr.message })
          );
        }

        uploadedAttachmentPath = storagePath;

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

        const { data: existingRows } = await supabase
          .from('attendances')
          .select('id, date')
          .eq('schoolId', activeSchoolId)
          .eq('teacherId', teacher.id)
          .eq('type', 'GURU')
          .in('date', datesToInsert);

        const existingByDate = new Map<string, string>(
          ((existingRows ?? []) as Array<{ id: string; date: string }>).map(
            (row) => [row.date, row.id]
          )
        );

        const dbStatus = leaveCategory === 'SAKIT' ? 'SAKIT' : 'IZIN';
        const categoryLabel =
          leaveCategory === 'DINAS_LUAR'
            ? t('teacherAttendance.leaveCatDinasLuar')
            : leaveCategory === 'SAKIT'
              ? t('teacherAttendance.leaveCatSakit')
              : t('teacherAttendance.leaveCatIzin');

        const refSegment = leaveRefNumber.trim()
          ? t('teacherAttendance.leaveRefPrefix', {
              ref: leaveRefNumber.trim(),
            })
          : '';
        const formattedNote = `[${categoryLabel}]${refSegment} ${leaveReason.trim()}`;

        for (const dt of datesToInsert) {
          const existingId = existingByDate.get(dt);
          if (existingId) {
            const { error: updateErr } = await supabase
              .from('attendances')
              .update({
                status: dbStatus,
                notes: formattedNote,
                leaveType: leaveCategory,
                attachmentUrl: storagePath,
              })
              .eq('id', existingId)
              .eq('schoolId', activeSchoolId);

            if (updateErr) {
              throw new Error(updateErr.message);
            }
          } else {
            const { error: insertErr } = await supabase
              .from('attendances')
              .insert({
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

            if (insertErr) {
              throw new Error(insertErr.message);
            }
          }
        }

        setLeaveRefNumber('');
        setLeaveReason('');
        setLeaveFile(null);
        await loadTeacherAndAttendance();
        showToast(
          'success',
          t('teacherAttendance.toastLeaveSubmitted', {
            category: categoryLabel,
            days: datesToInsert.length,
          })
        );
        setActiveView('beranda');
      } catch (err: unknown) {
        if (uploadedAttachmentPath) {
          await supabase.storage
            .from('attendance-attachments')
            .remove([uploadedAttachmentPath])
            .catch(() => null);
        }
        showToast(
          'error',
          extractErrorMessage(err, t('teacherAttendance.errSubmitLeave'))
        );
      } finally {
        setIsSubmittingLeave(false);
      }
    },
    [
      teacher,
      activeSchoolId,
      isLeaveFormLocked,
      showToast,
      t,
      holidayReason,
      leaveFile,
      leaveReason,
      leaveEndDate,
      leaveStartDate,
      schoolGeo?.name,
      schoolTimezone,
      leaveCategory,
      leaveRefNumber,
      loadTeacherAndAttendance,
      setActiveView,
    ]
  );

  // Perhitungan Statistik Laporan
  const selectedMonthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
  const selectedMonthLabel = `${monthNames[calendarMonth]} ${calendarYear}`;
  const selectedJavaneseMonthRange = useMemo(
    () => getJavaneseMonthRangeLabel(calendarYear, calendarMonth, currentLang),
    [calendarYear, calendarMonth, currentLang]
  );

  const reportStats = useMemo(() => {
    const filtered =
      reportScope === 'monthly'
        ? historyRecords.filter((r) => r.date.startsWith(selectedMonthPrefix))
        : historyRecords.filter((r) => r.date.startsWith(String(calendarYear)));

    let hadir = 0;
    let terlambat = 0;
    let izinSakit = 0;
    let alpa = 0;

    for (const r of filtered) {
      const normalizedStatus = (r.status ?? '').toUpperCase();
      if (normalizedStatus === 'HADIR') {
        hadir += 1;
      } else if (normalizedStatus === 'TERLAMBAT') {
        terlambat += 1;
      } else if (normalizedStatus === 'IZIN' || normalizedStatus === 'SAKIT') {
        izinSakit += 1;
      } else if (normalizedStatus === 'ALPA' || normalizedStatus === 'ALPHA') {
        alpa += 1;
      }
    }

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
      pasaranShort: string;
      isRedDate: boolean;
      holidayName: string | null;
      record?: AttendanceRecord;
    }> = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push({
        dateStr: null,
        dayNum: null,
        pasaranShort: '',
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
      const jvInfo = getJavaneseDateInfo(dateStr, currentLang);
      cells.push({
        dateStr,
        dayNum: d,
        pasaranShort: jvInfo.pasaran,
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
    currentLang,
  ]);

  const handlePrevMonth = useCallback(() => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }, [calendarMonth]);

  const handleNextMonth = useCallback(() => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }, [calendarMonth]);

  const selectedDateInfo = useMemo(() => {
    if (!selectedCalendarDate) return null;
    const redStatus = checkRedDateStatus(
      selectedCalendarDate,
      dbHolidaysMap,
      effectiveWorkDaysMode
    );
    const record = recordsByDate.get(selectedCalendarDate);
    const jvInfo = getJavaneseDateInfo(selectedCalendarDate, currentLang);
    const [y, m, d] = selectedCalendarDate.split('-').map(Number);
    const masehiPart = `${d || 1} ${monthNames[(m || 1) - 1] ?? ''} ${y || ''}`;
    return {
      dateStr: selectedCalendarDate,
      label: `${jvInfo.hariPasaran}, ${masehiPart}`,
      javaneseSubtitle: `${jvInfo.javaneseDay} ${jvInfo.javaneseMonth} ${jvInfo.javaneseYear} Ja (${jvInfo.winduYearName})`,
      ...redStatus,
      record,
    };
  }, [
    selectedCalendarDate,
    dbHolidaysMap,
    effectiveWorkDaysMode,
    recordsByDate,
    currentLang,
    monthNames,
  ]);

  const masehiDateOnly = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const monthName = monthNames[(m || 1) - 1] ?? '';
    return `${d} ${monthName} ${y}`;
  }, [todayStr, monthNames]);

  const formattedDateWithPasaran = `${todayJavaneseInfo.hariPasaran}, ${masehiDateOnly}`;
  const javaneseDateBadge = `${todayJavaneseInfo.javaneseDay} ${todayJavaneseInfo.javaneseMonth} ${todayJavaneseInfo.javaneseYear} Ja`;

  const monthYearLabel = useMemo(() => {
    const [y, m] = todayStr.split('-').map(Number);
    return `${monthNames[(m || 1) - 1] ?? ''} ${y}`;
  }, [todayStr, monthNames]);

  const clockParts = getClockPartsInTimezone(now, schoolTimezone);
  const hoursStr = clockParts.hours;
  const minutesStr = clockParts.minutes;
  const secondsStr = clockParts.seconds;

  const activeQuoteItem =
    activeQuotes[(now.getDate() + quoteOffset) % activeQuotes.length] ??
    defaultDailyQuotes[0];

  const isLeaveFormReady =
    Boolean(teacher) &&
    Boolean(leaveFile) &&
    leaveReason.trim().length >= MIN_REASON_LENGTH &&
    (leaveCategory !== 'DINAS_LUAR' || leaveRefNumber.trim().length > 0);

  const isTeacherAccountLinked = Boolean(teacher?.userId);
  const accountStatusHint = useMemo(() => {
    if (!teacher) {
      return {
        title:
          currentLang === 'en'
            ? 'Teacher Profile Unlinked'
            : 'Profil PTK Belum Tertaut',
        description:
          currentLang === 'en'
            ? 'Your login account is not yet connected to a Dapodik teacher record.'
            : 'Akun login Anda belum terhubung dengan data PTK Dapodik sekolah ini.',
      };
    }

    if (isTeacherAccountLinked) {
      return {
        title:
          currentLang === 'en'
            ? 'Login Account Linked'
            : 'Akun Login Tertaut',
        description:
          currentLang === 'en'
            ? 'This PTK profile is verified and linked to an active login account.'
            : 'Data PTK ini sudah terhubung dengan akun pengguna aktif.',
      };
    }

    return {
      title:
        currentLang === 'en'
          ? 'Account Not Yet Linked'
          : 'Akun Belum Tertaut',
      description:
        currentLang === 'en'
          ? 'Dapodik PTK data is registered, but not yet linked to a teacher login account.'
          : 'Data PTK Dapodik sudah terdaftar, namun belum ditautkan ke akun login guru.',
    };
  }, [teacher, isTeacherAccountLinked, currentLang]);

  const teacherIdentityLabel = useMemo(
    () =>
      formatTeacherIdentityLabel(
        teacher,
        t('teacherAttendance.registeredStaffFallback')
      ),
    [teacher, t]
  );

  return {
    // Locale & formatting
    currentLang,
    dateLocale,
    monthNames,
    shortDayNames,
    formatDurationMinutes,
    formatStatusLabel,
    formatShortTime,
    formatDistanceLabel,

    // Roles & device
    isSuperAdmin,
    isAdminOrSuperAdmin,
    devicePlatform,
    isDesktopBlockedForTeacher,

    // Simulation
    simSchools,
    simSchoolId,
    setSimSchoolId,
    simTeachers,
    simTeacherId,
    setSimTeacherId,
    isLoadingSimTeachers,
    activeSchoolId,

    // Clock & dates
    now,
    schoolTimezone,
    todayStr,
    todayJavaneseInfo,
    masehiDateOnly,
    formattedDateWithPasaran,
    javaneseDateBadge,
    monthYearLabel,
    hoursStr,
    minutesStr,
    secondsStr,

    // Teacher, school & attendance records
    teacher,
    resolvedTeacherPhotoUrl,
    schoolGeo,
    todayRecord,
    historyRecords,
    isLoadingData,
    loadTeacherAndAttendance,

    // Quotes
    activeQuotes,
    activeQuoteItem,
    setQuoteOffset,

    // Schedule & status
    effectiveWorkStartTime,
    effectiveToleranceMinutes,
    effectiveWorkEndTime,
    effectiveWorkDaysMode,
    effectiveSelfieCheckIn,
    effectiveSelfieCheckOut,
    effectiveDeadlineStr,
    currentLateMinutes,
    hasCheckedIn,
    hasCheckedOut,
    isOnLeaveToday,
    todayCheckOutTimingInfo,
    isCheckInLocked,
    canCheckOut,
    attendancePhase,

    // Account status & identity
    isTeacherAccountLinked,
    accountStatusHint,
    teacherIdentityLabel,

    // Holiday & special event lock
    isHolidayLoading,
    isHolidayLocked,
    isHoliday,
    holidayReason,
    isLeaveFormLocked,
    specialEventTitleInput,
    setSpecialEventTitleInput,
    isTogglingHolidayLock,
    isHolidayModalOpen,
    setIsHolidayModalOpen,
    handleOpenHolidayModal,
    handleEnableSpecialEvent,
    handleDisableSpecialEvent,

    // Leave form
    leaveCategory,
    setLeaveCategory,
    leaveStartDate,
    setLeaveStartDate,
    leaveEndDate,
    setLeaveEndDate,
    leaveRefNumber,
    setLeaveRefNumber,
    leaveReason,
    setLeaveReason,
    leaveFile,
    setLeaveFile,
    isSubmittingLeave,
    isLeaveFormReady,
    handleSubmitStrictLeave,

    // Report & calendar
    reportScope,
    setReportScope,
    calendarYear,
    setCalendarYear,
    calendarMonth,
    setCalendarMonth,
    selectedCalendarDate,
    setSelectedCalendarDate,
    selectedMonthLabel,
    selectedJavaneseMonthRange,
    reportStats,
    calendarDaysGrid,
    handlePrevMonth,
    handleNextMonth,
    selectedDateInfo,
  };
}