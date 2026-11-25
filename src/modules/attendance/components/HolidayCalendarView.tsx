// src/modules/attendance/components/HolidayCalendarView.tsx
import { useState, useEffect, useMemo } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    CheckCircle2,
    Sparkles,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    checkRedDateStatus,
    type WorkDaysMode,
    type HolidayRecord,
} from '../utils/indonesianHolidays';
import {
    getJavaneseDateInfo,
    getJavaneseMonthRangeLabel,
} from '../utils/javaneseCalendar';

interface HolidayCalendarViewProps {
    year: number;
    holidays: HolidayRecord[];
    workDaysMode: WorkDaysMode;
    isSuperAdmin: boolean;
    onClickEditHoliday: (holiday: HolidayRecord) => void;
    onClickAddHolidayOnDate: (isoDate: string) => void;
}

// ============================================================================
// PARAMETER TAMPILAN YANG MUDAH DISESUAIKAN
// ============================================================================
const CALENDAR_CONFIG = {
    highlightFridayGreen: true, // Ubah ke false jika hari Jumat tidak ingin berwarna hijau
    showFullPasaranName: true,  // true = "21 Pahing", false = "21 Ph"
};

function getTodayIsoLocal(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function HolidayCalendarView({
    year,
    holidays,
    workDaysMode,
    isSuperAdmin,
    onClickEditHoliday,
    onClickAddHolidayOnDate,
}: HolidayCalendarViewProps) {
    const { t } = useTranslation();
    const todayIso = useMemo(() => getTodayIsoLocal(), []);

    const monthNames = useMemo(
        () => [
            t('attendanceSettings.month_0'),
            t('attendanceSettings.month_1'),
            t('attendanceSettings.month_2'),
            t('attendanceSettings.month_3'),
            t('attendanceSettings.month_4'),
            t('attendanceSettings.month_5'),
            t('attendanceSettings.month_6'),
            t('attendanceSettings.month_7'),
            t('attendanceSettings.month_8'),
            t('attendanceSettings.month_9'),
            t('attendanceSettings.month_10'),
            t('attendanceSettings.month_11'),
        ],
        [t]
    );

    const dayHeaders = useMemo(
        () => [
            t('attendanceSettings.day_0'),
            t('attendanceSettings.day_1'),
            t('attendanceSettings.day_2'),
            t('attendanceSettings.day_3'),
            t('attendanceSettings.day_4'),
            t('attendanceSettings.day_5'),
            t('attendanceSettings.day_6'),
        ],
        [t]
    );

    // State khusus tampilan HP (1 bulan per tampilan + tanggal yang diketuk)
    const [mobileMonth, setMobileMonth] = useState<number>(() => {
        const now = new Date();
        return now.getFullYear() === year ? now.getMonth() : 0;
    });

    const [selectedIsoDate, setSelectedIsoDate] = useState<string>(() => {
        const now = new Date();
        if (now.getFullYear() === year) return getTodayIsoLocal();
        return `${year}-01-01`;
    });

    // Sinkronkan bulan & tanggal terpilih saat admin mengganti filter tahun
    useEffect(() => {
        const now = new Date();
        if (now.getFullYear() === year) {
            setMobileMonth(now.getMonth());
            setSelectedIsoDate(getTodayIsoLocal());
        } else {
            setMobileMonth(0);
            setSelectedIsoDate(`${year}-01-01`);
        }
    }, [year]);

    // Peta tanggal -> daftar hari libur & peta nama libur untuk akses cepat
    const { holidaysByDate, holidaysNameMap } = useMemo(() => {
        const map = new Map<string, HolidayRecord[]>();
        const nameMap: Record<string, string> = {};

        for (const h of holidays) {
            const list = map.get(h.date) ?? [];
            list.push(h);
            map.set(h.date, list);

            if (!nameMap[h.date] || h.schoolId !== null) {
                nameMap[h.date] = h.name;
            }
        }
        return { holidaysByDate: map, holidaysNameMap: nameMap };
    }, [holidays]);

    // Navigasi bulan sebelumnya / berikutnya khusus layar HP
    const handleMobilePrevMonth = () => {
        setMobileMonth((prev) => {
            const nextM = prev === 0 ? 11 : prev - 1;
            setSelectedIsoDate(`${year}-${String(nextM + 1).padStart(2, '0')}-01`);
            return nextM;
        });
    };

    const handleMobileNextMonth = () => {
        setMobileMonth((prev) => {
            const nextM = prev === 11 ? 0 : prev + 1;
            setSelectedIsoDate(`${year}-${String(nextM + 1).padStart(2, '0')}-01`);
            return nextM;
        });
    };

    // Detail tanggal yang sedang diketuk di HP (hari kerja biasa maupun tanggal merah)
    const selectedMobileDetails = useMemo(() => {
        if (!selectedIsoDate) return null;
        const redStatus = checkRedDateStatus(
            selectedIsoDate,
            holidaysNameMap,
            workDaysMode
        );
        const dayHolidays = holidaysByDate.get(selectedIsoDate) ?? [];
        const jawaInfo = getJavaneseDateInfo(selectedIsoDate);
        const dateObj = new Date(`${selectedIsoDate}T00:00:00`);
        const locale = t('attendanceSettings.day_0') === 'Sun' ? 'en-US' : 'id-ID';
        const gregorianLabel = dateObj.toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });

        return {
            isoDate: selectedIsoDate,
            gregorianLabel,
            jawaInfo,
            ...redStatus,
            dayHolidays,
        };
    }, [selectedIsoDate, holidaysNameMap, holidaysByDate, workDaysMode, t]);

    // Data bulan aktif untuk tampilan HP
    const mobileMonthData = useMemo(() => {
        const daysInMonth = new Date(
            Date.UTC(year, mobileMonth + 1, 0)
        ).getUTCDate();
        const firstDayOfWeek = new Date(
            Date.UTC(year, mobileMonth, 1)
        ).getUTCDay();
        const monthPrefix = `${year}-${String(mobileMonth + 1).padStart(2, '0')}`;
        const javaneseRangeLabel = getJavaneseMonthRangeLabel(year, mobileMonth);
        const monthHolidays = holidays.filter((h) => h.date.startsWith(monthPrefix));

        const calendarCells: Array<number | null> = [
            ...Array.from({ length: firstDayOfWeek }, () => null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];

        return {
            monthPrefix,
            javaneseRangeLabel,
            monthHolidays,
            calendarCells,
        };
    }, [year, mobileMonth, holidays]);

    return (
        <div>
            {/* ====================================================================
                1. TAMPILAN KHUSUS HP (< 768px): 1 BULAN + NEXT/PREV + INFO KLIK
            ==================================================================== */}
            <div className="md:hidden space-y-3">
                <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-3">
                    {/* Navigasi Bulan HP + Sub-header Bulan Jawa */}
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={handleMobilePrevMonth}
                            className="p-2 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition shrink-0"
                            title={t('attendanceSettings.titlePrevMonth')}
                            aria-label={t('attendanceSettings.titlePrevMonth')}
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div className="text-center min-w-0 flex-1">
                            <div className="flex items-center justify-center gap-1.5">
                                <select
                                    value={mobileMonth}
                                    onChange={(e) => {
                                        const m = Number(e.target.value);
                                        setMobileMonth(m);
                                        setSelectedIsoDate(
                                            `${year}-${String(m + 1).padStart(2, '0')}-01`
                                        );
                                    }}
                                    className="form-input w-auto! py-1 px-2.5 text-xs font-bold bg-muted/40"
                                >
                                    {monthNames.map((mName, idx) => (
                                        <option key={mName} value={idx}>
                                            {mName} {year}
                                        </option>
                                    ))}
                                </select>
                                {mobileMonthData.monthHolidays.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-300 shrink-0">
                                        {t('attendanceSettings.holidayCountBadge', {
                                            count: mobileMonthData.monthHolidays.length,
                                        })}
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 mt-1 truncate">
                                {mobileMonthData.javaneseRangeLabel}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={handleMobileNextMonth}
                            className="p-2 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition shrink-0"
                            title={t('attendanceSettings.titleNextMonth')}
                            aria-label={t('attendanceSettings.titleNextMonth')}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Header Nama Hari HP */}
                    <div className="grid grid-cols-7 text-center border-b border-border/70 pb-1.5">
                        {dayHeaders.map((dayLabel, dayIdx) => {
                            const isSunday = dayIdx === 0;
                            const isFriday = dayIdx === 5;
                            const isSaturdayOff =
                                dayIdx === 6 && workDaysMode === 'FIVE_DAYS';

                            let headerColor = 'text-sky-600 dark:text-sky-400';
                            if (isSunday || isSaturdayOff) {
                                headerColor = 'text-red-500';
                            } else if (isFriday && CALENDAR_CONFIG.highlightFridayGreen) {
                                headerColor = 'text-emerald-600 dark:text-emerald-400';
                            }

                            return (
                                <span
                                    key={dayLabel}
                                    className={`text-[11px] font-bold ${headerColor}`}
                                >
                                    {dayLabel}
                                </span>
                            );
                        })}
                    </div>

                    {/* Grid Tanggal 1 Bulan HP */}
                    <div className="grid grid-cols-7 gap-1">
                        {mobileMonthData.calendarCells.map((dayNum, cellIdx) => {
                            if (dayNum === null) {
                                return <div key={`m-empty-${cellIdx}`} className="h-12" />;
                            }

                            const isoDate = `${mobileMonthData.monthPrefix}-${String(
                                dayNum
                            ).padStart(2, '0')}`;
                            const dayOfWeek = cellIdx % 7;
                            const isSunday = dayOfWeek === 0;
                            const isFriday = dayOfWeek === 5;
                            const isSaturdayOff =
                                dayOfWeek === 6 && workDaysMode === 'FIVE_DAYS';
                            const isWeekendOff = isSunday || isSaturdayOff;

                            const dayHolidays = holidaysByDate.get(isoDate) ?? [];
                            const hasHoliday = dayHolidays.length > 0;
                            const isCutiBersamaOnly =
                                hasHoliday &&
                                dayHolidays.every((h) =>
                                    h.name.toLowerCase().includes('cuti bersama')
                                );

                            const isToday = isoDate === todayIso;
                            const isSelected = isoDate === selectedIsoDate;
                            const jawaInfo = getJavaneseDateInfo(isoDate);

                            let cellBgClass = 'bg-muted/25 border-transparent';
                            let dateNumberClass = 'text-foreground';

                            if (hasHoliday && isCutiBersamaOnly) {
                                cellBgClass = 'bg-amber-500/15 border-amber-500/40';
                                dateNumberClass = 'text-amber-700 dark:text-amber-300';
                            } else if (hasHoliday || isWeekendOff) {
                                cellBgClass = 'bg-red-500/10 border-red-500/25';
                                dateNumberClass = 'text-red-600 dark:text-red-400';
                            } else if (isFriday && CALENDAR_CONFIG.highlightFridayGreen) {
                                dateNumberClass = 'text-emerald-600 dark:text-emerald-400';
                            }

                            if (isSelected) {
                                cellBgClass += ' ring-2 ring-primary scale-[1.03] font-extrabold';
                            } else if (isToday) {
                                cellBgClass += ' ring-2 ring-blue-500 bg-blue-500/10';
                            }

                            return (
                                <button
                                    key={isoDate}
                                    type="button"
                                    onClick={() => setSelectedIsoDate(isoDate)}
                                    className={`h-12 rounded-xl border px-0 py-1 flex flex-col items-center justify-center transition cursor-pointer overflow-hidden ${cellBgClass}`}
                                >
                                    <span
                                        className={`text-sm font-extrabold leading-tight ${dateNumberClass}`}
                                    >
                                        {dayNum}
                                    </span>
                                    <span className="text-[8.5px] leading-tight font-medium text-muted-foreground tracking-tighter whitespace-nowrap">
                                        {CALENDAR_CONFIG.showFullPasaranName
                                            ? jawaInfo.shortJavaneseDate
                                            : jawaInfo.compactJavaneseDate}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Kartu Info Detail saat Tanggal Diketuk di HP */}
                {selectedMobileDetails && (
                    <div
                        className={`p-4 rounded-2xl border text-xs space-y-2.5 transition ${selectedMobileDetails.isRedDate
                            ? 'bg-red-500/10 border-red-500/35'
                            : 'bg-muted/40 border-border'
                            }`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className="font-bold text-sm text-foreground">
                                    {selectedMobileDetails.gregorianLabel}
                                </div>
                                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1 mt-0.5">
                                    <Sparkles size={12} />
                                    <span>{selectedMobileDetails.jawaInfo.fullFormattedDate}</span>
                                </div>
                            </div>

                            {selectedMobileDetails.isRedDate ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500 text-white shrink-0">
                                    {t('attendanceSettings.badgeRedDate')}
                                </span>
                            ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                                    {t('attendanceSettings.badgeWorkday')}
                                </span>
                            )}
                        </div>

                        {selectedMobileDetails.holidayName ? (
                            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-700 dark:text-red-200 font-semibold">
                                {t('attendanceSettings.holidayNotePrefix', {
                                    name: selectedMobileDetails.holidayName,
                                })}
                            </div>
                        ) : (
                            <div className="p-2.5 rounded-xl bg-card/80 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                <span>{t('attendanceSettings.workdayEffectiveNote')}</span>
                            </div>
                        )}

                        {/* Tombol Aksi Cepat pada Tanggal Terpilih */}
                        <div className="pt-1 flex flex-wrap items-center justify-end gap-2">
                            {selectedMobileDetails.dayHolidays.length > 0 ? (
                                (isSuperAdmin ||
                                    selectedMobileDetails.dayHolidays[0].schoolId !== null) && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onClickEditHoliday(selectedMobileDetails.dayHolidays[0])
                                        }
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 transition"
                                    >
                                        <Pencil size={12} />
                                        {t('attendanceSettings.btnEditHolidayNote')}
                                    </button>
                                )
                            ) : (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onClickAddHolidayOnDate(selectedMobileDetails.isoDate)
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                                >
                                    <Plus size={12} />
                                    {t('attendanceSettings.btnSetAsHoliday')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ====================================================================
                2. TAMPILAN KHUSUS KOMPUTER (>= 768px): KALENDER 12 BULAN
            ==================================================================== */}
            <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {monthNames.map((monthName, monthIndex) => {
                    const daysInMonth = new Date(
                        Date.UTC(year, monthIndex + 1, 0)
                    ).getUTCDate();
                    const firstDayOfWeek = new Date(
                        Date.UTC(year, monthIndex, 1)
                    ).getUTCDay();
                    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

                    const javaneseRangeLabel = getJavaneseMonthRangeLabel(
                        year,
                        monthIndex
                    );

                    const monthHolidays = holidays.filter((h) =>
                        h.date.startsWith(monthPrefix)
                    );

                    const calendarCells: Array<number | null> = [
                        ...Array.from({ length: firstDayOfWeek }, () => null),
                        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
                    ];

                    return (
                        <div
                            key={`${year}-${monthIndex}`}
                            className="rounded-2xl border border-border bg-card p-3.5 shadow-xs flex flex-col justify-between gap-3"
                        >
                            <div className="space-y-2.5">
                                {/* Header Bulan Masehi + Badge Jumlah Libur */}
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h4 className="text-sm font-bold text-foreground">
                                            {monthName} {year}
                                        </h4>
                                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mt-0.5">
                                            {javaneseRangeLabel}
                                        </p>
                                    </div>

                                    {monthHolidays.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-300 shrink-0">
                                            {t('attendanceSettings.holidayCountBadge', {
                                                count: monthHolidays.length,
                                            })}
                                        </span>
                                    )}
                                </div>

                                {/* Header Nama Hari */}
                                <div className="grid grid-cols-7 text-center border-b border-border/70 pb-1.5">
                                    {dayHeaders.map((dayLabel, dayIdx) => {
                                        const isSunday = dayIdx === 0;
                                        const isFriday = dayIdx === 5;
                                        const isSaturdayOff =
                                            dayIdx === 6 && workDaysMode === 'FIVE_DAYS';

                                        let headerColor = 'text-sky-600 dark:text-sky-400';
                                        if (isSunday || isSaturdayOff) {
                                            headerColor = 'text-red-500';
                                        } else if (
                                            isFriday &&
                                            CALENDAR_CONFIG.highlightFridayGreen
                                        ) {
                                            headerColor = 'text-emerald-600 dark:text-emerald-400';
                                        }

                                        return (
                                            <span
                                                key={dayLabel}
                                                className={`text-[11px] font-bold ${headerColor}`}
                                            >
                                                {dayLabel}
                                            </span>
                                        );
                                    })}
                                </div>

                                {/* Grid Tanggal Masehi + Tanggal Jawa & Pasaran */}
                                <div className="grid grid-cols-7 gap-0.5">
                                    {calendarCells.map((dayNum, cellIdx) => {
                                        if (dayNum === null) {
                                            return (
                                                <div
                                                    key={`empty-${monthIndex}-${cellIdx}`}
                                                    className="h-12"
                                                />
                                            );
                                        }

                                        const isoDate = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
                                        const dayOfWeek = cellIdx % 7;
                                        const isSunday = dayOfWeek === 0;
                                        const isFriday = dayOfWeek === 5;
                                        const isSaturdayOff =
                                            dayOfWeek === 6 && workDaysMode === 'FIVE_DAYS';
                                        const isWeekendOff = isSunday || isSaturdayOff;

                                        const dayHolidays = holidaysByDate.get(isoDate) ?? [];
                                        const hasHoliday = dayHolidays.length > 0;
                                        const isCutiBersamaOnly =
                                            hasHoliday &&
                                            dayHolidays.every((h) =>
                                                h.name.toLowerCase().includes('cuti bersama')
                                            );

                                        const isToday = isoDate === todayIso;
                                        const jawaInfo = getJavaneseDateInfo(isoDate);

                                        let cellBgClass =
                                            'hover:bg-muted/60 border-transparent';
                                        let dateNumberClass = 'text-foreground';

                                        if (hasHoliday && isCutiBersamaOnly) {
                                            cellBgClass =
                                                'bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25';
                                            dateNumberClass =
                                                'text-amber-700 dark:text-amber-300';
                                        } else if (hasHoliday || isWeekendOff) {
                                            cellBgClass =
                                                'bg-red-500/10 border-red-500/25 hover:bg-red-500/20';
                                            dateNumberClass = 'text-red-600 dark:text-red-400';
                                        } else if (
                                            isFriday &&
                                            CALENDAR_CONFIG.highlightFridayGreen
                                        ) {
                                            dateNumberClass =
                                                'text-emerald-600 dark:text-emerald-400';
                                        }

                                        if (isToday) {
                                            cellBgClass +=
                                                ' ring-2 ring-blue-500 bg-blue-500/10';
                                        }

                                        const tooltipText = hasHoliday
                                            ? `${jawaInfo.fullFormattedDate} — ${dayHolidays.map((h) => h.name).join(', ')}`
                                            : t('attendanceSettings.tooltipAddHoliday', {
                                                javaneseDate: jawaInfo.fullFormattedDate,
                                            });

                                        return (
                                            <button
                                                key={isoDate}
                                                type="button"
                                                title={tooltipText}
                                                onClick={() => {
                                                    if (hasHoliday) {
                                                        onClickEditHoliday(dayHolidays[0]);
                                                    } else {
                                                        onClickAddHolidayOnDate(isoDate);
                                                    }
                                                }}
                                                className={`h-12 rounded-xl border px-0 py-1 flex flex-col items-center justify-center transition cursor-pointer overflow-hidden ${cellBgClass}`}
                                            >
                                                <span
                                                    className={`text-sm font-extrabold leading-tight ${dateNumberClass}`}
                                                >
                                                    {dayNum}
                                                </span>

                                                {CALENDAR_CONFIG.showFullPasaranName ? (
                                                    <>
                                                        <span className="hidden sm:inline text-[8.5px] leading-tight font-medium text-muted-foreground tracking-tighter whitespace-nowrap">
                                                            {jawaInfo.shortJavaneseDate}
                                                        </span>
                                                        <span className="sm:hidden text-[9px] leading-tight font-medium text-muted-foreground tracking-tighter whitespace-nowrap">
                                                            {jawaInfo.compactJavaneseDate}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-[9px] leading-tight font-medium text-muted-foreground tracking-tighter whitespace-nowrap">
                                                        {jawaInfo.compactJavaneseDate}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Daftar Keterangan Hari Libur di Bagian Bawah Kartu Bulan */}
                            <div className="pt-2.5 border-t border-border/70 space-y-1.5">
                                {monthHolidays.length === 0 ? (
                                    <p className="text-[11px] italic text-muted-foreground">
                                        {t('attendanceSettings.noSpecialHolidayMonth')}
                                    </p>
                                ) : (
                                    monthHolidays.map((item) => {
                                        const dayOnly = Number(item.date.slice(8, 10));
                                        const canEdit =
                                            isSuperAdmin || item.schoolId !== null;
                                        const jawaItem = getJavaneseDateInfo(item.date);

                                        return (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between gap-2 text-[11px]"
                                            >
                                                <div className="min-w-0 truncate">
                                                    <span className="font-bold text-red-600 dark:text-red-400">
                                                        {dayOnly}
                                                    </span>{' '}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        ({jawaItem.shortJavaneseDate})
                                                    </span>
                                                    :{' '}
                                                    <span className="font-medium text-foreground">
                                                        {item.name}
                                                    </span>
                                                </div>

                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onClickEditHoliday(item)
                                                        }
                                                        className="p-1 rounded hover:bg-muted text-blue-600 shrink-0"
                                                        title={t('attendanceSettings.titleEditHoliday')}
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}