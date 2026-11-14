import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';

import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { TenantSelector } from '@/modules/auth/components/TenantSelector';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/utils/cn';

export function MainLayout() {
  const { sidebarCollapsed, theme } = useUIStore();
  const { locale } = useTranslation();
  const location = useLocation();

  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);

  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

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
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline = (): void => setIsOffline(false);
    const handleOffline = (): void => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Jika Super Admin belum memilih sekolah dan tidak sedang membuka Master Akademik (untuk daftar sekolah baru), tampilkan pemilih tenant
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isMasterDataPage = location.pathname === '/academic/master-data';

  if (isSuperAdmin && !school && !isMasterDataPage) {
    return <TenantSelector />;
  }

  return (
    <div className="min-h-dvh bg-muted/30 text-foreground">
      <Sidebar />

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Header />

        {isOffline && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-300"
          >
            <WifiOff size={14} className="shrink-0" />
            <span>
              {locale === 'id'
                ? 'Koneksi internet terputus. Perubahan data tidak dapat disimpan hingga jaringan kembali pulih.'
                : 'Internet connection lost. Data changes cannot be saved until your network is restored.'}
            </span>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}