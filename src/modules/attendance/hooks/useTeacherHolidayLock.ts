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

export type SpecialEventTargetType = 'ALL' | 'GURU' | 'SISWA';

interface SchoolSpecialEventDbRow {
  id: string;
  schoolId: string;
  eventDate: string;
  reason: string | null;
  targetType: string | null;
  isActive: boolean;
}

interface SchoolSpecialEventUpsertPayload {
  schoolId: string;
  eventDate: string;
  reason: string;
  targetType: SpecialEventTargetType;
  isActive: boolean;
  createdBy: string | null;
}

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
      const { data, error } = await supabase
        .from('school_special_events')
        .select('id, schoolId, eventDate, reason, targetType, isActive')
        .eq('schoolId', schoolId)
        .eq('eventDate', targetDate)
        .eq('isActive', true);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as SchoolSpecialEventDbRow[];

      // Cari kegiatan khusus aktif dengan sasaran GURU atau ALL
      const matchedEvent = rows.find((row) => {
        const normalizedTarget = normalizeTargetType(row.targetType);
        return normalizedTarget === 'GURU' || normalizedTarget === 'ALL';
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
    } catch (err: unknown) {
      console.error(
        '[useTeacherHolidayLock] Gagal memeriksa status libur:',
        err
      );
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
   * Membuka kunci presensi khusus guru pada hari libur secara atomik (bebas duplicate key)
   */
  const enableTeacherSpecialEvent = async (
    title: string,
    userId?: string | null
  ): Promise<void> => {
    if (!schoolId) {
      throw new Error('Identitas sekolah belum tersedia.');
    }
    if (targetDate.length !== 10) {
      throw new Error('Format tanggal presensi tidak valid.');
    }

    const cleanTitle = title.trim() || 'Kegiatan Khusus Guru';

    // Periksa baris berdasarkan unique constraint aktual: (schoolId, eventDate)
    const { data: existingRaw, error: checkErr } = await supabase
      .from('school_special_events')
      .select('id, targetType, isActive')
      .eq('schoolId', schoolId)
      .eq('eventDate', targetDate)
      .maybeSingle();

    if (checkErr) {
      throw new Error(checkErr.message);
    }

    const existing = existingRaw as Pick<
      SchoolSpecialEventDbRow,
      'id' | 'targetType' | 'isActive'
    > | null;

    // Jika sudah ada agenda aktif khusus SISWA di tanggal yang sama, gabungkan menjadi ALL
    // agar presensi siswa yang sedang dibuka tidak ikut tertutup.
    const nextTargetType: SpecialEventTargetType =
      existing?.isActive && normalizeTargetType(existing.targetType) === 'SISWA'
        ? 'ALL'
        : 'GURU';

    const payload: SchoolSpecialEventUpsertPayload = {
      schoolId,
      eventDate: targetDate,
      reason: cleanTitle,
      targetType: nextTargetType,
      isActive: true,
      createdBy: userId ?? null,
    };

    const { error: upsertErr } = await supabase
      .from('school_special_events')
      .upsert(payload, {
        onConflict: 'schoolId,eventDate',
      });

    if (upsertErr) {
      throw new Error(upsertErr.message);
    }

    await checkLockStatus();
  };

  /**
   * Mengunci kembali presensi guru pada hari libur
   */
  const disableTeacherSpecialEvent = async (): Promise<void> => {
    if (!schoolId) {
      throw new Error('Identitas sekolah belum tersedia.');
    }

    if (state.specialEventId) {
      const { error } = await supabase
        .from('school_special_events')
        .update({ isActive: false })
        .eq('id', state.specialEventId);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from('school_special_events')
        .update({ isActive: false })
        .eq('schoolId', schoolId)
        .eq('eventDate', targetDate);

      if (error) {
        throw new Error(error.message);
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