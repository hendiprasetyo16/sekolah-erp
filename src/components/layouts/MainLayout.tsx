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

/**
 * Kerangka Utama Aplikasi (`MainLayout`).
 *
 * Bertanggung jawab atas:
 * 1. Sinkronisasi tema global ('light' / 'dark') pada elemen root dokumen.
 * 2. Pengalihan otomatis ke `TenantSelector` apabila pengguna berstatus `SUPER_ADMIN`
 *    belum memilih sekolah aktif (kecuali sedang membuka halaman pendaftaran sekolah baru).
 * 3. Reset posisi scroll ke atas secara otomatis setiap kali rute halaman berubah.
 * 4. Pemantauan status koneksi internet browser agar pengguna mendapat peringatan jika offline.
 */
export function MainLayout() {
  const { sidebarCollapsed, theme } = useUIStore();
  const { locale } = useTranslation();
  const location = useLocation();

  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);

  // Memantau status koneksi jaringan perangkat
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  /**
   * Menyinkronkan mode tema ('dark' atau 'light') pada elemen root <html>
   * setiap kali pengguna mengubah tema melalui tombol di Header.
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
   * Mengembalikan posisi scroll layar ke paling atas setiap kali pengguna berpindah halaman.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  /**
   * Mendengarkan perubahan status koneksi internet (`online` / `offline`).
   */
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

  // Jika Super Admin belum memilih institusi dan tidak sedang di halaman Master Data, tampilkan pemilih tenant
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isMasterDataPage = location.pathname === '/academic/master-data';

  if (isSuperAdmin && !school && !isMasterDataPage) {
    return <TenantSelector />;
  }

  return (
    <div className="min-h-dvh bg-muted/30 text-foreground">
      {/* Bilah Navigasi Samping (Fixed di Desktop, Drawer di Mobile) */}
      <Sidebar />

      {/* Kontainer Utama: Bergeser otomatis sesuai lebar Sidebar pada layar desktop */}
      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Header />

        {/* Banner Peringatan Koneksi Terputus (Hanya muncul saat perangkat offline) */}
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