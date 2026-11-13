import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  School,
  Lock,
  UserCheck,
  ArrowRight,
  GraduationCap,
  Wallet,
  Building2,
  ShieldCheck,
  Sun,
  Moon,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { APP_NAME, APP_VERSION } from '@/constants/app.constants';

/**
 * Kontrak tipe data untuk kartu fitur pada panel kaca (glassmorphism) di sisi kiri.
 * Menggunakan `LucideIcon` agar ketat secara tipe data dan bebas dari `any`.
 */
interface GlassFeatureCard {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

/**
 * Halaman Gerbang Masuk Utama (LoginPage).
 *
 * Fitur utama:
 * 1. Tata letak responsif otomatis berbasis grid 12-kolom (`7:5`) dan tinggi layar dinamis (`min-h-dvh`)
 *    agar tidak terpotong di layar laptop standar maupun menyisakan ruang kosong berlebih di layar lebar.
 * 2. Estetika Emerald-Teal dengan pendar cahaya lembut (ambient glow) dan kartu kaca (glassmorphism).
 * 3. Autentikasi multi-identitas terpusat (Email, NIP, NUPTK, NISN, atau NIK) melalui `useAuthStore`.
 */
export function LoginPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading: storeLoading } = useAuthStore();
  const { theme, setTheme, locale: currentLocale, setLocale } = useUIStore();

  // State input kredensial pengguna
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberSession, setRememberSession] = useState<boolean>(true);

  // State kontrol antarmuka (visibilitas kata sandi, status kirim, dan pesan kesalahan)
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  /**
   * Menyinkronkan tema terang ('light') atau gelap ('dark') pada elemen root <html>
   * setiap kali pengguna mengganti mode tampilan di halaman login.
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
   * Menangani pengiriman formulir masuk:
   * 1. Mengirim `identifier` & `password` ke `authStore.login` (resolusi NIP/NISN/NIK ke email
   *    ditangani langsung oleh `authService`).
   * 2. Jika akun baru pertama kali masuk (`isFirstLogin === true`), arahkan wajib ke
   *    halaman pembaruan kata sandi (`/force-change-password`).
   * 3. Jika akun sudah aktif normal, arahkan langsung ke `/dashboard`.
   */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await login(identifier, password);

      if (result.success) {
        if (result.user?.isFirstLogin) {
          navigate('/force-change-password', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
        return;
      }

      setErrorMessage(result.message || t('auth.loginError'));
    } catch {
      setErrorMessage(t('auth.loginError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Menampilkan instruksi resmi pemulihan kata sandi melalui Operator/Admin Sekolah.
   */
  const handleForgotPassword = (): void => {
    const message =
      locale === 'id'
        ? 'Silakan hubungi Admin atau Operator Sekolah Anda untuk melakukan reset kata sandi.'
        : 'Please contact your School Admin or Operator to reset your password.';

    toast.info(message, { duration: 5000 });
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

  const isBusy = isSubmitting || storeLoading;

  // Data 3 pilar modul utama untuk ditampilkan pada kartu kaca (glassmorphism)
  const glassFeatures: GlassFeatureCard[] = [
    {
      icon: GraduationCap,
      title: locale === 'id' ? 'Akademik' : 'Academics',
      subtitle: locale === 'id' ? 'Siswa, Guru & Jadwal' : 'Students & Schedules',
    },
    {
      icon: Wallet,
      title: locale === 'id' ? 'Keuangan' : 'Finance',
      subtitle: locale === 'id' ? 'SPP, Kas & Laporan' : 'Tuition & Cash Ledger',
    },
    {
      icon: Building2,
      title: locale === 'id' ? 'Operasional' : 'Operations',
      subtitle: locale === 'id' ? 'Sarpras, Surat & Aset' : 'Facilities & Assets',
    },
  ];

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-12 bg-muted/30 text-foreground transition-colors duration-300">
      {/* =====================================================================
          PANEL KIRI (7 KOLOM): EMERALD-TEAL GRADIENT, AMBIENT GLOW & GLASS CARDS
          Menggunakan padding & tipografi adaptif agar seluruh kartu kaca di bawah
          tampil utuh di layar laptop standar maupun layar lebar.
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

          {/* Blok Tajuk Utama (Ukuran adaptif agar tidak memakan tinggi berlebih) */}
          <div className="my-auto py-4">
            <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur-md">
              <ShieldCheck size={14} className="text-emerald-200" />
              <span>
                {locale === 'id'
                  ? 'Sistem Manajemen Sekolah Terintegrasi'
                  : 'Integrated School Management System'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl xl:text-[40px] font-bold leading-[1.18] tracking-tight text-white">
              {locale === 'id' ? (
                <>
                  Sistem Manajemen Sekolah{' '}
                  <span className="text-emerald-200">Terpadu & Akurat</span>
                </>
              ) : (
                <>
                  Unified School Management{' '}
                  <span className="text-emerald-200">System</span>
                </>
              )}
            </h1>

            <p className="mt-3.5 text-xs xl:text-sm text-emerald-50/85 max-w-xl leading-relaxed">
              {locale === 'id'
                ? 'Kelola seluruh operasional satuan pendidikan — mulai dari data induk akademik, presensi, hingga administrasi keuangan untuk jenjang SD, SMP, SMA, dan SMK.'
                : 'Manage complete school operations — from student and academic records to attendance and tuition finance across all school levels.'}
            </p>
          </div>

          {/* Baris 3 Kartu Kaca (Glassmorphism Cards) Kompak & Utuh */}
          <div className="grid grid-cols-3 gap-3 xl:gap-4">
            {glassFeatures.map((feature) => {
              const IconComponent = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-white/20 bg-white/10 p-3.5 xl:p-4 backdrop-blur-md shadow-lg shadow-emerald-950/15 transition-colors hover:bg-white/15"
                >
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-emerald-100">
                    <IconComponent size={16} />
                  </div>
                  <h3 className="text-xs xl:text-sm font-semibold text-white">{feature.title}</h3>
                  <p className="mt-0.5 text-[11px] xl:text-xs text-emerald-100/75 line-clamp-1">
                    {feature.subtitle}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* =====================================================================
          PANEL KANAN (5 KOLOM): FORMULIR AUTENTIKASI DALAM BINGKAI KARTU
          Menggunakan latar `bg-muted/30` dengan kartu `bg-card` agar proporsional
          dan tidak menyisakan ruang putih kosong yang melebar.
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
              <p className="text-[11px] text-muted-foreground">Portal Sekolah</p>
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

        {/* Kontainer Kartu Formulir Login (Terpusat & Terbingkai Rapi) */}
        <div className="mx-auto my-auto w-full max-w-105 py-3">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-card-foreground">
                {t('auth.loginTitle')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('auth.loginSubtitle')}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Kolom Input Identitas (Email / NIP / NUPTK / NISN / NIK) */}
              <div>
                <label
                  htmlFor="login-identifier"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  {locale === 'id' ? 'Email / NIP / NISN / Username' : 'Email / NIP / NISN / Username'}
                </label>
                <div className="relative">
                  <UserCheck
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="login-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={isBusy}
                    placeholder={
                      locale === 'id' ? 'Cth: 1980.., 001.., W-001..' : 'Ex: 1980.., 001.., W-001..'
                    }
                    className={cn(
                      'h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3.5 text-sm text-foreground',
                      'placeholder:text-muted-foreground/70',
                      'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                      'disabled:cursor-not-allowed disabled:opacity-60 transition-all'
                    )}
                    required
                  />
                </div>
              </div>

              {/* Kolom Input Kata Sandi */}
              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isBusy}
                    placeholder="••••••••"
                    className={cn(
                      'h-10 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-sm text-foreground',
                      'placeholder:text-muted-foreground/70',
                      'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                      'disabled:cursor-not-allowed disabled:opacity-60 transition-all'
                    )}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Opsi Ingat Saya & Lupa Kata Sandi */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => setRememberSession(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-muted-foreground">{t('auth.rememberMe')}</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline transition-colors"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>

              {/* Notifikasi Kesalahan Login */}
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  {errorMessage}
                </div>
              )}

              {/* Tombol Submit dengan Aksen Glow Emerald */}
              <button
                id="login-submit"
                type="submit"
                disabled={isBusy}
                className={cn(
                  'mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-all',
                  'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/25',
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                  'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]'
                )}
              >
                {isBusy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    <span>{t('auth.loginButton')}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
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