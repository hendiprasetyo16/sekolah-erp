export type AppUserRole =
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'KEPALA_SEKOLAH'
    | 'OPERATOR'
    | 'BENDAHARA'
    | 'WALI_KELAS'
    | 'GURU'
    | 'STAFF_TU'
    | 'STAFF_SARPRAS'
    | 'ORANG_TUA'
    | 'SISWA';

export type UserTabKey = 'semua' | 'manajemen' | 'staff' | 'siswa' | 'orangtua';
export type BulkTargetGroup = 'staff' | 'siswa' | 'orangtua';

export interface AppUser {
    id: string;
    schoolId: string | null;
    email: string;
    fullName: string;
    role: AppUserRole;
    isActive: boolean;
    avatarUrl: string | null;
    lastLogin: string | null;
    createdAt: string;
    updatedAt: string;
    /** Status keterhubungan ke profil master akademik (students.user_id / user_student_links) */
    isLinkedToMaster?: boolean;
    linkedChildrenCount?: number;
}

export type SortKey = 'fullName' | 'role' | 'isActive' | 'none';

export interface SortConfig {
    key: SortKey;
    direction: 'asc' | 'desc';
}

export interface CreateUserFormValues {
    fullName: string;
    email: string;
    password: string;
    role: AppUserRole;
}

export interface EditUserFormValues {
    fullName: string;
    role: AppUserRole;
}

export interface ResetPasswordFormValues {
    newPassword: string;
}

export interface EdgeFunctionBody {
    error?: string;
    message?: string;
}

export interface InvokeResult {
    data: EdgeFunctionBody | null;
    error: { message: string } | null;
}

export interface BulkGenerateResponse {
    error?: string;
    message?: string;
    failed?: number;
    remaining?: number;
}

export interface BatchExecutionSummary {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    firstMessage: string;
}

// ==========================================
// KONSTANTA MODUL MANAJEMEN PENGGUNA
// ==========================================

export const ITEMS_PER_PAGE = 10;
export const DEFAULT_PASSWORD = 'Password123!';
export const BULK_CONCURRENCY = 5;

export const ROLE_VALUES = [
    'SUPER_ADMIN',
    'ADMIN',
    'KEPALA_SEKOLAH',
    'OPERATOR',
    'BENDAHARA',
    'WALI_KELAS',
    'GURU',
    'STAFF_TU',
    'STAFF_SARPRAS',
    'ORANG_TUA',
    'SISWA',
] as const satisfies readonly AppUserRole[];

export const MANAGEMENT_ROLES: readonly AppUserRole[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'KEPALA_SEKOLAH',
    'OPERATOR',
];

export const STAFF_ROLES: readonly AppUserRole[] = [
    'GURU',
    'WALI_KELAS',
    'BENDAHARA',
    'STAFF_TU',
    'STAFF_SARPRAS',
];

export const BULK_TABS: readonly UserTabKey[] = ['staff', 'siswa', 'orangtua'];

export const isBulkTargetGroup = (tab: UserTabKey): tab is BulkTargetGroup =>
    tab === 'staff' || tab === 'siswa' || tab === 'orangtua';