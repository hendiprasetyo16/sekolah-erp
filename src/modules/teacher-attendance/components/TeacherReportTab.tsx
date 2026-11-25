// src/modules/teacher-attendance/components/TeacherReportTab.tsx
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Menu,
    CheckCircle2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { WorkDaysMode } from '@/modules/attendance/utils/indonesianHolidays';
import { getSchoolDateString } from '@/modules/attendance/services/gps.utils';
import type { AttendanceRecord } from '../types/teacherAttendance.types';

interface CalendarDayCell {
    dateStr: string | null;
    dayNum: number | null;
    pasaranShort: string;
    isRedDate: boolean;
    holidayName: string | null;
    record?: AttendanceRecord;
}

interface SelectedDateDetails {
    dateStr: string;
    label: string;
    javaneseSubtitle: string;
    isRedDate: boolean;
    holidayName: string | null;
    record?: AttendanceRecord;
}

interface TeacherReportTabProps {
    onToggleSidebar: () => void;
    reportScope: 'monthly' | 'yearly';
    setReportScope: (scope: 'monthly' | 'yearly') => void;
    selectedMonthLabel: string;
    selectedJavaneseMonthRange: string;
    calendarYear: number;
    setCalendarYear: (year: number) => void;
    calendarMonth?: number;
    setCalendarMonth: (month: number) => void;
    selectedCalendarDate: string;
    setSelectedCalendarDate: (dateStr: string) => void;
    todayStr: string;
    schoolTimezone: string;
    effectiveWorkDaysMode: WorkDaysMode;
    shortDayNames: string[];
    calendarDaysGrid: CalendarDayCell[];
    selectedDateInfo: SelectedDateDetails | null;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    reportStats: {
        hadir: number;
        terlambat: number;
        izinSakit: number;
        alpa: number;
        percentage: number;
    };
    formatShortTime: (iso?: string | null) => string;
    formatStatusLabel: (status?: string | null) => string;
}

