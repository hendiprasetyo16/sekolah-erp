import { supabase } from '@/services/supabase.client';
import {
    BULK_CONCURRENCY,
    DEFAULT_PASSWORD,
    type AppUser,
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

/**
 * Memperkaya daftar akun dengan status keterhubungan ke tabel `students` (user_id)
 * dan `user_student_links` secara non-blocking.
 */
const enrichUsersWithMasterLinks = async (
    users: AppUser[],
    schoolId: string | null,
    isSuperAdmin: boolean
): Promise<AppUser[]> => {
    if (users.length === 0) return users;

    const hasStudents = users.some((u) => u.role === 'SISWA');
    const hasParents = users.some((u) => u.role === 'ORANG_TUA');

    const linkedStudentUserIds = new Set<string>();
    const parentChildrenCount = new Map<string, number>();

    try {
        if (hasStudents) {
            let studentQuery = supabase
                .from('students')
                .select('user_id')
                .not('user_id', 'is', null);

            if (!isSuperAdmin && schoolId) {
                studentQuery = studentQuery.eq('school_id', schoolId);
            }

            const { data: studentRows } = await studentQuery;
            if (Array.isArray(studentRows)) {
                for (const row of studentRows) {
                    const uid = (row as { user_id?: string | null }).user_id;
                    if (uid) linkedStudentUserIds.add(uid);
                }
            }
        }

        if (hasParents) {
            const parentIds = users.filter((u) => u.role === 'ORANG_TUA').map((u) => u.id);
            const { data: linkRows } = await supabase
                .from('user_student_links')
                .select('user_id')
                .in('user_id', parentIds);

            if (Array.isArray(linkRows)) {
                for (const row of linkRows) {
                    const uid = (row as { user_id?: string | null }).user_id;
                    if (uid) {
                        parentChildrenCount.set(uid, (parentChildrenCount.get(uid) ?? 0) + 1);
                    }
                }
            }
        }
    } catch {
        // Fallback aman apabila RLS/kolom master berbeda
    }

    return users.map((u) => {
        if (u.role === 'SISWA') {
            return {
                ...u,
                isLinkedToMaster: linkedStudentUserIds.has(u.id),
            };
        }
        if (u.role === 'ORANG_TUA') {
            const count = parentChildrenCount.get(u.id) ?? 0;
            return {
                ...u,
                isLinkedToMaster: count > 0,
                linkedChildrenCount: count,
            };
        }
        return u;
    });
};

// ==========================================
// PUBLIC SERVICE API
// ==========================================

export const userManagementService = {
    async fetchAllUsers(schoolId: string | null, isSuperAdmin: boolean): Promise<AppUser[]> {
        if (!isSuperAdmin && !schoolId) return [];

        const pageSize = 1000;
        const allUsers: AppUser[] = [];

        for (let from = 0; ; from += pageSize) {
            let query = supabase
                .from('users')
                .select('*')
                .order('createdAt', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);

            if (!isSuperAdmin && schoolId) {
                query = query.eq('schoolId', schoolId);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);

            const batch = (data as AppUser[]) || [];
            allUsers.push(...batch);
            if (batch.length < pageSize) break;
        }

        return enrichUsersWithMasterLinks(allUsers, schoolId, isSuperAdmin);
    },

    async createUser(payload: CreateUserFormValues, schoolId: string | null): Promise<void> {
        if (payload.role !== 'SUPER_ADMIN' && !schoolId) {
            throw new Error('Pilih sekolah terlebih dahulu sebelum membuat akun sekolah.');
        }

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>('create-user', {
            body: {
                ...payload,
                schoolId: payload.role === 'SUPER_ADMIN' ? schoolId : schoolId,
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
    }): Promise<void> {
        const { targetUser, data, isSuperAdmin, activeSchoolId } = params;

        if (!isSuperAdmin && targetUser.role === 'SUPER_ADMIN') {
            throw new Error('Anda tidak memiliki izin mengubah akun Super Admin.');
        }

        const updateFields = isSuperAdmin
            ? { fullName: data.fullName, role: data.role }
            : { fullName: data.fullName };

        let query = supabase.from('users').update(updateFields).eq('id', targetUser.id);
        if (!isSuperAdmin && activeSchoolId) {
            query = query.eq('schoolId', activeSchoolId);
        }

        const { error } = await query;
        if (error) throw new Error(error.message);

        // Sinkronkan nama lengkap ke tabel master `students` jika akun ber-role SISWA
        const effectiveRole = isSuperAdmin ? data.role : targetUser.role;
        if (effectiveRole === 'SISWA' && targetUser.fullName !== data.fullName) {
            try {
                await supabase
                    .from('students')
                    .update({ full_name: data.fullName })
                    .eq('user_id', targetUser.id);
            } catch {
                // Best-effort sync agar tidak memblokir update akun utama
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
        activeSchoolId: string | null;
    }): Promise<void> {
        const { targetUser, currentUserId, isSuperAdmin, activeSchoolId } = params;

        if (!isSuperAdmin) {
            throw new Error('Hanya Super Admin yang dapat mengubah status akun.');
        }
        if (currentUserId === targetUser.id) {
            throw new Error('Anda tidak dapat memblokir akun Anda sendiri.');
        }

        let query = supabase
            .from('users')
            .update({ isActive: !targetUser.isActive })
            .eq('id', targetUser.id);

        if (activeSchoolId && targetUser.schoolId) {
            query = query.eq('schoolId', activeSchoolId);
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

        if (currentUserId === targetUserId) {
            throw new Error('Anda tidak dapat menghapus akun Anda sendiri.');
        }

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>('delete-user', {
            body: { targetUserId, schoolId: activeSchoolId },
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
    }): Promise<BatchExecutionSummary> {
        const { usersTarget, activeSchoolId, currentUserId } = params;

        // Lindungi akun SUPER_ADMIN & akun diri sendiri agar tidak tertimpa password default
        const eligibleUsers = usersTarget.filter(
            (u) => u.role !== 'SUPER_ADMIN' && u.id !== currentUserId
        );
        const skippedCount = usersTarget.length - eligibleUsers.length;

        if (eligibleUsers.length === 0) {
            throw new Error(
                'Tidak ada akun yang memenuhi syarat untuk di-generate (Super Admin & akun sendiri dilewati).'
            );
        }

        const results = await runWithConcurrency(eligibleUsers, BULK_CONCURRENCY, (user) =>
            invokeSafe('create-user', {
                email: user.email,
                password: DEFAULT_PASSWORD,
                fullName: user.fullName,
                role: user.role,
                schoolId: user.schoolId ?? activeSchoolId,
                existingUserId: user.id,
            })
        );

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
        if (!activeSchoolId) {
            throw new Error('Pilih sekolah terlebih dahulu sebelum menjalankan generate massal.');
        }

        const { data, error } = await supabase.functions.invoke<BulkGenerateResponse>(
            'generate-accounts-from-master',
            {
                body: { targetGroup, schoolId: activeSchoolId },
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
    }): Promise<BatchExecutionSummary> {
        const { selectedIds, allUsers, activeSchoolId, currentUserId } = params;
        const userMap = new Map(allUsers.map((u) => [u.id, u]));

        const safeIds = selectedIds.filter((id) => {
            if (id === currentUserId) return false;
            const target = userMap.get(id);
            return target?.role !== 'SUPER_ADMIN';
        });

        const skippedCount = selectedIds.length - safeIds.length;

        if (safeIds.length === 0) {
            throw new Error(
                'Tidak ada akun valid yang dapat dihapus (Super Admin & akun sendiri dilindungi).'
            );
        }

        const results = await runWithConcurrency(safeIds, BULK_CONCURRENCY, (id) =>
            invokeSafe('delete-user', { targetUserId: id, schoolId: activeSchoolId })
        );

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
        if (!activeSchoolId) {
            throw new Error('Pilih sekolah terlebih dahulu sebelum menghapus data massal.');
        }

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
            'delete-users-by-role',
            {
                body: { targetGroup, schoolId: activeSchoolId },
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