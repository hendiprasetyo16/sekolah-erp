// src/modules/attendance/hooks/useTeacherHolidayLock.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase.client';
import {
  checkRedDateStatus,
  type WorkDaysMode,
} from '../utils/indonesianHolidays';

interface UseTeacherHolidayLockParams {
  schoolId: string;
  targetDate: string;
  dbHolidaysMap: Record<string, string>;
  workDaysMode: WorkDaysMode;
}

export interface TeacherHolidayLockState {
  loading: boolean;
  isLocked: boolean;
  isHoliday: boolean;
  isSpecialEvent: boolean;
  reason: string;
  specialEventId: string | null;
}

export function useTeacherHolidayLock({
  schoolId,
  targetDate,
  dbHolidaysMap,
  workDaysMode,
}: UseTeacherHolidayLockParams) {
  const [state, setState] = useState<TeacherHolidayLockState>({
    loading: true,
    isLocked: false,
    isHoliday: false,
    isSpecialEvent: false,
    reason: '',
    specialEventId: null,
  });

  const checkLockStatus = useCallback(async () => {
    const redStatus = checkRedDateStatus(
      targetDate,
      dbHolidaysMap,
      workDaysMode
    );

    if (!schoolId) {
      setState({
        loading: false,
        isLocked: redStatus.isRedDate,
        isHoliday: redStatus.isRedDate,
        isSpecialEvent: false,
        reason: redStatus.holidayName || 'Hari Libur',
        specialEventId: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const { data, error } = await supabase
        .from('school_special_events')
        .select('id, school_id, event_date, title, target_type, is_active')
        .eq('school_id', schoolId)
        .eq('event_date', targetDate)
        .eq('is_active', true);

      if (error) {
        throw error;
      }

      const rows = data ?? [];

      // Cari kegiatan khusus aktif pada tanggal target khusus sasaran GURU atau ALL
      const matchedEvent = rows.find((row) => {
        const rowTarget = String(row.target_type ?? 'ALL').toUpperCase();
        return rowTarget === 'GURU' || rowTarget === 'ALL';
      });

      if (matchedEvent) {
        const eventTitle = String(
          matchedEvent.title ?? 'Kegiatan Khusus Guru'
        );
        setState({
          loading: false,
          isLocked: false,
          isHoliday: redStatus.isRedDate,
          isSpecialEvent: true,
          reason: eventTitle,
          specialEventId: String(matchedEvent.id),
        });
        return;
      }

      if (redStatus.isRedDate) {
        setState({
          loading: false,
          isLocked: true,
          isHoliday: true,
          isSpecialEvent: false,
          reason: redStatus.holidayName || 'Hari Libur Sekolah / Akhir Pekan',
          specialEventId: null,
        });
      } else {
        setState({
          loading: false,
          isLocked: false,
          isHoliday: false,
          isSpecialEvent: false,
          reason: 'Hari Kerja Normal',
          specialEventId: null,
        });
      }
    } catch (err) {
      console.error('[useTeacherHolidayLock] Gagal memeriksa status libur:', err);
      setState({
        loading: false,
        isLocked: redStatus.isRedDate,
        isHoliday: redStatus.isRedDate,
        isSpecialEvent: false,
        reason: redStatus.holidayName || 'Hari Libur',
        specialEventId: null,
      });
    }
  }, [schoolId, targetDate, dbHolidaysMap, workDaysMode]);

  useEffect(() => {
    checkLockStatus();
  }, [checkLockStatus]);

  /**
   * Membuka kunci presensi khusus guru pada hari libur
   */
  const enableTeacherSpecialEvent = async (
    title: string,
    userId?: string | null
  ) => {
    if (!schoolId) return;
    const cleanTitle = title.trim() || 'Kegiatan Khusus Guru';

    const { error } = await supabase.from('school_special_events').insert({
      school_id: schoolId,
      event_date: targetDate,
      title: cleanTitle,
      target_type: 'GURU',
      is_active: true,
      created_by: userId ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    await checkLockStatus();
  };

  /**
   * Mengunci kembali presensi guru pada hari libur
   */
  const disableTeacherSpecialEvent = async () => {
    if (!state.specialEventId) return;

    const { error } = await supabase
      .from('school_special_events')
      .update({ is_active: false })
      .eq('id', state.specialEventId);

    if (error) {
      throw new Error(error.message);
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