export function TeacherReportTab({
    onToggleSidebar,
    reportScope,
    setReportScope,
    selectedMonthLabel,
    selectedJavaneseMonthRange,
    calendarYear,
    setCalendarYear,
    calendarMonth,
    setCalendarMonth,
    selectedCalendarDate,
    setSelectedCalendarDate,
    todayStr,
    schoolTimezone,
    effectiveWorkDaysMode,
    shortDayNames,
    calendarDaysGrid,
    selectedDateInfo,
    onPrevMonth,
    onNextMonth,
    reportStats,
    formatShortTime,
    formatStatusLabel,
}: TeacherReportTabProps) {
    const { t } = useTranslation();

    const activeMonthIndex = useMemo(() => {
        if (typeof calendarMonth === 'number') return calendarMonth;
        const firstDateCell = calendarDaysGrid.find((c) => Boolean(c.dateStr));
        if (firstDateCell?.dateStr) {
            const monthPart = Number(firstDateCell.dateStr.split('-')[1]);
            if (!Number.isNaN(monthPart) && monthPart >= 1 && monthPart <= 12) {
                return monthPart - 1;
            }
        }
        return new Date().getMonth();
    }, [calendarMonth, calendarDaysGrid]);

    const shortMonthLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
        return Array.from({ length: 12 }, (_, idx) =>
            formatter.format(new Date(2026, idx, 1)).replace('.', '')
        );
    }, []);

    const handleQuickSelectMonth = (monthIdx: number) => {
        setCalendarMonth(monthIdx);
        const monthPrefix = `${calendarYear}-${String(monthIdx + 1).padStart(2, '0')}`;
        if (todayStr.startsWith(monthPrefix)) {
            setSelectedCalendarDate(todayStr);
        } else {
            setSelectedCalendarDate(`${monthPrefix}-01`);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
        >
            <div className="rounded-3xl bg-linear-to-r from-[#16365C] to-[#275A96] p-5 text-white shadow-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="p-2 rounded-xl bg-white/15 hover:bg-white/25 transition"
                        title={t('teacherAttendance.titleToggleSidebar')}
                    >
                        <Menu size={17} />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold">
                            {reportScope === 'monthly'
                                ? t('teacherAttendance.reportTitleMonthly')
                                : t('teacherAttendance.reportTitleYearly')}
                        </h2>
                        <p className="text-xs text-blue-100/80">
                            {reportScope === 'monthly'
                                ? selectedMonthLabel
                                : t('teacherAttendance.yearLabel', {
                                    year: calendarYear,
                                })}
                        </p>
                    </div>
                </div>
                <div className="flex rounded-xl bg-white/15 p-1 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setReportScope('monthly')}
                        className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'monthly'
                                ? 'bg-white text-slate-900'
                                : 'text-white'
                            }`}
                    >
                        {t('teacherAttendance.scopeMonthly')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setReportScope('yearly')}
                        className={`px-3 py-1.5 rounded-lg transition ${reportScope === 'yearly'
                                ? 'bg-white text-slate-900'
                                : 'text-white'
                            }`}
                    >
                        {t('teacherAttendance.scopeYearly')}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl bg-linear-to-r from-[#1E3B5C] via-[#3A5357] to-[#8C7A3E] p-5 text-white shadow-md flex items-center justify-between">
                <div>
                    <p className="text-xs text-white/80">
                        {t('teacherAttendance.attendanceRateLabel')}
                    </p>
                    <p className="text-3xl font-extrabold mt-1">
                        {reportStats.percentage}%
                    </p>
                    <p className="text-xs text-amber-200 mt-1">
                        {reportStats.percentage >= 80
                            ? t('teacherAttendance.disciplineGood')
                            : t('teacherAttendance.disciplineNeedsImprovement')}
                    </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                    <CheckCircle2 size={26} className="text-amber-300" />
                </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                <div className="data-card px-1.5 py-2.5 sm:p-3 text-center min-w-0 overflow-hidden">
                    <div className="text-xl sm:text-2xl font-extrabold text-emerald-500">
                        {reportStats.hadir}
                    </div>
                    <div className="text-[9.5px] sm:text-[11px] leading-tight tracking-tight opacity-75 mt-1 wrap-break-word">
                        {t('teacherAttendance.statPresentDays')}
                    </div>
                </div>
                <div className="data-card px-1.5 py-2.5 sm:p-3 text-center min-w-0 overflow-hidden">
                    <div className="text-xl sm:text-2xl font-extrabold text-amber-500">
                        {reportStats.terlambat}
                    </div>
                    <div className="text-[9.5px] sm:text-[11px] leading-tight tracking-tight opacity-75 mt-1 wrap-break-word">
                        {t('teacherAttendance.statLateDays')}
                    </div>
                </div>
                <div className="data-card px-1.5 py-2.5 sm:p-3 text-center min-w-0 overflow-hidden">
                    <div className="text-xl sm:text-2xl font-extrabold text-blue-500">
                        {reportStats.izinSakit}
                    </div>
                    <div className="text-[9.5px] sm:text-[11px] leading-tight tracking-tight opacity-75 mt-1 wrap-break-word">
                        {t('teacherAttendance.statLeaveSickDays')}
                    </div>
                </div>
                <div className="data-card px-1.5 py-2.5 sm:p-3 text-center min-w-0 overflow-hidden">
                    <div className="text-xl sm:text-2xl font-extrabold text-red-500">
                        {reportStats.alpa}
                    </div>
                    <div className="text-[9.5px] sm:text-[11px] leading-tight tracking-tight opacity-75 mt-1 wrap-break-word">
                        {t('teacherAttendance.statUnexcusedDays')}
                    </div>
                </div>
            </div>

            <div className="data-card p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CalendarDays size={18} className="text-primary" />
                        <div>
                            <h3 className="font-bold text-sm">{selectedMonthLabel}</h3>
                            <p className="text-[10px] font-medium text-amber-600 dark:text-amber-300">
                                {selectedJavaneseMonthRange}
                            </p>
                            <p className="text-[10px] opacity-65">
                                {effectiveWorkDaysMode === 'FIVE_DAYS'
                                    ? t('teacherAttendance.workMode5Days')
                                    : t('teacherAttendance.workMode6Days')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => {
                                const d = new Date();
                                setCalendarYear(d.getFullYear());
                                setCalendarMonth(d.getMonth());
                                setSelectedCalendarDate(
                                    getSchoolDateString(d, schoolTimezone)
                                );
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-muted hover:bg-muted/80 transition"
                        >
                            {t('teacherAttendance.btnToday')}
                        </button>
                        <button
                            type="button"
                            onClick={onPrevMonth}
                            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={onNextMonth}
                            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                {/* NAVIGASI CEPAT 12-BULAN SAAT MODE TAHUNAN AKTIF */}
                {reportScope === 'yearly' && (
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 p-1.5 rounded-2xl bg-muted/45 border border-border">
                        {shortMonthLabels.map((label, idx) => {
                            const isActive = idx === activeMonthIndex;
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => handleQuickSelectMonth(idx)}
                                    className={`py-1.5 px-1 rounded-xl text-[11px] font-semibold transition ${isActive
                                            ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                                            : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                                        }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="grid grid-cols-7 gap-1 text-center">
                    {shortDayNames.map((hari, idx) => (
                        <div
                            key={hari}
                            className={`text-[11px] font-bold py-1 ${idx === 0
                                    ? 'text-red-500'
                                    : idx === 6 && effectiveWorkDaysMode === 'FIVE_DAYS'
                                        ? 'text-red-500'
                                        : 'opacity-65'
                                }`}
                        >
                            {hari}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                    {calendarDaysGrid.map((cell, idx) => {
                        if (!cell.dateStr || !cell.dayNum) {
                            return <div key={`empty-${idx}`} className="h-12" />;
                        }

                        const isToday = cell.dateStr === todayStr;
                        const isSelected = cell.dateStr === selectedCalendarDate;
                        const status = cell.record?.status;

                        const statusDotColor =
                            status === 'HADIR'
                                ? 'bg-emerald-500'
                                : status === 'TERLAMBAT'
                                    ? 'bg-amber-500'
                                    : status === 'IZIN' || status === 'SAKIT'
                                        ? 'bg-blue-500'
                                        : status === 'ALPA' || status === 'ALPHA'
                                            ? 'bg-red-500'
                                            : null;

                        return (
                            <button
                                key={cell.dateStr}
                                type="button"
                                onClick={() => setSelectedCalendarDate(cell.dateStr!)}
                                className={`h-12 rounded-xl flex flex-col items-center justify-center relative transition border ${isSelected
                                        ? 'border-primary ring-2 ring-primary/30 font-extrabold'
                                        : isToday
                                            ? 'border-amber-400 font-bold'
                                            : 'border-transparent'
                                    } ${cell.isRedDate
                                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                                        : 'bg-muted/35 hover:bg-muted/70'
                                    }`}
                            >
                                <span className="text-xs leading-none">{cell.dayNum}</span>
                                <span className="text-[8px] opacity-65 leading-none mt-0.5">
                                    {cell.pasaranShort}
                                </span>
                                <div className="mt-1 h-1.5 flex items-center justify-center gap-0.5">
                                    {statusDotColor ? (
                                        <span
                                            className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`}
                                        />
                                    ) : cell.isRedDate ? (
                                        <span className="w-1 h-1 rounded-full bg-red-400/70" />
                                    ) : null}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {selectedDateInfo && (
                    <div
                        className={`p-3 rounded-2xl border text-xs space-y-1 ${selectedDateInfo.isRedDate
                                ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-muted/40 border-border'
                            }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <span className="font-bold block">
                                    {selectedDateInfo.label}
                                </span>
                                <span className="text-[10px] text-amber-600 dark:text-amber-300 font-medium">
                                    {selectedDateInfo.javaneseSubtitle}
                                </span>
                            </div>
                            {selectedDateInfo.isRedDate && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white shrink-0">
                                    {t('teacherAttendance.redDateBadge')}
                                </span>
                            )}
                        </div>

                        {selectedDateInfo.holidayName && (
                            <p className="text-[11px] font-semibold text-red-600 dark:text-red-300">
                                {t('teacherAttendance.holidayNotePrefix', {
                                    name: selectedDateInfo.holidayName,
                                })}
                            </p>
                        )}

                        {selectedDateInfo.record ? (
                            <p className="text-[11px] opacity-85">
                                {t('teacherAttendance.calStatusLine')}
                                <strong>
                                    {formatStatusLabel(selectedDateInfo.record.status)}
                                </strong>
                                {selectedDateInfo.record.checkInTime
                                    ? t('teacherAttendance.calInOutTime', {
                                        checkIn: formatShortTime(
                                            selectedDateInfo.record.checkInTime
                                        ),
                                        checkOut: formatShortTime(
                                            selectedDateInfo.record.checkOutTime
                                        ),
                                    })
                                    : ''}
                                {selectedDateInfo.record.notes
                                    ? ` • ${selectedDateInfo.record.notes}`
                                    : ''}
                            </p>
                        ) : (
                            <p className="text-[11px] opacity-65">
                                {selectedDateInfo.isRedDate
                                    ? t('teacherAttendance.calNoScheduleHoliday')
                                    : t('teacherAttendance.calNoRecordDate')}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}