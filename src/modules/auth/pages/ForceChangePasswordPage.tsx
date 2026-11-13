import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    KeyRound,
    Loader2,
    LogOut,
    Eye,
    EyeOff,
    LockKeyhole,
    School,
    ShieldCheck,
    UserCheck,
    KeySquare,
    Sun,
    Moon,
    Globe,
    type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { APP_NAME, APP_VERSION } from '@/constants/app.constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';

/**
 * Daftar kata sandi lemah/bawaan yang dilarang digunakan sebagai kata sandi baru.
 */
const FORBIDDEN_DEFAULT_PASSWORDS: readonly string[] = [
    '12345678',
    '123456789',
    'password',
    'password123',
    'sekolah123',
    'admin123',
];

/**
 * Membangun skema validasi Zod secara dinamis mengikuti bahasa antarmuka ('id' atau 'en').
 * Memastikan kata sandi baru minimal 8 karakter, bukan sandi bawaan umum,
 * dan cocok dengan kolom konfirmasi kata sandi.
 */
function createChangePasswordSchema(locale: string) {
    const isId = locale === 'id';

    return z
        .object({
            newPassword: z
                .string()
                .min(
                    8,
                    isId
                        ? 'Kata sandi baru minimal harus terdiri dari 8 karakter.'
                        : 'New password must be at least 8 characters long.'
                )
                .refine((val) => !FORBIDDEN_DEFAULT_PASSWORDS.includes(val.trim().toLowerCase()), {
                    message: isId
                        ? 'Gunakan kombinasi kata sandi pribadi, bukan kata sandi bawaan umum.'
                        : 'Please choose a personal password instead of a common default password.',
                }),
            confirmPassword: z
                .string()
                .min(
                    8,
                    isId
                        ? 'Konfirmasi kata sandi minimal 8 karakter.'
                        : 'Confirm password must be at least 8 characters long.'
                ),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
            message: isId
                ? 'Konfirmasi kata sandi tidak cocok dengan kata sandi baru.'
                : 'Password confirmation does not match the new password.',
            path: ['confirmPassword'],
        });
}

/**
 * Tipe data terinferensi dari skema validasi formulir ganti kata sandi.
 */
type ChangePasswordFormValues = z.infer<ReturnType<typeof createChangePasswordSchema>>;

/**
 * Kontrak tipe data untuk kartu kaca (glassmorphism) pada panel informasi kiri.
 */
interface SecurityGlassCard {
    icon: LucideIcon;
    title: string;
    subtitle: string;
}

/**
 * Helper aman untuk mengekstrak pesan kesalahan dari objek `unknown`
 * tanpa menggunakan tipe `any`.
 */
function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message;
    }
    return fallback;
}

/**
 * Halaman Pembaruan Kata Sandi Wajib (`ForceChangePasswordPage`).
 *
 * Ditampilkan secara otomatis ketika pengguna berhasil masuk menggunakan akun baru
 * yang masih memiliki penanda `isFirstLogin === true`.
 * Tata letak dibuat identik dengan `LoginPage` (grid adaptif 7:5 dengan `min-h-dvh`,
 * panel Emerald-Teal glassmorphism di kiri, dan kartu formulir di kanan).
 */
