import type { UserRole } from './common.types';

// 1. Tambahkan 'academic' ke dalam tipe Module
export type Module =
  | 'dashboard'
  | 'academic' // <-- MODUL BARU DITAMBAHKAN DI SINI
  | 'students'
  | 'teachers'
  | 'finance'
  | 'schedules'
  | 'inventory'
  | 'administration'
  | 'scholarships'
  | 'reports'
  | 'settings';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'export' | 'import' | 'approve';

export interface Permission {
  module: Module;
  actions: Action[];
}

export type RolePermissions = Record<UserRole, Permission[]>;

// 2. Berikan izin akses modul 'academic' ke Role yang berhak
export const ROLE_PERMISSIONS: RolePermissions = {
  SUPER_ADMIN: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update', 'delete'] }, // <-- TAMBAHKAN INI
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'delete', 'export', 'import', 'approve'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['create', 'read', 'update', 'delete'] },
  ],
  ADMIN: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update', 'delete'] }, // <-- TAMBAHKAN INI
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'export'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'export'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['read'] },
  ],
  KEPALA_SEKOLAH: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] }, // <-- TAMBAHKAN INI (Hanya lihat)
    { module: 'students', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'finance', actions: ['read', 'export', 'approve'] },
    { module: 'schedules', actions: ['read', 'export'] },
    { module: 'inventory', actions: ['read', 'export'] },
    { module: 'administration', actions: ['read', 'export'] },
    { module: 'scholarships', actions: ['read', 'export'] },
    { module: 'reports', actions: ['read', 'export'] },
    { module: 'settings', actions: ['read', 'update'] },
  ],
  OPERATOR: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['create', 'read', 'update'] }, // <-- TAMBAHKAN INI
    { module: 'students', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'teachers', actions: ['create', 'read', 'update', 'export', 'import'] },
    { module: 'schedules', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { module: 'scholarships', actions: ['create', 'read', 'update', 'export'] },
  ],
  BENDAHARA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'finance', actions: ['create', 'read', 'update', 'delete', 'export', 'import'] },
    { module: 'reports', actions: ['read', 'export'] },
  ],
  WALI_KELAS: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] }, // <-- TAMBAHKAN INI
    { module: 'students', actions: ['read', 'update', 'export'] },
    { module: 'schedules', actions: ['read'] },
  ],
  GURU: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'academic', actions: ['read'] }, // <-- TAMBAHKAN INI
    { module: 'students', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
  ],
  STAFF_TU: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'students', actions: ['read'] },
    { module: 'administration', actions: ['create', 'read', 'update', 'delete', 'export'] },
  ],
  STAFF_SARPRAS: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'inventory', actions: ['create', 'read', 'update', 'delete', 'export'] },
  ],
  ORANG_TUA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'students', actions: ['read'] },
    { module: 'finance', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
  ],
  SISWA: [
    { module: 'dashboard', actions: ['read'] },
    { module: 'schedules', actions: ['read'] },
    { module: 'finance', actions: ['read'] },
  ],
};