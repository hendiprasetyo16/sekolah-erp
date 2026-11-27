// src/modules/attendance/components/AttendanceSettingsTab.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Clock,
    CalendarDays,
    FileSpreadsheet,
    Download,
    Upload,
    Plus,
    Trash2,
    Save,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Globe,
    Building2,
    Briefcase,
    Server,
    Moon,
    Loader2,
    Pencil,
    List,
    Calendar,
    X,
    Camera,
    MapPin,
    Monitor,
    GraduationCap,
    MessageSquare,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import type { WorkDaysMode, HolidayRecord } from '../utils/indonesianHolidays';
import {
    downloadHolidayExcelTemplate,
    parseHolidaySpreadsheetFile,
    type ParsedHolidayRow,
} from '../utils/excelHolidayParser';
import {
    fetchHolidaysFromServer,
    HOLIDAY_API_PROVIDER_OPTIONS,
    type HolidayApiProviderId,
    type CalendarReferenceMode,
} from '../utils/holidayApiService';
import { getJavaneseDateInfo } from '../utils/javaneseCalendar';
import { HolidayCalendarView } from './HolidayCalendarView';
import { StudentAttendanceSettingsCard } from './StudentAttendanceSettingsCard';
import { TeacherDesktopAccessCard } from './TeacherDesktopAccessCard';
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard';

// ============================================================================
// KONSTANTA & PARAMETER YANG BISA KAMU SESUAIKAN
// ============================================================================
type AttendanceSettingsSubTab =
    | 'GURU_SCHEDULE'
    | 'GURU_DESKTOP'
    | 'SISWA'
    | 'HOLIDAYS'
    | 'WHATSAPP';

const DEFAULT_SUB_TAB: AttendanceSettingsSubTab = 'GURU_SCHEDULE';
const CUSTOM_YEARS_STORAGE_KEY = 'sekolah_erp_holiday_custom_years';
const INITIAL_BASE_YEARS = [2026, 2027, 2028];
const DEFAULT_HOLIDAY_VIEW_MODE: 'LIST' | 'CALENDAR' = 'CALENDAR';
const UPDATE_CHUNK_SIZE = 20;
const INSERT_CHUNK_SIZE = 100;

// ============================================================================
// TEMA TOMBOL MODERN TERPUSAT
// ============================================================================
const BTN_STYLE = {
    primaryEmerald:
        'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm shadow-emerald-600/20 hover:shadow-md hover:shadow-emerald-600/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    primaryBlue:
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    secondary:
        'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs hover:shadow-xs active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    secondaryCompact:
        'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    danger:
        'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-sm shadow-red-600/20 hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    dangerOutline:
        'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 active:scale-[0.98] transition-all duration-200 cursor-pointer',
} as const;

function chunkList<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function calculateEffectiveDeadline(
    startTime: string,
    toleranceMinutes: number
): string {
    const [hStr, mStr] = startTime.split(':');
    const h = Number(hStr) || 7;
    const m = Number(mStr) || 0;
    const safeTolerance = Math.max(0, Math.floor(Number(toleranceMinutes) || 0));
    const totalMinutes = Math.min(23 * 60 + 59, h * 60 + m + safeTolerance);
    const finalH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const finalM = String(totalMinutes % 60).padStart(2, '0');
    return `${finalH}:${finalM}`;
}

function isMissingColumnError(err: unknown): boolean {
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    const code = String((err as { code?: string })?.code ?? '');
    return (
        code === 'PGRST204' ||
        code === '42703' ||
        msg.includes('schema cache') ||
        (msg.includes('column') && msg.includes('does not exist'))
    );
}

