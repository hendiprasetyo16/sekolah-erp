import { supabase } from '@/services/supabase.client';
import {
    BULK_CONCURRENCY,
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

/**
 * Mengambil pesan error yang mudah dibaca dari respons Supabase Edge Function.
 */
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

/**
 * Memanggil Edge Function dengan penanganan error yang aman untuk proses massal.
 */
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

/**
 * Menjalankan proses async secara paralel dengan batas antrean (concurrency)
 * agar server tidak kelebihan beban saat memproses banyak akun sekaligus.
 */
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

/**
 * Merangkum hasil eksekusi massal (jumlah berhasil, gagal, dan dilewati).
 */
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
 * Memecah array besar menjadi beberapa potongan kecil (chunk)
 * agar parameter `.in(...)` pada query Supabase tidak melebihi batas panjang URL.
 */
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
 * 2. Teks tugas tambahan Dapodik dari `public.teachers` ("tugasTambahan").
 */
const enrichUsersWithMasterData = async (
    users: AppUser[],
    schoolId: string | null,
    isSuperAdmin: boolean
): Promise<AppUser[]> => {
    if (users.length === 0) return users;

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

                if (!isSuperAdmin && schoolId) {
                    linkQuery = linkQuery.eq('schoolId', schoolId);
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
            // Fallback aman agar daftar pengguna tetap tampil
        }
    }

    // 2. Ambil tugasTambahan dari tabel teachers (Dapodik)
    if (staffUserIds.length > 0) {
        try {
            const staffChunks = chunkArray(staffUserIds, 200);
            for (const chunk of staffChunks) {
                let teacherQuery = supabase
                    .from('teachers')
                    .select('userId, tugasTambahan')
                    .in('userId', chunk);

                if (!isSuperAdmin && schoolId) {
                    teacherQuery = teacherQuery.eq('schoolId', schoolId);
                }

                const { data: teacherRows, error } = await teacherQuery;
                if (!error && Array.isArray(teacherRows)) {
                    for (const row of teacherRows) {
                        const typedRow = row as {
                            userId?: string | null;
                            tugasTambahan?: string | null;
                        };
                        if (typedRow.userId && typedRow.tugasTambahan) {
                            teacherDutyMap.set(typedRow.userId, typedRow.tugasTambahan);
                        }
                    }
                }
            }
        } catch {
            // Fallback aman jika tabel/kolom belum tersedia
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
            tugasTambahan: teacherDutyMap.get(u.id) ?? u.tugasTambahan ?? null,
        };
    });
};

// ==========================================
// PUBLIC SERVICE API
// ==========================================

export const userManagementService = {
    /**
     * Mengambil seluruh data pengguna (dengan paginasi 1000 baris per batch)
     * lalu menggabungkannya dengan status tautan master & tugas tambahan Dapodik.
     */
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

        return enrichUsersWithMasterData(allUsers, schoolId, isSuperAdmin);
    },

    /**
     * Membuat satu akun pengguna baru melalui Edge Function `create-user`.
     * Sesuai constraint `users_scope_check`, SUPER_ADMIN wajib memiliki schoolId = null.
     */
    async createUser(payload: CreateUserFormValues, schoolId: string | null): Promise<void> {
        if (payload.role !== 'SUPER_ADMIN' && !schoolId) {
            throw new Error('Pilih sekolah terlebih dahulu sebelum membuat akun sekolah.');
        }

        const isNonStaffRole =
            payload.role === 'SUPER_ADMIN' ||
            payload.role === 'SISWA' ||
            payload.role === 'ORANG_TUA';

        // Bersihkan additionalRoles agar tidak duplikat dengan role utama
        const cleanAdditionalRoles = isNonStaffRole
            ? []
            : Array.from(new Set(payload.additionalRoles ?? [])).filter(
                  (r) => r !== payload.role
              );

        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>('create-user', {
            body: {
                ...payload,
                additionalRoles: cleanAdditionalRoles,
                schoolId: payload.role === 'SUPER_ADMIN' ? null : schoolId,
            },
        });

        if (error) {
            throw new Error(await extractEdgeErrorMessage(error));
        }
        if (data?.error) {
            throw new Error(data.error);
        }
    },

    /**
     * Memperbarui nama lengkap, role utama, dan daftar tugas tambahan pengguna,
     * serta menyinkronkan nama siswa ke tabel `students`.
     */
    async updateUser(params: {
        targetUser: AppUser;
        data: EditUserFormValues;
        isSuperAdmin: boolean;
        activeSchoolId: string | null;
    }): Promise<void> {
        const { targetUser, data, isSuperAdmin, activeSchoolId } = params;

        const targetMainRole = isSuperAdmin ? data.role : targetUser.role;
        const isNonStaffRole =
            targetMainRole === 'SUPER_ADMIN' ||
            targetMainRole === 'SISWA' ||
            targetMainRole === 'ORANG_TUA';

        const cleanAdditionalRoles = isNonStaffRole
            ? []
            : Array.from(new Set(data.additionalRoles ?? [])).filter(
                  (r) => r !== targetMainRole
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
        if (!isSuperAdmin && activeSchoolId) {
            query = query.eq('schoolId', activeSchoolId);
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
                // Best-effort sync agar tidak memblokir pembaruan akun utama
            }
        }
    },

    /**
     * Mengatur ulang kata sandi pengguna melalui Edge Function `reset-password`.
     */
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

    /**
     * Mengaktifkan atau memblokir akun pengguna.
     */
    async toggleActiveStatus(params: {
        targetUser: AppUser;
        currentUserId?: string;
        isSuperAdmin: boolean;
        canManageUsers: boolean;
        activeSchoolId: string | null;
    }): Promise<void> {
        const { targetUser, currentUserId, isSuperAdmin, canManageUsers, activeSchoolId } = params;

        if (!canManageUsers) {
            throw new Error('Anda tidak memiliki izin untuk mengubah status akun.');
        }
        if (!isSuperAdmin && targetUser.role === 'SUPER_ADMIN') {
            throw new Error('Admin sekolah tidak dapat mengubah status akun Super Admin.');
        }
        if (currentUserId === targetUser.id) {
            throw new Error('Anda tidak dapat memblokir akun Anda sendiri.');
        }

        let query = supabase
            .from('users')
            .update({ isActive: !targetUser.isActive })
            .eq('id', targetUser.id);

        if (!isSuperAdmin && activeSchoolId) {
            query = query.eq('schoolId', activeSchoolId);
        }

        const { error } = await query;
        if (error) throw new Error(error.message);
    },

    /**
     * Menghapus satu akun pengguna melalui Edge Function `delete-user`.
     */
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

    /**
     * Melakukan generate/reset akun untuk pengguna yang dicentang di tabel.
     * Kata sandi awal diambil langsung dari secret server (`useDefaultPassword: true`).
     */
    async generateSelectedUsers(params: {
        usersTarget: AppUser[];
        activeSchoolId: string | null;
        currentUserId?: string;
    }): Promise<BatchExecutionSummary> {
        const { usersTarget, activeSchoolId, currentUserId } = params;

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
                useDefaultPassword: true,
                fullName: user.fullName,
                role: user.role,
                additionalRoles: Array.isArray(user.additionalRoles) ? user.additionalRoles : [],
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

    /**
     * Menjalankan generate akun massal dari data master (Guru/Siswa/Orang Tua)
     * melalui Edge Function `generate-accounts-from-master`.
     */
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

    /**
     * Menghapus beberapa akun sekaligus yang dicentang pada tabel.
     */
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

    /**
     * Menghapus seluruh akun berdasarkan kelompok tab (staff / siswa / orangtua).
     */
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