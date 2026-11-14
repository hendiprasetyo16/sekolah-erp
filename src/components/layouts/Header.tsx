import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Bell,
  Sun,
  Moon,
  LogOut,
  User,
  Settings,
  ChevronRight,
  ChevronDown,
  Menu,
  Building2,
  CheckCheck,
  CalendarRange,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import { ROLE_LABELS } from '@/constants/app.constants';
import { getInitials } from '@/utils/format';
import { Button } from '@/components/ui/button';

interface HeaderNotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
}

interface HeaderNotificationStore {
  unreadCount?: number;
  notifications?: HeaderNotificationItem[];
  markAllAsRead?: () => void;
}

interface BreadcrumbItem {
  label: string;
  href: string;
  isClickable: boolean;
}

interface AcademicYearOption {
  id: string;
  schoolId: string;
  name: string;
  startYear?: number;
  endYear?: number;
  isActive: boolean;
}

type AuthAcademicYear = ReturnType<typeof useAuthStore.getState>['academicYear'];

const CORE_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'] as const;

/**
 * Kamus label dwibahasa untuk segmen URL pada Breadcrumb.
 */
const ROUTE_SEGMENT_LABELS: Record<string, { id: string; en: string }> = {
  dashboard: { id: 'Dasbor', en: 'Dashboard' },
  academic: { id: 'Akademik', en: 'Academic' },
  'master-data': { id: 'Master Akademik', en: 'Master Academic' },
  students: { id: 'Data Siswa', en: 'Students' },
  teachers: { id: 'Guru & Staf', en: 'Teachers & Staff' },
  schedules: { id: 'Jadwal Pelajaran', en: 'Schedules' },
  attendance: { id: 'Presensi', en: 'Attendance' },
  teacher: { id: 'Presensi GPS', en: 'GPS Check-In' },
  finance: { id: 'Keuangan', en: 'Finance' },
  'fee-templates': { id: 'Master Biaya', en: 'Fee Templates' },
  bills: { id: 'Tagihan Siswa', en: 'Student Bills' },
  payments: { id: 'Pembayaran', en: 'Payments' },
  inventory: { id: 'Sarpras & Aset', en: 'Inventory' },
  admin: { id: 'Administrasi', en: 'Administration' },
  users: { id: 'Manajemen Akun', en: 'User Accounts' },
  scholarships: { id: 'Beasiswa', en: 'Scholarships' },
  reports: { id: 'Laporan', en: 'Reports' },
  settings: { id: 'Pengaturan', en: 'Settings' },
  school: { id: 'Profil Sekolah', en: 'School Profile' },
  profile: { id: 'Profil Saya', en: 'My Profile' },
  create: { id: 'Tambah Baru', en: 'Create New' },
  new: { id: 'Tambah Baru', en: 'New' },
  edit: { id: 'Ubah Data', en: 'Edit' },
};

const NON_ROUTABLE_SEGMENTS = new Set<string>(['academic']);

