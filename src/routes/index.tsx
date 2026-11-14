import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MainLayout } from '@/components/layouts/MainLayout';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { AdminDashboard } from '@/modules/dashboard/pages/AdminDashboard';
import { StudentDashboard } from '@/modules/dashboard/pages/StudentDashboard';
import { ParentDashboard } from '@/modules/dashboard/pages/ParentDashboard';
import {
  PortalSchedulePage,
  PortalAttendancePage,
  PortalFinancePage,
} from '@/modules/dashboard/pages/PortalSubPages';
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

// Attendance module
import { StudentKioskPage } from '@/modules/attendance/pages/StudentKioskPage';
import { TeacherAttendancePage } from '@/modules/attendance/pages/TeacherAttendancePage';
import { AttendanceDashboardPage } from '@/modules/attendance/pages/AttendanceDashboardPage';
import {
  InventoryPlaceholder,
  AdminPlaceholder,
  ScholarshipsPlaceholder,
  SettingsPlaceholder,
} from './placeholder-pages';

// Academic module
import { MasterSettingsPage } from '@/modules/academic/pages/MasterSettingsPage';
import { ClassFormPage } from '@/modules/academic/pages/ClassFormPage';

import { UserManagementPage } from '@/modules/admin/pages/UserManagementPage';
import { ForceChangePasswordPage } from '@/modules/auth/pages/ForceChangePasswordPage';
import { ProfilePage } from '@/modules/profile/pages/ProfilePage';

// ============================================================================
// DAFTAR HAK AKSES ROLE (Diselaraskan dengan Sidebar.tsx)
// ============================================================================
const CORE_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'] as const;
const CLASS_EDITOR_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
const ACADEMIC_STAFF_ROLES = [...CORE_ADMIN_ROLES, 'WALI_KELAS', 'GURU', 'STAFF_TU'] as const;
const FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'BENDAHARA'] as const;
const INVENTORY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'STAFF_SARPRAS'] as const;
const TU_ROLES = [...CORE_ADMIN_ROLES, 'STAFF_TU'] as const;
const USER_MANAGEMENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU'] as const;
const REPORT_ROLES = [...CORE_ADMIN_ROLES, 'BENDAHARA'] as const;
const ATTENDANCE_RECAP_ROLES = [...CORE_ADMIN_ROLES, 'WALI_KELAS'] as const;
const PORTAL_ROLES = ['SISWA', 'ORANG_TUA'] as const;
const ATTENDANCE_GPS_ROLES = [
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'WALI_KELAS',
  'GURU',
  'STAFF_TU',
  'STAFF_SARPRAS',
  'BENDAHARA',
] as const;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.isFirstLogin && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

  if (!user?.isFirstLogin && location.pathname === '/force-change-password') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Satpam Rute Per-Role: Mencegah user membuka halaman yang bukan haknya
 * lewat pengetikan URL manual di browser.
 */
