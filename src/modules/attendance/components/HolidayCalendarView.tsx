// src/modules/attendance/components/HolidayCalendarView.tsx
import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import type { WorkDaysMode, HolidayRecord } from '../utils/indonesianHolidays';
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

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
] as const;

const DAY_HEADERS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const;

// Pengaturan tampilan yang mudah disesuaikan
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
    const todayIso = useMemo(() => getTodayIsoLocal(), []);

    // Peta tanggal -> daftar hari libur untuk akses cepat O(1)
    const holidaysByDate = useMemo(() => {
        const map = new Map<string, HolidayRecord[]>();
        for (const h of holidays) {
            const list = map.get(h.date) ?? [];
            list.push(h);
            map.set(h.date, list);
        }
        return map;
    }, [holidays]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {MONTH_NAMES.map((monthName, monthIndex) => {
                const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
                const firstDayOfWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
                const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

                // Keterangan rentang bulan Jawa (contoh: "21 Jumadilawal 1960 Ja - 20 Jumadilakir 1960 Ja")
                const javaneseRangeLabel = getJavaneseMonthRangeLabel(year, monthIndex);

                // Kumpulkan daftar libur khusus pada bulan ini
                const monthHolidays = holidays.filter((h) => h.date.startsWith(monthPrefix));

                // Buat sel kosong sebelum tanggal 1 + seluruh tanggal dalam bulan ini
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
                                    {/* Sub-header Bulan & Tahun Jawa */}
                                    <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 mt-0.5">
                                        {javaneseRangeLabel}
                                    </p>
                                </div>

                                {monthHolidays.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-300 shrink-0">
                                        {monthHolidays.length} libur
                                    </span>
                                )}
                            </div>

                            {/* Header Nama Hari (Min s.d. Sab) */}
                            <div className="grid grid-cols-7 text-center border-b border-border/70 pb-1.5">
                                {DAY_HEADERS.map((dayLabel, dayIdx) => {
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

                                    // Penentuan warna latar & warna angka tanggal
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
                                        : `${jawaInfo.fullFormattedDate} (Klik untuk tambah libur)`;

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
                                            {/* Angka Tanggal Masehi */}
                                            <span
                                                className={`text-sm font-extrabold leading-tight ${dateNumberClass}`}
                                            >
                                                {dayNum}
                                            </span>

                                            {/* Tanggal Jawa + Pasaran (contoh: "21 Pahing") */}
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
                                    Tidak ada tanggal merah khusus bulan ini.
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
                                                    title="Edit hari libur ini"
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
    );
}