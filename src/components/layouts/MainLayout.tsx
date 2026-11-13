import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { TenantSelector } from '@/modules/auth/components/TenantSelector';
import { cn } from '@/utils/cn';

export function MainLayout() {
  const { sidebarCollapsed } = useUIStore();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isMasterDataPage = location.pathname === '/academic/master-data';

  if (isSuperAdmin && !school && !isMasterDataPage) {
    return <TenantSelector />;
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Sidebar />

      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-60'
        )}
      >
        <Header />
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}