// src/modules/admin/services/user-management.service.ts
import { supabase } from '@/services/supabase.client';
import {
    BULK_CONCURRENCY,
    ITEMS_PER_PAGE,
    MANAGEMENT_ROLES,
    ROLE_DISPLAY_NAMES,
    ROLE_VALUES,
    STAFF_ROLES,
    isProtectedAdminAccount,
    normalizeSchoolId,
    type AppUser,
    type AppUserRole,
    type BatchExecutionSummary,
    type BulkGenerateResponse,
    type BulkTargetGroup,
    type CreateUserFormValues,
    type EdgeFunctionBody,
    type EditUserFormValues,
    type FetchUsersPageParams,
    type FetchUsersPageResult,
    type InvokeResult,
    type UserTabCounts,
    type UserTabKey,
} from '../types/user-management.types';

const USER_SELECT_COLUMNS =
    'id, schoolId, email, fullName, role, additionalRoles, isActive, avatarUrl, lastLogin, createdAt, updatedAt';

// ==========================================
// INTERNAL HELPERS
// ==========================================

const extractEdgeErrorMessage = async (error: unknown): Promise<string> => {
    if (!error || typeof error !== 'object') return 'Terjadi kesalahan jaringan';
    const errObj = error as { message?: string; context?: Response };

    if (errObj.context && typeof errObj.context.json === 'function') {
        try {
            const parsed = (await errObj.context.json()) as EdgeFunctionBody;
            if (parsed?.error) return parsed.error;
            if (parsed?.message) return parsed.message;
        } catch {
            // Abaikan jika body bukan JSON valid
        }
    }

    return errObj.message || 'Terjadi kesalahan pada server';
};

const invokeSafe = async (
    name: string,
    body: Record<string, unknown>
): Promise<InvokeResult> => {
    try {
        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(name, { body });
        if (error) {
            const message = await extractEdgeErrorMessage(error);
            return { data: null, error: { message } };
        }
        return { data, error: null };
    } catch (e) {
        return {
            data: null,
            error: { message: e instanceof Error ? e.message : 'Network error' },
        };
    }
};

const runWithConcurrency = async <T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> => {
    if (items.length === 0) return [];
    const results = new Array<R>(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await worker(items[index]);
        }
    });

    await Promise.all(runners);
    return results;
};

const summarizeResults = (results: InvokeResult[], skipped = 0): BatchExecutionSummary => {
    const failures = results.filter((r) => r.error || r.data?.error);
    return {
        total: results.length,
        success: results.length - failures.length,
        failed: failures.length,
        skipped,
        firstMessage:
            failures[0]?.error?.message || failures[0]?.data?.error || 'Unknown error',
    };
};

