// src/modules/admin/pages/UserManagementPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import {
    AlertCircle,
    ArrowDown,
    ArrowDownAZ,
    ArrowUp,
    ArrowUpDown,
    ArrowUpZA,
    CheckCircle2,
    ChevronDown,
    DatabaseZap,
    GraduationCap,
    Plus,
    Search,
    ShieldCheck,
    Trash2,
    UserCog,
    UserPlus,
    Users,
    Users2,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { translations } from '@/constants/translations';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
    ITEMS_PER_PAGE,
    getEffectiveRoles,
    isBulkTargetGroup,
    isProtectedAdminAccount,
    normalizeSchoolId,
    type AppUser,
    type BulkTargetGroup,
    type CreateUserFormValues,
    type EditUserFormValues,
    type ResetPasswordFormValues,
    type SortConfig,
    type SortKey,
    type UserTabCounts,
    type UserTabKey,
} from '../types/user-management.types';
import { userManagementService } from '../services/user-management.service';
import {
    AddUserModal,
    ConfirmUserActionModal,
    EditUserModal,
    ResetPasswordModal,
} from '../components/UserManagementForms';
import { UserManagementTable } from '../components/UserManagementTable';

const EMPTY_TAB_COUNTS: UserTabCounts = {
    semua: 0,
    manajemen: 0,
    staff: 0,
    siswa: 0,
    orangtua: 0,
};

