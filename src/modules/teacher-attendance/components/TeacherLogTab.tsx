// src/modules/teacher-attendance/components/TeacherLogTab.tsx
/**
 * ============================================================================
 * MENU 5: DATA LOG RIWAYAT PRESENSI HARIAN (TeacherLogTab)
 * ============================================================================
 * Menampilkan:
 * 1. Chip filter cepat berdasarkan kategori status (Semua, Hadir, Terlambat,
 *    Izin/Sakit/Dinas/Cuti, Alpa) beserta jumlah masing-masing.
 * 2. Daftar riwayat harian lengkap dengan Pasaran Jawa, jam datang/pulang,
 *    jarak check-in, lencana keterlambatan, lencana pulang awal, dan catatan.
 * ============================================================================
 */
import { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { History, Menu } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { getJavaneseDateInfo } from '@/modules/attendance/utils/javaneseCalendar';
import type { SupportedAttendanceLocale } from '@/modules/attendance/types/attendance.types';
import type { AttendanceRecord } from '../types/teacherAttendance.types';
import {
    calculateLateMinutes,
    isEarlyDepartureNote,
} from '../utils/teacherAttendance.helpers';

type LogStatusFilter = 'ALL' | 'HADIR' | 'TERLAMBAT' | 'IZIN_SAKIT' | 'ALPA';

interface TeacherLogTabProps {
    historyRecords: AttendanceRecord[];
    currentLang: SupportedAttendanceLocale;
    effectiveWorkStartTime: string;
    effectiveToleranceMinutes: number;
    schoolTimezone: string;
    onToggleSidebar: () => void;
    formatShortTime: (iso?: string | null) => string;
    formatStatusLabel: (status?: string | null) => string;
}

export const TeacherLogTab = memo(function TeacherLogTab({
    historyRecords,
    currentLang,
    effectiveWorkStartTime,
    effectiveToleranceMinutes,
    schoolTimezone,
    onToggleSidebar,
    formatShortTime,
    formatStatusLabel,
}: TeacherLogTabProps) {
    const { t } = useTranslation();
    const [activeFilter, setActiveFilter] = useState<LogStatusFilter>('ALL');

    // Hitung jumlah per kategori & saring daftar log sesuai chip filter yang dipilih
    const { counts, filteredRecords } = useMemo(() => {
        const summary = {
            ALL: historyRecords.length,
            HADIR: 0,
            TERLAMBAT: 0,
            IZIN_SAKIT: 0,
            ALPA: 0,
        };

        const matched: AttendanceRecord[] = [];

        for (const item of historyRecords) {
            const status = (item.status ?? '').toUpperCase();
            let bucket: Exclude<LogStatusFilter, 'ALL'> | null = null;

            if (status === 'HADIR') {
                bucket = 'HADIR';
            } else if (status === 'TERLAMBAT') {
                bucket = 'TERLAMBAT';
            } else if (
                status === 'IZIN' ||
                status === 'SAKIT' ||
                status === 'DINAS_LUAR' ||
                status === 'CUTI'
            ) {
                bucket = 'IZIN_SAKIT';
            } else if (status === 'ALPA' || status === 'ALPHA') {
                bucket = 'ALPA';
            }

            if (bucket) {
                summary[bucket] += 1;
            }

            if (activeFilter === 'ALL' || bucket === activeFilter) {
                matched.push(item);
            }
        }

        return { counts: summary, filteredRecords: matched };
    }, [historyRecords, activeFilter]);

    const filterChips = useMemo<{ key: LogStatusFilter; label: string }[]>(
        () => [
            { key: 'ALL', label: t('teacherAttendance.filterAll') },
            { key: 'HADIR', label: formatStatusLabel('HADIR') },
            { key: 'TERLAMBAT', label: formatStatusLabel('TERLAMBAT') },
            {
                key: 'IZIN_SAKIT',
                label: `${formatStatusLabel('IZIN')}/${formatStatusLabel('SAKIT')}`,
            },
            { key: 'ALPA', label: formatStatusLabel('ALPA') },
        ],
        [t, formatStatusLabel]
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="data-card space-y-3"
        >
            {/* ==================================================================
                BAGIAN 1: HEADER DATA LOG PRESENSI
            ================================================================== */}
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <History size={18} className="text-emerald-500" />
                        {t('teacherAttendance.logTitle')}
                    </h2>
                    <p className="text-xs opacity-70">
                        {t('teacherAttendance.logSubtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onToggleSidebar}
                    className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition"
                    title={t('teacherAttendance.titleToggleSidebar')}
                    aria-label={t('teacherAttendance.titleToggleSidebar')}
                >
                    <Menu size={16} />
                </button>
            </div>

            {/* ==================================================================
                BAGIAN 2: CHIP FILTER STATUS KEHADIRAN
            ================================================================== */}
            {historyRecords.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {filterChips.map((chip) => {
                        const isSelected = activeFilter === chip.key;
                        return (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => setActiveFilter(chip.key)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition ${isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                        : 'bg-muted/50 text-foreground/75 border-border hover:bg-muted'
                                    }`}
                            >
                                {chip.label} ({counts[chip.key]})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ==================================================================
                BAGIAN 3: DAFTAR RIWAYAT LOG PRESENSI HARIAN
            ================================================================== */}
            {historyRecords.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-8">
                    {t('teacherAttendance.logEmpty')}
                </p>
            ) : filteredRecords.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                    <p className="text-xs opacity-65">
                        {t('teacherAttendance.logEmptyFiltered')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setActiveFilter('ALL')}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-muted hover:bg-muted/80 transition"
                    >
                        {t('teacherAttendance.btnShowAll')}
                    </button>
                </div>
            ) : (
                <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
                    {filteredRecords.map((item) => {
                        const normalizedStatus = (item.status ?? '').toUpperCase();
                        const isEarlyLog = isEarlyDepartureNote(item.notes);
                        const itemJv = getJavaneseDateInfo(item.date, currentLang);
                        const loggedLateMinutes =
                            typeof item.deviceTelemetry?.lateMinutes === 'number'
                                ? item.deviceTelemetry.lateMinutes
                                : item.checkInTime && normalizedStatus === 'TERLAMBAT'
                                    ? calculateLateMinutes(
                                        new Date(item.checkInTime),
                                        effectiveWorkStartTime,
                                        effectiveToleranceMinutes,
                                        schoolTimezone
                                    )
                                    : 0;

                        return (
                            <div
                                key={item.id}
                                className="p-3.5 rounded-2xl bg-muted/40 border border-border flex items-start justify-between gap-3"
                            >
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-bold">
                                            {item.date} ({itemJv.hariPasaran})
                                        </span>
                                        {loggedLateMinutes > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                                {t('teacherAttendance.logLateBadge', {
                                                    minutes: loggedLateMinutes,
                                                })}
                                            </span>
                                        )}
                                        {isEarlyLog && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300">
                                                {t('teacherAttendance.logEarlyBadge')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] opacity-75">
                                        {item.checkInTime
                                            ? t('teacherAttendance.logInOutDetails', {
                                                checkIn: formatShortTime(item.checkInTime),
                                                distance: item.checkInDistance ?? 0,
                                                checkOut: formatShortTime(item.checkOutTime),
                                            })
                                            : item.notes || '-'}
                                    </div>
                                    {item.checkInTime && item.notes && (
                                        <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1 leading-relaxed">
                                            {item.notes}
                                        </div>
                                    )}
                                </div>
                                <span
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${normalizedStatus === 'HADIR'
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                            : normalizedStatus === 'TERLAMBAT'
                                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                                : normalizedStatus === 'ALPA' ||
                                                    normalizedStatus === 'ALPHA'
                                                    ? 'bg-red-500/15 text-red-600 dark:text-red-300'
                                                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                                        }`}
                                >
                                    {formatStatusLabel(item.status)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
});