// src/types/permission.types.ts
import type { UserRole } from './common.types';

export type Module =
  | 'dashboard'
  | 'academic'
  | 'students'
  | 'teachers'
  | 'finance'
  | 'schedules'
  | 'inventory'
  | 'library'
  | 'administration'
  | 'scholarships'
  | 'reports'
  | 'settings'
  | 'attendance';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'export' | 'import' | 'approve';

export interface Permission {
  module: Module;
  actions: Action[];
}

export type RolePermissions = Record<UserRole, Permission[]>;

export const ROLE_PERMISSIONS: RolePermissions = {
  // ==========================================
  // 👑 SUPER_ADMIN: Pemilik Platform/SaaS (Tidak Punya schoolId)
  // ==========================================
  SUPER_ADMIN: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update', 'delete'] },
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'delete', 'export', 'import', 'approve'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'library', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['create', 'read', 'update', 'delete'] },
    { module: 'attendance', actions: ['create', 'read', 'update', 'delete', 'export'] },
  ],

  // ==========================================
  // 🛡️ ADMIN: IT / Pemilik Sekolah (Dewa di Level Sekolah)
  // ==========================================
  ADMIN: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update', 'delete'] },
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'delete', 'export', 'import', 'approve'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'library', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['read', 'update'] },
    { module: 'attendance', actions: ['create', 'read', 'update', 'delete', 'export'] },
  ],

  // ==========================================
  // 🎓 KEPALA_SEKOLAH: Pimpinan & Approval
  // ==========================================
  KEPALA_SEKOLAH: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] },
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['read', 'export', 'approve'] },
    { module: 'schedules', actions: ['read', 'export'] },
    { module: 'inventory', actions: ['read', 'export'] },
    { module: 'library', actions: ['read', 'export'] },
    { module: 'administration', actions: ['read', 'export'] },
    { module: 'scholarships', actions: ['read', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['read', 'update'] },
    { module: 'attendance', actions: ['create', 'read', 'update', 'export'] },
  ],

  // ==========================================
  // 💻 OPERATOR: Dapodik, Master Akademik & Jadwal
  // ==========================================
  OPERATOR: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update'] },
    { module: 'students', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['read'] },
    { module: 'attendance', actions: ['create', 'read', 'update', 'export'] },
  ],

  // ==========================================
  // 💰 BENDAHARA: Keuangan & Tagihan
  // ==========================================
  BENDAHARA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'students', actions: ['read'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'attendance', actions: ['create', 'read'] },
  ],

  // ==========================================
  // 🏫 WALI_KELAS: Pembina Rombel & Rekap Kelas
  // ==========================================
  WALI_KELAS: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] },
    { module: 'students', actions: ['read', 'update', 'export'] },
    { module: 'teachers', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
    { module: 'attendance', actions: ['create', 'read', 'update', 'export'] },
  ],

  // ==========================================
  // 👨‍🏫 GURU: Pendidik & Presensi Mandiri
  // ==========================================
  GURU: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] },
    { module: 'students', actions: ['read'] },
    { module: 'teachers', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
    { module: 'library', actions: ['read'] },
    { module: 'attendance', actions: ['create', 'read', 'update'] },
  ],

  // ==========================================
  // 🗂️ STAFF_TU: Tata Usaha, Persuratan & Beasiswa
  // ==========================================
  STAFF_TU: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] },
    { module: 'students', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'teachers', actions: ['read', 'export'] },
    { module: 'schedules', actions: ['read', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'export'] },
    { module: 'attendance', actions: ['create', 'read'] },
  ],

  // ==========================================
  // 📦 STAFF_SARPRAS: Inventaris & Aset
  // ==========================================
  STAFF_SARPRAS: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'attendance', actions: ['create', 'read'] },
  ],

  // ==========================================
  // 📚 STAFF_PERPUS: Perpustakaan & Presensi Mandiri
  // ==========================================
  STAFF_PERPUS: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'library', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'students', actions: ['read'] },
    { module: 'attendance', actions: ['create', 'read'] },
  ],

  // ==========================================
  // 👨‍👩‍👧 ORANG_TUA: Portal Wali Murid
  // ==========================================
  ORANG_TUA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'students', actions: ['read'] },
    { module: 'finance', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
    { module: 'library', actions: ['read'] },
    { module: 'attendance', actions: ['read'] },
  ],

  // ==========================================
  // 🎒 SISWA: Portal Peserta Didik
  // ==========================================
  SISWA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
    { module: 'finance', actions: ['read'] },
    { module: 'library', actions: ['read'] },
    { module: 'attendance', actions: ['read'] },
  ],
};