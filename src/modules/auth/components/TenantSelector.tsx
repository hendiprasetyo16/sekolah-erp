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
    Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { APP_NAME, APP_VERSION } from '@/constants/app.constants';
import { Button } from '@/components/ui/button';

/**
 * Representasi baris data satuan pendidikan dari tabel `public.schools`.
 * Mendukung variasi kolom opsional agar aman terhadap skema database.
 */
interface SchoolTenantRow {
    id: string;
    name: string;
    npsn: string;
    level?: string | null;
    educationLevel?: string | null;
    city?: string | null;
    province?: string | null;
    address?: string | null;
    logoUrl?: string | null;
    isActive?: boolean | null;
}

/**
 * Representasi baris data tahun ajaran dari tabel `public.academic_years`.
 */
interface AcademicYearRow {
    id: string;
    schoolId: string;
    name: string;
    semester?: string | null;
    isActive?: boolean | null;
}

type AuthStoreState = ReturnType<typeof useAuthStore.getState>;
type EducationLevelFilter = 'ALL' | 'SD' | 'SMP' | 'SMA' | 'SMK';

const LEVEL_FILTER_OPTIONS: readonly EducationLevelFilter[] = [
    'ALL',
    'SD',
    'SMP',
    'SMA',
    'SMK',
];

/**
 * Mengambil label jenjang pendidikan yang terstandar dari baris data sekolah.
 */
function resolveSchoolLevel(school: SchoolTenantRow): string {
    const rawLevel = school.level ?? school.educationLevel ?? 'SEKOLAH';
    return rawLevel.trim().toUpperCase();
}

/**
 * Memformat lokasi geografis sekolah (Kabupaten/Kota & Provinsi).
 */
function formatSchoolLocation(school: SchoolTenantRow, fallbackText: string): string {
    const parts = [school.city, school.province].filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
    if (parts.length > 0) return parts.join(', ');
    if (school.address && school.address.trim().length > 0) return school.address;
    return fallbackText;
}

/**
 * Mengembalikan kelas warna lencana berdasarkan jenjang pendidikan.
 */
function getLevelBadgeStyle(level: string): string {
    switch (level) {
        case 'SD':
            return 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300';
        case 'SMP':
            return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        case 'SMA':
            return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'SMK':
            return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        default:
            return 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300';
    }
}

/**
 * Konsol Pemilihan Satuan Pendidikan (`TenantSelector`).
 *
 * Ditampilkan khusus bagi pengguna berstatus `SUPER_ADMIN` sebelum memasuki
 * ruang kerja sekolah tertentu. Menyediakan:
 * 1. Banner header Emerald-Teal dengan ringkasan statistik multi-sekolah.
 * 2. Pencarian instan (nama sekolah, NPSN, kota) & filter jenjang (`SD/SMP/SMA/SMK`).
 * 3. Pemilihan sekolah yang otomatis memuat konteks Tahun Ajaran aktif ke `useAuthStore`.
 * 4. Dialog konfirmasi keluar sesi sebelum logout dijalankan.
 */
