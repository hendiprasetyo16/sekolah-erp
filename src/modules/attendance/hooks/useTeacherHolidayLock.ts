// ============================================================================
// FILE: src/modules/attendance/hooks/useTeacherHolidayLock.ts
// FUNGSI: Pengaturan Lock Hari Libur & Kegiatan Khusus Presensi Guru (SQL v22.2)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/services/supabase.client';
import type {
  SpecialEventTargetType,
  SupportedAttendanceLocale,
  WorkDaysMode,
} from '../types/attendance.types';
import { checkRedDateStatus } from '../utils/indonesianHolidays';

export type { SpecialEventTargetType };

interface SchoolSpecialEventDbRow {
  id: string;
  schoolId: string;
  eventDate: string;
  reason: string | null;
  targetType: string | null;
  isActive: boolean;
}

interface UseTeacherHolidayLockParams {
  schoolId: string;
  targetDate: string; // Format YYYY-MM-DD
  dbHolidaysMap: Record<string, string>;
  workDaysMode: WorkDaysMode;
  lang?: SupportedAttendanceLocale;
}

export interface TeacherHolidayLockState {
  loading: boolean;
  isLocked: boolean;
  isHoliday: boolean;
  isSpecialEvent: boolean;
  reason: string;
  specialEventId: string | null;
  specialEventTargetType: SpecialEventTargetType | null;
}

function normalizeTargetType(
  rawTarget: string | null | undefined
): SpecialEventTargetType {
  const upper = String(rawTarget ?? 'ALL')
    .trim()
    .toUpperCase();
  if (upper === 'GURU' || upper === 'SISWA' || upper === 'ALL') {
    return upper;
  }
  return 'ALL';
}

