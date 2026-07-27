import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Sun, Moon, Globe, LogOut, User,
  Settings, ChevronRight, Menu, X
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import { getInitials } from '@/utils/format';

export function Header() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, locale: currentLocale, setLocale, sidebarCollapsed, setSidebarOpen } = useUIStore();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Generate breadcrumb from location
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, idx) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    href: '/' + pathSegments.slice(0, idx + 1).join('/'),
  }));

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

        {/* Notifications */}
        <button
          className={cn(
            'relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
            unreadCount > 0 && 'notification-badge'
          )}
          title={t('common.notifications')}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
              {unreadCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative ml-2">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
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
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted/50 transition-colors">
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
                      onClick={handleLogout}
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
  );
}