export function TenantSelector() {
    const navigate = useNavigate();
    const { t, locale } = useTranslation();
    const { user, logout } = useAuthStore();
    const { theme, setTheme, locale: currentLocale, setLocale } = useUIStore();

    // State daftar sekolah & status pemuatan
    const [schools, setSchools] = useState<SchoolTenantRow[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectingSchoolId, setSelectingSchoolId] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string>('');

    // State pencarian, filter jenjang, & modal konfirmasi keluar
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedLevel, setSelectedLevel] = useState<EducationLevelFilter>('ALL');
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
    const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

    /**
     * Menyinkronkan tema terang ('light') atau gelap ('dark') pada elemen root <html>.
     */
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

    /**
     * Menutup modal konfirmasi keluar ketika pengguna menekan tombol `Escape`.
     */
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !isLoggingOut) {
                setIsLogoutModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLoggingOut]);

    /**
     * Memuat seluruh daftar satuan pendidikan terdaftar dari Supabase.
     */
    const fetchSchools = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        setFetchError('');

        try {
            const { data, error } = await supabase
                .from('schools')
                .select('*')
                .order('name', { ascending: true });

            if (error) {
                throw new Error(error.message);
            }

            setSchools((data as SchoolTenantRow[] | null) ?? []);
        } catch (err: unknown) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal memuat daftar satuan pendidikan.'
                        : 'Failed to load registered schools.';
            setFetchError(message);
        } finally {
            setIsLoading(false);
        }
    }, [locale]);

    useEffect(() => {
        void fetchSchools();
    }, [fetchSchools]);

    /**
     * Menyaring daftar sekolah berdasarkan kata kunci pencarian dan filter jenjang.
     */
    const filteredSchools = useMemo<SchoolTenantRow[]>(() => {
        const keyword = searchQuery.trim().toLowerCase();

        return schools.filter((item) => {
            const level = resolveSchoolLevel(item);
            const matchesLevel = selectedLevel === 'ALL' || level === selectedLevel;

            if (!matchesLevel) return false;
            if (!keyword) return true;

            const haystack = [item.name, item.npsn, item.city, item.province, level]
                .filter((val): val is string => typeof val === 'string')
                .join(' ')
                .toLowerCase();

            return haystack.includes(keyword);
        });
    }, [schools, searchQuery, selectedLevel]);

    /**
     * Memilih satuan pendidikan, memuat Tahun Ajaran aktif sekolah tersebut,
     * lalu membuka ruang kerja utama (`/dashboard`).
     */
    const handleSelectSchool = async (selectedSchool: SchoolTenantRow): Promise<void> => {
        setSelectingSchoolId(selectedSchool.id);

        try {
            // Ambil daftar tahun ajaran milik sekolah terkait, utamakan yang berstatus `isActive: true`
            const { data: yearRows } = await supabase
                .from('academic_years')
                .select('*')
                .eq('schoolId', selectedSchool.id)
                .order('isActive', { ascending: false })
                .order('name', { ascending: false })
                .limit(1);

            const activeYear = ((yearRows as AcademicYearRow[] | null) ?? [])[0] ?? null;

            // Simpan konteks sekolah dan tahun ajaran aktif ke Zustand store
            useAuthStore.setState({
                school: selectedSchool as unknown as AuthStoreState['school'],
                academicYear: activeYear as unknown as AuthStoreState['academicYear'],
            });

            toast.success(
                locale === 'id'
                    ? `Ruang kerja ${selectedSchool.name} dibuka.`
                    : `Opened workspace for ${selectedSchool.name}.`
            );

            navigate('/dashboard', { replace: true });
        } catch {
            toast.error(
                locale === 'id'
                    ? 'Gagal memuat konteks tahun ajaran sekolah.'
                    : 'Failed to load school academic year context.'
            );
        } finally {
            setSelectingSchoolId(null);
        }
    };

    /**
     * Menjalankan proses keluar sesi setelah pengguna menekan konfirmasi pada dialog.
     */
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

    // Hitung ringkasan statistik untuk kartu kaca di banner atas
    const activeSchoolCount = useMemo(
        () => schools.filter((s) => s.isActive !== false).length,
        [schools]
    );

    const distinctLevelCount = useMemo(() => {
        const levels = new Set(schools.map((s) => resolveSchoolLevel(s)));
        return levels.size;
    }, [schools]);

    return (
        <div className="min-h-dvh flex flex-col bg-muted/30 text-foreground transition-colors duration-300">
            {/* =====================================================================
          HERO BANNER EMERALD-TEAL DENGAN AMBIENT GLOW & GLASSMORPHISM
         ===================================================================== */}
            <header className="relative overflow-hidden border-b border-emerald-900/20 text-white">
                {/* Lapisan 1: Gradien Emerald ke Teal */}
                <div className="absolute inset-0 bg-linear-to-br from-emerald-600 via-teal-700 to-emerald-950 dark:from-emerald-950 dark:via-teal-950 dark:to-slate-950" />

                {/* Lapisan 2: Pendar cahaya lembut */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-20 -left-16 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
                    <div className="absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
                </div>

                {/* Lapisan 3: Pola grid halus */}
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
                    {/* Baris Navigasi Atas: Identitas Konsol + Kontrol Bahasa, Tema & Keluar */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-md shadow-md shadow-emerald-950/20">
                                <Building2 size={22} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                                        {locale === 'id'
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

                        {/* Kontrol Bahasa, Tema, dan Tombol Keluar (Memicu Modal Konfirmasi) */}
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
                                <span>{locale === 'id' ? 'Keluar' : 'Sign Out'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Baris Kartu Ringkasan Kaca (Glassmorphism Summary Cards) */}
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                                <School size={18} />
                            </div>
                            <div>
                                <p className="text-[11px] text-emerald-100/80">
                                    {locale === 'id' ? 'Total Satuan Pendidikan' : 'Registered Institutions'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {schools.length}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {locale === 'id' ? 'Sekolah' : 'Schools'}
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
                                    {locale === 'id' ? 'Status Operasional Aktif' : 'Active Operational Status'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {activeSchoolCount}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {locale === 'id' ? 'Terverifikasi' : 'Verified'}
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
                                    {locale === 'id' ? 'Cakupan Jenjang' : 'Education Levels'}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-white">
                                    {distinctLevelCount}{' '}
                                    <span className="text-xs font-normal text-emerald-100/80">
                                        {locale === 'id' ? 'Jenjang Pendidikan' : 'Levels'}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* =====================================================================
          AREA KONTEN UTAMA: TOOLBAR FILTER & GRID SATUAN PENDIDIKAN
         ===================================================================== */}
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
                {/* Kartu Header & Toolbar Pencarian */}
                <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-foreground">
                                {locale === 'id' ? 'Pilih Satuan Pendidikan' : 'Select Educational Institution'}
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {locale === 'id'
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
                                title={locale === 'id' ? 'Muat ulang daftar sekolah' : 'Refresh school list'}
                            >
                                <RefreshCw size={14} className={cn('mr-1.5', isLoading && 'animate-spin')} />
                                {locale === 'id' ? 'Segarkan' : 'Refresh'}
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                onClick={() => navigate('/academic/master-data')}
                                className="h-9 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
                            >
                                <Plus size={15} className="mr-1.5" />
                                {locale === 'id' ? 'Tambah Sekolah Baru' : 'Add New School'}
                            </Button>
                        </div>
                    </div>

                    {/* Baris Pencarian & Filter Jenjang */}
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
                                    locale === 'id'
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
                            {LEVEL_FILTER_OPTIONS.map((levelOption) => {
                                const isSelected = selectedLevel === levelOption;
                                const label =
                                    levelOption === 'ALL'
                                        ? locale === 'id'
                                            ? 'Semua Jenjang'
                                            : 'All Levels'
                                        : levelOption;

                                return (
                                    <button
                                        key={levelOption}
                                        type="button"
                                        onClick={() => setSelectedLevel(levelOption)}
                                        className={cn(
                                            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                                            isSelected
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Status Loading Skeleton */}
                {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((idx) => (
                            <div
                                key={idx}
                                className="h-52 animate-pulse rounded-2xl border border-border bg-card p-5"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="h-11 w-11 rounded-xl bg-muted" />
                                    <div className="h-5 w-14 rounded-md bg-muted" />
                                </div>
                                <div className="mt-4 h-5 w-3/4 rounded bg-muted" />
                                <div className="mt-2 h-3.5 w-1/3 rounded bg-muted" />
                                <div className="mt-4 h-3.5 w-2/3 rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : fetchError ? (
                    /* Status Error Memuat Data */
                    <div className="rounded-2xl border border-rose-500/30 bg-card p-8 text-center">
                        <AlertTriangle size={28} className="mx-auto text-rose-500" />
                        <h3 className="mt-3 text-sm font-bold text-foreground">
                            {locale === 'id' ? 'Gagal Memuat Data Sekolah' : 'Failed to Load Schools'}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">{fetchError}</p>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => void fetchSchools()}
                            className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            {locale === 'id' ? 'Coba Lagi' : 'Retry'}
                        </Button>
                    </div>
                ) : (
                    /* Grid Kartu Sekolah Terdaftar + Kartu Pintasan Tambah Sekolah */
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredSchools.map((schoolItem) => {
                            const level = resolveSchoolLevel(schoolItem);
                            const isSelecting = selectingSchoolId === schoolItem.id;
                            const locationText = formatSchoolLocation(
                                schoolItem,
                                locale === 'id' ? 'Lokasi belum dilengkapi' : 'Location not specified'
                            );

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
                                    {/* Garis aksen atas Emerald-Teal saat hover */}
                                    <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-emerald-500 to-teal-600 opacity-0 transition-opacity group-hover:opacity-100" />

                                    <div>
                                        {/* Baris Atas Kartu: Logo Sekolah & Lencana Jenjang */}
                                        <div className="flex items-start justify-between gap-3">
                                            {schoolItem.logoUrl ? (
                                                <img
                                                    src={schoolItem.logoUrl}
                                                    alt={schoolItem.name}
                                                    className="h-11 w-11 rounded-xl border border-border object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:text-emerald-300">
                                                    <School size={21} />
                                                </div>
                                            )}

                                            <span
                                                className={cn(
                                                    'rounded-md border px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
                                                    getLevelBadgeStyle(level)
                                                )}
                                            >
                                                {level}
                                            </span>
                                        </div>

                                        {/* Nama & NPSN Sekolah */}
                                        <h3 className="mt-4 line-clamp-1 text-base font-bold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                            {schoolItem.name}
                                        </h3>

                                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                                            NPSN: <span className="font-semibold text-foreground/85">{schoolItem.npsn || '-'}</span>
                                        </p>

                                        {/* Lokasi Sekolah */}
                                        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <MapPin size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <span className="line-clamp-1">{locationText}</span>
                                        </div>
                                    </div>

                                    {/* Tombol Footer Kartu: Buka Ruang Kerja */}
                                    <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3.5">
                                        <span className="text-xs font-semibold text-emerald-600 transition-colors group-hover:text-emerald-700 dark:text-emerald-400">
                                            {isSelecting
                                                ? locale === 'id'
                                                    ? 'Memuat ruang kerja...'
                                                    : 'Opening workspace...'
                                                : locale === 'id'
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

                        {/* Kartu Pintasan Pendaftaran Sekolah Baru */}
                        <button
                            type="button"
                            onClick={() => navigate('/academic/master-data')}
                            className="group flex min-h-52.5 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-emerald-500/60 hover:bg-emerald-500/5"
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-600 group-hover:text-white">
                                <Plus size={20} />
                            </div>
                            <p className="mt-3 text-sm font-bold text-foreground">
                                {locale === 'id' ? 'Daftarkan Sekolah Baru' : 'Register New School'}
                            </p>
                            <p className="mt-1 max-w-55 text-xs text-muted-foreground">
                                {locale === 'id'
                                    ? 'Tambahkan unit satuan pendidikan baru ke dalam sistem terpadu.'
                                    : 'Add a new educational institution into the unified platform.'}
                            </p>
                        </button>
                    </div>
                )}
            </main>

            {/* Footer Identitas Sistem */}
            <footer className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
                {APP_NAME} v{APP_VERSION} —{' '}
                {locale === 'id' ? 'Konsol Manajemen Multi-Sekolah' : 'Multi-School Management Console'}
            </footer>

            {/* =====================================================================
          MODAL DIALOG KONFIRMASI KELUAR SESI
         ===================================================================== */}
            {isLogoutModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="tenant-logout-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onClick={() => {
                        if (!isLoggingOut) setIsLogoutModalOpen(false);
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
                                    {locale === 'id' ? 'Konfirmasi Keluar Sesi' : 'Confirm Sign Out'}
                                </h3>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {locale === 'id'
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
                                {locale === 'id' ? 'Batal' : 'Cancel'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={isLoggingOut}
                                onClick={() => void handleConfirmLogout()}
                                className="bg-rose-600 text-white hover:bg-rose-700"
                            >
                                {isLoggingOut && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                                {locale === 'id' ? 'Ya, Keluar' : 'Yes, Sign Out'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}