function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly string[];
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();

  if (!user?.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Pengarah Dasbor Otomatis berdasarkan role pengguna yang sedang login.
 */
function DashboardGate() {
  const role = useAuthStore((state) => state.user?.role);

  if (role === 'SISWA') return <StudentDashboard />;
  if (role === 'ORANG_TUA') return <ParentDashboard />;
  return <AdminDashboard />;
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
        {/* RUTE PUBLIK */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

        {/* RUTE STANDALONE */}
        <Route
          path="/force-change-password"
          element={
            <ProtectedRoute>
              <ForceChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* RUTE TERLINDUNGI */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          {/* Dashboard Otomatis Sesuai Role + Profil Pribadi */}
          <Route path="/dashboard" element={<DashboardGate />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Portal Siswa & Orang Tua */}
          <Route
            path="/portal/schedules"
            element={
              <RoleRoute allowedRoles={PORTAL_ROLES}>
                <PortalSchedulePage />
              </RoleRoute>
            }
          />
          <Route
            path="/portal/attendance"
            element={
              <RoleRoute allowedRoles={PORTAL_ROLES}>
                <PortalAttendancePage />
              </RoleRoute>
            }
          />
          <Route
            path="/portal/finance"
            element={
              <RoleRoute allowedRoles={PORTAL_ROLES}>
                <PortalFinancePage />
              </RoleRoute>
            }
          />

          {/* Academic / Master Data */}
          <Route
            path="/academic/master-data"
            element={
              <RoleRoute allowedRoles={CORE_ADMIN_ROLES}>
                <MasterSettingsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/academic/classes/new"
            element={
              <RoleRoute allowedRoles={CLASS_EDITOR_ROLES}>
                <ClassFormPage />
              </RoleRoute>
            }
          />
          <Route
            path="/academic/classes/:id/edit"
            element={
              <RoleRoute allowedRoles={CLASS_EDITOR_ROLES}>
                <ClassFormPage />
              </RoleRoute>
            }
          />

          {/* Students */}
          <Route
            path="/students"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <StudentListPage />
              </RoleRoute>
            }
          />
          <Route
            path="/students/new"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <StudentFormPage />
              </RoleRoute>
            }
          />
          <Route
            path="/students/:id"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <StudentDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/students/:id/edit"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <StudentFormPage />
              </RoleRoute>
            }
          />

          {/* Teachers */}
          <Route
            path="/teachers"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <TeacherListPage />
              </RoleRoute>
            }
          />
          <Route
            path="/teachers/new"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <TeacherFormPage />
              </RoleRoute>
            }
          />
          <Route
            path="/teachers/:id"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <TeacherDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/teachers/:id/edit"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <TeacherFormPage />
              </RoleRoute>
            }
          />

          {/* Finance */}
          <Route
            path="/finance"
            element={
              <RoleRoute allowedRoles={FINANCE_ROLES}>
                <FinanceDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/finance/*"
            element={
              <RoleRoute allowedRoles={FINANCE_ROLES}>
                <FinanceDashboardPage />
              </RoleRoute>
            }
          />

          {/* Schedules */}
          <Route
            path="/schedules"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <ScheduleDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/schedules/*"
            element={
              <RoleRoute allowedRoles={ACADEMIC_STAFF_ROLES}>
                <ScheduleDashboardPage />
              </RoleRoute>
            }
          />

          {/* Reports */}
          <Route
            path="/reports"
            element={
              <RoleRoute allowedRoles={REPORT_ROLES}>
                <ReportsDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/reports/*"
            element={
              <RoleRoute allowedRoles={REPORT_ROLES}>
                <ReportsDashboardPage />
              </RoleRoute>
            }
          />

          {/* User Management */}
          <Route
            path="/admin/users"
            element={
              <RoleRoute allowedRoles={USER_MANAGEMENT_ROLES}>
                <UserManagementPage />
              </RoleRoute>
            }
          />

          {/* Attendance */}
          <Route
            path="/attendance"
            element={
              <RoleRoute allowedRoles={ATTENDANCE_RECAP_ROLES}>
                <AttendanceDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/attendance/teacher"
            element={
              <RoleRoute allowedRoles={ATTENDANCE_GPS_ROLES}>
                <TeacherAttendancePage />
              </RoleRoute>
            }
          />

          {/* Settings */}
          <Route
            path="/settings/school"
            element={<Navigate to="/academic/master-data" state={{ tab: 'sekolah' }} replace />}
          />
          <Route
            path="/settings"
            element={
              <RoleRoute allowedRoles={CORE_ADMIN_ROLES}>
                <SettingsPlaceholder />
              </RoleRoute>
            }
          />
          <Route
            path="/settings/*"
            element={
              <RoleRoute allowedRoles={CORE_ADMIN_ROLES}>
                <SettingsPlaceholder />
              </RoleRoute>
            }
          />

          {/* Placeholders */}
          <Route
            path="/inventory/*"
            element={
              <RoleRoute allowedRoles={INVENTORY_ROLES}>
                <InventoryPlaceholder />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RoleRoute allowedRoles={TU_ROLES}>
                <AdminPlaceholder />
              </RoleRoute>
            }
          />
          <Route
            path="/scholarships/*"
            element={
              <RoleRoute allowedRoles={TU_ROLES}>
                <ScholarshipsPlaceholder />
              </RoleRoute>
            }
          />
        </Route>

        {/* Kiosk Absensi Siswa */}
        <Route path="/kiosk" element={<StudentKioskPage />} />

        {/* Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}