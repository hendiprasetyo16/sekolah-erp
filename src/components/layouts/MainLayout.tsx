import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { TenantSelector } from '@/modules/auth/components/TenantSelector';

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
    // Tambahkan class "relative" di sini
    <div className="min-h-screen bg-background relative">

      {/* KELUARKAN SIDEBAR: Hapus div hidden pembungkus sebelumnya */}
      <Sidebar />

      <motion.div
        initial={false}
        animate={{ marginLeft: sidebarCollapsed ? 72 : 280 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden lg:block"
        style={{ minHeight: '100vh' }}
      >
        <Header />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </motion.div>

      <div className="lg:hidden">
        <Header />
        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}