// ============================================================================
// FILE: src/modules/attendance/hooks/useHolidayLock.ts
// FUNGSI: Hook generik pengunci presensi hari libur & override kegiatan khusus
//        untuk target SISWA maupun GURU (Multi-Tenant + Offline Fallback)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
  SpecialEventTargetType,
  SupportedAttendanceLocale,
  WorkDaysMode,
} from '../types/attendance.types';
import { getSchoolDateString } from '../services/gps.utils';
import { checkRedDateStatus } from '../utils/indonesianHolidays';

export type HolidayLockTarget = 'SISWA' | 'GURU';

const ALLOWED_OVERRIDE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

const OVERRIDE_LOCAL_STORAGE_PREFIX = 'sekolah_erp_special_event';

interface SchoolSpecialEventRow {
  id: string;
  eventDate: string;
  reason: string | null;
  targetType: string | null;
  isActive: boolean;
}

interface CachedSpecialEventPayload {
  active: boolean;
  reason: string;
  id?: string | null;
  targetType?: SpecialEventTargetType | null;
}

export interface UseHolidayLockParams {
  target: HolidayLockTarget;
  schoolId?: string;
  targetDate?: string;
  lang?: SupportedAttendanceLocale;
  /** Opsional: jika sudah dimuat oleh induk (mis. kalender), hindari query ulang */
  dbHolidaysMap?: Record<string, string>;
  /** Opsional: jika sudah dimuat oleh induk, hindari query ulang ke tabel schools */
  workDaysMode?: WorkDaysMode;
}

export interface HolidayLockState {
  isLocked: boolean;
  isHoliday: boolean;
  holidayName: string;
  isSpecialEventActive: boolean;
  specialEventReason: string;
  specialEventId: string | null;
  specialEventTargetType: SpecialEventTargetType | null;
  canManageOverride: boolean;
  isLoading: boolean;
  isToggling: boolean;
  activateSpecialEvent: (
    reason?: string,
    userIdOverride?: string | null
  ) => Promise<void>;
  deactivateSpecialEvent: () => Promise<void>;
  refreshLockState: () => Promise<void>;
}

function normalizeTargetType(
  raw: string | null | undefined
): SpecialEventTargetType {
  const upper = String(raw ?? 'ALL')
    .trim()
    .toUpperCase();
  if (upper === 'GURU' || upper === 'SISWA' || upper === 'ALL') {
    return upper;
  }
  return 'ALL';
}

export function getTodayLocalISO(timeZone: string = 'Asia/Jakarta'): string {
  return getSchoolDateString(new Date(), timeZone);
}

function getLocalOverrideKey(
  target: HolidayLockTarget,
  schoolId: string,
  dateISO: string
): string {
  return `${OVERRIDE_LOCAL_STORAGE_PREFIX}_${target.toLowerCase()}_${schoolId}_${dateISO}`;
}

function getDefaultEventReason(
  target: HolidayLockTarget,
  lang: SupportedAttendanceLocale
): string {
  if (target === 'GURU') {
    return lang === 'en' ? 'Special Teacher Event' : 'Kegiatan Khusus Guru';
  }
  return lang === 'en' ? 'Special School Event' : 'Kegiatan Khusus Sekolah';
}