export function Header() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const { theme, setTheme, locale: currentLocale, setLocale, setSidebarOpen } = useUIStore();
  const { user, school, academicYear, logout, setSchool, setAcademicYear } = useAuthStore();

  const notificationStore = useNotificationStore() as unknown as HeaderNotificationStore;
  const unreadCount = notificationStore.unreadCount ?? 0;
  const notifications = notificationStore.notifications ?? [];
  const markAllAsRead = notificationStore.markAllAsRead;

  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [yearMenuOpen, setYearMenuOpen] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [isRefreshingYears, setIsRefreshingYears] = useState<boolean>(false);
  const loadedSchoolIdRef = useRef<string | null>(null);

  const canAccessSettings = Boolean(
    user?.role && (CORE_ADMIN_ROLES as readonly string[]).includes(user.role)
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isLoggingOut) {
        setUserMenuOpen(false);
        setNotificationOpen(false);
        setYearMenuOpen(false);
        setIsLogoutModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoggingOut]);

  const fetchSchoolAcademicYears = useCallback(
    async (forceRefresh = false): Promise<void> => {
      const targetSchoolId = school?.id;
      if (!targetSchoolId) return;

      if (!forceRefresh && loadedSchoolIdRef.current === targetSchoolId && academicYears.length > 0) {
        return;
      }

      setIsRefreshingYears(true);

      const timeoutId = window.setTimeout(() => {
        setIsRefreshingYears(false);
      }, 5000);

      try {
        // <-- PERBAIKAN BUG: Hanya ambil kolom yang benar-benar ada di tabel academic_years
        const { data, error } = await supabase
          .from('academic_years')
          .select('id, schoolId, name, startYear, endYear, isActive')
          .eq('schoolId', targetSchoolId)
          .order('startYear', { ascending: false });

        if (!error && Array.isArray(data)) {
          setAcademicYears(data as AcademicYearOption[]);
          loadedSchoolIdRef.current = targetSchoolId;
        }
      } finally {
        window.clearTimeout(timeoutId);
        setIsRefreshingYears(false);
      }
    },
    [school?.id, academicYears.length]
  );

  useEffect(() => {
    if (!school?.id) {
      setAcademicYears([]);
      loadedSchoolIdRef.current = null;
      return;
    }

    if (loadedSchoolIdRef.current !== school.id) {
      void fetchSchoolAcademicYears(true);
    }
  }, [school?.id, fetchSchoolAcademicYears]);

  const handleToggleYearMenu = (): void => {
    const nextState = !yearMenuOpen;
    setYearMenuOpen(nextState);
    setNotificationOpen(false);
    setUserMenuOpen(false);

    if (nextState) {
      void fetchSchoolAcademicYears(false);
    }
  };

  const handleSelectAcademicYear = (selected: AcademicYearOption): void => {
    setAcademicYear(selected as unknown as AuthAcademicYear);
    setYearMenuOpen(false);
    toast.success(
      locale === 'id'
        ? `Konteks dialihkan ke Tahun Ajaran ${selected.name}`
        : `Switched context to Academic Year ${selected.name}`
    );
  };

  const displayedAcademicYears: AcademicYearOption[] = (() => {
    if (academicYears.length > 0) return academicYears;
    if (academicYear) {
      return [academicYear as unknown as AcademicYearOption];
    }
    return [];
  })();

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = pathSegments.map((segment, idx) => {
    const isUuid = segment.length >= 24 || /^[0-9a-fA-F-]{36}$/.test(segment);
    const translated = ROUTE_SEGMENT_LABELS[segment]?.[locale];

    const label = isUuid
      ? 'Detail'
      : translated ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

    return {
      label,
      href: '/' + pathSegments.slice(0, idx + 1).join('/'),
      isClickable: !NON_ROUTABLE_SEGMENTS.has(segment),
    };
  });

  const currentPageTitle =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : t('sidebar.dashboard');

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

  const handleReturnToTenantConsole = (): void => {
    setSchool(null);
    setAcademicYear(null);
    navigate('/dashboard', { replace: true });
  };

  const roleDisplay = user?.role
    ? ROLE_LABELS[user.role]?.[locale] || user.role.replace(/_/g, ' ')
    : '';

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-xs sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label={locale === 'id' ? 'Buka menu navigasi' : 'Open navigation menu'}
          >
            <Menu size={19} />
          </button>

          <span className="truncate text-sm font-semibold text-foreground md:hidden">
            {currentPageTitle}
          </span>

          <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-[13px] md:flex">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.href} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight size={13} className="text-muted-foreground/60" />}
                  {isLast || !crumb.isClickable ? (
                    <span
                      className={cn(
                        isLast ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.href}
                      className="text-muted-foreground transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {academicYear?.name && (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={handleToggleYearMenu}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
                title={
                  locale === 'id' ? 'Ganti konteks tahun ajaran' : 'Switch academic year context'
                }
              >
                <CalendarRange size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span className="tabular-nums">TA {academicYear.name}</span>
                <ChevronDown
                  size={12}
                  className={cn(
                    'text-emerald-600/80 transition-transform duration-150 dark:text-emerald-400/80',
                    yearMenuOpen && 'rotate-180'
                  )}
                />
              </button>

              {yearMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setYearMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3.5 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {locale === 'id' ? 'Pilih Tahun Ajaran' : 'Select Academic Year'}
                      </p>
                      {isRefreshingYears && (
                        <Loader2 size={12} className="animate-spin text-emerald-600" />
                      )}
                    </div>

                    <div className="max-h-60 overflow-y-auto p-1.5">
                      {displayedAcademicYears.map((item) => {
                        const isCurrent = item.id === academicYear.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectAcademicYear(item)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                              isCurrent
                                ? 'bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <div>
                              <p className="tabular-nums">TA {item.name}</p>
                              {item.isActive && (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  {locale === 'id' ? 'Tahun Aktif Berjalan' : 'Current Active'}
                                </span>
                              )}
                            </div>
                            {isCurrent && <Check size={14} className="text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {user?.role === 'SUPER_ADMIN' && (
            <button
              type="button"
              onClick={handleReturnToTenantConsole}
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-emerald-500/40 hover:bg-muted md:flex"
            >
              <Building2 size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span>
                {school
                  ? locale === 'id'
                    ? 'Ganti Sekolah'
                    : 'Switch School'
                  : locale === 'id'
                    ? 'Konsol Sekolah'
                    : 'School Console'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setLocale(currentLocale === 'id' ? 'en' : 'id')}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t('common.language')}
          >
            {currentLocale}
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationOpen((prev) => !prev);
                setUserMenuOpen(false);
                setYearMenuOpen(false);
              }}
              className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t('common.notifications')}
              aria-label={t('common.notifications')}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-card" />
              )}
            </button>

            {notificationOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-foreground">
                      {locale === 'id' ? 'Notifikasi' : 'Notifications'}
                    </span>
                    {unreadCount > 0 && markAllAsRead && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        <CheckCheck size={13} />
                        {locale === 'id' ? 'Tandai dibaca' : 'Mark read'}
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        {locale === 'id' ? 'Tidak ada notifikasi baru' : 'No new notifications'}
                      </p>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={cn(
                            'border-b border-border px-3.5 py-2.5 text-left last:border-b-0',
                            !notif.isRead && 'bg-emerald-500/5'
                          )}
                        >
                          <p className="text-xs font-medium text-foreground">{notif.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {notif.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mx-0.5 h-5 w-px bg-border" />

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((prev) => !prev);
                setNotificationOpen(false);
                setYearMenuOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-600/10 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {user ? getInitials(user.fullName) : 'U'}
              </div>
              <div className="hidden text-left lg:block">
                <p className="text-xs font-semibold leading-tight text-foreground">
                  {user?.fullName || 'Pengguna'}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">{roleDisplay}</p>
              </div>
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  <div className="border-b border-border bg-muted/30 px-3.5 py-2.5">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {user?.fullName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigate('/profile');
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      <User size={14} className="text-muted-foreground" />
                      {t('common.profile')}
                    </button>
                    {canAccessSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/settings');
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <Settings size={14} className="text-muted-foreground" />
                        {t('common.settings')}
                      </button>
                    )}
                  </div>
                  <div className="border-t border-border p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setIsLogoutModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <LogOut size={14} />
                      {t('common.logout')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {isLogoutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-logout-title"
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
                <h3 id="header-logout-title" className="text-base font-bold text-foreground">
                  {locale === 'id' ? 'Konfirmasi Keluar Sesi' : 'Confirm Sign Out'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {locale === 'id'
                    ? 'Sesi kerja Anda akan diakhiri. Pastikan seluruh perubahan data telah disimpan.'
                    : 'Your current session will end. Make sure all data changes have been saved.'}
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
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => void handleConfirmLogout()}
              >
                {isLoggingOut && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {locale === 'id' ? 'Ya, Keluar' : 'Yes, Sign Out'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}