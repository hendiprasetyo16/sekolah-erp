// src/modules/auth/components/TenantSelector.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    School,
    Plus,
    LogOut,
    ArrowRight,
    MapPin,
    Search,
    Building2,
    ShieldCheck,
    Sun,
    Moon,
    Globe,
    RefreshCw,
    CheckCircle2,
    Layers,
    AlertTriangle,
    AlertCircle,
    Loader2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { APP_NAME, APP_VERSION } from '@/constants/app.constants';
import {
    type SchoolLevelCode,
    type SchoolLevelFilterGroup,
    type SchoolStatusCode,
    SCHOOL_LEVEL_CHOICES,
    SCHOOL_STATUS_CHOICES,
    SCHOOL_LEVEL_FILTER_TABS,
    formatSchoolLevelBadge,
    resolveSchoolFilterGroup,
} from '@/constants/school.constants';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// ============================================================================
// TIPE DATA
// ============================================================================

interface SchoolTenantRow {
    id: string;
    name: string;
    npsn: string;
    level: string;
    type?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    logoUrl?: string | null;
    principalName?: string | null;
    principalNip?: string | null;
    principalSignatureUrl?: string | null;
    schoolStampUrl?: string | null;
}

interface AcademicYearRow {
    id: string;
    schoolId: string;
    name: string;
    startYear: number;
    endYear: number;
    isActive: boolean;
}

interface SupabaseErrorShape {
    code?: string;
    message?: string;
    details?: string;
}

type AuthStoreState = ReturnType<typeof useAuthStore.getState>;
type ErrorContext = 'fetch' | 'create' | 'select';

const SCHOOL_TENANT_SELECT_FIELDS =
    'id, name, npsn, level, type, address, city, province, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl';

// ============================================================================
// FUNGSI BANTU
// ============================================================================

function formatSchoolLocation(school: SchoolTenantRow, fallbackText: string): string {
    const cleanCity = school.city && school.city.trim() !== '-' ? school.city.trim() : '';
    const cleanProvince =
        school.province && school.province.trim() !== '-' ? school.province.trim() : '';

    const parts = [cleanCity, cleanProvince].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');

    const cleanAddress =
        school.address && school.address.trim() !== '-' ? school.address.trim() : '';
    if (cleanAddress) return cleanAddress;

    return fallbackText;
}

function getLevelBadgeStyle(filterGroup: string): string {
    switch (filterGroup) {
        case 'TK':
            return 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300';
        case 'SD':
            return 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300';
        case 'SMP':
            return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        case 'SMA':
            return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'SMK':
            return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'SLB':
            return 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
        case 'PKBM':
            return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
        default:
            return 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300';
    }
}

function resolveCurrentAcademicYearRange(): { startYear: number; endYear: number; name: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const startYear = month >= 6 ? year : year - 1;
    const endYear = startYear + 1;
    return {
        startYear,
        endYear,
        name: `${startYear}/${endYear}`,
    };
}