export function useHolidayLock({
  target,
  schoolId,
  targetDate,
  lang = 'id',
  dbHolidaysMap,
  workDaysMode: providedWorkDaysMode,
}: UseHolidayLockParams): HolidayLockState {
  const { user, school } = useAuthStore();
  const defaultEventReason = getDefaultEventReason(target, lang);

  const schoolWithSettings = school as
    | (typeof school & { settings?: { timezone?: unknown } })
    | null;

  const schoolTimeZone =
    typeof schoolWithSettings?.settings?.timezone === 'string' &&
    schoolWithSettings.settings.timezone.trim()
      ? schoolWithSettings.settings.timezone.trim()
      : 'Asia/Jakarta';

  const activeSchoolId = schoolId || school?.id || user?.schoolId || '';
  const activeDate = targetDate || getTodayLocalISO(schoolTimeZone);

  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayName, setHolidayName] = useState<string>('');
  const [isSpecialEventActive, setIsSpecialEventActive] =
    useState<boolean>(false);
  const [specialEventReason, setSpecialEventReason] = useState<string>('');
  const [specialEventId, setSpecialEventId] = useState<string | null>(null);
  const [specialEventTargetType, setSpecialEventTargetType] =
    useState<SpecialEventTargetType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  const requestSeqRef = useRef<number>(0);

  const userWithAdditionalRoles = user as
    | (typeof user & { additionalRoles?: string[] })
    | null;

  const allUserRoles: string[] = [
    ...(userWithAdditionalRoles?.role ? [userWithAdditionalRoles.role] : []),
    ...(Array.isArray(userWithAdditionalRoles?.additionalRoles)
      ? userWithAdditionalRoles.additionalRoles
      : []),
  ];

  const canManageOverride = allUserRoles.some((role) =>
    (ALLOWED_OVERRIDE_ROLES as readonly string[]).includes(role)
  );

  const refreshLockState = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    if (!activeSchoolId || activeDate.length !== 10) {
      const fallbackStatus =
        activeDate.length === 10 && dbHolidaysMap && providedWorkDaysMode
          ? checkRedDateStatus(
              activeDate,
              dbHolidaysMap,
              providedWorkDaysMode,
              lang
            )
          : { isRedDate: false, holidayName: '' };

      setIsHoliday(fallbackStatus.isRedDate);
      setHolidayName(fallbackStatus.holidayName ?? '');
      setIsSpecialEventActive(false);
      setSpecialEventReason('');
      setSpecialEventId(null);
      setSpecialEventTargetType(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [schoolRes, holidayRes, specialEventRes] = await Promise.all([
        providedWorkDaysMode
          ? Promise.resolve({
              data: { workDaysMode: providedWorkDaysMode },
              error: null,
            })
          : supabase
              .from('schools')
              .select('workDaysMode')
              .eq('id', activeSchoolId)
              .maybeSingle(),
        dbHolidaysMap
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from('national_holidays')
              .select('id, schoolId, date, name')
              .eq('date', activeDate)
              .or(`schoolId.eq.${activeSchoolId},schoolId.is.null`),
        supabase
          .from('school_special_events')
          .select('id, eventDate, reason, targetType, isActive')
          .eq('schoolId', activeSchoolId)
          .eq('eventDate', activeDate),
      ]);

      if (seq !== requestSeqRef.current) return;
      if (schoolRes.error) throw schoolRes.error;

      const resolvedWorkDaysMode: WorkDaysMode =
        schoolRes.data?.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS';

      const resolvedHolidaysMap: Record<string, string> = dbHolidaysMap
        ? { ...dbHolidaysMap }
        : {};

      if (!dbHolidaysMap && !holidayRes.error && Array.isArray(holidayRes.data)) {
        const rows = holidayRes.data as Array<{
          schoolId: string | null;
          name: string;
        }>;
        const schoolSpecific = rows.find((r) => r.schoolId === activeSchoolId);
        const globalHoliday = rows.find((r) => r.schoolId === null);
        const matched = schoolSpecific ?? globalHoliday;
        if (matched) {
          resolvedHolidaysMap[activeDate] = matched.name;
        }
      }

      const redStatus = checkRedDateStatus(
        activeDate,
        resolvedHolidaysMap,
        resolvedWorkDaysMode,
        lang
      );

      setIsHoliday(redStatus.isRedDate);
      setHolidayName(redStatus.holidayName ?? '');

      let overrideActive = false;
      let overrideText = '';
      let overrideId: string | null = null;
      let overrideTarget: SpecialEventTargetType | null = null;
      const cacheKey = getLocalOverrideKey(target, activeSchoolId, activeDate);

      if (!specialEventRes.error && Array.isArray(specialEventRes.data)) {
        const eventRows = specialEventRes.data as SchoolSpecialEventRow[];
        const matchedEvent =
          eventRows.find(
            (row) =>
              row.isActive && normalizeTargetType(row.targetType) === target
          ) ??
          eventRows.find(
            (row) =>
              row.isActive && normalizeTargetType(row.targetType) === 'ALL'
          );

        if (matchedEvent) {
          overrideActive = true;
          overrideText =
            String(matchedEvent.reason || '').trim() || defaultEventReason;
          overrideId = String(matchedEvent.id);
          overrideTarget = normalizeTargetType(matchedEvent.targetType);

          try {
            const payload: CachedSpecialEventPayload = {
              active: true,
              reason: overrideText,
              id: overrideId,
              targetType: overrideTarget,
            };
            localStorage.setItem(cacheKey, JSON.stringify(payload));
          } catch {
            // Abaikan error kapasitas localStorage
          }
        } else {
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            // Abaikan error localStorage
          }
        }
      } else if (specialEventRes.error) {
        try {
          const savedLocal = localStorage.getItem(cacheKey);
          if (savedLocal) {
            const parsed = JSON.parse(savedLocal) as CachedSpecialEventPayload;
            if (parsed.active) {
              overrideActive = true;
              overrideText = parsed.reason || defaultEventReason;
              overrideId = parsed.id ?? null;
              overrideTarget = parsed.targetType ?? target;
            }
          }
        } catch {
          // Abaikan error parsing localStorage
        }
      }

      if (seq === requestSeqRef.current) {
        setIsSpecialEventActive(overrideActive);
        setSpecialEventReason(overrideText);
        setSpecialEventId(overrideId);
        setSpecialEventTargetType(overrideTarget);
      }
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      console.error(
        `[useHolidayLock:${target}] Gagal memeriksa status hari libur:`,
        err
      );
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    target,
    activeSchoolId,
    activeDate,
    dbHolidaysMap,
    providedWorkDaysMode,
    lang,
    defaultEventReason,
  ]);

  useEffect(() => {
    void refreshLockState();
  }, [refreshLockState]);

  const activateSpecialEvent = async (
    reason?: string,
    userIdOverride?: string | null
  ) => {
    if (!activeSchoolId) {
      throw new Error(
        lang === 'en'
          ? 'Active school is not selected.'
          : 'Sekolah aktif belum terpilih.'
      );
    }
    if (!canManageOverride) {
      throw new Error(
        lang === 'en'
          ? 'You do not have permission to unlock holiday attendance.'
          : 'Akun Anda tidak memiliki izin membuka kunci hari libur.'
      );
    }
    if (activeDate.length !== 10) {
      throw new Error(
        lang === 'en'
          ? 'Invalid attendance date format.'
          : 'Format tanggal presensi tidak valid.'
      );
    }

    const cleanReason = (reason ?? '').trim() || defaultEventReason;
    const actorId =
      userIdOverride !== undefined ? userIdOverride : user?.id ?? null;
    setIsToggling(true);

    try {
      const { data: existingRows, error: checkErr } = await supabase
        .from('school_special_events')
        .select('id, targetType, isActive')
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate);

      if (checkErr) throw checkErr;

      const rows = (existingRows ?? []) as Array<{
        id: string;
        targetType: string | null;
        isActive: boolean;
      }>;

      const existingSpecific = rows.find(
        (r) => normalizeTargetType(r.targetType) === target
      );
      const existingAll = rows.find(
        (r) => normalizeTargetType(r.targetType) === 'ALL'
      );

      let resolvedId: string | null = null;
      let resolvedTarget: SpecialEventTargetType = target;

      if (existingSpecific) {
        const { error: updateErr } = await supabase
          .from('school_special_events')
          .update({
            reason: cleanReason,
            isActive: true,
            createdBy: actorId,
          })
          .eq('id', existingSpecific.id);
        if (updateErr) throw updateErr;
        resolvedId = String(existingSpecific.id);
      } else if (existingAll) {
        const { error: updateErr } = await supabase
          .from('school_special_events')
          .update({
            reason: cleanReason,
            isActive: true,
            createdBy: actorId,
          })
          .eq('id', existingAll.id);
        if (updateErr) throw updateErr;
        resolvedId = String(existingAll.id);
        resolvedTarget = 'ALL';
      } else {
        const { data: upsertedRow, error: upsertErr } = await supabase
          .from('school_special_events')
          .upsert(
            {
              schoolId: activeSchoolId,
              eventDate: activeDate,
              reason: cleanReason,
              targetType: target,
              isActive: true,
              createdBy: actorId,
            },
            { onConflict: 'schoolId,eventDate,targetType' }
          )
          .select('id')
          .maybeSingle();
        if (upsertErr) throw upsertErr;
        resolvedId = upsertedRow?.id ? String(upsertedRow.id) : null;
      }

      try {
        const payload: CachedSpecialEventPayload = {
          active: true,
          reason: cleanReason,
          id: resolvedId,
          targetType: resolvedTarget,
        };
        localStorage.setItem(
          getLocalOverrideKey(target, activeSchoolId, activeDate),
          JSON.stringify(payload)
        );
      } catch {
        // Abaikan jika localStorage penuh
      }

      setIsSpecialEventActive(true);
      setSpecialEventReason(cleanReason);
      setSpecialEventId(resolvedId);
      setSpecialEventTargetType(resolvedTarget);
    } finally {
      setIsToggling(false);
    }
  };

  const deactivateSpecialEvent = async () => {
    if (!activeSchoolId) {
      throw new Error(
        lang === 'en'
          ? 'Active school is not selected.'
          : 'Sekolah aktif belum terpilih.'
      );
    }
    if (!canManageOverride) {
      throw new Error(
        lang === 'en'
          ? 'You do not have permission to lock holiday attendance.'
          : 'Akun Anda tidak memiliki izin mengunci kembali hari libur.'
      );
    }

    const siblingTarget: HolidayLockTarget =
      target === 'SISWA' ? 'GURU' : 'SISWA';
    setIsToggling(true);

    try {
      const { data: existingRows, error: fetchErr } = await supabase
        .from('school_special_events')
        .select('id, reason, targetType, isActive')
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate);

      if (fetchErr) throw fetchErr;

      const rows = (existingRows ?? []) as Array<{
        id: string;
        reason: string | null;
        targetType: string | null;
        isActive: boolean;
      }>;

      const existingSiblingRow = rows.find(
        (r) => normalizeTargetType(r.targetType) === siblingTarget
      );

      for (const row of rows) {
        const rowTarget = normalizeTargetType(row.targetType);
        if (rowTarget === target && row.isActive) {
          const { error } = await supabase
            .from('school_special_events')
            .update({ isActive: false })
            .eq('id', row.id);
          if (error) throw error;
        } else if (rowTarget === 'ALL' && row.isActive) {
          if (!existingSiblingRow) {
            // Alihkan ALL ke target pasangan agar presensi pihak lain tidak ikut terkunci
            const { error } = await supabase
              .from('school_special_events')
              .update({ targetType: siblingTarget })
              .eq('id', row.id);
            if (error) throw error;
          } else {
            const { error: siblingActErr } = await supabase
              .from('school_special_events')
              .update({
                isActive: true,
                reason: existingSiblingRow.reason || row.reason,
              })
              .eq('id', existingSiblingRow.id);
            if (siblingActErr) throw siblingActErr;

            const { error: allDeactErr } = await supabase
              .from('school_special_events')
              .update({ isActive: false })
              .eq('id', row.id);
            if (allDeactErr) throw allDeactErr;
          }
        }
      }

      try {
        localStorage.removeItem(
          getLocalOverrideKey(target, activeSchoolId, activeDate)
        );
      } catch {
        // Abaikan error localStorage
      }

      setIsSpecialEventActive(false);
      setSpecialEventReason('');
      setSpecialEventId(null);
      setSpecialEventTargetType(null);
    } finally {
      setIsToggling(false);
    }
  };

  const isLocked = isHoliday && !isSpecialEventActive;

  return {
    isLocked,
    isHoliday,
    holidayName,
    isSpecialEventActive,
    specialEventReason,
    specialEventId,
    specialEventTargetType,
    canManageOverride,
    isLoading,
    isToggling,
    activateSpecialEvent,
    deactivateSpecialEvent,
    refreshLockState,
  };
}