export function useTeacherHolidayLock({
  schoolId,
  targetDate,
  dbHolidaysMap,
  workDaysMode,
  lang = 'id',
}: UseTeacherHolidayLockParams) {
  const [state, setState] = useState<TeacherHolidayLockState>({
    loading: true,
    isLocked: false,
    isHoliday: false,
    isSpecialEvent: false,
    reason: '',
    specialEventId: null,
    specialEventTargetType: null,
  });

  const requestSeqRef = useRef<number>(0);

  const checkLockStatus = useCallback(async () => {
    const seq = ++requestSeqRef.current;

    const redStatus = checkRedDateStatus(
      targetDate,
      dbHolidaysMap,
      workDaysMode,
      lang
    );

    const defaultHolidayLabel =
      redStatus.holidayName ||
      (lang === 'en'
        ? 'School / Weekend Holiday'
        : 'Hari Libur Sekolah / Akhir Pekan');

    if (!schoolId || targetDate.length !== 10) {
      setState({
        loading: false,
        isLocked: redStatus.isRedDate,
        isHoliday: redStatus.isRedDate,
        isSpecialEvent: false,
        reason: defaultHolidayLabel,
        specialEventId: null,
        specialEventTargetType: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const { data, error } = await supabase
        .from('school_special_events')
        .select('id, schoolId, eventDate, reason, targetType, isActive')
        .eq('schoolId', schoolId)
        .eq('eventDate', targetDate)
        .eq('isActive', true);

      if (seq !== requestSeqRef.current) return;
      if (error) throw error;

      const rows = (data ?? []) as SchoolSpecialEventDbRow[];

      // Prioritaskan agenda spesifik GURU, lalu ALL
      const matchedGuru = rows.find(
        (row) => normalizeTargetType(row.targetType) === 'GURU'
      );
      const matchedAll = rows.find(
        (row) => normalizeTargetType(row.targetType) === 'ALL'
      );
      const matchedEvent = matchedGuru ?? matchedAll;

      if (matchedEvent) {
        const eventTitle =
          String(matchedEvent.reason ?? '').trim() ||
          (lang === 'en' ? 'Special Teacher Event' : 'Kegiatan Khusus Guru');

        setState({
          loading: false,
          isLocked: false,
          isHoliday: redStatus.isRedDate,
          isSpecialEvent: true,
          reason: eventTitle,
          specialEventId: String(matchedEvent.id),
          specialEventTargetType: normalizeTargetType(matchedEvent.targetType),
        });
        return;
      }

      if (redStatus.isRedDate) {
        setState({
          loading: false,
          isLocked: true,
          isHoliday: true,
          isSpecialEvent: false,
          reason: defaultHolidayLabel,
          specialEventId: null,
          specialEventTargetType: null,
        });
      } else {
        setState({
          loading: false,
          isLocked: false,
          isHoliday: false,
          isSpecialEvent: false,
          reason: lang === 'en' ? 'Regular Workday' : 'Hari Kerja Normal',
          specialEventId: null,
          specialEventTargetType: null,
        });
      }
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      console.error('[useTeacherHolidayLock] Gagal memeriksa status libur:', err);
      setState({
        loading: false,
        isLocked: redStatus.isRedDate,
        isHoliday: redStatus.isRedDate,
        isSpecialEvent: false,
        reason: defaultHolidayLabel,
        specialEventId: null,
        specialEventTargetType: null,
      });
    }
  }, [schoolId, targetDate, dbHolidaysMap, workDaysMode, lang]);

  useEffect(() => {
    void checkLockStatus();
  }, [checkLockStatus]);

  /**
   * Membuka kunci presensi khusus guru pada hari libur selaras unique index
   * ("schoolId", "eventDate", "targetType") pada SQL v22.2
   */
  const enableTeacherSpecialEvent = async (
    title: string,
    userId?: string | null
  ): Promise<void> => {
    if (!schoolId) {
      throw new Error(
        lang === 'en'
          ? 'School identity is unavailable.'
          : 'Identitas sekolah belum tersedia.'
      );
    }
    if (targetDate.length !== 10) {
      throw new Error(
        lang === 'en'
          ? 'Invalid attendance date format.'
          : 'Format tanggal presensi tidak valid.'
      );
    }

    const cleanTitle =
      title.trim() ||
      (lang === 'en' ? 'Special Teacher Event' : 'Kegiatan Khusus Guru');

    const { data: existingRows, error: checkErr } = await supabase
      .from('school_special_events')
      .select('id, targetType, isActive')
      .eq('schoolId', schoolId)
      .eq('eventDate', targetDate);

    if (checkErr) {
      throw new Error(checkErr.message);
    }

    const rows = (existingRows ?? []) as Array<
      Pick<SchoolSpecialEventDbRow, 'id' | 'targetType' | 'isActive'>
    >;

    const existingGuru = rows.find(
      (r) => normalizeTargetType(r.targetType) === 'GURU'
    );
    const existingAll = rows.find(
      (r) => normalizeTargetType(r.targetType) === 'ALL'
    );

    if (existingGuru) {
      const { error: updateErr } = await supabase
        .from('school_special_events')
        .update({
          reason: cleanTitle,
          isActive: true,
          createdBy: userId ?? null,
        })
        .eq('id', existingGuru.id);

      if (updateErr) throw new Error(updateErr.message);
    } else if (existingAll) {
      const { error: updateErr } = await supabase
        .from('school_special_events')
        .update({
          reason: cleanTitle,
          isActive: true,
          createdBy: userId ?? null,
        })
        .eq('id', existingAll.id);

      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { error: upsertErr } = await supabase
        .from('school_special_events')
        .upsert(
          {
            schoolId,
            eventDate: targetDate,
            reason: cleanTitle,
            targetType: 'GURU',
            isActive: true,
            createdBy: userId ?? null,
          },
          {
            onConflict: 'schoolId,eventDate,targetType',
          }
        );

      if (upsertErr) throw new Error(upsertErr.message);
    }

    await checkLockStatus();
  };

  /**
   * Mengunci kembali presensi guru pada hari libur tanpa menutup presensi siswa
   */
  const disableTeacherSpecialEvent = async (): Promise<void> => {
    if (!schoolId) {
      throw new Error(
        lang === 'en'
          ? 'School identity is unavailable.'
          : 'Identitas sekolah belum tersedia.'
      );
    }

    const { data: existingRows, error: fetchErr } = await supabase
      .from('school_special_events')
      .select('id, reason, targetType, isActive')
      .eq('schoolId', schoolId)
      .eq('eventDate', targetDate);

    if (fetchErr) {
      throw new Error(fetchErr.message);
    }

    const rows = (existingRows ?? []) as Array<
      Pick<SchoolSpecialEventDbRow, 'id' | 'reason' | 'targetType' | 'isActive'>
    >;
    const existingSiswaRow = rows.find(
      (r) => normalizeTargetType(r.targetType) === 'SISWA'
    );

    for (const row of rows) {
      const target = normalizeTargetType(row.targetType);
      if (target === 'GURU' && row.isActive) {
        const { error } = await supabase
          .from('school_special_events')
          .update({ isActive: false })
          .eq('id', row.id);
        if (error) throw new Error(error.message);
      } else if (target === 'ALL' && row.isActive) {
        if (!existingSiswaRow) {
          const { error } = await supabase
            .from('school_special_events')
            .update({ targetType: 'SISWA' })
            .eq('id', row.id);
          if (error) throw new Error(error.message);
        } else {
          // Baris SISWA sudah ada di DB: pertahankan status aktifnya lalu tutup baris ALL
          const { error: siswaActErr } = await supabase
            .from('school_special_events')
            .update({
              isActive: true,
              reason: existingSiswaRow.reason || row.reason,
            })
            .eq('id', existingSiswaRow.id);
          if (siswaActErr) throw new Error(siswaActErr.message);

          const { error: allDeactErr } = await supabase
            .from('school_special_events')
            .update({ isActive: false })
            .eq('id', row.id);
          if (allDeactErr) throw new Error(allDeactErr.message);
        }
      }
    }

    await checkLockStatus();
  };

  return {
    ...state,
    refreshHolidayLock: checkLockStatus,
    enableTeacherSpecialEvent,
    disableTeacherSpecialEvent,
  };
}