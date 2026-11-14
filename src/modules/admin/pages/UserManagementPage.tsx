import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
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
    MANAGEMENT_ROLES,
    STAFF_ROLES,
    isBulkTargetGroup,
    type AppUser,
    type BulkTargetGroup,
    type CreateUserFormValues,
    type EditUserFormValues,
    type ResetPasswordFormValues,
    type SortConfig,
    type SortKey,
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

export function UserManagementPage() {
    const { school, user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();
    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
    const activeSchoolId = school?.id ?? currentUser?.schoolId ?? null;

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
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: 'none',
        direction: 'asc',
    });
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
    const [isGenerateSelectedModalOpen, setIsGenerateSelectedModalOpen] = useState(false);
    const [isGenerateAllModalOpen, setIsGenerateAllModalOpen] = useState(false);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);

    // ------------------------------------------
    // DATA FETCHING & REALTIME (TERFILTER SEKOLAH)
    // ------------------------------------------
    const { data: users = [], isLoading } = useQuery<AppUser[], Error>({
        queryKey: ['users-list', activeSchoolId, isSuperAdmin],
        queryFn: () => userManagementService.fetchAllUsers(activeSchoolId, isSuperAdmin),
        enabled: isSuperAdmin || Boolean(activeSchoolId),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });

    useEffect(() => {
        if (!isSuperAdmin && !activeSchoolId) return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const changeFilter =
            !isSuperAdmin && activeSchoolId ? `schoolId=eq.${activeSchoolId}` : undefined;

        try {
            channel = supabase
                .channel(`users-list-${crypto.randomUUID()}`)
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
                        timer = setTimeout(
                            () => queryClient.invalidateQueries({ queryKey: ['users-list'] }),
                            500
                        );
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
    }, [queryClient, activeSchoolId, isSuperAdmin]);

    // ------------------------------------------
    // MUTATIONS
    // ------------------------------------------
    const addUserMutation = useMutation({
        mutationFn: (payload: CreateUserFormValues) =>
            userManagementService.createUser(payload, activeSchoolId),
        onSuccess: () => {
            toast.success(tUM('toastAddSuccess'));
            setIsAddUserModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
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
            });

            if (currentUser && currentUser.id === payload.targetUser.id) {
                useAuthStore.setState({
                    user: {
                        ...currentUser,
                        fullName: payload.data.fullName,
                        role: isSuperAdmin ? payload.data.role : currentUser.role,
                    },
                });
            }
        },
        onSuccess: () => {
            toast.success(tUM('toastEditSuccess'));
            setUserToEdit(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
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
                activeSchoolId,
            }),
        onSuccess: () => {
            toast.success(tUM('toastStatusSuccess'));
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
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
        onSuccess: () => {
            toast.success(tUM('toastDelSuccess'));
            setUserToDelete(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const generateSelectedMutation = useMutation({
        mutationFn: (usersTarget: AppUser[]) =>
            userManagementService.generateSelectedUsers({
                usersTarget,
                activeSchoolId,
                currentUserId: currentUser?.id,
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
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
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
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) =>
            toast.error(lang === 'id' ? 'Gagal Generate' : 'Generation Failed', {
                description: error.message,
            }),
    });

    const deleteSelectedMutation = useMutation({
        mutationFn: (ids: string[]) =>
            userManagementService.deleteSelectedUsers({
                selectedIds: ids,
                allUsers: users,
                activeSchoolId,
                currentUserId: currentUser?.id,
            }),
        onSuccess: (summary) => {
            toast.success(tUM('toastDelSelSuccess', { count: summary.success }));
            if (summary.failed > 0) {
                toast.warning(`${summary.failed} akun gagal dihapus.`, {
                    description: summary.firstMessage,
                });
            }
            setIsDeleteSelectedModalOpen(false);
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
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
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    // ------------------------------------------
    // FILTER, SORT & PAGINATION
    // ------------------------------------------
    const processedUsers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const filtered = users.filter((u) => {
            const matchesSearch =
                u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);

            let matchesTab = true;
            if (activeTab === 'manajemen') matchesTab = MANAGEMENT_ROLES.includes(u.role);
            else if (activeTab === 'staff') matchesTab = STAFF_ROLES.includes(u.role);
            else if (activeTab === 'siswa') matchesTab = u.role === 'SISWA';
            else if (activeTab === 'orangtua') matchesTab = u.role === 'ORANG_TUA';

            return matchesSearch && matchesTab;
        });

        if (sortConfig.key !== 'none') {
            filtered.sort((a, b) => {
                let comparison = 0;
                if (sortConfig.key === 'fullName') {
                    comparison = a.fullName.localeCompare(b.fullName, undefined, {
                        sensitivity: 'base',
                    });
                } else if (sortConfig.key === 'role') {
                    comparison = a.role.localeCompare(b.role, undefined, {
                        sensitivity: 'base',
                    });
                } else if (sortConfig.key === 'isActive') {
                    comparison = a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1;
                }
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return filtered;
    }, [users, searchQuery, activeTab, sortConfig]);

    const totalPages = Math.ceil(processedUsers.length / ITEMS_PER_PAGE);

    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        const validIds = new Set(users.map((u) => u.id));
        setSelectedUserIds((prev) => {
            const next = prev.filter((id) => validIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [users]);

    const paginatedUsers = useMemo(
        () =>
            processedUsers.slice(
                (currentPage - 1) * ITEMS_PER_PAGE,
                currentPage * ITEMS_PER_PAGE
            ),
        [processedUsers, currentPage]
    );

    const eligibleSelectedUsers = useMemo(
        () =>
            processedUsers.filter(
                (u) =>
                    selectedUserIds.includes(u.id) &&
                    u.role !== 'SUPER_ADMIN' &&
                    u.id !== currentUser?.id
            ),
        [processedUsers, selectedUserIds, currentUser?.id]
    );

    const tabCounts = useMemo<Record<UserTabKey, number>>(
        () => ({
            semua: users.length,
            manajemen: users.filter((u) => MANAGEMENT_ROLES.includes(u.role)).length,
            staff: users.filter((u) => STAFF_ROLES.includes(u.role)).length,
            siswa: users.filter((u) => u.role === 'SISWA').length,
            orangtua: users.filter((u) => u.role === 'ORANG_TUA').length,
        }),
        [users]
    );

    // ------------------------------------------
    // HANDLERS
    // ------------------------------------------
    const handleTabChange = (nextTab: string) => {
        setActiveTab(nextTab as UserTabKey);
        setCurrentPage(1);
        setSelectedUserIds([]);
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
        setSelectedUserIds([]);
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
        const pageIds = paginatedUsers.map((u) => u.id);
        if (checked) {
            setSelectedUserIds((prev) => Array.from(new Set([...prev, ...pageIds])));
        } else {
            const pageIdSet = new Set(pageIds);
            setSelectedUserIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
        }
    };

    const handleToggleSelectUser = (userId: string) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
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
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative space-y-6"
        >
            {/* ================= MODALS ================= */}
            <AnimatePresence>
                {isAddUserModalOpen && isSuperAdmin && (
                    <AddUserModal
                        lang={lang}
                        activeSchoolId={activeSchoolId}
                        isSubmitting={addUserMutation.isPending}
                        onClose={() => setIsAddUserModalOpen(false)}
                        onSubmit={(values) => addUserMutation.mutate(values)}
                    />
                )}

                {userToEdit && (
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

                {userToReset && isSuperAdmin && (
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

                {userToDelete && isSuperAdmin && (
                    <ConfirmUserActionModal
                        variant="delete-single"
                        title={tUM('modalDelTitle')}
                        description={tUM('modalDelSub')}
                        highlightText={userToDelete.fullName}
                        subNote={
                            userToDelete.role === 'SISWA'
                                ? lang === 'id'
                                    ? 'Profil akademik siswa yang tertaut (students.user_id) akan ikut terhapus secara cascade.'
                                    : 'The linked student academic record (students.user_id) will also be cascade-deleted.'
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

                {isGenerateSelectedModalOpen && isSuperAdmin && (
                    <ConfirmUserActionModal
                        variant="generate-selected"
                        title={tUM('modalGenSelTitle', { count: eligibleSelectedUsers.length })}
                        description={tUM('modalGenSelSub', { count: eligibleSelectedUsers.length })}
                        subNote={
                            selectedUserIds.length > eligibleSelectedUsers.length
                                ? lang === 'id'
                                    ? `${selectedUserIds.length - eligibleSelectedUsers.length} akun Super Admin / akun sendiri otomatis dilewati.`
                                    : `${selectedUserIds.length - eligibleSelectedUsers.length} Super Admin / self account(s) automatically skipped.`
                                : undefined
                        }
                        confirmLabel={tGlobal('yes')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={generateSelectedMutation.isPending}
                        onClose={() => setIsGenerateSelectedModalOpen(false)}
                        onConfirm={() =>
                            generateSelectedMutation.mutate(
                                processedUsers.filter((u) => selectedUserIds.includes(u.id))
                            )
                        }
                    />
                )}

                {isGenerateAllModalOpen && isSuperAdmin && activeBulkGroup && (
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

                {isDeleteSelectedModalOpen && isSuperAdmin && (
                    <ConfirmUserActionModal
                        variant="delete-selected"
                        title={tUM('modalDelSelTitle', { count: eligibleSelectedUsers.length })}
                        description={tUM('modalDelSelSub', { count: eligibleSelectedUsers.length })}
                        subNote={
                            selectedUserIds.length > eligibleSelectedUsers.length
                                ? lang === 'id'
                                    ? `${selectedUserIds.length - eligibleSelectedUsers.length} akun Super Admin / akun sendiri dilindungi dari penghapusan.`
                                    : `${selectedUserIds.length - eligibleSelectedUsers.length} Super Admin / self account(s) protected from deletion.`
                                : undefined
                        }
                        confirmLabel={tGlobal('delete')}
                        cancelLabel={tGlobal('cancel')}
                        isPending={deleteSelectedMutation.isPending}
                        onClose={() => setIsDeleteSelectedModalOpen(false)}
                        onConfirm={() => deleteSelectedMutation.mutate(selectedUserIds)}
                    />
                )}

                {isDeleteAllModalOpen && isSuperAdmin && activeBulkGroup && (
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
                {isSuperAdmin && (
                    <Button
                        onClick={() => setIsAddUserModalOpen(true)}
                        className="bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
                    >
                        <Plus className="mr-2 h-4 w-4" /> {tUM('addUser')}
                    </Button>
                )}
            </div>

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

                            {/* GENERATE DATA (SUPER_ADMIN) */}
                            {isSuperAdmin && activeBulkGroup && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
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

                            {/* HAPUS (SUPER_ADMIN) */}
                            {isSuperAdmin &&
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
                                    activeBulkGroup && (
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
                    totalFilteredCount={processedUsers.length}
                    isLoading={isLoading}
                    lang={lang}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    sortConfig={sortConfig}
                    selectedUserIds={selectedUserIds}
                    currentUserId={currentUser?.id}
                    isSuperAdmin={isSuperAdmin}
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
        </motion.div>
    );
}