function formatFriendlyError(error: unknown, isId: boolean, context: ErrorContext): string {
    const errObj =
        typeof error === 'object' && error !== null ? (error as SupabaseErrorShape) : {};
    const code = errObj.code ?? '';
    const rawMessage = (
        error instanceof Error ? error.message : errObj.message ?? ''
    ).toLowerCase();

    if (
        rawMessage.includes('failed to fetch') ||
        rawMessage.includes('networkerror') ||
        rawMessage.includes('load failed') ||
        rawMessage.includes('network request failed')
    ) {
        return isId
            ? 'Koneksi ke server terputus. Periksa sambungan internet Anda lalu coba kembali.'
            : 'Unable to reach the server. Please check your internet connection and try again.';
    }

    if (
        code === '23505' ||
        rawMessage.includes('duplicate key') ||
        rawMessage.includes('schools_npsn_key') ||
        rawMessage.includes('sudah terdaftar')
    ) {
        return isId
            ? 'Nomor NPSN tersebut sudah terdaftar pada satuan pendidikan lain. Silakan periksa kembali NPSN Anda.'
            : 'This NPSN is already registered to another school. Please verify your NPSN.';
    }

    if (code === '23514' || rawMessage.includes('schools_npsn_check')) {
        return isId
            ? 'Format NPSN tidak sesuai. Pastikan NPSN terdiri dari tepat 8 digit angka.'
            : 'Invalid NPSN format. Please ensure the NPSN consists of 8 numeric digits.';
    }

    if (code === '23502' || rawMessage.includes('null value in column')) {
        return isId
            ? 'Masih ada data wajib yang belum lengkap. Silakan periksa kembali seluruh kolom formulir.'
            : 'Some required fields are incomplete. Please review the form and try again.';
    }

    if (
        code === '42501' ||
        rawMessage.includes('row-level security') ||
        rawMessage.includes('permission denied')
    ) {
        return isId
            ? 'Akun Anda tidak memiliki izin untuk menyimpan data sekolah. Pastikan Anda masuk sebagai Super Admin.'
            : 'Your account does not have permission to perform this action. Please sign in as Super Admin.';
    }

    if (code === 'PGRST301' || rawMessage.includes('jwt') || rawMessage.includes('session')) {
        return isId
            ? 'Sesi masuk Anda telah berakhir. Silakan keluar dan masuk kembali ke sistem.'
            : 'Your sign-in session has expired. Please sign out and sign in again.';
    }

    if (code === 'PGRST204' || rawMessage.includes('schema cache')) {
        return isId
            ? 'Terjadi ketidaksesuaian struktur data dengan server. Silakan muat ulang halaman lalu coba kembali.'
            : 'A data structure mismatch occurred with the server. Please refresh the page and try again.';
    }

    if (context === 'fetch') {
        return isId
            ? 'Daftar satuan pendidikan belum dapat dimuat saat ini. Silakan tekan tombol Segarkan untuk mencoba kembali.'
            : 'Unable to load the list of schools right now. Please click Refresh to try again.';
    }

    if (context === 'select') {
        return isId
            ? 'Ruang kerja sekolah belum dapat dibuka saat ini. Silakan coba beberapa saat lagi.'
            : 'Unable to open the school workspace right now. Please try again shortly.';
    }

    return isId
        ? 'Data sekolah baru belum dapat disimpan saat ini. Periksa kembali isian Anda lalu coba lagi.'
        : 'Unable to save the new school right now. Please check your entries and try again.';
}

// ============================================================================
// KOMPONEN UTAMA: TENANT SELECTOR
// ============================================================================

