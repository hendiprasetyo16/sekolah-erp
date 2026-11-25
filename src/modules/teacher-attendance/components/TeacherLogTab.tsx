// src/modules/teacher-attendance/components/TeacherLogTab.tsx
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

export function TeacherLogTab({
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="data-card space-y-3"
        >
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
                >
                    <Menu size={16} />
                </button>
            </div>

            {historyRecords.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-8">
                    {t('teacherAttendance.logEmpty')}
                </p>
            ) : (
                <div className="space-y-2.5 max-h-105 overflow-y-auto pr-1">
                    {historyRecords.map((item) => {
                        const isEarlyLog = isEarlyDepartureNote(item.notes);
                        const itemJv = getJavaneseDateInfo(item.date, currentLang);
                        const loggedLateMinutes =
                            typeof item.deviceTelemetry?.lateMinutes === 'number'
                                ? item.deviceTelemetry.lateMinutes
                                : item.checkInTime && item.status === 'TERLAMBAT'
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
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${item.status === 'HADIR'
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                            : item.status === 'TERLAMBAT'
                                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                                : item.status === 'ALPA' || item.status === 'ALPHA'
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
}