import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Sun, Moon, Globe, LogOut, User,
  Settings, ChevronRight, Menu, Building2, AlertCircle,
  CheckCheck, Info // Tambahan icon baru
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import { getInitials } from '@/utils/format';
import { Button } from '@/components/ui/button';

export function Header() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, locale: currentLocale, setLocale, sidebarCollapsed, setSidebarOpen } = useUIStore();
  const { user, school, logout } = useAuthStore();

  // Mengambil state notifikasi (Asumsi ada properti notifications, jika belum ada kita beri array kosong sementara)
  const { unreadCount, notifications = [], markAllAsRead } = useNotificationStore() as any;

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // STATE BARU: Untuk mengontrol buka/tutup panel notifikasi
  const [notificationOpen, setNotificationOpen] = useState(false);

  // STATE BARU: Untuk mengontrol pop-up konfirmasi logout
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Teks terjemahan
  const logoutTitle = locale === 'id' ? 'Konfirmasi Keluar' : 'Confirm Logout';
  const logoutDesc = locale === 'id' ? 'Apakah Anda yakin ingin keluar dari sesi ini?' : 'Are you sure you want to log out of this session?';
  const btnCancel = locale === 'id' ? 'Batal' : 'Cancel';
  const btnConfirm = locale === 'id' ? 'Ya, Keluar' : 'Yes, Log Out';
  const notifTitle = locale === 'id' ? 'Notifikasi' : 'Notifications';
  const notifEmpty = locale === 'id' ? 'Belum ada notifikasi baru' : 'No new notifications';
  const notifMarkAll = locale === 'id' ? 'Tandai semua dibaca' : 'Mark all as read';

  // LOGIKA BREADCRUMB
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, idx) => {
    const isId = segment.length >= 24 || /^[0-9a-fA-F-]{36}$/.test(segment);
    let label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

    if (isId) {
      label = locale === 'id' ? 'Detail' : 'Detail';
    }

    return {
      label,
      href: '/' + pathSegments.slice(0, idx + 1).join('/'),
    };
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const toggleLocale = () => {
    setLocale(currentLocale === 'id' ? 'en' : 'id');
  };

  return (
    <>
      <header className={cn(
        'sticky top-0 z-30 h-16 border-b border-border/50',
        'bg-background/80 backdrop-blur-xl',
        'flex items-center justify-between px-4 lg:px-6 gap-4'
      )}>
        {/* Left: Mobile menu + Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, idx) => (
              <div key={crumb.href} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
                <span className={cn(
                  idx === breadcrumbs.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground cursor-pointer transition-colors'
                )}>
                  {crumb.label}
                </span>
              </div>
            ))}
          </nav>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-4">
          <div className={cn(
            'relative flex items-center rounded-lg border transition-all duration-200',
            searchFocused
              ? 'border-primary/50 bg-muted/50 ring-2 ring-primary/20'
              : 'border-border/50 bg-muted/30'
          )}>
            <Search size={16} className="absolute left-3 text-muted-foreground" />
            <input
              type="text"
              placeholder={`${t('common.search')} (Ctrl+K)`}
              className="w-full bg-transparent py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <kbd className="hidden sm:flex absolute right-3 items-center gap-0.5 text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded border border-border/50">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">

          {/* TOMBOL GANTI SEKOLAH (HANYA SUPER_ADMIN) */}
          {user?.role === 'SUPER_ADMIN' && school && (
            <button
              onClick={() => useAuthStore.setState({ school: null, academicYear: null })}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 rounded-lg hover:bg-emerald-100 transition-colors mr-2"
              title={locale === 'id' ? 'Klik untuk berpindah ke institusi lain' : 'Click to switch to another institution'}
            >
              <Building2 size={16} />
              <span className="max-w-37.5 truncate">{school.name}</span>
              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                {locale === 'id' ? 'Ganti' : 'Change'}
              </span>
            </button>
          )}

          {/* Language toggle */}
          <button
            onClick={toggleLocale}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm font-medium"
            title={t('common.language')}
          >
            <Globe size={16} />
            <span className="hidden sm:inline text-xs uppercase">{currentLocale}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </motion.div>
            </AnimatePresence>
          </button>

          {/* =================================================================== */}
          {/* BAGIAN NOTIFIKASI YANG BARU DIPERBAIKI                              */}
          {/* =================================================================== */}
          <div className="relative">
            <button
              onClick={() => {
                setNotificationOpen(!notificationOpen);
                setUserMenuOpen(false); // Tutup menu user jika sedang terbuka
              }}
              className={cn(
                'relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                unreadCount > 0 && 'notification-badge'
              )}
              title={t('common.notifications')}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notificationOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
                  >
                    {/* Header Notifikasi */}
                    <div className="flex items-center justify-between p-4 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{notifTitle}</h3>
                        {unreadCount > 0 && (
                          <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {unreadCount} Baru
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && markAllAsRead && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                        >
                          <CheckCheck size={14} />
                          {notifMarkAll}
                        </button>
                      )}
                    </div>

                    {/* Body Notifikasi (List) */}
                    <div className="max-h-87.5 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                          <Bell size={40} className="mb-3 opacity-20" />
                          <p className="text-sm">{notifEmpty}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          {notifications.map((notif: any) => (
                            <div
                              key={notif.id}
                              className={cn(
                                "p-4 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer flex gap-3",
                                !notif.isRead && "bg-primary/5"
                              )}
                            >
                              <div className={cn(
                                "mt-0.5 w-2 h-2 rounded-full shrink-0",
                                !notif.isRead ? "bg-primary" : "bg-transparent"
                              )} />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground line-clamp-1">{notif.title}</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notif.message}</p>
                                <p className="text-[10px] text-muted-foreground/70 mt-2">{notif.time || 'Beberapa saat yang lalu'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Notifikasi */}
                    {notifications.length > 0 && (
                      <div className="p-2 border-t border-border/50">
                        <button className="w-full py-1.5 text-xs font-medium text-center text-primary hover:bg-muted/50 rounded-lg transition-colors">
                          Lihat Semua Notifikasi
                        </button>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* =================================================================== */}
          {/* BAGIAN USER MENU                                                    */}
          {/* =================================================================== */}
          <div className="relative ml-2">
            <button
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setNotificationOpen(false); // Tutup notifikasi jika menu user dibuka
              }}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {user ? getInitials(user.fullName) : 'U'}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-foreground leading-tight">{user?.fullName || 'User'}</p>
                <p className="text-xs text-muted-foreground leading-tight">{user?.role?.replace(/_/g, ' ') || 'Admin'}</p>
              </div>
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 z-50 rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                  >
                    <div className="p-3 border-b border-border/50">
                      <p className="text-sm font-medium text-foreground">{user?.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <User size={16} className="text-muted-foreground" />
                        {t('common.profile')}
                      </button>

                      <button
                        onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Settings size={16} className="text-muted-foreground" />
                        {t('common.settings')}
                      </button>
                    </div>
                    <div className="p-1.5 border-t border-border/50">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setIsLogoutModalOpen(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut size={16} />
                        {t('common.logout')}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI LOGOUT                                             */}
      {/* =================================================================== */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card text-card-foreground rounded-2xl shadow-2xl border border-border max-w-sm w-full p-6 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border border-red-200 dark:border-red-800 mx-auto mb-4">
                <LogOut className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>

              <h3 className="text-xl font-bold mb-2">{logoutTitle}</h3>
              <p className="text-muted-foreground text-sm mb-6">
                {logoutDesc}
              </p>

              <div className="flex justify-center gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLogoutModalOpen(false)}
                >
                  {btnCancel}
                </Button>
                <Button
                  type="button"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    setIsLogoutModalOpen(false);
                    handleLogout();
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {btnConfirm}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}