export function TenantSelector() {
    const navigate = useNavigate();
    const { t, locale } = useTranslation();
    const isId = locale === 'id';
    const { user, logout, setSchool, setAcademicYear } = useAuthStore();
    const { theme, setTheme, locale: currentLocale, setLocale } = useUIStore();

    const [schools, setSchools] = useState<SchoolTenantRow[]>([]);
    const [brokenLogoIds, setBrokenLogoIds] = useState<Record<string, boolean>>({});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectingSchoolId, setSelectingSchoolId] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string>('');

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedLevel, setSelectedLevel] = useState<SchoolLevelFilterGroup>('ALL');
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
    const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const [isCreatingSchool, setIsCreatingSchool] = useState<boolean>(false);
    const [createFormError, setCreateFormError] = useState<string>('');
    const [newSchoolName, setNewSchoolName] = useState<string>('');
    const [newSchoolNpsn, setNewSchoolNpsn] = useState<string>('');
    const [newSchoolLevel, setNewSchoolLevel] = useState<SchoolLevelCode>('TK');
    const [newSchoolType, setNewSchoolType] = useState<SchoolStatusCode>('SWASTA');
    const [newSchoolCity, setNewSchoolCity] = useState<string>('');
    const [newSchoolProvince, setNewSchoolProvince] = useState<string>('');

    const defaultAcademicYear = useMemo(() => resolveCurrentAcademicYearRange(), []);

    useEffect(() => {
        const rootElement = document.documentElement;
        if (theme === 'dark') {
            rootElement.classList.add('dark');
            rootElement.classList.remove('light');
            rootElement.style.colorScheme = 'dark';
        } else {
            rootElement.classList.remove('dark');
            rootElement.classList.add('light');
            rootElement.style.colorScheme = 'light';
        }
    }, [theme]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.defaultPrevented) return;
            if (event.key === 'Escape') {
                if (!isLoggingOut) setIsLogoutModalOpen(false);
                if (!isCreatingSchool) {
                    setIsCreateModalOpen(false);
                    setCreateFormError('');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLoggingOut, isCreatingSchool]);

    const fetchSchools = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        setFetchError('');

        try {
            const { data, error } = await supabase
                .from('schools')
                .select(SCHOOL_TENANT_SELECT_FIELDS)
                .order('name', { ascending: true });

            if (error) {
                throw error;
            }

            setBrokenLogoIds({});
            setSchools((data as SchoolTenantRow[] | null) ?? []);
        } catch (err: unknown) {
            setFetchError(formatFriendlyError(err, isId, 'fetch'));
        } finally {
            setIsLoading(false);
        }
    }, [isId]);

    useEffect(() => {
        void fetchSchools();
    }, [fetchSchools]);

    const filteredSchools = useMemo<SchoolTenantRow[]>(() => {
        const keyword = searchQuery.trim().toLowerCase();

        return schools.filter((item) => {
            const filterGroup = resolveSchoolFilterGroup(item.level);
            const badgeText = formatSchoolLevelBadge(item.level);
            const matchesLevel = selectedLevel === 'ALL' || filterGroup === selectedLevel;

            if (!matchesLevel) return false;
            if (!keyword) return true;

            const haystack = [item.name, item.npsn, item.city, item.province, item.type, badgeText, filterGroup]
                .filter((val): val is string => typeof val === 'string' && val.trim() !== '-')
                .join(' ')
                .toLowerCase();

            return haystack.includes(keyword);
        });
    }, [schools, searchQuery, selectedLevel]);

    const handleSelectSchool = async (selectedSchool: SchoolTenantRow): Promise<void> => {
        setSelectingSchoolId(selectedSchool.id);

        try {
            const { data: yearRows, error: yearError } = await supabase
                .from('academic_years')
                .select('id, schoolId, name, startYear, endYear, isActive')
                .eq('schoolId', selectedSchool.id)
                .order('isActive', { ascending: false })
                .order('startYear', { ascending: false })
                .limit(1);

            if (yearError) {
                throw yearError;
            }

            const activeYear = ((yearRows as AcademicYearRow[] | null) ?? [])[0] ?? null;

            setSchool(selectedSchool as unknown as AuthStoreState['school']);
            setAcademicYear(activeYear as unknown as AuthStoreState['academicYear']);

            toast.success(
                isId
                    ? `Ruang kerja ${selectedSchool.name} berhasil dibuka.`
                    : `Workspace for ${selectedSchool.name} is ready.`
            );

            navigate('/dashboard', { replace: true });
        } catch (err: unknown) {
            toast.error(formatFriendlyError(err, isId, 'select'));
        } finally {
            setSelectingSchoolId(null);
        }
    };

    const openCreateModal = (): void => {
        setCreateFormError('');
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = (): void => {
        if (isCreatingSchool) return;
        setCreateFormError('');
        setIsCreateModalOpen(false);
    };

    const handleCreateSchool = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        setCreateFormError('');

        const cleanName = newSchoolName.trim();
        const cleanNpsn = newSchoolNpsn.trim();

        if (!cleanName) {
            setCreateFormError(
                isId
                    ? 'Nama satuan pendidikan wajib diisi terlebih dahulu.'
                    : 'School name is required.'
            );
            return;
        }

        if (!/^\d{8}$/.test(cleanNpsn)) {
            setCreateFormError(
                isId
                    ? 'Nomor NPSN harus terdiri dari tepat 8 digit angka.'
                    : 'NPSN must consist of exactly 8 numeric digits.'
            );
            return;
        }

        setIsCreatingSchool(true);
        try {
            const { data: createdSchool, error: schoolError } = await supabase
                .from('schools')
                .insert({
                    name: cleanName,
                    npsn: cleanNpsn,
                    level: newSchoolLevel,
                    type: newSchoolType,
                    address: '-',
                    city: newSchoolCity.trim() || '-',
                    province: newSchoolProvince.trim() || '-',
                })
                .select(SCHOOL_TENANT_SELECT_FIELDS)
                .single();

            if (schoolError || !createdSchool) {
                throw schoolError ?? new Error('CREATE_SCHOOL_EMPTY');
            }

            const schoolRecord = createdSchool as SchoolTenantRow;

            const { startYear, endYear, name: academicYearName } = resolveCurrentAcademicYearRange();
            const { data: createdYear, error: yearInsertError } = await supabase
                .from('academic_years')
                .insert({
                    schoolId: schoolRecord.id,
                    name: academicYearName,
                    startYear,
                    endYear,
                    isActive: true,
                })
                .select('id')
                .single();

            if (yearInsertError || !createdYear) {
                toast.warning(
                    isId
                        ? 'Sekolah berhasil didaftarkan, silakan atur Tahun Ajaran di menu Master Akademik.'
                        : 'School registered, please configure the Academic Year in Master Academic.'
                );
            } else {
                const { error: semesterInsertError } = await supabase.from('semesters').insert({
                    schoolId: schoolRecord.id,
                    academicYearId: (createdYear as { id: string }).id,
                    type: 'GANJIL',
                    startDate: `${startYear}-07-13`,
                    endDate: `${startYear}-12-20`,
                    isActive: true,
                });

                if (semesterInsertError) {
                    toast.warning(
                        isId
                            ? 'Sekolah dan Tahun Ajaran berhasil dibuat, silakan lengkapi jadwal Semester di Master Akademik.'
                            : 'School and Academic Year created, please complete Semester dates in Master Academic.'
                    );
                }
            }

            setIsCreateModalOpen(false);
            setCreateFormError('');
            setNewSchoolName('');
            setNewSchoolNpsn('');
            setNewSchoolLevel('TK');
            setNewSchoolType('SWASTA');
            setNewSchoolCity('');
            setNewSchoolProvince('');

            await fetchSchools();
            await handleSelectSchool(schoolRecord);
        } catch (err: unknown) {
            const friendlyMsg = formatFriendlyError(err, isId, 'create');
            setCreateFormError(friendlyMsg);
            toast.error(friendlyMsg);
        } finally {
            setIsCreatingSchool(false);
        }
    };

    const handleConfirmLogout = async (): Promise<void> => {
        setIsLoggingOut(true);
        try {
            await logout();
            setIsLogoutModalOpen(false);
            navigate('/login', { replace: true });
        } finally {
            setIsLoggingOut(false);
        }
    };

    const distinctLevelCount = useMemo(() => {
        const levels = new Set(schools.map((s) => formatSchoolLevelBadge(s.level)));
        return levels.size;
    }, [schools]);

    const hasActiveFilter = searchQuery.trim().length > 0 || selectedLevel !== 'ALL';

    return (
        <div className="min-h-dvh flex flex-col bg-muted/30 text-foreground transition-colors duration-300">
            {/* HERO BANNER EMERALD-TEAL */}
            <header className="relative overflow-hidden border-b border-emerald-900/20 text-white">
                <div className="absolute inset-0 bg-linear-to-br from-emerald-600 via-teal-700 to-emerald-950 dark:from-emerald-950 dark:via-teal-950 dark:to-slate-950" />

                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
                    <div className="absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
                </div>

                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
                        backgroundSize: '44px 44px',
                    }}
                />

                <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-md shadow-md shadow-emerald-950/20">
                                <Building2 size={22} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                                        {isId
                                            ? 'Konsol Manajemen Multi-Sekolah'
                                            : 'Multi-School Management Console'}
                                    </h1>
                                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 backdrop-blur-sm">
                                        <ShieldCheck size={11} />
                                        Super Admin
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs text-emerald-100/85">
                                    {user?.fullName || 'Administrator'} • {user?.email}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setLocale(currentLocale === 'id' ? 'en' : 'id')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase text-white backdrop-blur-md transition-colors hover:bg-white/20"
                                title={t('common.language')}
                            >
                                <Globe size={14} />
                                <span>{currentLocale}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                                title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
                            >
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsLogoutModalOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition-all hover:border-rose-300/50 hover:bg-rose-600/85"
                            >
                                <LogOut size={14} />
                                <span>{isId ? 'Keluar' : 'Sign Out'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                                <School size={18} />
                            </div>
                            <div>
                                <p className="text-[11px] text-emerald-100/80">
                                    {isId ? 'Total Satuan Pendidikan' : 'Registered Institutions'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {schools.length}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {isId ? 'Sekolah' : 'Schools'}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                                <CheckCircle2 size={18} />
                            </div>
                            <div>
                                <p className="text-[11px] text-emerald-100/80">
                                    {isId ? 'Status Operasional Aktif' : 'Active Operational Status'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {schools.length}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {isId ? 'Terverifikasi' : 'Verified'}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                                <Layers size={18} />
                            </div>
                            <div>
                                <p className="text-[11px] text-emerald-100/80">
                                    {isId ? 'Cakupan Jenjang' : 'Education Levels'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {distinctLevelCount}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {isId ? 'Jenjang Pendidikan' : 'Levels'}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* AREA KONTEN UTAMA */}
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                {isId ? 'Pilih Satuan Pendidikan' : 'Select Educational Institution'}
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isId
                                    ? 'Pilih sekolah yang akan dikelola untuk memuat konteks tahun ajaran dan data operasional.'
                                    : 'Choose a school to manage in order to load its academic year and operational context.'}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void fetchSchools()}
                                disabled={isLoading}
                                className="h-9 rounded-lg text-xs"
                                title={isId ? 'Muat ulang daftar sekolah' : 'Refresh school list'}
                            >
                                <RefreshCw size={14} className={cn('mr-1.5', isLoading && 'animate-spin')} />
                                {isId ? 'Segarkan' : 'Refresh'}
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                onClick={openCreateModal}
                                className="h-9 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
                            >
                                <Plus size={15} className="mr-1.5" />
                                {isId ? 'Tambah Sekolah Baru' : 'Add New School'}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-xs">
                            <Search
                                size={15}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={
                                    isId
                                        ? 'Cari nama sekolah, NPSN, atau kota...'
                                        : 'Search school name, NPSN, or city...'
                                }
                                className={cn(
                                    'h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground',
                                    'placeholder:text-muted-foreground/70',
                                    'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
                                )}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {SCHOOL_LEVEL_FILTER_TABS.map((tab) => {
                                const isSelected = selectedLevel === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        onClick={() => setSelectedLevel(tab.value)}
                                        className={cn(
                                            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                                            isSelected
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        {isId ? tab.labelId : tab.labelEn}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((idx) => (
                            <div
                                key={idx}
                                className="h-52 animate-pulse rounded-2xl border border-border bg-card p-5"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="h-12 w-12 rounded-xl bg-muted" />
                                    <div className="h-5 w-14 rounded-md bg-muted" />
                                </div>
                                <div className="mt-4 h-5 w-3/4 rounded bg-muted" />
                                <div className="mt-2 h-3.5 w-1/3 rounded bg-muted" />
                                <div className="mt-4 h-3.5 w-2/3 rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : fetchError ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-card p-8 text-center">
                        <AlertTriangle size={28} className="mx-auto text-rose-500" />
                        <h3 className="mt-3 text-sm font-bold text-foreground">
                            {isId ? 'Gagal Memuat Data Sekolah' : 'Failed to Load Schools'}
                        </h3>
                        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                            {fetchError}
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => void fetchSchools()}
                            className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            {isId ? 'Coba Lagi' : 'Retry'}
                        </Button>
                    </div>
                ) : (
                    <>
                        {filteredSchools.length === 0 && hasActiveFilter && (
                            <div className="mb-4 rounded-2xl border border-border bg-card p-6 text-center">
                                <p className="text-sm font-semibold text-foreground">
                                    {isId
                                        ? 'Tidak ada satuan pendidikan yang cocok dengan pencarian Anda.'
                                        : 'No educational institutions match your search criteria.'}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedLevel('ALL');
                                    }}
                                    className="mt-3 text-xs"
                                >
                                    {isId ? 'Reset Filter' : 'Reset Filters'}
                                </Button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredSchools.map((schoolItem) => {
                                const badgeLabel = formatSchoolLevelBadge(schoolItem.level);
                                const filterGroup = resolveSchoolFilterGroup(schoolItem.level);
                                const isSelecting = selectingSchoolId === schoolItem.id;
                                const locationText = formatSchoolLocation(
                                    schoolItem,
                                    isId ? 'Lokasi belum dilengkapi' : 'Location not specified'
                                );
                                const hasValidLogo =
                                    Boolean(schoolItem.logoUrl) && !brokenLogoIds[schoolItem.id];

                                return (
                                    <div
                                        key={schoolItem.id}
                                        onClick={() => {
                                            if (!isSelecting) void handleSelectSchool(schoolItem);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if ((e.key === 'Enter' || e.key === ' ') && !isSelecting) {
                                                e.preventDefault();
                                                void handleSelectSchool(schoolItem);
                                            }
                                        }}
                                        className={cn(
                                            'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-xs transition-all duration-200',
                                            'cursor-pointer hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md hover:shadow-emerald-950/5',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
                                        )}
                                    >
                                        <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-emerald-500 to-teal-600 opacity-0 transition-opacity group-hover:opacity-100" />

                                        <div>
                                            <div className="flex items-start justify-between gap-3">
                                                {hasValidLogo ? (
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-2xs">
                                                        <img
                                                            src={schoolItem.logoUrl!}
                                                            alt={schoolItem.name}
                                                            onError={() =>
                                                                setBrokenLogoIds((prev) => ({
                                                                    ...prev,
                                                                    [schoolItem.id]: true,
                                                                }))
                                                            }
                                                            className="h-full w-full object-contain"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:text-emerald-300">
                                                        <School size={22} />
                                                    </div>
                                                )}

                                                <span
                                                    className={cn(
                                                        'rounded-md border px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
                                                        getLevelBadgeStyle(filterGroup)
                                                    )}
                                                >
                                                    {badgeLabel}
                                                </span>
                                            </div>

                                            <h3 className="mt-4 line-clamp-1 text-base font-bold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                                {schoolItem.name}
                                            </h3>

                                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                                                NPSN:{' '}
                                                <span className="font-semibold text-foreground/85">
                                                    {schoolItem.npsn || '-'}
                                                </span>
                                            </p>

                                            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <MapPin
                                                    size={13}
                                                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                                                />
                                                <span className="line-clamp-1">{locationText}</span>
                                            </div>
                                        </div>

                                        <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3.5">
                                            <span className="text-xs font-semibold text-emerald-600 transition-colors group-hover:text-emerald-700 dark:text-emerald-400">
                                                {isSelecting
                                                    ? isId
                                                        ? 'Memuat ruang kerja...'
                                                        : 'Opening workspace...'
                                                    : isId
                                                        ? 'Buka Ruang Kerja'
                                                        : 'Open Workspace'}
                                            </span>

                                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-transform group-hover:translate-x-0.5 group-hover:bg-emerald-600 group-hover:text-white dark:text-emerald-400">
                                                {isSelecting ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <ArrowRight size={14} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            <button
                                type="button"
                                onClick={openCreateModal}
                                className="group flex min-h-52.5 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-emerald-500/60 hover:bg-emerald-500/5"
                            >
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-600 group-hover:text-white">
                                    <Plus size={20} />
                                </div>
                                <p className="mt-3 text-sm font-bold text-foreground">
                                    {isId ? 'Daftarkan Sekolah Baru' : 'Register New School'}
                                </p>
                                <p className="mt-1 max-w-60 text-xs text-muted-foreground">
                                    {isId
                                        ? 'Tambahkan unit TK, RA, SD, MI, SMP, MTs, SMA, MA, SMK, SLB, atau PKBM.'
                                        : 'Add a TK, RA, SD, MI, SMP, MTs, SMA, MA, SMK, SLB, or PKBM institution.'}
                                </p>
                            </button>
                        </div>
                    </>
                )}
            </main>

            <footer className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
                {APP_NAME} v{APP_VERSION} —{' '}
                {isId ? 'Konsol Manajemen Multi-Sekolah' : 'Multi-School Management Console'}
            </footer>

            {/* MODAL DAFTARKAN SEKOLAH BARU */}
            {isCreateModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="create-school-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeCreateModal();
                    }}
                >
                    <div
                        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border pb-3.5">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <School size={18} />
                                </div>
                                <div>
                                    <h3 id="create-school-title" className="text-base font-bold text-foreground">
                                        {isId ? 'Daftarkan Satuan Pendidikan' : 'Register Institution'}
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        {isId
                                            ? `Otomatis mengaktifkan TA ${defaultAcademicYear.name} (Semester Ganjil).`
                                            : `Automatically activates AY ${defaultAcademicYear.name} (Odd Semester).`}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={isCreatingSchool}
                                onClick={closeCreateModal}
                                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSchool} className="mt-4 space-y-3.5" noValidate>
                            {createFormError && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
                                >
                                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                                    <span className="leading-relaxed">{createFormError}</span>
                                </div>
                            )}

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-foreground">
                                    {isId ? 'Nama Satuan Pendidikan' : 'Institution Name'}{' '}
                                    <span className="font-bold text-destructive" aria-hidden="true">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={isCreatingSchool}
                                    value={newSchoolName}
                                    onChange={(e) => {
                                        setNewSchoolName(e.target.value);
                                        if (createFormError) setCreateFormError('');
                                    }}
                                    placeholder={
                                        isId
                                            ? 'Cth: SD Muhammadiyah Pajangan 1'
                                            : 'e.g., Muhammadiyah Elementary School'
                                    }
                                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                        NPSN{' '}
                                        <span className="font-bold text-destructive" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={8}
                                        required
                                        disabled={isCreatingSchool}
                                        value={newSchoolNpsn}
                                        onChange={(e) => {
                                            setNewSchoolNpsn(e.target.value.replace(/\D/g, ''));
                                            if (createFormError) setCreateFormError('');
                                        }}
                                        placeholder="2040xxxx"
                                        className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                        {isId ? 'Status Sekolah' : 'School Status'}{' '}
                                        <span className="font-bold text-destructive" aria-hidden="true">*</span>
                                    </label>
                                    <Select
                                        value={newSchoolType}
                                        onValueChange={(value) => setNewSchoolType(value as SchoolStatusCode)}
                                        disabled={isCreatingSchool}
                                    >
                                        <SelectTrigger className="h-9 w-full text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent position="popper" sideOffset={4} className="z-60">
                                            {SCHOOL_STATUS_CHOICES.map((st) => (
                                                <SelectItem key={st.value} value={st.value} className="text-xs">
                                                    {isId ? st.labelId : st.labelEn}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-foreground">
                                    {isId ? 'Jenjang Pendidikan' : 'Education Level'}{' '}
                                    <span className="font-bold text-destructive" aria-hidden="true">*</span>
                                </label>
                                <Select
                                    value={newSchoolLevel}
                                    onValueChange={(value) => setNewSchoolLevel(value as SchoolLevelCode)}
                                    disabled={isCreatingSchool}
                                >
                                    <SelectTrigger className="h-9 w-full text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent
                                        position="popper"
                                        sideOffset={4}
                                        className="z-60 max-h-56"
                                    >
                                        {SCHOOL_LEVEL_CHOICES.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                                {isId ? opt.labelId : opt.labelEn}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                        {isId ? 'Kabupaten / Kota' : 'City'}
                                    </label>
                                    <input
                                        type="text"
                                        disabled={isCreatingSchool}
                                        value={newSchoolCity}
                                        onChange={(e) => setNewSchoolCity(e.target.value)}
                                        placeholder={isId ? 'Cth: Sleman' : 'City'}
                                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                        {isId ? 'Provinsi' : 'Province'}
                                    </label>
                                    <input
                                        type="text"
                                        disabled={isCreatingSchool}
                                        value={newSchoolProvince}
                                        onChange={(e) => setNewSchoolProvince(e.target.value)}
                                        placeholder={isId ? 'Cth: DI Yogyakarta' : 'Province'}
                                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>
                            </div>

                            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isCreatingSchool}
                                    onClick={closeCreateModal}
                                >
                                    {isId ? 'Batal' : 'Cancel'}
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={isCreatingSchool}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {isCreatingSchool && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                                    {isId ? 'Simpan & Buka Ruang Kerja' : 'Save & Open Workspace'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL KONFIRMASI KELUAR SESI */}
            {isLogoutModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="tenant-logout-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget && !isLoggingOut) {
                            setIsLogoutModalOpen(false);
                        }
                    }}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                <LogOut size={18} />
                            </div>
                            <div>
                                <h3 id="tenant-logout-title" className="text-base font-bold text-foreground">
                                    {isId ? 'Konfirmasi Keluar Sesi' : 'Confirm Sign Out'}
                                </h3>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {isId
                                        ? 'Apakah Anda yakin ingin keluar dari Konsol Manajemen Multi-Sekolah? Anda perlu masuk kembali untuk mengakses data.'
                                        : 'Are you sure you want to sign out from the Multi-School Console? You will need to sign in again to access data.'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isLoggingOut}
                                onClick={() => setIsLogoutModalOpen(false)}
                            >
                                {isId ? 'Batal' : 'Cancel'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={isLoggingOut}
                                onClick={() => void handleConfirmLogout()}
                                className="bg-rose-600 text-white hover:bg-rose-700"
                            >
                                {isLoggingOut && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                                {isId ? 'Ya, Keluar' : 'Yes, Sign Out'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}