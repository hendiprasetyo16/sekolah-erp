// src/modules/attendance/components/HolidayCalendarView.tsx
import { useMemo } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { WorkDaysMode, HolidayRecord } from '../utils/indonesianHolidays';
import {
    BULAN_INDONESIA,
    buildMonthCalendarCells,
} from '../utils/javaneseCalendar';

interface HolidayCalendarViewProps {
    year: number;
    holidays: HolidayRecord[];
    workDaysMode: WorkDaysMode;
    isSuperAdmin: boolean;
    onClickEditHoliday: (holiday: HolidayRecord) => void;
    onClickAddHolidayOnDate: (isoDate: string) => void;
}

const HEADER_HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function HolidayCalendarView({
    year,
    holidays,
    workDaysMode,
    isSuperAdmin,
    onClickEditHoliday,
    onClickAddHolidayOnDate,
}: HolidayCalendarViewProps) {
    // Peta tanggal -> daftar hari libur pada tanggal tersebut
    const holidayByDateMap = useMemo(() => {
        const map = new Map<string, HolidayRecord[]>();
        for (const h of holidays) {
            const existing = map.get(h.date) ?? [];
            existing.push(h);
            map.set(h.date, existing);
        }
        return map;
    }, [holidays]);

    const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

    return (
        <div className="space-y-4">
            {/* Legenda Warna & Petunjuk Klik */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500 inline-block" />
                        <span>Libur Nasional / Sekolah</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500 inline-block" />
                        <span>Cuti Bersama</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="font-bold text-red-500">Min</span>
                        <span>
                            {workDaysMode === 'FIVE_DAYS'
                                ? '& Sab (Akhir Pekan Libur)'
                                : '(Libur Mingguan)'}
                        </span>
                    </span>
                </div>
                <span className="text-muted-foreground">
                    Klik tanggal di kalender untuk <strong>Tambah</strong> atau <strong>Edit</strong> libur
                </span>
            </div>

            {/* Grid 12 Bulan (Januari - Desember) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {BULAN_INDONESIA.map((monthName, monthIdx) => {
                    const cells = buildMonthCalendarCells(year, monthIdx);
                    const monthPrefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
                    const monthHolidays = holidays.filter((h) =>
                        h.date.startsWith(monthPrefix)
                    );

                    return (
                        <div
                            key={monthName}
                            className="rounded-xl border border-border bg-card p-3.5 shadow-sm flex flex-col justify-between space-y-3"
                        >
                            <div>
                                {/* Header Nama Bulan */}
                                <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                                    <h4 className="text-xs font-bold text-foreground">
                                        {monthName} {year}
                                    </h4>
                                    {monthHolidays.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-600 dark:text-red-300">
                                            {monthHolidays.length} libur
                                        </span>
                                    )}
                                </div>

                                {/* Nama Hari (Min - Sab) */}
                                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                                    {HEADER_HARI_SINGKAT.map((hari, idx) => {
                                        const isWeekendHeader =
                                            idx === 0 || (workDaysMode === 'FIVE_DAYS' && idx === 6);
                                        return (
                                            <div
                                                key={hari}
                                                className={`text-[10px] font-bold py-0.5 ${isWeekendHeader
                                                        ? 'text-red-500'
                                                        : 'text-muted-foreground'
                                                    }`}
                                            >
                                                {hari}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Sel Tanggal + Pasaran Jawa */}
                                <div className="grid grid-cols-7 gap-1">
                                    {cells.map((cell, cellIdx) => {
                                        if (!cell) {
                                            return <div key={`empty-${cellIdx}`} className="h-11" />;
                                        }

                                        const dayHolidays = holidayByDateMap.get(cell.isoDate) ?? [];
                                        const hasHoliday = dayHolidays.length > 0;
                                        const isCuti =
                                            hasHoliday &&
                                            dayHolidays.some((h) =>
                                                h.name.toLowerCase().includes('cuti bersama')
                                            );
                                        const isWeekend =
                                            cell.dayOfWeek === 0 ||
                                            (workDaysMode === 'FIVE_DAYS' && cell.dayOfWeek === 6);
                                        const isToday = cell.isoDate === todayIso;

                                        const tooltipText = hasHoliday
                                            ? `${cell.fullFormattedDate} — ${dayHolidays.map((h) => h.name).join(', ')}`
                                            : `${cell.fullFormattedDate} (Klik untuk tambah libur)`;

                                        const handleCellClick = () => {
                                            if (hasHoliday) {
                                                const editable = dayHolidays.find(
                                                    (h) => isSuperAdmin || h.schoolId !== null
                                                );
                                                if (editable) {
                                                    onClickEditHoliday(editable);
                                                } else {
                                                    onClickAddHolidayOnDate(cell.isoDate);
                                                }
                                            } else {
                                                onClickAddHolidayOnDate(cell.isoDate);
                                            }
                                        };

                                        return (
                                            <button
                                                key={cell.isoDate}
                                                type="button"
                                                onClick={handleCellClick}
                                                title={tooltipText}
                                                className={`h-11 rounded-lg border flex flex-col items-center justify-center transition relative group ${hasHoliday
                                                        ? isCuti
                                                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-800 dark:text-amber-200 font-bold hover:bg-amber-500/30'
                                                            : 'bg-red-500/20 border-red-500/60 text-red-700 dark:text-red-200 font-bold hover:bg-red-500/30'
                                                        : isWeekend
                                                            ? 'border-transparent bg-red-500/5 text-red-500 hover:border-border'
                                                            : 'border-transparent hover:border-border hover:bg-muted/50'
                                                    } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                                            >
                                                <span className="text-xs leading-tight">
                                                    {cell.dayNumber}
                                                </span>
                                                <span
                                                    className={`text-[9px] leading-none mt-0.5 ${hasHoliday || isWeekend
                                                            ? 'opacity-85 font-semibold'
                                                            : 'text-muted-foreground'
                                                        }`}
                                                >
                                                    {cell.pasaranShort}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Catatan Keterangan Libur Bulan Ini */}
                            <div className="pt-2 border-t border-border/70 space-y-1 min-h-10">
                                {monthHolidays.length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Tidak ada tanggal merah khusus bulan ini.
                                    </p>
                                ) : (
                                    monthHolidays.map((h) => {
                                        const canEdit = isSuperAdmin || h.schoolId !== null;
                                        const dayNum = Number(h.date.slice(8, 10));
                                        return (
                                            <div
                                                key={h.id}
                                                className="flex items-center justify-between gap-1.5 text-[10px]"
                                            >
                                                <span className="truncate">
                                                    <strong className="text-red-500 font-mono">
                                                        {String(dayNum).padStart(2, '0')}:
                                                    </strong>{' '}
                                                    {h.name}
                                                </span>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onClickEditHoliday(h)}
                                                        className="p-0.5 text-blue-600 hover:bg-blue-500/15 rounded shrink-0"
                                                        title="Edit tanggal merah ini"
                                                    >
                                                        <Pencil size={11} />
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