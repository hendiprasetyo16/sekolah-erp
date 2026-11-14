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
    | 'STAFF_PERPUS'
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
    /** Daftar peran/tugas tambahan yang digabung otomatis setelah login */
    additionalRoles?: AppUserRole[];
    /** Teks tugas tambahan bawaan dari master Dapodik (teachers.tugasTambahan) */
    tugasTambahan?: string | null;
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
    additionalRoles: AppUserRole[];
}

export interface EditUserFormValues {
    fullName: string;
    role: AppUserRole;
    additionalRoles: AppUserRole[];
}

export interface ResetPasswordFormValues {
    newPassword: string;
}

export interface EdgeFunctionFailureItem {
    email?: string | null;
    reason?: string;
    error?: string;
}

export interface EdgeFunctionBody {
    success?: boolean;
    error?: string;
    message?: string;
    deleted?: number;
    remaining?: number;
    failed?: EdgeFunctionFailureItem[];
}

export interface InvokeResult {
    data: EdgeFunctionBody | null;
    error: { message: string } | null;
}

export interface BulkGenerateResponse {
    success?: boolean;
    error?: string;
    message?: string;
    created?: number;
    linked?: number;
    skipped?: number;
    invalidEmailCount?: number;
    failed?: number;
    remaining?: number;
    failures?: Array<{ email: string; reason: string }>;
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
    'STAFF_PERPUS',
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
    'STAFF_PERPUS',
];

/** Daftar role yang dapat dipilih sebagai Tugas Tambahan pada form akun */
export const ADDITIONAL_ROLE_OPTIONS: readonly AppUserRole[] = [
    'WALI_KELAS',
    'BENDAHARA',
    'STAFF_TU',
    'STAFF_SARPRAS',
    'STAFF_PERPUS',
    'OPERATOR',
];

export const BULK_TABS: readonly UserTabKey[] = ['staff', 'siswa', 'orangtua'];

export const isBulkTargetGroup = (tab: UserTabKey): tab is BulkTargetGroup =>
    tab === 'staff' || tab === 'siswa' || tab === 'orangtua';

/**
 * Kamus label role yang aman (fallback jika key belum ada di file translations.ts).
 */
export const ROLE_DISPLAY_NAMES: Record<AppUserRole, { id: string; en: string }> = {
    SUPER_ADMIN: { id: 'Super Admin', en: 'Super Admin' },
    ADMIN: { id: 'Admin Sekolah', en: 'School Admin' },
    KEPALA_SEKOLAH: { id: 'Kepala Sekolah', en: 'Principal' },
    OPERATOR: { id: 'Operator Sekolah', en: 'School Operator' },
    BENDAHARA: { id: 'Bendahara', en: 'Treasurer' },
    WALI_KELAS: { id: 'Wali Kelas', en: 'Homeroom Teacher' },
    GURU: { id: 'Guru', en: 'Teacher' },
    STAFF_TU: { id: 'Staff Tata Usaha (TU)', en: 'Administrative Staff' },
    STAFF_SARPRAS: { id: 'Staff Sarpras', en: 'Facilities Staff' },
    STAFF_PERPUS: { id: 'Staff Perpustakaan', en: 'Library Staff' },
    ORANG_TUA: { id: 'Orang Tua / Wali', en: 'Parent / Guardian' },
    SISWA: { id: 'Siswa', en: 'Student' },
};

/**
 * Mengubah teks tugas tambahan Dapodik menjadi kode AppUserRole sistem.
 */
export function mapTugasTambahanToRoles(tugasTambahan?: string | null): AppUserRole[] {
    if (!tugasTambahan) return [];
    const text = tugasTambahan.toLowerCase().trim();
    const mapped: AppUserRole[] = [];

    if (text.includes('bendahara')) mapped.push('BENDAHARA');
    if (text.includes('sarpras') || text.includes('sarana')) mapped.push('STAFF_SARPRAS');
    if (text.includes('perpustakaan') || text.includes('perpus')) mapped.push('STAFF_PERPUS');
    if (text.includes('tata usaha') || text.includes('administrasi')) mapped.push('STAFF_TU');
    if (text.includes('wali kelas')) mapped.push('WALI_KELAS');
    if (text.includes('wakil kepala') || text.includes('wakasek') || text.includes('operator')) {
        mapped.push('OPERATOR');
    }

    return mapped;
}

/**
 * Menggabungkan Role Utama + Additional Roles + Tugas Tambahan Dapodik
 * menjadi satu array unik tanpa duplikat.
 */
export function getEffectiveRoles(
    user: {
        role?: string;
        additionalRoles?: readonly string[];
        tugasTambahan?: string | null;
    } | null | undefined
): string[] {
    if (!user) return [];
    const roleSet = new Set<string>();

    if (user.role) roleSet.add(user.role);

    if (Array.isArray(user.additionalRoles)) {
        for (const r of user.additionalRoles) {
            if (r) roleSet.add(r);
        }
    }

    for (const r of mapTugasTambahanToRoles(user.tugasTambahan)) {
        roleSet.add(r);
    }

    return Array.from(roleSet);
}