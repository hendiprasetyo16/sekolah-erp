// src/modules/admin/services/user-management.service.ts
import { supabase } from '@/services/supabase.client';
import {
    BULK_CONCURRENCY,
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
    type InvokeResult,
} from '../types/user-management.types';

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
 * Memperkaya daftar akun dengan:
 * 1. Status keterhubungan siswa/orang tua di `public.user_student_links`.
 * 2. Status keterhubungan & tugas tambahan Dapodik dari `public.teachers` ("tugasTambahan").
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
    const linkedTeacherIds = new Set<string>();
    const teacherDutyMap = new Map<string, string>();

    // 1. Ambil tautan master siswa / orang tua
    if (studentParentIds.length > 0) {
        try {
            const idChunks = chunkArray(studentParentIds, 200);
            for (const chunk of idChunks) {
                let linkQuery = supabase
                    .from('user_student_links')
                    .select('userId')
                    .in('userId', chunk);

                if (!isSuperAdmin && validSchoolId) {
                    linkQuery = linkQuery.eq('schoolId', validSchoolId);
                }

                const { data: linkRows, error } = await linkQuery;
                if (!error && Array.isArray(linkRows)) {
                    for (const row of linkRows) {
                        const uid = (row as { userId?: string | null }).userId;
                        if (uid) {
                            linkedCountMap.set(uid, (linkedCountMap.get(uid) ?? 0) + 1);
                        }
                    }
                }
            }
        } catch {
            // Fallback aman
        }
    }

    // 2. Ambil tautan master & tugasTambahan dari tabel teachers (Dapodik)
    if (staffUserIds.length > 0) {
        try {
            const staffChunks = chunkArray(staffUserIds, 200);
            for (const chunk of staffChunks) {
                let teacherQuery = supabase
                    .from('teachers')
                    .select('userId, tugasTambahan')
                    .in('userId', chunk);

                if (!isSuperAdmin && validSchoolId) {
                    teacherQuery = teacherQuery.eq('schoolId', validSchoolId);
                }

                const { data: teacherRows, error } = await teacherQuery;
                if (!error && Array.isArray(teacherRows)) {
                    for (const row of teacherRows) {
                        const typedRow = row as {
                            userId?: string | null;
                            tugasTambahan?: string | null;
                        };
                        if (typedRow.userId) {
                            linkedTeacherIds.add(typedRow.userId);
                            if (typedRow.tugasTambahan) {
                                teacherDutyMap.set(typedRow.userId, typedRow.tugasTambahan);
                            }
                        }
                    }
                }
            }
        } catch {
            // Fallback aman
        }
    }

    return users.map((u) => {
        const normalizedAdditionalRoles: AppUserRole[] = Array.isArray(u.additionalRoles)
            ? u.additionalRoles
            : [];

        if (u.role === 'SISWA') {
            const count = linkedCountMap.get(u.id) ?? 0;
            return {
                ...u,
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
            additionalRoles: normalizedAdditionalRoles,
            isLinkedToMaster: linkedTeacherIds.has(u.id),
            tugasTambahan: teacherDutyMap.get(u.id) ?? u.tugasTambahan ?? null,
        };
    });
};

// ==========================================
// PUBLIC SERVICE API
// ==========================================

export const userManagementService = {
    async fetchAllUsers(schoolId: string | null, isSuperAdmin: boolean): Promise<AppUser[]> {
        const validSchoolId = normalizeSchoolId(schoolId);
        if (!isSuperAdmin && !validSchoolId) return [];

        const pageSize = 1000;
        const allUsers: AppUser[] = [];

        for (let from = 0; ; from += pageSize) {
            let query = supabase
                .from('users')
                .select('*')
                .order('createdAt', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (validSchoolId) {
                if (isSuperAdmin) {
                    // SUPER_ADMIN memiliki schoolId = NULL (level sistem lintas sekolah),
                    // sehingga tetap disertakan bersama seluruh pengguna sekolah yang sedang dipilih.
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

        // Pastikan akun SUPER_ADMIN selalu tampil di urutan paling atas secara default
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