const chunkArray = <T>(items: readonly T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

/**
 * Memperkaya daftar akun secara PARALEL (hanya dijalankan pada baris halaman aktif):
 * 1. Status keterhubungan & foto profil siswa/orang tua dari `user_student_links` & `students`.
 * 2. Status keterhubungan, tugas tambahan Dapodik, dan `photoUrl` dari `teachers`.
 */
const enrichUsersWithMasterData = async (
    users: AppUser[],
    schoolId: string | null,
    isSuperAdmin: boolean
): Promise<AppUser[]> => {
    if (users.length === 0) return users;

    const validSchoolId = normalizeSchoolId(schoolId);

    const studentParentIds = users
        .filter((u) => u.role === 'SISWA' || u.role === 'ORANG_TUA')
        .map((u) => u.id);

    const staffUserIds = users
        .filter(
            (u) =>
                u.role !== 'SISWA' &&
                u.role !== 'ORANG_TUA' &&
                u.role !== 'SUPER_ADMIN'
        )
        .map((u) => u.id);

    const linkedCountMap = new Map<string, number>();
    const primaryStudentByUser = new Map<string, string>();
    const studentPhotoMap = new Map<string, string>();
    const linkedTeacherIds = new Set<string>();
    const teacherDutyMap = new Map<string, string>();
    const teacherPhotoMap = new Map<string, string>();

    const enrichStudentParentTask = async () => {
        if (studentParentIds.length === 0) return;
        try {
            const idChunks = chunkArray(studentParentIds, 200);
            const linkResults = await Promise.all(
                idChunks.map(async (chunk) => {
                    let linkQuery = supabase
                        .from('user_student_links')
                        .select('userId, studentId')
                        .in('userId', chunk);

                    if (!isSuperAdmin && validSchoolId) {
                        linkQuery = linkQuery.eq('schoolId', validSchoolId);
                    }

                    const { data, error } = await linkQuery;
                    return !error && Array.isArray(data) ? data : [];
                })
            );

            for (const linkRows of linkResults) {
                for (const row of linkRows) {
                    const typedRow = row as {
                        userId?: string | null;
                        studentId?: string | null;
                    };
                    if (typedRow.userId) {
                        linkedCountMap.set(
                            typedRow.userId,
                            (linkedCountMap.get(typedRow.userId) ?? 0) + 1
                        );
                        if (typedRow.studentId && !primaryStudentByUser.has(typedRow.userId)) {
                            primaryStudentByUser.set(typedRow.userId, typedRow.studentId);
                        }
                    }
                }
            }

            const uniqueStudentIds = Array.from(new Set(primaryStudentByUser.values()));
            if (uniqueStudentIds.length > 0) {
                const studentChunks = chunkArray(uniqueStudentIds, 200);
                const studentResults = await Promise.all(
                    studentChunks.map(async (sChunk) => {
                        let studentQuery = supabase
                            .from('students')
                            .select('id, photoUrl')
                            .in('id', sChunk);

                        if (!isSuperAdmin && validSchoolId) {
                            studentQuery = studentQuery.eq('schoolId', validSchoolId);
                        }

                        const { data, error } = await studentQuery;
                        return !error && Array.isArray(data) ? data : [];
                    })
                );

                for (const studentRows of studentResults) {
                    for (const row of studentRows) {
                        const typedRow = row as {
                            id?: string | null;
                            photoUrl?: string | null;
                        };
                        if (typedRow.id && typedRow.photoUrl) {
                            studentPhotoMap.set(typedRow.id, typedRow.photoUrl);
                        }
                    }
                }
            }
        } catch {
            // Fallback aman
        }
    };

    const enrichStaffTask = async () => {
        if (staffUserIds.length === 0) return;
        try {
            const staffChunks = chunkArray(staffUserIds, 200);
            const teacherResults = await Promise.all(
                staffChunks.map(async (chunk) => {
                    let teacherQuery = supabase
                        .from('teachers')
                        .select('userId, tugasTambahan, photoUrl')
                        .in('userId', chunk);

                    if (!isSuperAdmin && validSchoolId) {
                        teacherQuery = teacherQuery.eq('schoolId', validSchoolId);
                    }

                    const { data, error } = await teacherQuery;
                    return !error && Array.isArray(data) ? data : [];
                })
            );

            for (const teacherRows of teacherResults) {
                for (const row of teacherRows) {
                    const typedRow = row as {
                        userId?: string | null;
                        tugasTambahan?: string | null;
                        photoUrl?: string | null;
                    };
                    if (typedRow.userId) {
                        linkedTeacherIds.add(typedRow.userId);
                        if (typedRow.tugasTambahan) {
                            teacherDutyMap.set(typedRow.userId, typedRow.tugasTambahan);
                        }
                        if (typedRow.photoUrl) {
                            teacherPhotoMap.set(typedRow.userId, typedRow.photoUrl);
                        }
                    }
                }
            }
        } catch {
            // Fallback aman
        }
    };

    await Promise.all([enrichStudentParentTask(), enrichStaffTask()]);

    return users.map((u) => {
        const normalizedAdditionalRoles: AppUserRole[] = Array.isArray(u.additionalRoles)
            ? u.additionalRoles
            : [];

        if (u.role === 'SISWA') {
            const count = linkedCountMap.get(u.id) ?? 0;
            const linkedStudentId = primaryStudentByUser.get(u.id);
            const studentPhoto = linkedStudentId
                ? studentPhotoMap.get(linkedStudentId)
                : undefined;

            return {
                ...u,
                avatarUrl: studentPhoto ?? u.avatarUrl ?? null,
                additionalRoles: [],
                isLinkedToMaster: count > 0,
            };
        }
        if (u.role === 'ORANG_TUA') {
            const count = linkedCountMap.get(u.id) ?? 0;
            return {
                ...u,
                additionalRoles: [],
                isLinkedToMaster: count > 0,
                linkedChildrenCount: count,
            };
        }
        return {
            ...u,
            avatarUrl: teacherPhotoMap.get(u.id) ?? u.avatarUrl ?? null,
            additionalRoles: normalizedAdditionalRoles,
            isLinkedToMaster: linkedTeacherIds.has(u.id),
            tugasTambahan: teacherDutyMap.get(u.id) ?? u.tugasTambahan ?? null,
        };
    });
};

const applyTabFilter = <T extends { in: (col: string, vals: readonly string[]) => T; eq: (col: string, val: string) => T }>(
    query: T,
    tab: UserTabKey
): T => {
    if (tab === 'manajemen') return query.in('role', [...MANAGEMENT_ROLES]);
    if (tab === 'staff') return query.in('role', [...STAFF_ROLES]);
    if (tab === 'siswa') return query.eq('role', 'SISWA');
    if (tab === 'orangtua') return query.eq('role', 'ORANG_TUA');
    return query;
};

const buildSearchOrClause = async (
    search: string | undefined,
    tab: UserTabKey,
    validSchoolId: string | null
): Promise<string | null> => {
    const rawTrimmed = search?.trim() ?? '';
    if (!rawTrimmed) return null;

    const safeSearch = rawTrimmed
        .replace(/[,()\\]/g, '')
        .replace(/[%_]/g, '\\$&');

    if (!safeSearch) return null;

    const lowerSearch = rawTrimmed.toLowerCase();
    const matchedRoles = ROLE_VALUES.filter((r) => {
        const labelId = ROLE_DISPLAY_NAMES[r]?.id?.toLowerCase() ?? '';
        const labelEn = ROLE_DISPLAY_NAMES[r]?.en?.toLowerCase() ?? '';
        return (
            r.toLowerCase().includes(lowerSearch) ||
            labelId.includes(lowerSearch) ||
            labelEn.includes(lowerSearch)
        );
    });

    let matchedTeacherUserIds: string[] = [];
    if (
        safeSearch.length >= 2 &&
        (tab === 'semua' || tab === 'manajemen' || tab === 'staff')
    ) {
        try {
            let tQuery = supabase
                .from('teachers')
                .select('userId')
                .not('userId', 'is', null)
                .ilike('tugasTambahan', `%${safeSearch}%`)
                .limit(100);

            if (validSchoolId) {
                tQuery = tQuery.eq('schoolId', validSchoolId);
            }

            const { data: tRows } = await tQuery;
            matchedTeacherUserIds = (tRows ?? [])
                .map((r) => (r as { userId?: string | null }).userId)
                .filter((uid): uid is string => Boolean(uid));
        } catch {
            // Fallback aman
        }
    }

    const orParts: string[] = [
        `fullName.ilike.%${safeSearch}%`,
        `email.ilike.%${safeSearch}%`,
    ];

    if (matchedRoles.length > 0) {
        orParts.push(`role.in.(${matchedRoles.join(',')})`);
    }
    if (matchedTeacherUserIds.length > 0) {
        orParts.push(`id.in.(${matchedTeacherUserIds.join(',')})`);
    }

    return orParts.join(',');
};

// ==========================================
// PUBLIC SERVICE API
// ==========================================

export const userManagementService = {
    /**
     * Mengambil 1 halaman user langsung dari server (10 baris) + enrichment paralel.
     * Jauh lebih cepat daripada menarik seluruh tabel `users` ke browser.
     */
    async fetchUsersPage(params: FetchUsersPageParams): Promise<FetchUsersPageResult> {
        const {
            schoolId,
            isSuperAdmin,
            page,
            pageSize = ITEMS_PER_PAGE,
            tab,
            search,
            sortConfig,
        } = params;

        const validSchoolId = normalizeSchoolId(schoolId);
        if (!isSuperAdmin && !validSchoolId) {
            return { users: [], totalCount: 0 };
        }

        const safePage = Math.max(1, Math.trunc(page));
        const safeLimit = Math.max(1, Math.min(100, Math.trunc(pageSize)));
        const searchOrClause = await buildSearchOrClause(search, tab, validSchoolId);

        // Mode Super Admin + Urutan Default: pastikan SUPER_ADMIN selalu berada di posisi paling atas
        if (
            isSuperAdmin &&
            sortConfig.key === 'none' &&
            (tab === 'semua' || tab === 'manajemen')
        ) {
            let superAdminQuery = supabase
                .from('users')
                .select(USER_SELECT_COLUMNS)
                .eq('role', 'SUPER_ADMIN')
                .order('createdAt', { ascending: false })
                .order('id', { ascending: true });

            if (searchOrClause) {
                superAdminQuery = superAdminQuery.or(searchOrClause);
            }

            let countOtherQuery = supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .neq('role', 'SUPER_ADMIN');

            if (validSchoolId) {
                countOtherQuery = countOtherQuery.eq('schoolId', validSchoolId);
            }
            countOtherQuery = applyTabFilter(countOtherQuery, tab);
            if (searchOrClause) {
                countOtherQuery = countOtherQuery.or(searchOrClause);
            }

            const [superRes, countOtherRes] = await Promise.all([
                superAdminQuery,
                countOtherQuery,
            ]);

            if (superRes.error) throw new Error(superRes.error.message);
            if (countOtherRes.error) throw new Error(countOtherRes.error.message);

            const superAdmins = (superRes.data as AppUser[]) || [];
            const otherCount = countOtherRes.count ?? 0;
            const totalCount = superAdmins.length + otherCount;

            const globalStart = (safePage - 1) * safeLimit;
            const globalEnd = globalStart + safeLimit - 1;
            const superSlice = superAdmins.slice(globalStart, globalEnd + 1);
            const remainingSlots = safeLimit - superSlice.length;

            let otherUsers: AppUser[] = [];
            if (remainingSlots > 0 && otherCount > 0) {
                const otherStart = Math.max(0, globalStart - superAdmins.length);
                const otherEnd = otherStart + remainingSlots - 1;

                let otherQuery = supabase
                    .from('users')
                    .select(USER_SELECT_COLUMNS)
                    .neq('role', 'SUPER_ADMIN');

                if (validSchoolId) {
                    otherQuery = otherQuery.eq('schoolId', validSchoolId);
                }
                otherQuery = applyTabFilter(otherQuery, tab);
                if (searchOrClause) {
                    otherQuery = otherQuery.or(searchOrClause);
                }

                const { data: otherData, error: otherErr } = await otherQuery
                    .order('createdAt', { ascending: false })
                    .order('id', { ascending: true })
                    .range(otherStart, otherEnd);

                if (otherErr) throw new Error(otherErr.message);
                otherUsers = (otherData as AppUser[]) || [];
            }

            const pageUsers = [...superSlice, ...otherUsers];
            const enriched = await enrichUsersWithMasterData(
                pageUsers,
                validSchoolId,
                isSuperAdmin
            );

            return {
                users: enriched,
                totalCount,
            };
        }

        // Query standar untuk semua kombinasi tab, pencarian, dan sorting
        let query = supabase
            .from('users')
            .select(USER_SELECT_COLUMNS, { count: 'exact' });

        if (validSchoolId) {
            if (isSuperAdmin) {
                query = query.or(`schoolId.eq.${validSchoolId},role.eq.SUPER_ADMIN`);
            } else {
                query = query.eq('schoolId', validSchoolId);
            }
        }

        query = applyTabFilter(query, tab);

        if (searchOrClause) {
            query = query.or(searchOrClause);
        }

        const isAsc = sortConfig.direction === 'asc';
        if (sortConfig.key === 'fullName') {
            query = query.order('fullName', { ascending: isAsc });
        } else if (sortConfig.key === 'role') {
            query = query
                .order('role', { ascending: isAsc })
                .order('fullName', { ascending: true });
        } else if (sortConfig.key === 'isActive') {
            // asc = Aktif (true) di atas, Nonaktif (false) di bawah (selaras dengan sort lama)
            query = query
                .order('isActive', { ascending: !isAsc })
                .order('fullName', { ascending: true });
        } else {
            query = query.order('createdAt', { ascending: false });
        }

        query = query.order('id', { ascending: true });

        const from = (safePage - 1) * safeLimit;
        const to = from + safeLimit - 1;

        const { data, count, error } = await query.range(from, to);
        if (error) throw new Error(error.message);

        const pageUsers = (data as AppUser[]) || [];
        const enriched = await enrichUsersWithMasterData(
            pageUsers,
            validSchoolId,
            isSuperAdmin
        );

        return {
            users: enriched,
            totalCount: count ?? 0,
        };
    },

    /**
     * Menghitung jumlah akun per tab secara paralel menggunakan `head: true` (0 payload).
     */
    async fetchTabCounts(
        schoolId: string | null,
        isSuperAdmin: boolean
    ): Promise<UserTabCounts> {
        const validSchoolId = normalizeSchoolId(schoolId);
        if (!isSuperAdmin && !validSchoolId) {
            return { semua: 0, manajemen: 0, staff: 0, siswa: 0, orangtua: 0 };
        }

        const countForTab = async (tab: UserTabKey): Promise<number> => {
            let q = supabase
                .from('users')
                .select('id', { count: 'exact', head: true });

            if (validSchoolId) {
                if (isSuperAdmin) {
                    q = q.or(`schoolId.eq.${validSchoolId},role.eq.SUPER_ADMIN`);
                } else {
                    q = q.eq('schoolId', validSchoolId);
                }
            }

            q = applyTabFilter(q, tab);
            const { count, error } = await q;
            if (error) throw new Error(error.message);
            return count ?? 0;
        };

        const [semua, manajemen, staff, siswa, orangtua] = await Promise.all([
            countForTab('semua'),
            countForTab('manajemen'),
            countForTab('staff'),
            countForTab('siswa'),
            countForTab('orangtua'),
        ]);

        return { semua, manajemen, staff, siswa, orangtua };
    },

    async fetchAllUsers(schoolId: string | null, isSuperAdmin: boolean): Promise<AppUser[]> {
        const validSchoolId = normalizeSchoolId(schoolId);
        if (!isSuperAdmin && !validSchoolId) return [];

        const pageSize = 1000;
        const allUsers: AppUser[] = [];

        for (let from = 0; ; from += pageSize) {
            let query = supabase
                .from('users')
                .select(USER_SELECT_COLUMNS)
                .order('createdAt', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (validSchoolId) {
                if (isSuperAdmin) {
                    query = query.or(`schoolId.eq.${validSchoolId},role.eq.SUPER_ADMIN`);
                } else {
                    query = query.eq('schoolId', validSchoolId);
                }
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);

            const batch = (data as AppUser[]) || [];
            allUsers.push(...batch);
            if (batch.length < pageSize) break;
        }

        allUsers.sort((a, b) => {
            if (a.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN') return -1;
            if (a.role !== 'SUPER_ADMIN' && b.role === 'SUPER_ADMIN') return 1;
            return 0;
        });

        return enrichUsersWithMasterData(allUsers, validSchoolId, isSuperAdmin);
    },

    async createUser(
        payload: CreateUserFormValues,
        schoolId: string | null,
        isSuperAdmin = false
    ): Promise<void> {
        const validSchoolId = normalizeSchoolId(schoolId);

        if (payload.role !== 'SUPER_ADMIN' && !validSchoolId) {
            throw new Error('Pilih sekolah yang valid terlebih dahulu sebelum membuat akun sekolah.');
        }

        if (!isSuperAdmin && (payload.role === 'SUPER_ADMIN' || payload.role === 'ADMIN')) {
            throw new Error('Anda tidak memiliki izin untuk membuat akun Admin atau Super Admin.');
        }

        const isNonStaffRole =
            payload.role === 'SUPER_ADMIN' ||
            payload.role === 'SISWA' ||
            payload.role === 'ORANG_TUA';

        const cleanAdditionalRoles = isNonStaffRole
            ? []
            : Array.from(new Set(payload.additionalRoles ?? [])).filter(
                  (r) =>
                      r !== payload.role &&
                      (isSuperAdmin || (r !== 'SUPER_ADMIN' && r !== 'ADMIN'))
              );

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>('create-user', {
            body: {
                ...payload,
                additionalRoles: cleanAdditionalRoles,
                schoolId: payload.role === 'SUPER_ADMIN' ? null : validSchoolId,
            },
        });

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }
    },

    async updateUser(params: {
        targetUser: AppUser;
        data: EditUserFormValues;
        isSuperAdmin: boolean;
        activeSchoolId: string | null;
        currentUserId?: string;
    }): Promise<void> {
        const { targetUser, data, isSuperAdmin, activeSchoolId, currentUserId } = params;
        const validSchoolId = normalizeSchoolId(activeSchoolId);
        const isSelf = Boolean(currentUserId && currentUserId === targetUser.id);

        if (!isSelf && isProtectedAdminAccount(targetUser, isSuperAdmin)) {
            throw new Error('Anda tidak memiliki izin untuk mengubah akun Admin atau Super Admin.');
        }

        const targetMainRole = isSuperAdmin ? data.role : targetUser.role;
        const isNonStaffRole =
            targetMainRole === 'SUPER_ADMIN' ||
            targetMainRole === 'SISWA' ||
            targetMainRole === 'ORANG_TUA';

        const cleanAdditionalRoles = isNonStaffRole
            ? []
            : Array.from(new Set(data.additionalRoles ?? [])).filter(
                  (r) =>
                      r !== targetMainRole &&
                      (isSuperAdmin || (r !== 'SUPER_ADMIN' && r !== 'ADMIN'))
              );

        const updateFields = isSuperAdmin
            ? {
                  fullName: data.fullName,
                  role: data.role,
                  additionalRoles: cleanAdditionalRoles,
              }
            : {
                  fullName: data.fullName,
                  additionalRoles: cleanAdditionalRoles,
              };

        let query = supabase.from('users').update(updateFields).eq('id', targetUser.id);
        if (!isSuperAdmin && validSchoolId) {
            query = query.eq('schoolId', validSchoolId);
        }

        const { error } = await query;
        if (error) throw new Error(error.message);

        // Sinkronkan nama lengkap ke tabel master `students` jika akun ber-role SISWA
        if (targetMainRole === 'SISWA' && targetUser.fullName !== data.fullName) {
            try {
                const { data: linkRow } = await supabase
                    .from('user_student_links')
                    .select('studentId')
                    .eq('userId', targetUser.id)
                    .limit(1)
                    .maybeSingle();

                const linkedStudentId = (linkRow as { studentId?: string } | null)?.studentId;
                if (linkedStudentId) {
                    await supabase
                        .from('students')
                        .update({ fullName: data.fullName })
                        .eq('id', linkedStudentId);
                }
            } catch {
                // Best-effort sync
            }
        }

        // Sinkronkan nama lengkap ke tabel master `teachers` jika akun guru/PTK tertaut
        if (
            targetMainRole !== 'SISWA' &&
            targetMainRole !== 'ORANG_TUA' &&
            targetMainRole !== 'SUPER_ADMIN' &&
            targetUser.fullName !== data.fullName
        ) {
            try {
                let teacherSyncQuery = supabase
                    .from('teachers')
                    .update({ fullName: data.fullName })
                    .eq('userId', targetUser.id);

                if (!isSuperAdmin && validSchoolId) {
                    teacherSyncQuery = teacherSyncQuery.eq('schoolId', validSchoolId);
                }

                await teacherSyncQuery;
            } catch {
                // Best-effort sync
            }
        }
    },

    async resetPassword(targetUserId: string, newPassword: string): Promise<void> {
        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
            'reset-password',
            {
                body: { targetUserId, newPassword },
            }
        );

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }
    },

    async toggleActiveStatus(params: {
        targetUser: AppUser;
        currentUserId?: string;
        isSuperAdmin: boolean;
        canManageUsers: boolean;
        activeSchoolId: string | null;
    }): Promise<void> {
        const { targetUser, currentUserId, isSuperAdmin, canManageUsers, activeSchoolId } = params;
        const validSchoolId = normalizeSchoolId(activeSchoolId);

        if (!canManageUsers) {
            throw new Error('Anda tidak memiliki izin untuk mengubah status akun.');
        }
        if (isProtectedAdminAccount(targetUser, isSuperAdmin)) {
            throw new Error('Anda tidak dapat mengubah status akun Admin atau Super Admin.');
        }
        if (currentUserId === targetUser.id) {
            throw new Error('Anda tidak dapat memblokir akun Anda sendiri.');
        }

        let query = supabase
            .from('users')
            .update({ isActive: !targetUser.isActive })
            .eq('id', targetUser.id);

        if (!isSuperAdmin && validSchoolId) {
            query = query.eq('schoolId', validSchoolId);
        }

        const { error } = await query;
        if (error) throw new Error(error.message);
    },

    async deleteUser(params: {
        targetUserId: string;
        currentUserId?: string;
        activeSchoolId: string | null;
    }): Promise<void> {
        const { targetUserId, currentUserId, activeSchoolId } = params;
        const validSchoolId = normalizeSchoolId(activeSchoolId);

        if (currentUserId === targetUserId) {
            throw new Error('Anda tidak dapat menghapus akun Anda sendiri.');
        }

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>('delete-user', {
            body: { targetUserId, schoolId: validSchoolId },
        });

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }
    },

    async generateSelectedUsers(params: {
        usersTarget: AppUser[];
        activeSchoolId: string | null;
        currentUserId?: string;
        isSuperAdmin?: boolean;
    }): Promise<BatchExecutionSummary> {
        const { usersTarget, activeSchoolId, currentUserId, isSuperAdmin = false } = params;
        const fallbackSchoolId = normalizeSchoolId(activeSchoolId);

        const eligibleUsers = usersTarget.filter(
            (u) => !isProtectedAdminAccount(u, isSuperAdmin) && u.id !== currentUserId
        );
        const skippedCount = usersTarget.length - eligibleUsers.length;

        if (eligibleUsers.length === 0) {
            throw new Error(
                'Tidak ada akun yang memenuhi syarat untuk di-generate (Admin/Super Admin & akun sendiri dilewati).'
            );
        }

        const results = await runWithConcurrency(eligibleUsers, BULK_CONCURRENCY, (user) => {
            const targetSchoolId = normalizeSchoolId(user.schoolId) ?? fallbackSchoolId;
            if (!targetSchoolId) {
                return Promise.resolve({
                    data: null,
                    error: { message: `School ID untuk akun ${user.email} tidak valid.` },
                });
            }

            return invokeSafe('create-user', {
                email: user.email,
                useDefaultPassword: true,
                fullName: user.fullName,
                role: user.role,
                additionalRoles: Array.isArray(user.additionalRoles) ? user.additionalRoles : [],
                schoolId: targetSchoolId,
                existingUserId: user.id,
            });
        });

        const summary = summarizeResults(results, skippedCount);
        if (summary.success === 0) {
            throw new Error(summary.firstMessage);
        }

        return summary;
    },

    async generateBulkFromMaster(
        targetGroup: BulkTargetGroup,
        activeSchoolId: string | null
    ): Promise<BulkGenerateResponse> {
        const validSchoolId = normalizeSchoolId(activeSchoolId);
        if (!validSchoolId) {
            throw new Error(
                'Pilih sekolah aktif yang valid terlebih dahulu sebelum menjalankan generate massal.'
            );
        }

        const { data, error } = await supabase.functions.invoke<BulkGenerateResponse>(
            'generate-accounts-from-master',
            {
                body: { targetGroup, schoolId: validSchoolId },
            }
        );

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }

        return data ?? {};
    },

    async deleteSelectedUsers(params: {
        selectedIds: string[];
        allUsers: AppUser[];
        activeSchoolId: string | null;
        currentUserId?: string;
        isSuperAdmin?: boolean;
    }): Promise<BatchExecutionSummary> {
        const {
            selectedIds,
            allUsers,
            activeSchoolId,
            currentUserId,
            isSuperAdmin = false,
        } = params;
        const fallbackSchoolId = normalizeSchoolId(activeSchoolId);
        const userMap = new Map(allUsers.map((u) => [u.id, u]));

        const safeIds = selectedIds.filter((id) => {
            if (id === currentUserId) return false;
            const target = userMap.get(id);
            if (!target) return false;
            return !isProtectedAdminAccount(target, isSuperAdmin);
        });

        const skippedCount = selectedIds.length - safeIds.length;

        if (safeIds.length === 0) {
            throw new Error(
                'Tidak ada akun valid yang dapat dihapus (Admin/Super Admin & akun sendiri dilindungi).'
            );
        }

        const results = await runWithConcurrency(safeIds, BULK_CONCURRENCY, (id) => {
            const target = userMap.get(id);
            const targetSchoolId = normalizeSchoolId(target?.schoolId) ?? fallbackSchoolId;
            return invokeSafe('delete-user', { targetUserId: id, schoolId: targetSchoolId });
        });

        const summary = summarizeResults(results, skippedCount);
        if (summary.success === 0) {
            throw new Error(summary.firstMessage);
        }

        return summary;
    },

    async deleteUsersByRoleGroup(
        targetGroup: BulkTargetGroup,
        activeSchoolId: string | null
    ): Promise<EdgeFunctionBody> {
        const validSchoolId = normalizeSchoolId(activeSchoolId);
        if (!validSchoolId) {
            throw new Error(
                'Pilih sekolah aktif yang valid terlebih dahulu sebelum menghapus data massal.'
            );
        }

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
            'delete-users-by-role',
            {
                body: { targetGroup, schoolId: validSchoolId },
            }
        );

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }

        return data ?? {};
    },
};