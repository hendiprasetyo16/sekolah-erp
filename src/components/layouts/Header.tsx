import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Bell, Sun, Moon, LogOut, User, Settings, ChevronRight,
  Menu, Building2, CheckCheck, CalendarRange
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import { ROLE_LABELS } from '@/constants/app.constants';
import { getInitials } from '@/utils/format';
import { Button } from '@/components/ui/button';

export function Header() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, locale: currentLocale, setLocale, setSidebarOpen } = useUIStore();
  const { user, school, academicYear, logout } = useAuthStore();
  const { unreadCount = 0, notifications = [], markAllAsRead } = useNotificationStore() as any;

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, idx) => {
    const isUuid = segment.length >= 24 || /^[0-9a-fA-F-]{36}$/.test(segment);
    const label = isUuid
      ? 'Detail'
      : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

    return {
      label,
      href: '/' + pathSegments.slice(0, idx + 1).join('/'),
    };
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleDisplay = user?.role
    ? ROLE_LABELS[user.role]?.[locale] || user.role.replace(/_/g, ' ')
    : '';

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-6">
        {/* Kiri: Tombol Menu Mobile & Breadcrumb */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Menu"
          >
            <Menu size={19} />
          </button>

          <nav className="hidden items-center gap-1.5 text-[13px] md:flex">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={crumb.href} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight size={13} className="text-muted-foreground/60" />}
                  {isLast ? (
                    <span className="font-medium text-foreground">{crumb.label}</span>
                  ) : (
                    <Link
                      to={crumb.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Kanan: Konteks Tahun Ajaran, Switcher Tenant, Kontrol & Profil */}
        <div className="flex items-center gap-2">
          {/* Indikator Tahun Ajaran Aktif */}
          {academicYear?.name && (
            <div className="hidden items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground sm:flex">
              <CalendarRange size={13} className="text-primary" />
              <span className="tabular-nums">TA {academicYear.name}</span>
            </div>
          )}

          {/* Tombol Ganti Sekolah (Khusus Super Admin) */}
          {user?.role === 'SUPER_ADMIN' && school && (
            <button
              type="button"
              onClick={() => useAuthStore.setState({ school: null, academicYear: null })}
              className="hidden items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted md:flex"
            >
              <Building2 size={13} className="text-muted-foreground" />
              <span>{locale === 'id' ? 'Ganti Sekolah' : 'Switch School'}</span>
            </button>
          )}

          {/* Bahasa */}
          <button
            type="button"
            onClick={() => setLocale(currentLocale === 'id' ? 'en' : 'id')}
            className="rounded-md px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('common.language')}
          >
            {currentLocale}
          </button>

          {/* Tema */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Notifikasi */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationOpen(!notificationOpen);
                setUserMenuOpen(false);
              }}
              className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('common.notifications')}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-600" />
              )}
            </button>

            {notificationOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                    <span className="text-xs font-semibold text-foreground">
                      {locale === 'id' ? 'Notifikasi' : 'Notifications'}
                    </span>
                    {unreadCount > 0 && markAllAsRead && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
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
                      notifications.map((notif: any) => (
                        <div
                          key={notif.id}
                          className={cn(
                            'border-b border-border px-3.5 py-2.5 text-left last:border-b-0',
                            !notif.isRead && 'bg-muted/40'
                          )}
                        >
                          <p className="text-xs font-medium text-foreground">{notif.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Menu Pengguna */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setNotificationOpen(false);
              }}
              className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-muted"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground border border-border">
                {user ? getInitials(user.fullName) : 'U'}
              </div>
              <div className="hidden text-left lg:block">
                <p className="text-xs font-medium leading-tight text-foreground">
                  {user?.fullName || 'Pengguna'}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">{roleDisplay}</p>
              </div>
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="truncate text-xs font-semibold text-foreground">{user?.fullName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                    >
                      <User size={14} className="text-muted-foreground" />
                      {t('common.profile')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                    >
                      <Settings size={14} className="text-muted-foreground" />
                      {t('common.settings')}
                    </button>
                  </div>
                  <div className="border-t border-border p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setIsLogoutModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
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

      {/* Dialog Konfirmasi Keluar */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">
              {locale === 'id' ? 'Keluar dari Sesi' : 'Sign Out'}
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {locale === 'id'
                ? 'Sesi kerja Anda akan diakhiri. Pastikan perubahan data sudah disimpan.'
                : 'Your current session will end. Make sure all changes are saved.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsLogoutModalOpen(false)}
              >
                {locale === 'id' ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  handleLogout();
                }}
              >
                {locale === 'id' ? 'Keluar' : 'Sign Out'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}