export function UserManagementPage() {
    const { school, user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();

    const effectiveCurrentRoles = useMemo(
        () => getEffectiveRoles(currentUser),
        [currentUser]
    );
    const isSuperAdmin = effectiveCurrentRoles.includes('SUPER_ADMIN');
    const canManageUsers = isSuperAdmin || effectiveCurrentRoles.includes('ADMIN');
    const activeSchoolId = useMemo(
        () => normalizeSchoolId(school?.id) ?? normalizeSchoolId(currentUser?.schoolId),
        [school?.id, currentUser?.schoolId]
    );

    const { locale } = useUIStore();
    const lang = locale === 'en' ? 'en' : 'id';

    const tGlobal = (key: keyof typeof translations.id.common): string =>
        translations[lang].common[key];

    const tUM = (
        key: keyof typeof translations.id.userManagement,
        replace?: Record<string, string | number>
    ): string => {
        let text: string = translations[lang].userManagement[key];
        if (replace) {
            Object.keys(replace).forEach((k) => {
                text = text.replace(`{${k}}`, String(replace[k]));
            });
        }
        return text;
    };

    // ------------------------------------------
    // FILTER, SORT & MODAL STATES
    // ------------------------------------------
    const [activeTab, setActiveTab] = useState<UserTabKey>('semua');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: 'none',
        direction: 'asc',
    });
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [selectedUsersMap, setSelectedUsersMap] = useState<Record<string, AppUser>>({});

    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
    const [isGenerateSelectedModalOpen, setIsGenerateSelectedModalOpen] = useState(false);
    const [isGenerateAllModalOpen, setIsGenerateAllModalOpen] = useState(false);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);

    // Debounce pencarian 250ms agar mengetik tetap mulus tanpa spam kueri DB
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 250);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const invalidateUsersQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['users-page'] });
        queryClient.invalidateQueries({ queryKey: ['users-tab-counts'] });
        queryClient.invalidateQueries({ queryKey: ['users-list'] });
    }, [queryClient]);

    // ------------------------------------------
    // DATA FETCHING PARALEL (10 BARIS + TAB COUNTS)
    // ------------------------------------------
    const {
        data: pageResult = { users: [], totalCount: 0 },
        isLoading,
    } = useQuery({
        queryKey: [
            'users-page',
            activeSchoolId,
            isSuperAdmin,
            currentPage,
            activeTab,
            debouncedSearch,
            sortConfig.key,
            sortConfig.direction,
            lang,
        ],
        queryFn: () =>
            userManagementService.fetchUsersPage({
                schoolId: activeSchoolId,
                isSuperAdmin,
                page: currentPage,
                pageSize: ITEMS_PER_PAGE,
                tab: activeTab,
                search: debouncedSearch,
                sortConfig,
                lang,
            }),
        enabled: isSuperAdmin || Boolean(activeSchoolId),
        staleTime: 30_000,
        placeholderData: keepPreviousData,
    });

    const { data: tabCounts = EMPTY_TAB_COUNTS } = useQuery<UserTabCounts, Error>({
        queryKey: ['users-tab-counts', activeSchoolId, isSuperAdmin],
        queryFn: () => userManagementService.fetchTabCounts(activeSchoolId, isSuperAdmin),
        enabled: isSuperAdmin || Boolean(activeSchoolId),
        staleTime: 30_000,
        placeholderData: keepPreviousData,
    });

    const paginatedUsers = pageResult.users;
    const totalFilteredCount = pageResult.totalCount;
    const totalPages = Math.ceil(totalFilteredCount / ITEMS_PER_PAGE);

    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // Sinkronkan objek user terpilih jika datanya diperbarui di halaman aktif
    useEffect(() => {
        if (paginatedUsers.length === 0) return;
        setSelectedUsersMap((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const u of paginatedUsers) {
                if (next[u.id] && next[u.id] !== u) {
                    next[u.id] = u;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [paginatedUsers]);

    // Realtime subscription ringan
    useEffect(() => {
        if (!isSuperAdmin && !activeSchoolId) return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        const changeFilter = activeSchoolId ? `schoolId=eq.${activeSchoolId}` : undefined;

        try {
            channel = supabase
                .channel(`users-realtime-${activeSchoolId ?? 'global'}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'users',
                        ...(changeFilter ? { filter: changeFilter } : {}),
                    },
                    () => {
                        clearTimeout(timer);
                        timer = setTimeout(() => invalidateUsersQueries(), 600);
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.warn('Realtime users tidak aktif:', status, err?.message);
                    }
                });
        } catch (e) {
            console.warn('Realtime gagal dipasang:', e);
        }

        return () => {
            clearTimeout(timer);
            if (channel) supabase.removeChannel(channel);
        };
    }, [activeSchoolId, isSuperAdmin, invalidateUsersQueries]);

    // ------------------------------------------
    // MUTATIONS
    // ------------------------------------------
    const addUserMutation = useMutation({
        mutationFn: (payload: CreateUserFormValues) =>
            userManagementService.createUser(payload, activeSchoolId, isSuperAdmin),
        onSuccess: () => {
            toast.success(tUM('toastAddSuccess'));
            setIsAddUserModalOpen(false);
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const editUserMutation = useMutation({
        mutationFn: async (payload: { targetUser: AppUser; data: EditUserFormValues }) => {
            await userManagementService.updateUser({
                targetUser: payload.targetUser,
                data: payload.data,
                isSuperAdmin,
                activeSchoolId,
                currentUserId: currentUser?.id,
            });

            if (currentUser && currentUser.id === payload.targetUser.id) {
                const updatedRole = isSuperAdmin ? payload.data.role : currentUser.role;
                const updatedAdditional = (payload.data.additionalRoles ?? []).filter(
                    (r) => r !== updatedRole
                );

                useAuthStore.setState({
                    user: {
                        ...currentUser,
                        fullName: payload.data.fullName,
                        role: updatedRole,
                        additionalRoles: updatedAdditional,
                    },
                    activeRole: updatedRole,
                });
            }
        },
        onSuccess: () => {
            toast.success(tUM('toastEditSuccess'));
            setUserToEdit(null);
            invalidateUsersQueries();
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            queryClient.invalidateQueries({ queryKey: ['user-detail'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const resetPasswordMutation = useMutation({
        mutationFn: (payload: { userId: string; values: ResetPasswordFormValues }) =>
            userManagementService.resetPassword(payload.userId, payload.values.newPassword),
        onSuccess: () => {
            toast.success(tUM('toastResetSuccess'));
            setUserToReset(null);
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const toggleStatusMutation = useMutation({
        mutationFn: (targetUser: AppUser) =>
            userManagementService.toggleActiveStatus({
                targetUser,
                currentUserId: currentUser?.id,
                isSuperAdmin,
                canManageUsers,
                activeSchoolId,
            }),
        onSuccess: () => {
            toast.success(tUM('toastStatusSuccess'));
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const deleteUserMutation = useMutation({
        mutationFn: (userId: string) =>
            userManagementService.deleteUser({
                targetUserId: userId,
                currentUserId: currentUser?.id,
                activeSchoolId,
            }),
        onSuccess: (_, deletedId) => {
            toast.success(tUM('toastDelSuccess'));
            setUserToDelete(null);
            setSelectedUsersMap((prev) => {
                if (!prev[deletedId]) return prev;
                const next = { ...prev };
                delete next[deletedId];
                return next;
            });
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const generateSelectedMutation = useMutation({
        mutationFn: (usersTarget: AppUser[]) =>
            userManagementService.generateSelectedUsers({
                usersTarget,
                activeSchoolId,
                currentUserId: currentUser?.id,
                isSuperAdmin,
            }),
        onSuccess: (summary) => {
            toast.success(tUM('toastGenSelSuccess', { count: summary.success }), {
                description:
                    lang === 'id'
                        ? 'Kata sandi diatur ulang ke sandi awal sistem (wajib diganti saat login).'
                        : 'Password reset to system initial password (must be changed on login).',
            });
            if (summary.failed > 0) {
                toast.warning(`${summary.failed} akun gagal diproses.`, {
                    description: summary.firstMessage,
                });
            }
            setIsGenerateSelectedModalOpen(false);
            setSelectedUsersMap({});
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const generateBulkMasterMutation = useMutation({
        mutationFn: (targetGroup: BulkTargetGroup) =>
            userManagementService.generateBulkFromMaster(targetGroup, activeSchoolId),
        onSuccess: (data) => {
            toast.success(lang === 'id' ? 'Proses Selesai' : 'Process Completed', {
                description: data.message,
            });
            const failedCount = data.failed ?? 0;
            const remainingCount = data.remaining ?? 0;
            const firstFailureReason = data.failures?.[0]?.reason;

            if (failedCount > 0) {
                toast.warning(
                    lang === 'id'
                        ? `${failedCount} akun gagal diproses.`
                        : `${failedCount} accounts failed to process.`,
                    firstFailureReason ? { description: firstFailureReason } : undefined
                );
            }
            if (remainingCount > 0) {
                toast.info(
                    lang === 'id'
                        ? `Tersisa ${remainingCount} antrean.`
                        : `${remainingCount} items remaining in queue.`,
                    {
                        description:
                            lang === 'id'
                                ? 'Klik Generate Semua lagi untuk melanjutkan.'
                                : 'Click Generate All again to continue.',
                    }
                );
            } else {
                setIsGenerateAllModalOpen(false);
            }
            invalidateUsersQueries();
        },
        onError: (error: Error) =>
            toast.error(lang === 'id' ? 'Gagal Generate' : 'Generation Failed', {
                description: error.message,
            }),
    });

    const deleteSelectedMutation = useMutation({
        mutationFn: (selectedUsersList: AppUser[]) =>
            userManagementService.deleteSelectedUsers({
                selectedIds: selectedUsersList.map((u) => u.id),
                allUsers: selectedUsersList,
                activeSchoolId,
                currentUserId: currentUser?.id,
                isSuperAdmin,
            }),
        onSuccess: (summary) => {
            toast.success(tUM('toastDelSelSuccess', { count: summary.success }));
            if (summary.failed > 0) {
                toast.warning(`${summary.failed} akun gagal dihapus.`, {
                    description: summary.firstMessage,
                });
            }
            setIsDeleteSelectedModalOpen(false);
            setSelectedUsersMap({});
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const deleteAllBulkMutation = useMutation({
        mutationFn: (targetGroup: BulkTargetGroup) =>
            userManagementService.deleteUsersByRoleGroup(targetGroup, activeSchoolId),
        onSuccess: (data) => {
            toast.success(tGlobal('info'), { description: data?.message || 'Done!' });
            const remainingCount = data?.remaining ?? 0;

            if (remainingCount > 0) {
                toast.info(
                    lang === 'id'
                        ? `Tersisa ${remainingCount} akun untuk dihapus.`
                        : `${remainingCount} accounts remaining to delete.`,
                    {
                        description:
                            lang === 'id'
                                ? 'Klik Hapus Semua lagi untuk melanjutkan.'
                                : 'Click Delete All again to continue.',
                    }
                );
            } else {
                setIsDeleteAllModalOpen(false);
            }
            setSelectedUsersMap({});
            invalidateUsersQueries();
        },
        onError: (error: Error) => toast.error(error.message),
    });

    // ------------------------------------------
    // DERIVED SELECTION STATES
    // ------------------------------------------
    const selectedUsersList = useMemo(
        () => Object.values(selectedUsersMap),
        [selectedUsersMap]
    );

    const selectedUserIds = useMemo(
        () => Object.keys(selectedUsersMap),
        [selectedUsersMap]
    );

    const eligibleSelectedUsers = useMemo(
        () =>
            selectedUsersList.filter(
                (u) => !isProtectedAdminAccount(u, isSuperAdmin) && u.id !== currentUser?.id
            ),
        [selectedUsersList, isSuperAdmin, currentUser?.id]
    );

    // ------------------------------------------
    // HANDLERS
    // ------------------------------------------
    const handleTabChange = (nextTab: string) => {
        setActiveTab(nextTab as UserTabKey);
        setCurrentPage(1);
        setSelectedUsersMap({});
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
        setSelectedUsersMap({});
    };

    const handleSortChange = (nextSort: SortConfig) => {
        setSortConfig(nextSort);
        setCurrentPage(1);
    };

    const handleColumnSort = (key: SortKey) => {
        if (sortConfig.key === key) {
            handleSortChange({
                key: sortConfig.direction === 'asc' ? key : 'none',
                direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
            });
        } else {
            handleSortChange({ key, direction: 'asc' });
        }
    };

    const handleSelectAllPage = (checked: boolean) => {
        const selectablePageUsers = paginatedUsers.filter(
            (u) => u.id !== currentUser?.id && !isProtectedAdminAccount(u, isSuperAdmin)
        );

        if (checked) {
            setSelectedUsersMap((prev) => {
                const next = { ...prev };
                for (const u of selectablePageUsers) {
                    next[u.id] = u;
                }
                return next;
            });
        } else {
            setSelectedUsersMap((prev) => {
                const next = { ...prev };
                for (const u of selectablePageUsers) {
                    delete next[u.id];
                }
                return next;
            });
        }
    };

    const handleToggleSelectUser = (userId: string) => {
        setSelectedUsersMap((prev) => {
            const next = { ...prev };
            if (next[userId]) {
                delete next[userId];
            } else {
                const found = paginatedUsers.find((u) => u.id === userId);
                if (found) next[userId] = found;
            }
            return next;
        });
    };

    const sortLabel =
        sortConfig.key === 'fullName'
            ? lang === 'id'
                ? 'Sortir Nama'
                : 'Sort Name'
            : sortConfig.key === 'role'
                ? lang === 'id'
                    ? 'Sortir Role'
                    : 'Sort Role'
                : sortConfig.key === 'isActive'
                    ? lang === 'id'
                        ? 'Sortir Status'
                        : 'Sort Status'
                    : lang === 'id'
                        ? 'Sortir'
                        : 'Sort';

    const TAB_ITEMS: { value: UserTabKey; label: string; icon: typeof Users }[] = [
        { value: 'semua', label: tUM('tabAll'), icon: Users },
        { value: 'manajemen', label: tUM('tabManagement'), icon: ShieldCheck },
        { value: 'staff', label: tUM('tabStaff'), icon: UserCog },
        { value: 'siswa', label: tUM('tabStudent'), icon: GraduationCap },
        { value: 'orangtua', label: tUM('tabParent'), icon: Users2 },
    ];

    const activeBulkGroup = isBulkTargetGroup(activeTab) ? activeTab : null;

    return (
        <div className="relative space-y-6">
            {/* ================= MODALS ================= */}
            <AnimatePresence>
                {isAddUserModalOpen && canManageUsers && (
                    <AddUserModal
                        lang={lang}
                        activeSchoolId={activeSchoolId}
                        isSuperAdmin={isSuperAdmin}
                        isSubmitting={addUserMutation.isPending}
                        onClose={() => setIsAddUserModalOpen(false)}
                        onSubmit={(values) => addUserMutation.mutate(values)}
                    />
                )}

                {userToEdit && canManageUsers && (
                    <EditUserModal
                        user={userToEdit}
                        lang={lang}
                        isSuperAdmin={isSuperAdmin}
                        isSubmitting={editUserMutation.isPending}
                        onClose={() => setUserToEdit(null)}
                        onSubmit={(data) =>
                            editUserMutation.mutate({ targetUser: userToEdit, data })
                        }
                    />
                )}

                {userToReset && canManageUsers && (
                    <ResetPasswordModal
                        user={userToReset}
                        lang={lang}
                        isSubmitting={resetPasswordMutation.isPending}
                        onClose={() => setUserToReset(null)}
                        onSubmit={(values) =>
                            resetPasswordMutation.mutate({
                                userId: userToReset.id,
                                values,
                            })
                        }
                    />
                )}

                {userToDelete && canManageUsers && (
                    <ConfirmUserActionModal
                        variant="delete-single"
                        title={tUM('modalDelTitle')}
                        description={tUM('modalDelSub')}
                        highlightText={userToDelete.fullName}
                        subNote={
                            userToDelete.role === 'SISWA'
                                ? lang === 'id'
                                    ? 'Tautan akun siswa akan dilepas tanpa menghapus data induk akademik siswa.'
                                    : 'The student user link will be detached without deleting the master academic record.'
                                : userToDelete.role === 'ORANG_TUA'
                                    ? lang === 'id'
                                        ? 'Tautan wali murid (user_student_links) akan dilepas tanpa menghapus data siswa.'
                                        : 'Parent-student links (user_student_links) will be removed without deleting student records.'
                                    : undefined
                        }
                        confirmLabel={tGlobal('delete')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={deleteUserMutation.isPending}
                        onClose={() => setUserToDelete(null)}
                        onConfirm={() => deleteUserMutation.mutate(userToDelete.id)}
                    />
                )}

                {isGenerateSelectedModalOpen && canManageUsers && (
                    <ConfirmUserActionModal
                        variant="generate-selected"
                        title={tUM('modalGenSelTitle', { count: eligibleSelectedUsers.length })}
                        description={tUM('modalGenSelSub', { count: eligibleSelectedUsers.length })}
                        subNote={
                            selectedUsersList.length > eligibleSelectedUsers.length
                                ? lang === 'id'
                                    ? `${selectedUsersList.length - eligibleSelectedUsers.length} akun Admin / akun sendiri otomatis dilewati.`
                                    : `${selectedUsersList.length - eligibleSelectedUsers.length} Admin / self account(s) automatically skipped.`
                                : undefined
                        }
                        confirmLabel={tGlobal('yes')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={generateSelectedMutation.isPending}
                        onClose={() => setIsGenerateSelectedModalOpen(false)}
                        onConfirm={() => generateSelectedMutation.mutate(selectedUsersList)}
                    />
                )}

                {isGenerateAllModalOpen && canManageUsers && activeBulkGroup && activeSchoolId && (
                    <ConfirmUserActionModal
                        variant="generate-all"
                        title={tUM('modalGenAllTitle')}
                        description={tUM('modalGenAllSub')}
                        confirmLabel={tUM('generateAll')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={generateBulkMasterMutation.isPending}
                        onClose={() => setIsGenerateAllModalOpen(false)}
                        onConfirm={() => generateBulkMasterMutation.mutate(activeBulkGroup)}
                    />
                )}

                {isDeleteSelectedModalOpen && canManageUsers && (
                    <ConfirmUserActionModal
                        variant="delete-selected"
                        title={tUM('modalDelSelTitle', { count: eligibleSelectedUsers.length })}
                        description={tUM('modalDelSelSub', { count: eligibleSelectedUsers.length })}
                        subNote={
                            selectedUsersList.length > eligibleSelectedUsers.length
                                ? lang === 'id'
                                    ? `${selectedUsersList.length - eligibleSelectedUsers.length} akun Admin / akun sendiri dilindungi dari penghapusan.`
                                    : `${selectedUsersList.length - eligibleSelectedUsers.length} Admin / self account(s) protected from deletion.`
                                : undefined
                        }
                        confirmLabel={tGlobal('delete')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={deleteSelectedMutation.isPending}
                        onClose={() => setIsDeleteSelectedModalOpen(false)}
                        onConfirm={() => deleteSelectedMutation.mutate(selectedUsersList)}
                    />
                )}

                {isDeleteAllModalOpen && isSuperAdmin && activeBulkGroup && activeSchoolId && (
                    <ConfirmUserActionModal
                        variant="delete-all"
                        title={tGlobal('warning')}
                        description={tUM('modalDelAllSub')}
                        confirmLabel={tGlobal('yes')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={deleteAllBulkMutation.isPending}
                        onClose={() => setIsDeleteAllModalOpen(false)}
                        onConfirm={() => deleteAllBulkMutation.mutate(activeBulkGroup)}
                    />
                )}
            </AnimatePresence>

            {/* ================= HEADER & JUDUL HALAMAN ================= */}
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold">
                        <Users className="h-6 w-6 text-primary" /> {tUM('pageTitle')}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">{tUM('pageSubtitle')}</p>
                </div>
                {canManageUsers && (
                    <Button
                        onClick={() => setIsAddUserModalOpen(true)}
                        className="bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
                    >
                        <Plus className="mr-2 h-4 w-4" /> {tUM('addUser')}
                    </Button>
                )}
            </div>

            {isSuperAdmin && !activeSchoolId && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        <p className="font-semibold">
                            {lang === 'id'
                                ? 'Mode Super Admin Lintas Sekolah'
                                : 'Cross-School Super Admin Mode'}
                        </p>
                        <p className="mt-0.5">
                            {lang === 'id'
                                ? 'Pilih sekolah aktif terlebih dahulu pada switcher sekolah sebelum membuat akun sekolah atau menjalankan Generate Masal.'
                                : 'Select an active school from the school switcher before creating school accounts or running Bulk Generate.'}
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
                {/* ================= TAB FILTER ================= */}
                <div className="w-full overflow-x-auto pb-1">
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-max">
                        <TabsList className="h-auto gap-1 bg-muted/50 p-1">
                            {TAB_ITEMS.map(({ value, label, icon: Icon }) => {
                                const isActive = activeTab === value;
                                return (
                                    <TabsTrigger
                                        key={value}
                                        value={value}
                                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                                    >
                                        <Icon size={14} />
                                        {label}
                                        <span
                                            className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${isActive
                                                ? 'bg-white/20 text-white'
                                                : 'bg-muted text-muted-foreground'
                                                }`}
                                        >
                                            {tabCounts[value] ?? 0}
                                        </span>
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                </div>

                {/* ================= TOOLBAR ================= */}
                <div className="border-b border-border pb-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* SEARCH */}
                        <div className="relative w-full min-w-0 lg:max-w-md lg:flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={tUM('searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                className="h-10 w-full pl-9"
                            />
                        </div>

                        {/* ACTIONS */}
                        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap lg:justify-end">
                            {/* SORTIR */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 min-w-33 grow justify-center gap-2 whitespace-nowrap px-3 sm:grow-0 sm:px-4"
                                    >
                                        {sortConfig.key === 'none' ? (
                                            <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : sortConfig.direction === 'asc' ? (
                                            <ArrowDown className="h-4 w-4 shrink-0 text-primary" />
                                        ) : (
                                            <ArrowUp className="h-4 w-4 shrink-0 text-primary" />
                                        )}
                                        <span className="font-normal">{sortLabel}</span>
                                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleSortChange({ key: 'fullName', direction: 'asc' })
                                        }
                                        className="cursor-pointer"
                                    >
                                        <ArrowDownAZ className="mr-2 h-4 w-4 shrink-0" />
                                        {lang === 'id' ? 'Nama (A - Z)' : 'Name (A - Z)'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleSortChange({
                                                key: 'fullName',
                                                direction: 'desc',
                                            })
                                        }
                                        className="cursor-pointer"
                                    >
                                        <ArrowUpZA className="mr-2 h-4 w-4 shrink-0" />
                                        {lang === 'id' ? 'Nama (Z - A)' : 'Name (Z - A)'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleSortChange({ key: 'role', direction: 'asc' })
                                        }
                                        className="cursor-pointer"
                                    >
                                        <ArrowDown className="mr-2 h-4 w-4 shrink-0" /> Role (A - Z)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleSortChange({ key: 'isActive', direction: 'asc' })
                                        }
                                        className="cursor-pointer"
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />
                                        {lang === 'id' ? 'Status Aktif' : 'Active Status'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleSortChange({ key: 'none', direction: 'asc' })
                                        }
                                        className={`cursor-pointer ${sortConfig.key === 'none'
                                            ? 'bg-primary/10 text-primary'
                                            : ''
                                            }`}
                                    >
                                        <ArrowUpDown className="mr-2 h-4 w-4 shrink-0" /> Reset
                                        (Default)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* GENERATE DATA */}
                            {canManageUsers && activeBulkGroup && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            disabled={!activeSchoolId}
                                            className="h-10 grow justify-center gap-2 whitespace-nowrap bg-blue-600 px-3 text-white hover:bg-blue-700 sm:grow-0 sm:px-4"
                                        >
                                            <DatabaseZap className="h-4 w-4 shrink-0" />
                                            <span>{tUM('generateData')}</span>
                                            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                        </Button>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem
                                            className="cursor-pointer font-medium text-blue-600 focus:bg-blue-50 focus:text-blue-700 dark:text-blue-400 dark:focus:bg-blue-500/10"
                                            onClick={() => setIsGenerateAllModalOpen(true)}
                                        >
                                            <DatabaseZap className="mr-2 h-4 w-4 shrink-0" />
                                            {tUM('generateAll')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="cursor-pointer"
                                            disabled={eligibleSelectedUsers.length === 0}
                                            onClick={() => setIsGenerateSelectedModalOpen(true)}
                                        >
                                            <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                                            <span className="truncate">
                                                {tUM('generateSelected')} (
                                                {eligibleSelectedUsers.length})
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}

                            {/* HAPUS */}
                            {canManageUsers &&
                                (eligibleSelectedUsers.length > 0 ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 grow justify-center gap-2 whitespace-nowrap border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 sm:grow-0 sm:px-4"
                                        onClick={() => setIsDeleteSelectedModalOpen(true)}
                                    >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        <span>
                                            {tUM('deleteSelected')} ({eligibleSelectedUsers.length})
                                        </span>
                                    </Button>
                                ) : (
                                    isSuperAdmin &&
                                    activeBulkGroup &&
                                    activeSchoolId && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 grow justify-center gap-2 whitespace-nowrap border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 sm:grow-0 sm:px-4"
                                            onClick={() => setIsDeleteAllModalOpen(true)}
                                        >
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{tUM('bulkDeleteAll')}</span>
                                        </Button>
                                    )
                                ))}
                        </div>
                    </div>
                </div>

                {/* ================= TABEL & PAGINATION ================= */}
                <UserManagementTable
                    users={paginatedUsers}
                    totalFilteredCount={totalFilteredCount}
                    isLoading={isLoading}
                    lang={lang}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    sortConfig={sortConfig}
                    selectedUserIds={selectedUserIds}
                    currentUserId={currentUser?.id}
                    isSuperAdmin={isSuperAdmin}
                    canManageUsers={canManageUsers}
                    onSort={handleColumnSort}
                    onPageChange={setCurrentPage}
                    onSelectAllPage={handleSelectAllPage}
                    onToggleSelectUser={handleToggleSelectUser}
                    onEditUser={setUserToEdit}
                    onResetPassword={setUserToReset}
                    onToggleStatus={(target) => toggleStatusMutation.mutate(target)}
                    onDeleteUser={setUserToDelete}
                />
            </div>
        </div>
    );
}