export function AttendanceSettingsTab() {
    const { t } = useTranslation();
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isAdmin = user?.role === 'ADMIN';
    const canManage = isSuperAdmin || isAdmin;

    const [activeSubTab, setActiveSubTab] =
        useState<AttendanceSettingsSubTab>(DEFAULT_SUB_TAB);

    const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
        school?.id ?? ''
    );

    const [workStartTime, setWorkStartTime] = useState<string>('07:30');
    const [lateToleranceMinutes, setLateToleranceMinutes] = useState<number>(0);
    const [workEndTime, setWorkEndTime] = useState<string>('14:30');
    const [workDaysMode, setWorkDaysMode] = useState<WorkDaysMode>('SIX_DAYS');
    const [requireSelfieCheckIn, setRequireSelfieCheckIn] = useState<boolean>(true);
    const [requireSelfieCheckOut, setRequireSelfieCheckOut] = useState<boolean>(true);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);
    const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

    const [filterYear, setFilterYear] = useState<number>(() =>
        new Date().getFullYear()
    );
    const [customYears, setCustomYears] = useState<number[]>(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_YEARS_STORAGE_KEY);
            const parsed: unknown = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed)
                ? parsed.filter((n): n is number => typeof n === 'number')
                : [];
        } catch {
            return [];
        }
    });
    const [dbRecordedYears, setDbRecordedYears] = useState<number[]>([]);
    const [selectedApiProvider, setSelectedApiProvider] =
        useState<HolidayApiProviderId>('AUTO');
    const [calendarRefMode, setCalendarRefMode] =
        useState<CalendarReferenceMode>('MUHAMMADIYAH');
    const [includeCutiFromServer, setIncludeCutiFromServer] =
        useState<boolean>(true);
    const [includeAwalRamadan, setIncludeAwalRamadan] = useState<boolean>(true);
    const [isFetchingServer, setIsFetchingServer] = useState<boolean>(false);

    const [syncFeedback, setSyncFeedback] = useState<{
        status: 'loading' | 'success' | 'error';
        text: string;
    } | null>(null);

    const [holidayScope, setHolidayScope] = useState<'GLOBAL' | 'SCHOOL'>(
        isSuperAdmin ? 'GLOBAL' : 'SCHOOL'
    );
    const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState<boolean>(false);

    const [holidayViewMode, setHolidayViewMode] = useState<'LIST' | 'CALENDAR'>(
        DEFAULT_HOLIDAY_VIEW_MODE
    );

    const [selectedHolidayIds, setSelectedHolidayIds] = useState<string[]>([]);

    const [editingHoliday, setEditingHoliday] = useState<HolidayRecord | null>(
        null
    );
    const [editDateInput, setEditDateInput] = useState<string>('');
    const [editNameInput, setEditNameInput] = useState<string>('');
    const [editModalError, setEditModalError] = useState<string | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
        title: string;
        description: string;
        targetIds: string[];
    } | null>(null);
    const [isDeletingHolidays, setIsDeletingHolidays] = useState<boolean>(false);

    const [newHolidayDate, setNewHolidayDate] = useState<string>('');
    const [newHolidayName, setNewHolidayName] = useState<string>('');
    const [isAddingHoliday, setIsAddingHoliday] = useState<boolean>(false);

    const [previewRows, setPreviewRows] = useState<ParsedHolidayRow[]>([]);
    const [previewSourceLabel, setPreviewSourceLabel] = useState<string>('');
    const [isImporting, setIsImporting] = useState<boolean>(false);

    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback(
        (type: 'success' | 'error', message: string) => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
            setToast({ type, message });
            toastTimeoutRef.current = setTimeout(() => {
                setToast(null);
                toastTimeoutRef.current = null;
            }, 5500);
        },
        []
    );

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    // Tutup modal dengan tombol Escape saat tidak sedang memproses simpan/hapus
    useEffect(() => {
        if (!editingHoliday && !deleteConfirmModal) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (editingHoliday && !isSavingEdit) {
                setEditingHoliday(null);
                setEditModalError(null);
            } else if (deleteConfirmModal && !isDeletingHolidays) {
                setDeleteConfirmModal(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingHoliday, isSavingEdit, deleteConfirmModal, isDeletingHolidays]);

    useEffect(() => {
        if (school?.id) {
            setSelectedSchoolId(school.id);
        }
    }, [school?.id]);

    useEffect(() => {
        if (!isSuperAdmin) return;
        supabase
            .from('schools')
            .select('id, name')
            .order('name')
            .then(({ data }) => {
                const list = data ?? [];
                setSchools(list);
                if (!school?.id && list.length > 0) {
                    setSelectedSchoolId(list[0].id);
                }
            });
    }, [isSuperAdmin, school?.id]);

    const loadScheduleSettings = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoadingSchedule(true);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select('*')
                .eq('id', selectedSchoolId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setWorkStartTime(data.workStartTime || '07:30');
                setLateToleranceMinutes(
                    Math.max(0, Number(data.lateToleranceMinutes) || 0)
                );
                setWorkEndTime(data.workEndTime || '14:30');
                setWorkDaysMode(
                    data.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS'
                );
                setRequireSelfieCheckIn(
                    typeof data.requireSelfieCheckIn === 'boolean'
                        ? data.requireSelfieCheckIn
                        : true
                );
                setRequireSelfieCheckOut(
                    typeof data.requireSelfieCheckOut === 'boolean'
                        ? data.requireSelfieCheckOut
                        : true
                );
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : t('attendanceSettings.errLoadSchedule');
            showToast('error', msg);
        } finally {
            setIsLoadingSchedule(false);
        }
    }, [selectedSchoolId, showToast, t]);

    useEffect(() => {
        void loadScheduleSettings();
    }, [loadScheduleSettings]);

    const effectiveDeadlinePreview = useMemo(
        () => calculateEffectiveDeadline(workStartTime, lateToleranceMinutes),
        [workStartTime, lateToleranceMinutes]
    );

    const availableYears = useMemo(() => {
        const yearsSet = new Set<number>([
            ...INITIAL_BASE_YEARS,
            ...dbRecordedYears,
            ...customYears,
            filterYear,
        ]);
        return Array.from(yearsSet).sort((a, b) => a - b);
    }, [dbRecordedYears, customYears, filterYear]);

    const handleAddNextYear = () => {
        const maxYear =
            availableYears.length > 0
                ? Math.max(...availableYears)
                : new Date().getFullYear();
        const nextYear = maxYear + 1;

        setCustomYears((prev) => {
            const updated = Array.from(new Set([...prev, nextYear])).sort(
                (a, b) => a - b
            );
            try {
                localStorage.setItem(CUSTOM_YEARS_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // abaikan jika storage penuh
            }
            return updated;
        });

        setFilterYear(nextYear);
        setSyncFeedback({
            status: 'success',
            text: t('attendanceSettings.feedbackNextYearAdded', {
                year: nextYear,
            }),
        });
    };

    const handleSaveSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSchoolId) {
            showToast('error', t('attendanceSettings.toastSelectSchool'));
            return;
        }

        const cleanTolerance = Math.max(
            0,
            Math.min(180, Math.floor(Number(lateToleranceMinutes) || 0))
        );

        setIsSavingSchedule(true);
        try {
            const { error } = await supabase
                .from('schools')
                .update({
                    workStartTime,
                    lateToleranceMinutes: cleanTolerance,
                    workEndTime,
                    workDaysMode,
                    requireSelfieCheckIn,
                    requireSelfieCheckOut,
                })
                .eq('id', selectedSchoolId);

            if (error) {
                if (isMissingColumnError(error)) {
                    const retry = await supabase
                        .from('schools')
                        .update({
                            workStartTime,
                            lateToleranceMinutes: cleanTolerance,
                            workEndTime,
                            workDaysMode,
                        })
                        .eq('id', selectedSchoolId);

                    if (retry.error) throw retry.error;
                    showToast(
                        'error',
                        t('attendanceSettings.toastPartialScheduleSaved')
                    );
                    return;
                }
                throw error;
            }

            setLateToleranceMinutes(cleanTolerance);
            const selfieSummary = `${t('attendanceSettings.selfieCheckInTitle')}: ${requireSelfieCheckIn
                ? t('attendanceSettings.selfieActiveShort')
                : t('attendanceSettings.selfieInactiveShort')
                }, ${t('attendanceSettings.selfieCheckOutTitle')}: ${requireSelfieCheckOut
                    ? t('attendanceSettings.selfieActiveShort')
                    : t('attendanceSettings.selfieInactiveShort')
                }`;

            showToast(
                'success',
                cleanTolerance > 0
                    ? t('attendanceSettings.toastScheduleSavedWithTolerance', {
                        start: workStartTime,
                        tolerance: cleanTolerance,
                        end: workEndTime,
                        selfie: selfieSummary,
                    })
                    : t('attendanceSettings.toastScheduleSavedNoTolerance', {
                        start: workStartTime,
                        end: workEndTime,
                        selfie: selfieSummary,
                    })
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error
                    ? err.message
                    : t('attendanceSettings.errSaveSchedule')
            );
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const loadHolidays = useCallback(async () => {
        setIsLoadingHolidays(true);
        setSelectedHolidayIds([]);
        try {
            let query = supabase
                .from('national_holidays')
                .select('id, schoolId, date, name')
                .gte('date', `${filterYear}-01-01`)
                .lte('date', `${filterYear}-12-31`)
                .order('date', { ascending: true });

            if (selectedSchoolId) {
                query = query.or(
                    `schoolId.eq.${selectedSchoolId},schoolId.is.null`
                );
            } else {
                query = query.is('schoolId', null);
            }

            const { data, error } = await query;
            if (error) throw error;
            setHolidays((data ?? []) as HolidayRecord[]);

            // Filter schoolId yang sama agar tahun libur kustom lintas sekolah tidak bocor
            let yearsQuery = supabase.from('national_holidays').select('date');
            if (selectedSchoolId) {
                yearsQuery = yearsQuery.or(
                    `schoolId.eq.${selectedSchoolId},schoolId.is.null`
                );
            } else {
                yearsQuery = yearsQuery.is('schoolId', null);
            }

            const { data: allDates } = await yearsQuery;
            if (allDates) {
                const yearsInDb = Array.from(
                    new Set(
                        allDates
                            .map((r: { date: string }) => Number(String(r.date).slice(0, 4)))
                            .filter((y) => Number.isFinite(y) && y > 2000)
                    )
                );
                setDbRecordedYears(yearsInDb);
            }
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error
                    ? err.message
                    : t('attendanceSettings.errLoadHolidays')
            );
        } finally {
            setIsLoadingHolidays(false);
        }
    }, [filterYear, selectedSchoolId, showToast, t]);

    useEffect(() => {
        void loadHolidays();
    }, [loadHolidays]);

    const resolvedHolidaySchoolId =
        isSuperAdmin && holidayScope === 'GLOBAL' ? null : selectedSchoolId || null;

    const upsertHolidayRows = async (rows: ParsedHolidayRow[]) => {
        const validRows = rows.filter(
            (r) => r.date.trim().length === 10 && r.name.trim().length > 0
        );
        if (validRows.length === 0) return;

        if ((!isSuperAdmin || holidayScope === 'SCHOOL') && !resolvedHolidaySchoolId) {
            throw new Error(t('attendanceSettings.errSchoolNotFound'));
        }

        // Deduplikasi tanggal dalam satu batch input (baris terakhir menang)
        const deduplicatedMap = new Map<string, ParsedHolidayRow>();
        for (const row of validRows) {
            deduplicatedMap.set(row.date, row);
        }
        const uniqueRows = Array.from(deduplicatedMap.values());

        let existingQuery = supabase
            .from('national_holidays')
            .select('id, date');

        if (resolvedHolidaySchoolId === null) {
            existingQuery = existingQuery.is('schoolId', null);
        } else {
            existingQuery = existingQuery.eq('schoolId', resolvedHolidaySchoolId);
        }

        const { data: existingList, error: fetchErr } = await existingQuery;
        if (fetchErr) throw fetchErr;

        const existingMap = new Map<string, string>();
        for (const item of existingList ?? []) {
            existingMap.set(item.date, item.id);
        }

        const toUpdate: Array<{ id: string; name: string }> = [];
        const toInsert: Array<{
            schoolId: string | null;
            date: string;
            name: string;
            createdBy: string | null;
        }> = [];

        for (const row of uniqueRows) {
            const existingId = existingMap.get(row.date);
            if (existingId) {
                toUpdate.push({ id: existingId, name: row.name.trim() });
            } else {
                toInsert.push({
                    schoolId: resolvedHolidaySchoolId,
                    date: row.date,
                    name: row.name.trim(),
                    createdBy: user?.id ?? null,
                });
            }
        }

        for (const updateBatch of chunkList(toUpdate, UPDATE_CHUNK_SIZE)) {
            const results = await Promise.all(
                updateBatch.map((item) =>
                    supabase
                        .from('national_holidays')
                        .update({ name: item.name })
                        .eq('id', item.id)
                )
            );
            const failed = results.find((res) => res.error);
            if (failed?.error) throw failed.error;
        }

        for (const insertBatch of chunkList(toInsert, INSERT_CHUNK_SIZE)) {
            const { error: insErr } = await supabase
                .from('national_holidays')
                .insert(insertBatch);
            if (insErr) throw insErr;
        }
    };

    const handleFetchFromServer = async () => {
        setIsFetchingServer(true);
        setSyncFeedback({
            status: 'loading',
            text: t('attendanceSettings.feedbackFetchingServer', {
                year: filterYear,
            }),
        });

        try {
            const { rows, usedProviderLabel } = await fetchHolidaysFromServer({
                year: filterYear,
                includeCutiBersama: includeCutiFromServer,
                providerId: selectedApiProvider,
                calendarMode: calendarRefMode,
                includeAwalRamadan:
                    calendarRefMode === 'MUHAMMADIYAH' && includeAwalRamadan,
                onProgress: (statusText) => {
                    setSyncFeedback({ status: 'loading', text: statusText });
                },
            });

            setPreviewRows(rows);
            setPreviewSourceLabel(
                t('attendanceSettings.feedbackPreviewSourceServer', {
                    provider: usedProviderLabel,
                    year: filterYear,
                })
            );
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackFetchedSuccess', {
                    count: rows.length,
                    provider: usedProviderLabel,
                }),
            });
        } catch (err: unknown) {
            const errMsg =
                err instanceof Error
                    ? err.message
                    : t('attendanceSettings.errFetchServer');
            setSyncFeedback({
                status: 'error',
                text: errMsg,
            });
        } finally {
            setIsFetchingServer(false);
        }
    };

    const handleAddSingleHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanName = newHolidayName.trim();
        if (!newHolidayDate || cleanName.length < 3) {
            setSyncFeedback({
                status: 'error',
                text: t('attendanceSettings.errEmptySingleHoliday'),
            });
            return;
        }

        setIsAddingHoliday(true);
        try {
            await upsertHolidayRows([
                {
                    date: newHolidayDate,
                    name: cleanName,
                    type: cleanName.toLowerCase().includes('cuti bersama')
                        ? 'CUTI_BERSAMA'
                        : 'SEKOLAH',
                },
            ]);
            const addedYear = Number(newHolidayDate.slice(0, 4));
            if (Number.isFinite(addedYear)) setFilterYear(addedYear);
            setNewHolidayDate('');
            setNewHolidayName('');
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackSingleAdded'),
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errAddSingleHoliday'),
            });
        } finally {
            setIsAddingHoliday(false);
        }
    };

    const handleOpenEditModal = (item: HolidayRecord) => {
        if (!isSuperAdmin && item.schoolId === null) {
            setSyncFeedback({
                status: 'error',
                text: t('attendanceSettings.errGlobalHolidayAdminOnly'),
            });
            return;
        }
        setEditingHoliday(item);
        setEditDateInput(item.date);
        setEditNameInput(item.name);
        setEditModalError(null);
    };

    const handleSaveEditHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingHoliday) return;
        const cleanName = editNameInput.trim();
        if (!editDateInput || cleanName.length < 3) {
            const validationMsg = t('attendanceSettings.errEmptySingleHoliday');
            setEditModalError(validationMsg);
            setSyncFeedback({
                status: 'error',
                text: validationMsg,
            });
            return;
        }

        setEditModalError(null);
        setIsSavingEdit(true);
        try {
            const { error } = await supabase
                .from('national_holidays')
                .update({
                    date: editDateInput,
                    name: cleanName,
                })
                .eq('id', editingHoliday.id);

            if (error) throw error;
            setEditingHoliday(null);
            setEditModalError(null);
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackEditSaved', {
                    name: cleanName,
                }),
            });
        } catch (err: unknown) {
            const errMsg =
                err instanceof Error
                    ? err.message
                    : t('attendanceSettings.errUpdateHoliday');
            setEditModalError(errMsg);
            setSyncFeedback({
                status: 'error',
                text: errMsg,
            });
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleSelectExcelFile = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        try {
            const parsed = await parseHolidaySpreadsheetFile(file);
            if (parsed.length === 0) {
                setSyncFeedback({
                    status: 'error',
                    text: t('attendanceSettings.errInvalidSpreadsheet'),
                });
                return;
            }
            setPreviewRows(parsed);
            setPreviewSourceLabel(
                t('attendanceSettings.feedbackPreviewSourceFile', {
                    fileName: file.name,
                })
            );
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackFileReadSuccess', {
                    count: parsed.length,
                    fileName: file.name,
                }),
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errReadSpreadsheet'),
            });
        }
    };

    const handleConfirmBatchSave = async () => {
        if (previewRows.length === 0) return;
        setIsImporting(true);
        try {
            const countSaved = previewRows.length;
            await upsertHolidayRows(previewRows);
            const importedYear = Number(previewRows[0].date.slice(0, 4));
            if (Number.isFinite(importedYear)) {
                setFilterYear(importedYear);
            }
            setPreviewRows([]);
            setPreviewSourceLabel('');
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackBatchSaved', {
                    count: countSaved,
                }),
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errSaveBatch'),
            });
        } finally {
            setIsImporting(false);
        }
    };

    const deletableHolidays = useMemo(
        () => holidays.filter((item) => isSuperAdmin || item.schoolId !== null),
        [holidays, isSuperAdmin]
    );

    const isAllSelected =
        deletableHolidays.length > 0 &&
        deletableHolidays.every((h) => selectedHolidayIds.includes(h.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedHolidayIds([]);
        } else {
            setSelectedHolidayIds(deletableHolidays.map((h) => h.id));
        }
    };

    const toggleSelectOne = (id: string) => {
        setSelectedHolidayIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleConfirmDeleteExecution = async () => {
        if (!deleteConfirmModal || deleteConfirmModal.targetIds.length === 0) {
            return;
        }

        setIsDeletingHolidays(true);
        try {
            for (const idChunk of chunkList(deleteConfirmModal.targetIds, 100)) {
                const { error } = await supabase
                    .from('national_holidays')
                    .delete()
                    .in('id', idChunk);
                if (error) throw error;
            }

            const deletedCount = deleteConfirmModal.targetIds.length;
            setDeleteConfirmModal(null);
            setSelectedHolidayIds([]);
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: t('attendanceSettings.feedbackDeletedCount', {
                    count: deletedCount,
                }),
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errDeleteHolidays'),
            });
        } finally {
            setIsDeletingHolidays(false);
        }
    };

    if (!canManage) return null;

    const subTabs: Array<{
        id: AttendanceSettingsSubTab;
        label: string;
        shortLabel: string;
        icon: typeof Clock;
        activeClass: string;
    }> = [
            {
                id: 'GURU_SCHEDULE',
                label: t('attendanceSettings.tabGuruSchedule'),
                shortLabel: t('attendanceSettings.tabGuruScheduleShort'),
                icon: Clock,
                activeClass: 'bg-emerald-600 text-white shadow-xs',
            },
            {
                id: 'GURU_DESKTOP',
                label: t('attendanceSettings.tabGuruDesktop'),
                shortLabel: t('attendanceSettings.tabGuruDesktopShort'),
                icon: Monitor,
                activeClass: 'bg-blue-600 text-white shadow-xs',
            },
            {
                id: 'SISWA',
                label: t('attendanceSettings.tabStudent'),
                shortLabel: t('attendanceSettings.tabStudentShort'),
                icon: GraduationCap,
                activeClass: 'bg-indigo-600 text-white shadow-xs',
            },
            {
                id: 'HOLIDAYS',
                label: t('attendanceSettings.tabHolidays', {
                    count: holidays.length,
                }),
                shortLabel: t('attendanceSettings.tabHolidaysShort', {
                    count: holidays.length,
                }),
                icon: CalendarDays,
                activeClass: 'bg-rose-600 text-white shadow-xs',
            },
            {
                id: 'WHATSAPP',
                label: t('attendanceSettings.tabWhatsapp'),
                shortLabel: t('attendanceSettings.tabWhatsappShort'),
                icon: MessageSquare,
                activeClass: 'bg-teal-600 text-white shadow-xs',
            },
        ];

    return (
        <div className="space-y-5">
            {/* Toast Notifikasi Atas */}
            {toast && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${toast.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                        : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
                        }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : (
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    )}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Pemilih Sekolah Khusus SUPER_ADMIN */}
            {isSuperAdmin && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold text-purple-700 dark:text-purple-300">
                            {t('attendanceSettings.superAdminTitle')}
                        </p>
                        <p className="text-[11px] opacity-75">
                            {t('attendanceSettings.superAdminSubtitle')}
                        </p>
                    </div>
                    <select
                        className="form-input w-auto! min-w-60 text-xs py-2"
                        value={selectedSchoolId}
                        onChange={(e) => setSelectedSchoolId(e.target.value)}
                    >
                        {schools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* ====================================================================
                NAVIGASI 5 SUB-TAB HORIZONTAL
            ==================================================================== */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-1.5 rounded-2xl border border-border bg-muted/40">
                {subTabs.map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activeSubTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${isActive
                                ? tab.activeClass
                                : 'text-muted-foreground hover:text-foreground hover:bg-card/70'
                                }`}
                        >
                            <IconComponent size={15} className="shrink-0" />
                            <span className="hidden sm:inline truncate">{tab.label}</span>
                            <span className="sm:hidden truncate">{tab.shortLabel}</span>
                        </button>
                    );
                })}
            </div>

            {/* ====================================================================
                SUB-TAB 1: JAM KERJA, VERIFIKASI SELFIE, & SISTEM HARI KERJA (GURU)
            ==================================================================== */}
            {activeSubTab === 'GURU_SCHEDULE' && (
                <form
                    onSubmit={handleSaveSchedule}
                    className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
                >
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <div>
                            <h2 className="text-base font-bold flex items-center gap-2">
                                <Clock size={18} className="text-emerald-600" />
                                {t('attendanceSettings.scheduleTitle')}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {t('attendanceSettings.scheduleSubtitle')}
                            </p>
                        </div>
                        {isLoadingSchedule && <RefreshCw size={16} className="spin opacity-60" />}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold mb-1.5">
                                {t('attendanceSettings.workStartLabel')}
                            </label>
                            <input
                                type="time"
                                required
                                value={workStartTime}
                                onChange={(e) => setWorkStartTime(e.target.value)}
                                className="form-input w-full text-sm font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {t('attendanceSettings.workStartHint')}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold mb-1.5">
                                {t('attendanceSettings.lateToleranceLabel')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={180}
                                step={1}
                                value={lateToleranceMinutes}
                                onChange={(e) =>
                                    setLateToleranceMinutes(
                                        e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                                    )
                                }
                                placeholder="0"
                                className="form-input w-full text-sm font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {t('attendanceSettings.lateToleranceHintPrefix')}
                                <strong>0</strong>
                                {t('attendanceSettings.lateToleranceHintSuffix')}
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold mb-1.5">
                                {t('attendanceSettings.workEndLabel')}
                            </label>
                            <input
                                type="time"
                                required
                                value={workEndTime}
                                onChange={(e) => setWorkEndTime(e.target.value)}
                                className="form-input w-full text-sm font-mono"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {t('attendanceSettings.workEndHint')}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                            {lateToleranceMinutes > 0 ? (
                                <>
                                    {t('attendanceSettings.toleranceActivePrefix')}
                                    <strong>
                                        {t('attendanceSettings.toleranceActiveMinutes', {
                                            minutes: lateToleranceMinutes,
                                        })}
                                    </strong>
                                    {t('attendanceSettings.toleranceActiveMid1')}
                                    <strong className="font-mono text-emerald-700 dark:text-emerald-300">
                                        {effectiveDeadlinePreview}
                                    </strong>
                                    {t('attendanceSettings.toleranceActiveMid2')}
                                    <strong>{t('attendanceSettings.statusPresent')}</strong>
                                    {t('attendanceSettings.toleranceActiveMid3')}
                                    <strong className="font-mono text-amber-700 dark:text-amber-300">
                                        {effectiveDeadlinePreview}
                                    </strong>
                                    {t('attendanceSettings.toleranceActiveMid4')}
                                    <strong>{t('attendanceSettings.statusLate')}</strong>.
                                </>
                            ) : (
                                <>
                                    {t('attendanceSettings.noTolerancePrefix')}
                                    <strong className="font-mono text-emerald-700 dark:text-emerald-300">
                                        {workStartTime}
                                    </strong>
                                    {t('attendanceSettings.noToleranceMid')}
                                    <strong>{t('attendanceSettings.statusLate')}</strong>.
                                </>
                            )}
                        </span>
                    </div>

                    {/* Pengaturan Verifikasi Kamera Selfie */}
                    <div className="space-y-2.5 pt-1">
                        <div>
                            <label className="block text-xs font-semibold">
                                {t('attendanceSettings.selfieSectionLabel')}
                            </label>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                {t('attendanceSettings.selfieSectionHint')}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div
                                onClick={() => setRequireSelfieCheckIn((prev) => !prev)}
                                role="switch"
                                aria-checked={requireSelfieCheckIn}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setRequireSelfieCheckIn((prev) => !prev);
                                    }
                                }}
                                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-start justify-between gap-3 select-none active:scale-[0.99] ${requireSelfieCheckIn
                                    ? 'border-emerald-600/70 bg-emerald-500/10 shadow-2xs'
                                    : 'border-border bg-muted/25 hover:bg-muted/40'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`p-2 rounded-lg shrink-0 mt-0.5 ${requireSelfieCheckIn
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                            }`}
                                    >
                                        {requireSelfieCheckIn ? <Camera size={16} /> : <MapPin size={16} />}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">
                                            {t('attendanceSettings.selfieCheckInTitle')}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            {requireSelfieCheckIn
                                                ? t('attendanceSettings.selfieCheckInActive')
                                                : t('attendanceSettings.selfieCheckInInactive')}
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${requireSelfieCheckIn ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${requireSelfieCheckIn ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                    />
                                </span>
                            </div>

                            <div
                                onClick={() => setRequireSelfieCheckOut((prev) => !prev)}
                                role="switch"
                                aria-checked={requireSelfieCheckOut}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setRequireSelfieCheckOut((prev) => !prev);
                                    }
                                }}
                                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-start justify-between gap-3 select-none active:scale-[0.99] ${requireSelfieCheckOut
                                    ? 'border-emerald-600/70 bg-emerald-500/10 shadow-2xs'
                                    : 'border-border bg-muted/25 hover:bg-muted/40'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`p-2 rounded-lg shrink-0 mt-0.5 ${requireSelfieCheckOut
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                            }`}
                                    >
                                        {requireSelfieCheckOut ? <Camera size={16} /> : <MapPin size={16} />}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">
                                            {t('attendanceSettings.selfieCheckOutTitle')}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            {requireSelfieCheckOut
                                                ? t('attendanceSettings.selfieCheckOutActive')
                                                : t('attendanceSettings.selfieCheckOutInactive')}
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${requireSelfieCheckOut ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${requireSelfieCheckOut ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                    />
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Pilihan 5 Hari Kerja vs 6 Hari Kerja */}
                    <div>
                        <label className="block text-xs font-semibold mb-2">
                            {t('attendanceSettings.workDaysLabel')}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setWorkDaysMode('FIVE_DAYS')}
                                className={`p-4 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] cursor-pointer flex items-start gap-3 ${workDaysMode === 'FIVE_DAYS'
                                    ? 'border-emerald-600 bg-emerald-500/10 ring-2 ring-emerald-500/20 shadow-2xs'
                                    : 'border-border bg-muted/20 hover:bg-muted/40'
                                    }`}
                            >
                                <Briefcase
                                    size={20}
                                    className={
                                        workDaysMode === 'FIVE_DAYS'
                                            ? 'text-emerald-600 shrink-0 mt-0.5'
                                            : 'text-muted-foreground shrink-0 mt-0.5'
                                    }
                                />
                                <div>
                                    <div className="text-xs font-bold">
                                        {t('attendanceSettings.fiveDaysTitle')}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {t('attendanceSettings.fiveDaysDescPrefix')}
                                        <strong>
                                            {t('attendanceSettings.fiveDaysDescHighlight')}
                                        </strong>
                                        {t('attendanceSettings.fiveDaysDescSuffix')}
                                    </p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setWorkDaysMode('SIX_DAYS')}
                                className={`p-4 rounded-xl border text-left transition-all duration-200 active:scale-[0.99] cursor-pointer flex items-start gap-3 ${workDaysMode === 'SIX_DAYS'
                                    ? 'border-emerald-600 bg-emerald-500/10 ring-2 ring-emerald-500/20 shadow-2xs'
                                    : 'border-border bg-muted/20 hover:bg-muted/40'
                                    }`}
                            >
                                <Briefcase
                                    size={20}
                                    className={
                                        workDaysMode === 'SIX_DAYS'
                                            ? 'text-emerald-600 shrink-0 mt-0.5'
                                            : 'text-muted-foreground shrink-0 mt-0.5'
                                    }
                                />
                                <div>
                                    <div className="text-xs font-bold">
                                        {t('attendanceSettings.sixDaysTitle')}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {t('attendanceSettings.sixDaysDescPrefix')}
                                        <strong>
                                            {t('attendanceSettings.sixDaysDescHighlight')}
                                        </strong>
                                        {t('attendanceSettings.sixDaysDescSuffix')}
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-border/60">
                        <button
                            type="submit"
                            disabled={isSavingSchedule || !selectedSchoolId}
                            className={BTN_STYLE.primaryEmerald}
                        >
                            {isSavingSchedule ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Save size={15} />
                            )}
                            {isSavingSchedule
                                ? t('attendanceSettings.btnSaving')
                                : t('attendanceSettings.btnSaveSchedule')}
                        </button>
                    </div>
                </form>
            )}

            {/* ====================================================================
                SUB-TAB 2: IZIN PRESENSI VIA KOMPUTER / LAPTOP (GURU)
            ==================================================================== */}
            {activeSubTab === 'GURU_DESKTOP' && (
                <TeacherDesktopAccessCard schoolId={selectedSchoolId} />
            )}

            {/* ====================================================================
                SUB-TAB 3: PENGATURAN JADWAL & METODE PRESENSI SISWA
            ==================================================================== */}
            {activeSubTab === 'SISWA' && (
                <StudentAttendanceSettingsCard schoolId={selectedSchoolId} />
            )}

            {/* ====================================================================
                SUB-TAB 4: KALENDER HARI LIBUR NASIONAL & SEKOLAH
            ==================================================================== */}
            {activeSubTab === 'HOLIDAYS' && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border pb-3">
                        <div>
                            <h2 className="text-base font-bold flex items-center gap-2">
                                <CalendarDays size={18} className="text-red-500" />
                                {t('attendanceSettings.holidayTitle')}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {t('attendanceSettings.holidaySubtitle')}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => downloadHolidayExcelTemplate(filterYear)}
                                className={BTN_STYLE.secondary}
                            >
                                <Download size={14} className="text-emerald-600" />
                                {t('attendanceSettings.btnExcelTemplate')}
                            </button>

                            <label className={BTN_STYLE.secondary}>
                                <Upload size={14} className="text-blue-600" />
                                {t('attendanceSettings.btnImportExcel')}
                                <input
                                    type="file"
                                    accept=".xlsx,.csv,.txt"
                                    className="hidden"
                                    onChange={handleSelectExcelFile}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Panel Kontrol Sinkronisasi Server API */}
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex flex-col gap-2.5 flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 sm:w-24 shrink-0">
                                        <Server size={15} />
                                        {t('attendanceSettings.apiServerLabel')}
                                    </span>
                                    <select
                                        value={selectedApiProvider}
                                        onChange={(e) =>
                                            setSelectedApiProvider(e.target.value as HolidayApiProviderId)
                                        }
                                        className="form-input w-full sm:w-72 text-xs py-1.5 px-3 bg-card"
                                    >
                                        {HOLIDAY_API_PROVIDER_OPTIONS.map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 sm:w-24 shrink-0">
                                        <Moon size={15} />
                                        {t('attendanceSettings.calendarRefLabel')}
                                    </span>
                                    <select
                                        value={calendarRefMode}
                                        onChange={(e) =>
                                            setCalendarRefMode(e.target.value as CalendarReferenceMode)
                                        }
                                        className="form-input w-full sm:w-72 text-xs py-1.5 px-3 bg-card"
                                    >
                                        <option value="MUHAMMADIYAH">
                                            {t('attendanceSettings.calRefMuhammadiyah')}
                                        </option>
                                        <option value="PEMERINTAH">
                                            {t('attendanceSettings.calRefGovernment')}
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleFetchFromServer}
                                disabled={isFetchingServer}
                                className={`${BTN_STYLE.primaryBlue} shrink-0 self-start md:self-center`}
                            >
                                {isFetchingServer ? (
                                    <Loader2 size={15} className="animate-spin" />
                                ) : (
                                    <Server size={15} />
                                )}
                                {isFetchingServer
                                    ? t('attendanceSettings.btnFetchingServer')
                                    : t('attendanceSettings.btnSyncFromServer', {
                                        year: filterYear,
                                    })}
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-blue-500/20 text-xs">
                            <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer font-medium">
                                    <input
                                        type="checkbox"
                                        checked={includeCutiFromServer}
                                        onChange={(e) => setIncludeCutiFromServer(e.target.checked)}
                                        className="rounded border-border"
                                    />
                                    <span>
                                        {t('attendanceSettings.includeCutiPrefix')}
                                        <strong>
                                            {t('attendanceSettings.includeCutiHighlight')}
                                        </strong>
                                    </span>
                                </label>

                                {calendarRefMode === 'MUHAMMADIYAH' && (
                                    <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-800 dark:text-emerald-200">
                                        <input
                                            type="checkbox"
                                            checked={includeAwalRamadan}
                                            onChange={(e) => setIncludeAwalRamadan(e.target.checked)}
                                            className="rounded border-border"
                                        />
                                        <span>
                                            {t('attendanceSettings.includeAwalRamadanPrefix')}
                                            <strong>
                                                {t('attendanceSettings.includeAwalRamadanHighlight')}
                                            </strong>
                                        </span>
                                    </label>
                                )}
                            </div>

                            {isSuperAdmin && (
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-semibold">
                                        {t('attendanceSettings.saveScopeLabel')}
                                    </span>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="holidayScope"
                                            checked={holidayScope === 'GLOBAL'}
                                            onChange={() => setHolidayScope('GLOBAL')}
                                        />
                                        <Globe size={13} className="text-purple-500" />
                                        <span>{t('attendanceSettings.scopeGlobal')}</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="holidayScope"
                                            checked={holidayScope === 'SCHOOL'}
                                            onChange={() => setHolidayScope('SCHOOL')}
                                        />
                                        <Building2 size={13} className="text-blue-500" />
                                        <span>{t('attendanceSettings.scopeSchool')}</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        {syncFeedback && (
                            <div
                                className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${syncFeedback.status === 'loading'
                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-800 dark:text-blue-200'
                                    : syncFeedback.status === 'success'
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                                        : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                                    }`}
                            >
                                {syncFeedback.status === 'loading' ? (
                                    <Loader2 size={15} className="animate-spin shrink-0" />
                                ) : syncFeedback.status === 'success' ? (
                                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                                ) : (
                                    <AlertTriangle size={15} className="text-red-600 shrink-0" />
                                )}
                                <span>{syncFeedback.text}</span>
                            </div>
                        )}
                    </div>

                    {/* Kotak Pratinjau Hasil Server / Excel */}
                    {previewRows.length > 0 && (
                        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                        <FileSpreadsheet size={16} />
                                        <span>
                                            {t('attendanceSettings.previewTitle', {
                                                source: previewSourceLabel,
                                                count: previewRows.length,
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-[11px] opacity-75 mt-0.5">
                                        {t('attendanceSettings.previewTip')}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setPreviewRows((prev) => [
                                                ...prev,
                                                {
                                                    date: `${filterYear}-01-01`,
                                                    name: t('attendanceSettings.defaultExtraHolidayName'),
                                                    type: 'SEKOLAH',
                                                },
                                            ])
                                        }
                                        className={BTN_STYLE.secondaryCompact}
                                        disabled={isImporting}
                                    >
                                        <Plus size={13} />
                                        {t('attendanceSettings.btnAddRow')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPreviewRows([]);
                                            setPreviewSourceLabel('');
                                        }}
                                        className={BTN_STYLE.secondaryCompact}
                                        disabled={isImporting}
                                    >
                                        {t('attendanceSettings.btnCancel')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmBatchSave}
                                        disabled={isImporting}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-50 cursor-pointer"
                                    >
                                        <Save size={14} />
                                        {isImporting
                                            ? t('attendanceSettings.btnSaving')
                                            : t('attendanceSettings.btnSaveToDb')}
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-card">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/60 text-left">
                                        <tr>
                                            <th className="py-2 px-3 font-semibold w-12">
                                                {t('attendanceSettings.colNo')}
                                            </th>
                                            <th className="py-2 px-3 font-semibold w-40">
                                                {t('attendanceSettings.colDate')}
                                            </th>
                                            <th className="py-2 px-3 font-semibold w-36">
                                                {t('attendanceSettings.colJavaneseDay')}
                                            </th>
                                            <th className="py-2 px-3 font-semibold">
                                                {t('attendanceSettings.colHolidayName')}
                                            </th>
                                            <th className="py-2 px-3 font-semibold w-14 text-right">
                                                {t('attendanceSettings.colDelete')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {previewRows.map((row, idx) => {
                                            const jawaInfo =
                                                row.date.length === 10
                                                    ? getJavaneseDateInfo(row.date)
                                                    : null;
                                            return (
                                                <tr key={`preview-${idx}`}>
                                                    <td className="py-1.5 px-3 font-mono text-muted-foreground">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="py-1.5 px-3">
                                                        <input
                                                            type="date"
                                                            value={row.date}
                                                            onChange={(e) =>
                                                                setPreviewRows((prev) =>
                                                                    prev.map((item, i) =>
                                                                        i === idx
                                                                            ? { ...item, date: e.target.value }
                                                                            : item
                                                                    )
                                                                )
                                                            }
                                                            className="form-input w-auto! text-xs py-1 px-2 font-mono text-red-500 font-semibold"
                                                        />
                                                    </td>
                                                    <td className="py-1.5 px-3 text-[11px] font-medium text-muted-foreground">
                                                        {jawaInfo?.hariPasaran ?? '-'}
                                                    </td>
                                                    <td className="py-1.5 px-3">
                                                        <input
                                                            type="text"
                                                            value={row.name}
                                                            onChange={(e) =>
                                                                setPreviewRows((prev) =>
                                                                    prev.map((item, i) =>
                                                                        i === idx
                                                                            ? { ...item, name: e.target.value }
                                                                            : item
                                                                    )
                                                                )
                                                            }
                                                            className="form-input w-full text-xs py-1 px-2"
                                                        />
                                                    </td>
                                                    <td className="py-1.5 px-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setPreviewRows((prev) =>
                                                                    prev.filter((_, i) => i !== idx)
                                                                )
                                                            }
                                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 active:scale-95 transition"
                                                            title={t('attendanceSettings.titleExcludeDate')}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Form Tambah 1 Tanggal Libur Manual */}
                    <form
                        onSubmit={handleAddSingleHoliday}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-muted/25 p-3.5 rounded-xl border border-border"
                    >
                        <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold mb-1">
                                {t('attendanceSettings.labelHolidayDate')}
                            </label>
                            <input
                                type="date"
                                required
                                value={newHolidayDate}
                                onChange={(e) => setNewHolidayDate(e.target.value)}
                                className="form-input w-full text-xs"
                            />
                        </div>
                        <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold mb-1">
                                {t('attendanceSettings.labelHolidayDesc')}
                            </label>
                            <input
                                type="text"
                                required
                                value={newHolidayName}
                                onChange={(e) => setNewHolidayName(e.target.value)}
                                placeholder={t('attendanceSettings.placeholderHolidayDesc')}
                                className="form-input w-full text-xs"
                            />
                        </div>
                        <div className="sm:col-span-3">
                            <button
                                type="submit"
                                disabled={isAddingHoliday}
                                className={`${BTN_STYLE.primaryEmerald} w-full py-2!`}
                            >
                                <Plus size={15} />
                                {isAddingHoliday
                                    ? t('attendanceSettings.btnSaving')
                                    : t('attendanceSettings.btnAddHoliday')}
                            </button>
                        </div>
                    </form>

                    {/* Daftar / Kalender Tanggal Merah */}
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h3 className="text-xs font-bold">
                                    {t('attendanceSettings.holidayListHeading', {
                                        year: filterYear,
                                        count: holidays.length,
                                    })}
                                </h3>

                                <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setHolidayViewMode('CALENDAR')}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${holidayViewMode === 'CALENDAR'
                                            ? 'bg-card text-foreground shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <Calendar size={13} />
                                        {t('attendanceSettings.viewCalendar')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHolidayViewMode('LIST')}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${holidayViewMode === 'LIST'
                                            ? 'bg-card text-foreground shadow-xs'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <List size={13} />
                                        {t('attendanceSettings.viewList')}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <select
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(Number(e.target.value))}
                                    className="form-input w-auto! min-w-32 text-xs py-1.5 px-3 font-semibold shrink-0"
                                >
                                    {availableYears.map((yr) => (
                                        <option key={yr} value={yr}>
                                            {t('attendanceSettings.yearOption', { year: yr })}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    onClick={handleAddNextYear}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 shadow-2xs active:scale-[0.98] transition-all duration-200 shrink-0 whitespace-nowrap cursor-pointer"
                                    title={t('attendanceSettings.titleAddYear')}
                                >
                                    <Plus size={14} />
                                    {t('attendanceSettings.btnAddYear')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void loadHolidays()}
                                    className="p-2 rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-95 transition-all duration-200 shrink-0 cursor-pointer"
                                    title={t('attendanceSettings.titleRefreshHolidays')}
                                >
                                    <RefreshCw
                                        size={14}
                                        className={isLoadingHolidays ? 'spin' : ''}
                                    />
                                </button>
                            </div>
                        </div>

                        {!isLoadingHolidays && deletableHolidays.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-muted/35 border border-border text-xs">
                                {holidayViewMode === 'LIST' ? (
                                    <label className="flex items-center gap-2 cursor-pointer font-semibold select-none">
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            onChange={toggleSelectAll}
                                            className="rounded border-border w-4 h-4 accent-emerald-600 cursor-pointer"
                                        />
                                        <span>
                                            {t('attendanceSettings.selectAllHolidays', {
                                                selected: selectedHolidayIds.length,
                                                total: deletableHolidays.length,
                                            })}
                                        </span>
                                    </label>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground">
                                        {t('attendanceSettings.tapDateHint')}
                                    </span>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    {holidayViewMode === 'LIST' && selectedHolidayIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setDeleteConfirmModal({
                                                    title: t('attendanceSettings.modalDelSelectedTitle', {
                                                        count: selectedHolidayIds.length,
                                                    }),
                                                    description: t(
                                                        'attendanceSettings.modalDelSelectedDesc',
                                                        { count: selectedHolidayIds.length }
                                                    ),
                                                    targetIds: selectedHolidayIds,
                                                })
                                            }
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-sm active:scale-[0.98] transition-all duration-200 cursor-pointer"
                                        >
                                            <Trash2 size={13} />
                                            {t('attendanceSettings.btnDeleteSelected', {
                                                count: selectedHolidayIds.length,
                                            })}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDeleteConfirmModal({
                                                title: t('attendanceSettings.modalDelAllTitle', {
                                                    year: filterYear,
                                                }),
                                                description: t('attendanceSettings.modalDelAllDesc', {
                                                    count: deletableHolidays.length,
                                                    year: filterYear,
                                                }),
                                                targetIds: deletableHolidays.map((h) => h.id),
                                            })
                                        }
                                        className={BTN_STYLE.dangerOutline}
                                    >
                                        <Trash2 size={13} />
                                        {t('attendanceSettings.btnDeleteAll', {
                                            count: deletableHolidays.length,
                                        })}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isLoadingHolidays ? (
                            <div className="py-8 text-center text-xs opacity-70">
                                {t('attendanceSettings.loadingHolidays')}
                            </div>
                        ) : holidayViewMode === 'CALENDAR' ? (
                            <HolidayCalendarView
                                year={filterYear}
                                holidays={holidays}
                                workDaysMode={workDaysMode}
                                isSuperAdmin={isSuperAdmin}
                                onClickEditHoliday={handleOpenEditModal}
                                onClickAddHolidayOnDate={(isoDate) => {
                                    setNewHolidayDate(isoDate);
                                    setSyncFeedback({
                                        status: 'success',
                                        text: t('attendanceSettings.feedbackDatePicked', {
                                            date: isoDate,
                                        }),
                                    });
                                }}
                            />
                        ) : holidays.length === 0 ? (
                            <div className="py-8 text-center text-xs opacity-75 border border-dashed border-border rounded-xl space-y-2 px-4">
                                <p>
                                    {t('attendanceSettings.emptyHolidaysTitle', {
                                        year: filterYear,
                                    })}
                                </p>
                                <p className="text-[11px] opacity-75">
                                    {t('attendanceSettings.emptyHolidaysDesc', {
                                        year: filterYear,
                                    })}
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-96 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                                {holidays.map((item, index) => {
                                    const isGlobal = item.schoolId === null;
                                    const isCuti = item.name.toLowerCase().includes('cuti bersama');
                                    const canManageItem = isSuperAdmin || !isGlobal;
                                    const isChecked = selectedHolidayIds.includes(item.id);
                                    const jawaInfo = getJavaneseDateInfo(item.date);

                                    return (
                                        <div
                                            key={item.id}
                                            className={`p-3 flex items-center justify-between gap-3 transition text-xs ${isChecked ? 'bg-emerald-500/10' : 'hover:bg-muted/30'
                                                }`}
                                        >
                                            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                                {canManageItem ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleSelectOne(item.id)}
                                                        className="rounded border-border w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                                                    />
                                                ) : (
                                                    <span className="w-4 shrink-0" />
                                                )}

                                                <span className="w-6 text-center font-mono text-[11px] font-bold text-muted-foreground shrink-0">
                                                    {index + 1}.
                                                </span>

                                                <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg shrink-0">
                                                    {item.date}
                                                </span>

                                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                                                    {jawaInfo.hariPasaran}
                                                </span>

                                                <span className="font-medium truncate">{item.name}</span>

                                                {isCuti && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                                        {t('attendanceSettings.badgeCutiBersama')}
                                                    </span>
                                                )}

                                                {isGlobal ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300">
                                                        <Globe size={10} />{' '}
                                                        {t('attendanceSettings.badgeNational')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300">
                                                        <Building2 size={10} />{' '}
                                                        {t('attendanceSettings.badgeSchool')}
                                                    </span>
                                                )}
                                            </div>

                                            {canManageItem && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEditModal(item)}
                                                        className="p-2 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer"
                                                        title={t('attendanceSettings.titleEditHoliday')}
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setDeleteConfirmModal({
                                                                title: t(
                                                                    'attendanceSettings.modalDelSingleTitle'
                                                                ),
                                                                description: t(
                                                                    'attendanceSettings.modalDelSingleDesc',
                                                                    {
                                                                        name: item.name,
                                                                        date: jawaInfo.fullFormattedDate,
                                                                    }
                                                                ),
                                                                targetIds: [item.id],
                                                            })
                                                        }
                                                        className="p-2 rounded-xl border border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
                                                        title={t('attendanceSettings.titleDeleteHoliday')}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ====================================================================
                SUB-TAB 5: INTEGRASI WHATSAPP GATEWAY ORANG TUA
            ==================================================================== */}
            {activeSubTab === 'WHATSAPP' && (
                <WhatsAppSettingsCard schoolId={selectedSchoolId} />
            )}

            {/* MODAL 1: EDIT TANGGAL & KETERANGAN HARI LIBUR */}
            {editingHoliday && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <form
                        onSubmit={handleSaveEditHoliday}
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
                    >
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600">
                                    <Pencil size={16} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold">
                                        {t('attendanceSettings.modalEditTitle')}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('attendanceSettings.modalEditSubtitle')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingHoliday(null);
                                    setEditModalError(null);
                                }}
                                disabled={isSavingEdit}
                                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground active:scale-95 transition cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {editModalError && (
                            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/15 text-xs font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                                <AlertTriangle size={15} className="text-red-600 shrink-0" />
                                <span>{editModalError}</span>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    {t('attendanceSettings.modalEditDateLabel')}
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={editDateInput}
                                    onChange={(e) => {
                                        setEditDateInput(e.target.value);
                                        if (editModalError) setEditModalError(null);
                                    }}
                                    className="form-input w-full text-xs font-mono"
                                />
                                {editDateInput.length === 10 && (
                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-300 mt-1 font-medium">
                                        {t('attendanceSettings.modalEditJavanesePrefix')}{' '}
                                        {getJavaneseDateInfo(editDateInput).fullFormattedDate}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    {t('attendanceSettings.modalEditDescLabel')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editNameInput}
                                    onChange={(e) => {
                                        setEditNameInput(e.target.value);
                                        if (editModalError) setEditModalError(null);
                                    }}
                                    className="form-input w-full text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingHoliday(null);
                                    setEditModalError(null);
                                }}
                                disabled={isSavingEdit}
                                className={BTN_STYLE.secondary}
                            >
                                {t('attendanceSettings.btnCancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingEdit}
                                className={BTN_STYLE.primaryEmerald}
                            >
                                <Save size={14} />
                                {isSavingEdit
                                    ? t('attendanceSettings.btnSaving')
                                    : t('attendanceSettings.btnSaveChanges')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL 2: KONFIRMASI HAPUS */}
            {deleteConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-600 shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-sm font-bold text-foreground">
                                    {deleteConfirmModal.title}
                                </h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {deleteConfirmModal.description}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmModal(null)}
                                disabled={isDeletingHolidays}
                                className={BTN_STYLE.secondary}
                            >
                                {t('attendanceSettings.btnCancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleConfirmDeleteExecution()}
                                disabled={isDeletingHolidays}
                                className={BTN_STYLE.danger}
                            >
                                <Trash2 size={14} />
                                {isDeletingHolidays
                                    ? t('attendanceSettings.btnDeleting')
                                    : t('attendanceSettings.btnConfirmDeleteNow')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}