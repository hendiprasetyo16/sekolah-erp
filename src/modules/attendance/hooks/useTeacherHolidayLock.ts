// ============================================================================
// FILE: src/modules/attendance/hooks/useTeacherHolidayLock.ts
// FUNGSI: Pengaturan Lock Hari Libur & Kegiatan Khusus Presensi Guru
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase.client';
import {
  checkRedDateStatus,
  type WorkDaysMode,
} from '../utils/indonesianHolidays';

interface UseTeacherHolidayLockParams {
  schoolId: string;
  targetDate: string; // Format YYYY-MM-DD
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

  /**
   * Memeriksa status hari libur dan kegiatan khusus guru dari database
   */
  const checkLockStatus = useCallback(async () => {
    const redStatus = checkRedDateStatus(
      targetDate,
      dbHolidaysMap,
      workDaysMode
    );

    if (!schoolId || targetDate.length !== 10) {
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
      // Gunakan nama kolom camelCase sesuai skema tabel school_special_events
      const { data, error } = await supabase
        .from('school_special_events')
        .select('id, schoolId, eventDate, reason, targetType, isActive')
        .eq('schoolId', schoolId)
        .eq('eventDate', targetDate)
        .eq('isActive', true);

      if (error) {
        throw error;
      }

      const rows = data ?? [];

      // Cari kegiatan khusus aktif dengan sasaran GURU atau ALL
      const matchedEvent = rows.find((row) => {
        const rowTarget = String(row.targetType ?? 'ALL').toUpperCase();
        return rowTarget === 'GURU' || rowTarget === 'ALL';
      });

      if (matchedEvent) {
        const eventTitle =
          String(matchedEvent.reason ?? '').trim() || 'Kegiatan Khusus Guru';

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
    void checkLockStatus();
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

    // Cek apakah sudah pernah ada baris untuk tanggal & targetType 'GURU' agar tidak duplikat
    const { data: existing, error: checkErr } = await supabase
      .from('school_special_events')
      .select('id')
      .eq('schoolId', schoolId)
      .eq('eventDate', targetDate)
      .eq('targetType', 'GURU')
      .maybeSingle();

    if (checkErr) {
      throw new Error(checkErr.message);
    }

    if (existing?.id) {
      // Aktifkan kembali baris yang sudah ada
      const { error: updateErr } = await supabase
        .from('school_special_events')
        .update({
          reason: cleanTitle,
          isActive: true,
        })
        .eq('id', existing.id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }
    } else {
      // Buat baris baru dengan nama kolom camelCase yang benar
      const { error: insertErr } = await supabase
        .from('school_special_events')
        .insert({
          schoolId,
          eventDate: targetDate,
          reason: cleanTitle,
          targetType: 'GURU',
          isActive: true,
          createdBy: userId ?? null,
        });

      if (insertErr) {
        throw new Error(insertErr.message);
      }
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
      .update({ isActive: false })
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