// src/modules/admin/types/user-management.types.ts
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
    /** Status keterhubungan ke profil master akademik (teachers.userId / user_student_links) */
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
// KONSTANTA & VALIDATOR MODUL MANAJEMEN PENGGUNA
// ==========================================

export const ITEMS_PER_PAGE = 10;
export const DEFAULT_PASSWORD = 'Password123!';
export const BULK_CONCURRENCY = 5;

export const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Memastikan nilai schoolId merupakan string UUID yang valid (bukan '', 'all', atau undefined).
 */
export function normalizeSchoolId(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return UUID_REGEX.test(trimmed) ? trimmed : null;
}

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

/** Daftar role standar yang dapat dipilih sebagai Tugas Tambahan pada form akun */
export const ADDITIONAL_ROLE_OPTIONS: readonly AppUserRole[] = [
    'GURU',
    'WALI_KELAS',
    'BENDAHARA',
    'STAFF_TU',
    'STAFF_SARPRAS',
    'STAFF_PERPUS',
    'OPERATOR',
];

/** Mengembalikan opsi tugas tambahan sesuai kewenangan aktor (Super Admin vs Admin Sekolah) */
export function getAssignableAdditionalRoles(actorIsSuperAdmin: boolean): AppUserRole[] {
    if (actorIsSuperAdmin) {
        return ['KEPALA_SEKOLAH', ...ADDITIONAL_ROLE_OPTIONS, 'ADMIN'];
    }
    return [...ADDITIONAL_ROLE_OPTIONS];
}

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
 * Mengecek apakah akun target memiliki role Admin / Super Admin (baik role utama
 * maupun additionalRoles) sehingga dilindungi dari modifikasi oleh Admin Sekolah biasa.
 */
export function isProtectedAdminAccount(
    target: {
        role?: string;
        additionalRoles?: readonly string[];
    },
    actorIsSuperAdmin: boolean
): boolean {
    const roles = [
        target.role,
        ...(Array.isArray(target.additionalRoles) ? target.additionalRoles : []),
    ];
    if (roles.includes('SUPER_ADMIN')) return true;
    if (!actorIsSuperAdmin && roles.includes('ADMIN')) return true;
    return false;
}

/**
 * Mengubah teks tugas tambahan Dapodik menjadi kode AppUserRole sistem.
 * Selaras 100% dengan fungsi SQL `public.map_tugas_tambahan_to_roles`.
 */
export function mapTugasTambahanToRoles(tugasTambahan?: string | null): AppUserRole[] {
    if (!tugasTambahan) return [];
    const text = tugasTambahan.toLowerCase().trim();
    const mapped: AppUserRole[] = [];

    if (text.includes('kepala sekolah') && !text.includes('wakil kepala')) {
        mapped.push('KEPALA_SEKOLAH');
    }
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

// Tambahkan di bagian bawah src/modules/admin/types/user-management.types.ts
export interface FetchUsersPageParams {
    schoolId: string | null;
    isSuperAdmin: boolean;
    page: number;
    pageSize?: number;
    tab: UserTabKey;
    search?: string;
    sortConfig: SortConfig;
    lang?: 'id' | 'en';
}

export interface FetchUsersPageResult {
    users: AppUser[];
    totalCount: number;
}

export type UserTabCounts = Record<UserTabKey, number>;