export function ForceChangePasswordPage() {
    const navigate = useNavigate();
    const { t, locale } = useTranslation();
    const { user, setUser, logout } = useAuthStore();
    const { theme, setTheme, locale: currentLocale, setLocale } = useUIStore();

    // State status pengiriman & visibilitas masing-masing kolom kata sandi
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

    // Inisialisasi React Hook Form dengan validasi Zod dwibahasa
    const form = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(createChangePasswordSchema(locale)),
        defaultValues: {
            newPassword: '',
            confirmPassword: '',
        },
    });

    /**
     * Menyinkronkan tema terang ('light') atau gelap ('dark') pada elemen root <html>
     * agar tampilan tetap konsisten meskipun halaman dimuat ulang secara langsung.
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
     * Memproses pembaruan kata sandi baru:
     * 1. Memvalidasi keberadaan sesi pengguna aktif (`user.id`).
     * 2. Memperbarui kredensial kata sandi langsung pada layanan Supabase Auth.
     * 3. Mencabut status `isFirstLogin` menjadi `false` pada tabel `public.users`.
     * 4. Menyinkronkan state global Zustand dan mengarahkan pengguna ke `/dashboard`.
     */
    const onSubmit = async (values: ChangePasswordFormValues): Promise<void> => {
        if (!user?.id) {
            toast.error(
                locale === 'id'
                    ? 'Sesi pengguna tidak ditemukan. Silakan masuk kembali.'
                    : 'User session not found. Please sign in again.'
            );
            navigate('/login', { replace: true });
            return;
        }

        setIsSubmitting(true);
        try {
            // Langkah 1: Perbarui kata sandi pada Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({
                password: values.newPassword,
            });

            if (authError) {
                throw new Error(authError.message);
            }

            // Langkah 2: Perbarui status `isFirstLogin` di tabel profil `public.users`
            const { error: dbError } = await supabase
                .from('users')
                .update({
                    isFirstLogin: false,
                    updatedAt: new Date().toISOString(),
                })
                .eq('id', user.id);

            if (dbError) {
                throw new Error(
                    locale === 'id'
                        ? 'Kata sandi Auth berhasil diubah, tetapi gagal memperbarui status profil akun.'
                        : 'Auth password updated, but failed to update account profile status.'
                );
            }

            // Langkah 3: Perbarui state lokal Zustand agar tidak diminta ganti sandi lagi
            setUser({ ...user, isFirstLogin: false });

            toast.success(
                locale === 'id'
                    ? 'Kata sandi pribadi berhasil disimpan. Mengalihkan ke ruang kerja...'
                    : 'Personal password saved successfully. Redirecting to workspace...'
            );

            navigate('/dashboard', { replace: true });
        } catch (error: unknown) {
            toast.error(
                getErrorMessage(
                    error,
                    locale === 'id'
                        ? 'Terjadi kesalahan saat memperbarui kata sandi.'
                        : 'An error occurred while updating your password.'
                )
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    /**
     * Membatalkan proses aktivasi sandi baru dan mengeluarkan pengguna ke halaman login.
     */
    const handleCancelAndLogout = async (): Promise<void> => {
        await logout();
        navigate('/login', { replace: true });
    };

    /**
     * Mengubah mode tema antara terang ('light') dan gelap ('dark').
     */
    const handleToggleTheme = (): void => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    /**
     * Mengubah bahasa antarmuka antara Bahasa Indonesia ('id') dan Bahasa Inggris ('en').
     */
    const handleToggleLocale = (): void => {
        setLocale(currentLocale === 'id' ? 'en' : 'id');
    };

    // Data 3 kartu kaca (glassmorphism) pada panel kiri yang menjelaskan standar keamanan akun
    const securityHighlights: SecurityGlassCard[] = [
        {
            icon: ShieldCheck,
            title: locale === 'id' ? 'Terenkripsi' : 'Encrypted',
            subtitle: locale === 'id' ? 'Proteksi Kredensial' : 'Credential Protection',
        },
        {
            icon: KeySquare,
            title: locale === 'id' ? 'Sandi Pribadi' : 'Personal Key',
            subtitle: locale === 'id' ? 'Ganti Sandi Bawaan' : 'Replace Default Pass',
        },
        {
            icon: UserCheck,
            title: locale === 'id' ? 'Akses Peran' : 'Role Access',
            subtitle: locale === 'id' ? 'Sesuai Hak Tugas' : 'Scoped Permissions',
        },
    ];

    return (
        <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-12 bg-muted/30 text-foreground transition-colors duration-300">
            {/* =====================================================================
          PANEL KIRI (7 KOLOM): EMERALD-TEAL GRADIENT, AMBIENT GLOW & GLASS CARDS
          Identik dengan panel kiri pada `LoginPage` untuk menjaga kontinuitas visual.
         ===================================================================== */}
            <aside className="hidden lg:flex lg:col-span-7 relative overflow-hidden">
                {/* Lapisan 1: Gradien utama Emerald ke Teal */}
                <div className="absolute inset-0 bg-linear-to-br from-emerald-600 via-teal-700 to-emerald-950 dark:from-emerald-950 dark:via-teal-950 dark:to-slate-950" />

                {/* Lapisan 2: Pendar cahaya lembut (Ambient Neon Glow) */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-16 -left-16 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
                    <div className="absolute bottom-8 right-8 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl" />
                    <div className="absolute top-1/2 left-1/3 h-60 w-60 -translate-y-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
                </div>

                {/* Lapisan 3: Tekstur garis grid tipis */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
                        backgroundSize: '44px 44px',
                    }}
                />

                {/* Lapisan 4: Konten utama dengan distribusi ruang vertikal otomatis */}
                <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col justify-between p-7 xl:p-12 text-white">
                    {/* Header Identitas Aplikasi */}
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-md shadow-md shadow-emerald-950/20">
                            <School size={22} className="text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold tracking-tight text-white">{APP_NAME}</span>
                                <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-100 backdrop-blur-sm">
                                    v{APP_VERSION}
                                </span>
                            </div>
                            <p className="text-xs text-emerald-100/80">
                                {locale === 'id'
                                    ? 'Portal Terpadu Administrasi & Akademik'
                                    : 'Integrated School Administration Portal'}
                            </p>
                        </div>
                    </div>

                    {/* Blok Tajuk Aktivasi & Keamanan Akun */}
                    <div className="my-auto py-4">
                        <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur-md">
                            <LockKeyhole size={14} className="text-emerald-200" />
                            <span>
                                {locale === 'id'
                                    ? 'Aktivasi Keamanan Login Perdana'
                                    : 'First-Time Login Security Activation'}
                            </span>
                        </div>

                        <h1 className="text-2xl sm:text-3xl xl:text-[40px] font-bold leading-[1.18] tracking-tight text-white">
                            {locale === 'id' ? (
                                <>
                                    Perlindungan Akun &{' '}
                                    <span className="text-emerald-200">Kredensial Pribadi</span>
                                </>
                            ) : (
                                <>
                                    Account Protection &{' '}
                                    <span className="text-emerald-200">Personal Credentials</span>
                                </>
                            )}
                        </h1>

                        <p className="mt-3.5 text-xs xl:text-sm text-emerald-50/85 max-w-xl leading-relaxed">
                            {locale === 'id'
                                ? 'Demi menjaga kerahasiaan data akademik dan administrasi sekolah, setiap pengguna baru wajib mengganti kata sandi bawaan operator sebelum mengakses sistem.'
                                : 'To safeguard school academic and administrative records, every new user must replace the initial operator-issued password before accessing the system.'}
                        </p>
                    </div>

                    {/* Baris 3 Kartu Kaca (Glassmorphism Cards) Kompak & Utuh */}
                    <div className="grid grid-cols-3 gap-3 xl:gap-4">
                        {securityHighlights.map((item) => {
                            const IconComponent = item.icon;
                            return (
                                <div
                                    key={item.title}
                                    className="rounded-xl border border-white/20 bg-white/10 p-3.5 xl:p-4 backdrop-blur-md shadow-lg shadow-emerald-950/15 transition-colors hover:bg-white/15"
                                >
                                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                                        <IconComponent size={16} />
                                    </div>
                                    <h3 className="text-xs xl:text-sm font-semibold text-white">{item.title}</h3>
                                    <p className="mt-0.5 text-[11px] xl:text-xs text-emerald-100/75 line-clamp-1">
                                        {item.subtitle}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </aside>

            {/* =====================================================================
          PANEL KANAN (5 KOLOM): FORMULIR PEMBARUAN KATA SANDI DALAM KARTU
         ===================================================================== */}
            <main className="col-span-1 lg:col-span-5 flex flex-col justify-between p-4 sm:p-6 xl:p-8 bg-muted/30">
                {/* Baris Kontrol Atas: Logo Mobile + Pengalih Bahasa & Tema */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 lg:hidden">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                            <School size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold leading-tight text-foreground">{APP_NAME}</p>
                            <p className="text-[11px] text-muted-foreground">Keamanan Akun</p>
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleToggleLocale}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title={t('common.language')}
                        >
                            <Globe size={14} />
                            <span className="uppercase">{currentLocale}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleToggleTheme}
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                    </div>
                </div>

                {/* Kontainer Kartu Formulir Pembaruan Sandi */}
                <div className="mx-auto my-auto w-full max-w-105 py-3">
                    <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm">
                        {/* Tajuk Kartu */}
                        <div className="mb-4">
                            <h2 className="text-xl font-bold tracking-tight text-card-foreground">
                                {locale === 'id' ? 'Pembaruan Kata Sandi Wajib' : 'Mandatory Password Update'}
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {locale === 'id'
                                    ? 'Buat kata sandi pribadi baru (minimal 8 karakter) untuk mengaktifkan ruang kerja Anda.'
                                    : 'Create a new personal password (minimum 8 characters) to activate your workspace.'}
                            </p>
                        </div>

                        {/* Badge Identitas Akun yang Sedang Diaktifkan */}
                        {user && (
                            <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
                                <p className="font-semibold text-foreground truncate">{user.fullName}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                            </div>
                        )}

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
                                {/* Field Kata Sandi Baru */}
                                <FormField
                                    control={form.control}
                                    name="newPassword"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-semibold text-foreground">
                                                {locale === 'id' ? 'Kata Sandi Baru' : 'New Password'}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        autoComplete="new-password"
                                                        placeholder={
                                                            locale === 'id' ? 'Minimal 8 karakter' : 'Minimum 8 characters'
                                                        }
                                                        className={cn(
                                                            'h-10 rounded-lg border-border bg-background pr-10 text-sm text-foreground',
                                                            'focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20'
                                                        )}
                                                        disabled={isSubmitting}
                                                        {...field}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNewPassword((prev) => !prev)}
                                                        aria-label={showNewPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage className="text-xs" />
                                        </FormItem>
                                    )}
                                />

                                {/* Field Konfirmasi Kata Sandi Baru */}
                                <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-semibold text-foreground">
                                                {locale === 'id' ? 'Konfirmasi Kata Sandi Baru' : 'Confirm New Password'}
                                            </FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        autoComplete="new-password"
                                                        placeholder={
                                                            locale === 'id'
                                                                ? 'Ulangi kata sandi baru'
                                                                : 'Re-enter your new password'
                                                        }
                                                        className={cn(
                                                            'h-10 rounded-lg border-border bg-background pr-10 text-sm text-foreground',
                                                            'focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20'
                                                        )}
                                                        disabled={isSubmitting}
                                                        {...field}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                                        aria-label={
                                                            showConfirmPassword ? 'Sembunyikan konfirmasi' : 'Lihat konfirmasi'
                                                        }
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage className="text-xs" />
                                        </FormItem>
                                    )}
                                />

                                {/* Tombol Aksi Utama & Tombol Batal */}
                                <div className="pt-2 space-y-2">
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={cn(
                                            'h-10 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-all',
                                            'hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/25',
                                            'focus-visible:ring-2 focus-visible:ring-emerald-500/40'
                                        )}
                                    >
                                        {isSubmitting ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <KeyRound className="mr-2 h-4 w-4" />
                                        )}
                                        {locale === 'id' ? 'Simpan Kata Sandi & Masuk' : 'Save Password & Continue'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCancelAndLogout}
                                        disabled={isSubmitting}
                                        className="h-9 w-full rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                                    >
                                        <LogOut className="mr-1.5 h-3.5 w-3.5" />
                                        {locale === 'id' ? 'Batalkan & Keluar' : 'Cancel & Sign Out'}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>
                </div>

                {/* Footer Identitas Sistem */}
                <div className="text-center text-[11px] text-muted-foreground">
                    {APP_NAME} v{APP_VERSION} —{' '}
                    {locale === 'id' ? 'Sistem Manajemen Sekolah' : 'School Management System'}
                </div>
            </main>
        </div>
    );
}