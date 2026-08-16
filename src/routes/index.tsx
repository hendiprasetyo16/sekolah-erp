import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

// 1. IMPORT HALAMAN MANAJEMEN PENGGUNA
import { UserManagementPage } from '@/modules/admin/pages/UserManagementPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

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

          {/* ========================================================= */}
          {/* PERUBAHAN: MEMISAHKAN MANAJEMEN PENGGUNA DAN SETTINGS */}
          {/* ========================================================= */}

          {/* Rute khusus untuk User Management */}
          <Route path="/admin/users" element={<UserManagementPage />} />

          {/* Rute khusus untuk Pengaturan Aplikasi (Tidak lagi me-redirect ke users) */}
          <Route path="/settings" element={<SettingsPlaceholder />} />
          <Route path="/settings/*" element={<SettingsPlaceholder />} />

          {/* Placeholders */}
          <Route path="/inventory/*" element={<InventoryPlaceholder />} />
          <Route path="/admin/*" element={<AdminPlaceholder />} />
          <Route path="/scholarships/*" element={<ScholarshipsPlaceholder />} />
        </Route>

        {/* Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}