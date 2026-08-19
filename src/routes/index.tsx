import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'; // <--- TAMBAH useLocation
import { MainLayout } from '@/components/layouts/MainLayout';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { AdminDashboard } from '@/modules/dashboard/pages/AdminDashboard';
import { StudentListPage } from '@/modules/students/pages/StudentListPage';
import { StudentFormPage } from '@/modules/students/pages/StudentFormPage';
import { StudentDetailPage } from '@/modules/students/pages/StudentDetailPage';
import { TeacherListPage } from '@/modules/teachers/pages/TeacherListPage';
import TeacherFormPage from '@/modules/teachers/pages/TeacherFormPage';
import TeacherDetailPage from '@/modules/teachers/pages/TeacherDetailPage';
import FinanceDashboardPage from '@/modules/finance/pages/FinanceDashboardPage';
import ScheduleDashboardPage from '@/modules/schedules/pages/ScheduleDashboardPage';
import ReportsDashboardPage from '@/modules/reports/pages/ReportsDashboardPage';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { InventoryPlaceholder, AdminPlaceholder, ScholarshipsPlaceholder, SettingsPlaceholder } from './placeholder-pages';

import { MasterSettingsPage } from '@/modules/academic/pages/MasterSettingsPage';
import { ClassFormPage } from '@/modules/academic/pages/ClassFormPage';

import { UserManagementPage } from '@/modules/admin/pages/UserManagementPage';

// 1. IMPORT HALAMAN FORCE CHANGE PASSWORD
import { ForceChangePasswordPage } from '@/modules/auth/pages/ForceChangePasswordPage';

// ============================================================================
// KOMPONEN PENCEGAT RUTE (SATPAM APLIKASI)
// ============================================================================
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation(); // Untuk mendeteksi user sedang berada di URL mana

  // 1. Jika belum login, lempar ke halaman login
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // 2. CEGATAN FASE 3: Jika isFirstLogin = true, dan dia sedang tidak di halaman ganti password, paksa pindah!
  if (user?.isFirstLogin && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

  // 3. Jika isFirstLogin = false, tapi dia iseng mencoba buka halaman ganti password, kembalikan ke dashboard
  if (!user?.isFirstLogin && location.pathname === '/force-change-password') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* RUTE PUBLIK (Hanya bisa diakses jika BELUM login) */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* RUTE STANDALONE (Sudah login, tapi tidak pakai Layout utama) */}
        <Route
          path="/force-change-password"
          element={
            <ProtectedRoute>
              <ForceChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* RUTE TERLINDUNGI (Menggunakan Sidebar & Header) */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<AdminDashboard />} />

          {/* Academic / Master Data */}
          <Route path="/academic/master-data" element={<MasterSettingsPage />} />
          <Route path="/academic/classes/new" element={<ClassFormPage />} />
          <Route path="/academic/classes/:id/edit" element={<ClassFormPage />} />

          {/* Students */}
          <Route path="/students" element={<StudentListPage />} />
          <Route path="/students/new" element={<StudentFormPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/students/:id/edit" element={<StudentFormPage />} />

          {/* Teachers */}
          <Route path="/teachers" element={<TeacherListPage />} />
          <Route path="/teachers/new" element={<TeacherFormPage />} />
          <Route path="/teachers/:id" element={<TeacherDetailPage />} />
          <Route path="/teachers/:id/edit" element={<TeacherFormPage />} />

          {/* Finance */}
          <Route path="/finance" element={<FinanceDashboardPage />} />
          <Route path="/finance/*" element={<FinanceDashboardPage />} />

          {/* Schedules */}
          <Route path="/schedules" element={<ScheduleDashboardPage />} />
          <Route path="/schedules/*" element={<ScheduleDashboardPage />} />

          {/* Reports */}
          <Route path="/reports" element={<ReportsDashboardPage />} />
          <Route path="/reports/*" element={<ReportsDashboardPage />} />

          {/* Rute khusus untuk User Management */}
          <Route path="/admin/users" element={<UserManagementPage />} />

          {/* Rute khusus untuk Pengaturan Aplikasi */}
          <Route path="/settings" element={<SettingsPlaceholder />} />
          <Route path="/settings/*" element={<SettingsPlaceholder />} />

          {/* Placeholders */}
          <Route path="/inventory/*" element={<InventoryPlaceholder />} />
          <Route path="/admin/*" element={<AdminPlaceholder />} />
          <Route path="/scholarships/*" element={<ScholarshipsPlaceholder />} />
        </Route>

        {/* Redirect: Jika rute tidak dikenali, arahkan ke dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}