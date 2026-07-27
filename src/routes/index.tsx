import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layouts/MainLayout';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { AdminDashboard } from '@/modules/dashboard/pages/AdminDashboard';
import { StudentListPage } from '@/modules/students/pages/StudentListPage';
import { StudentFormPage } from '@/modules/students/pages/StudentFormPage';
import { StudentDetailPage } from '@/modules/students/pages/StudentDetailPage';
import { TeacherListPage } from '@/modules/teachers/pages/TeacherListPage';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { FinancePlaceholder, SchedulesPlaceholder, InventoryPlaceholder, AdminPlaceholder, ScholarshipsPlaceholder, ReportsPlaceholder, SettingsPlaceholder } from './placeholder-pages';

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
        {/* Public routes */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<AdminDashboard />} />
          <Route path="/students" element={<StudentListPage />} />
          <Route path="/students/new" element={<StudentFormPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/students/:id/edit" element={<StudentFormPage />} />
          <Route path="/teachers" element={<TeacherListPage />} />
          <Route path="/finance/*" element={<FinancePlaceholder />} />
          <Route path="/schedules/*" element={<SchedulesPlaceholder />} />
          <Route path="/inventory/*" element={<InventoryPlaceholder />} />
          <Route path="/admin/*" element={<AdminPlaceholder />} />
          <Route path="/scholarships/*" element={<ScholarshipsPlaceholder />} />
          <Route path="/reports/*" element={<ReportsPlaceholder />} />
          <Route path="/settings/*" element={<SettingsPlaceholder />} />
        </Route>

        {/* Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
