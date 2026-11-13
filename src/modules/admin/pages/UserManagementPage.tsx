import { useState, useEffect, useMemo, type KeyboardEvent, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Users,
    ShieldCheck,
    UserCog,
    GraduationCap,
    Users2,
    Search,
    Plus,
    MoreVertical,
    Edit,
    KeyRound,
    Ban,
    CheckCircle2,
    Loader2,
    AlertCircle,
    X,
    Eye,
    EyeOff,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    UserPlus,
    Trash2,
    DatabaseZap,
    ChevronDown,
    ArrowDownAZ,
    ArrowUpZA,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
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
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ==========================================
// TYPES & INTERFACES
// ==========================================

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
}

type SortKey = 'fullName' | 'role' | 'isActive' | 'none';
type SortConfig = { key: SortKey; direction: 'asc' | 'desc' };

interface CreateUserFormValues {
    fullName: string;
    email: string;
    password: string;
    role: AppUserRole;
}

interface EditUserFormValues {
    fullName: string;
    role: AppUserRole;
}

interface ResetPasswordFormValues {
    newPassword: string;
}

interface EdgeFunctionBody {
    error?: string;
    message?: string;
}

type InvokeResult = {
    data: EdgeFunctionBody | null;
    error: { message: string } | null;
};

interface BulkGenerateResponse {
    error?: string;
    message?: string;
    failed?: number;
    remaining?: number;
}

// ==========================================
// KONSTANTA & HELPER
// ==========================================

const ITEMS_PER_PAGE = 10;
const DEFAULT_PASSWORD = 'Password123!';
const BULK_CONCURRENCY = 5;

const ROLE_VALUES = [
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

const MANAGEMENT_ROLES: AppUserRole[] = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'];
const STAFF_ROLES: AppUserRole[] = ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'];
const BULK_TABS = ['staff', 'siswa', 'orangtua'];

const invokeSafe = async (
    name: string,
    body: Record<string, unknown>
): Promise<InvokeResult> => {
    try {
        const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(name, { body });
        return { data, error: error ? { message: error.message } : null };
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

const summarizeResults = (results: InvokeResult[]) => {
    const failures = results.filter((r) => r.error || r.data?.error);
    return {
        total: results.length,
        success: results.length - failures.length,
        failed: failures.length,
        firstMessage:
            failures[0]?.error?.message || failures[0]?.data?.error || 'Unknown error',
    };
};

const fetchAllUsers = async (
    schoolId: string | null,
    isSuperAdmin: boolean
): Promise<AppUser[]> => {
    const size = 1000;
    const all: AppUser[] = [];

    for (let from = 0; ; from += size) {
        let query = supabase
            .from('users')
            .select('*')
            .order('createdAt', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + size - 1);

        if (!isSuperAdmin && schoolId) {
            query = query.eq('schoolId', schoolId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        all.push(...((data as AppUser[]) || []));
        if (!data || data.length < size) break;
    }

    return all;
};

// ==========================================
// SUB-KOMPONEN HEADER TABEL
// ==========================================

interface SortableHeaderProps {
    columnKey: SortKey;
    label: string;
    sortConfig: SortConfig;
    onSort: (key: SortKey) => void;
}

function SortableHeader({ columnKey, label, sortConfig, onSort }: SortableHeaderProps) {
    const renderIcon = () => {
        if (sortConfig.key !== columnKey) {
            return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
        }
        if (columnKey === 'fullName') {
            return sortConfig.direction === 'asc' ? (
                <ArrowDownAZ className="ml-1 h-3 w-3 text-primary" />
            ) : (
                <ArrowUpZA className="ml-1 h-3 w-3 text-primary" />
            );
        }
        return sortConfig.direction === 'asc' ? (
            <ArrowDown className="ml-1 h-3 w-3 text-primary" />
        ) : (
            <ArrowUp className="ml-1 h-3 w-3 text-primary" />
        );
    };

    return (
        <th
            className="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:bg-muted/50"
            onClick={() => onSort(columnKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                {renderIcon()}
            </div>
        </th>
    );
}

// ==========================================
// KOMPONEN UTAMA
// ==========================================

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
    // VALIDASI ZOD DWIBAHASA
    // ------------------------------------------
    const createUserSchema = useMemo(
        () =>
            z.object({
                fullName: z
                    .string()
                    .trim()
                    .min(3, lang === 'id' ? 'Minimal 3 karakter' : 'Minimum 3 characters'),
                email: z
                    .string()
                    .trim()
                    .email(lang === 'id' ? 'Format email tidak valid' : 'Invalid email format'),
                password: z
                    .string()
                    .min(6, lang === 'id' ? 'Minimal 6 karakter' : 'Minimum 6 characters'),
                role: z.enum(ROLE_VALUES),
            }),
        [lang]
    );

    const editUserSchema = useMemo(
        () =>
            z.object({
                fullName: z
                    .string()
                    .trim()
                    .min(3, lang === 'id' ? 'Minimal 3 karakter' : 'Minimum 3 characters'),
                role: z.enum(ROLE_VALUES),
            }),
        [lang]
    );

    const resetPasswordSchema = useMemo(
        () =>
            z.object({
                newPassword: z
                    .string()
                    .min(6, lang === 'id' ? 'Minimal 6 karakter' : 'Minimum 6 characters'),
            }),
        [lang]
    );

    // ------------------------------------------
    // STATES
    // ------------------------------------------
    const [activeTab, setActiveTab] = useState<string>('semua');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: 'none',
        direction: 'asc',
    });
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>('1');
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    useEffect(() => {
        setCurrentPage(1);
        setPageInput('1');
        setSelectedUserIds([]);
    }, [searchQuery, activeTab, sortConfig]);

    useEffect(() => {
        setPageInput(currentPage.toString());
    }, [currentPage]);

    // Modal states
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
    const [isGenerateSelectedModalOpen, setIsGenerateSelectedModalOpen] = useState(false);
    const [isGenerateAllModalOpen, setIsGenerateAllModalOpen] = useState(false);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [showAddPassword, setShowAddPassword] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);

    // ------------------------------------------
    // FORMS
    // ------------------------------------------
    const addUserForm = useForm<CreateUserFormValues>({
        resolver: zodResolver(createUserSchema),
        defaultValues: { fullName: '', email: '', password: '', role: 'GURU' },
    });

    const editUserForm = useForm<EditUserFormValues>({
        resolver: zodResolver(editUserSchema),
        defaultValues: { fullName: '', role: 'GURU' },
    });

    const resetPassForm = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { newPassword: '' },
    });

    useEffect(() => {
        if (userToEdit) {
            editUserForm.reset({ fullName: userToEdit.fullName, role: userToEdit.role });
        }
    }, [userToEdit, editUserForm]);

    // ------------------------------------------
    // DATA FETCHING & REALTIME
    // ------------------------------------------
    const { data: users, isLoading } = useQuery<AppUser[], Error>({
        queryKey: ['users-list', activeSchoolId, isSuperAdmin],
        queryFn: async () => {
            if (!isSuperAdmin && !activeSchoolId) return [];
            return fetchAllUsers(activeSchoolId, isSuperAdmin);
        },
        enabled: isSuperAdmin || Boolean(activeSchoolId),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        try {
            channel = supabase
                .channel(`users-list-${crypto.randomUUID()}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
                    clearTimeout(timer);
                    timer = setTimeout(
                        () => queryClient.invalidateQueries({ queryKey: ['users-list'] }),
                        500
                    );
                })
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
    }, [queryClient]);

    // ------------------------------------------
    // MUTATIONS
    // ------------------------------------------
    const addUserMutation = useMutation({
        mutationFn: async (payload: CreateUserFormValues) => {
            const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
                'create-user',
                {
                    body: { ...payload, schoolId: activeSchoolId },
                }
            );
            if (error || data?.error) throw new Error(error?.message || data?.error);
            return data;
        },
        onSuccess: () => {
            toast.success(tUM('toastAddSuccess'));
            setIsAddUserModalOpen(false);
            addUserForm.reset();
            setShowAddPassword(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const editUserMutation = useMutation({
        mutationFn: async (payload: { id: string; data: EditUserFormValues }) => {
            if (!isSuperAdmin && userToEdit?.role === 'SUPER_ADMIN') {
                throw new Error(
                    lang === 'id'
                        ? 'Anda tidak memiliki izin mengubah akun Super Admin.'
                        : 'You are not allowed to modify a Super Admin account.'
                );
            }

            // Non-SuperAdmin hanya diperbolehkan memperbarui nama lengkap, bukan role
            const updateFields = isSuperAdmin
                ? { fullName: payload.data.fullName, role: payload.data.role }
                : { fullName: payload.data.fullName };

            let query = supabase.from('users').update(updateFields).eq('id', payload.id);

            if (!isSuperAdmin && activeSchoolId) {
                query = query.eq('schoolId', activeSchoolId);
            }

            const { error } = await query;
            if (error) throw new Error(error.message);

            // Sinkronkan state global jika pengguna yang diedit adalah pengguna yang sedang login
            if (currentUser && currentUser.id === payload.id) {
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
        mutationFn: async (payload: { userId: string; newPass: string }) => {
            const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
                'reset-password',
                {
                    body: { targetUserId: payload.userId, newPassword: payload.newPass },
                }
            );
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => {
            toast.success(tUM('toastResetSuccess'));
            setUserToReset(null);
            resetPassForm.reset();
            setShowResetPassword(false);
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const toggleStatusMutation = useMutation({
        mutationFn: async (payload: { userId: string; currentStatus: boolean }) => {
            if (!isSuperAdmin) {
                throw new Error(
                    lang === 'id' ? 'Hanya Super Admin yang dapat mengubah status akun.' : 'Unauthorized action.'
                );
            }
            if (currentUser?.id === payload.userId) {
                throw new Error(
                    lang === 'id'
                        ? 'Anda tidak dapat memblokir akun Anda sendiri.'
                        : 'You cannot block your own account.'
                );
            }

            const { error } = await supabase
                .from('users')
                .update({ isActive: !payload.currentStatus })
                .eq('id', payload.userId);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(tUM('toastStatusSuccess'));
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            if (currentUser?.id === userId) {
                throw new Error(
                    lang === 'id'
                        ? 'Anda tidak dapat menghapus akun Anda sendiri.'
                        : 'You cannot delete your own account.'
                );
            }

            const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
                'delete-user',
                {
                    body: { targetUserId: userId },
                }
            );
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => {
            toast.success(tUM('toastDelSuccess'));
            setUserToDelete(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const generateSelectedMutation = useMutation({
        mutationFn: async (usersTarget: AppUser[]) => {
            const results = await runWithConcurrency(usersTarget, BULK_CONCURRENCY, (user) =>
                invokeSafe('create-user', {
                    email: user.email,
                    password: DEFAULT_PASSWORD,
                    fullName: user.fullName,
                    role: user.role,
                    schoolId: user.schoolId ?? activeSchoolId,
                    existingUserId: user.id,
                })
            );
            const summary = summarizeResults(results);
            if (summary.success === 0) throw new Error(summary.firstMessage);
            return summary;
        },
        onSuccess: (summary) => {
            toast.success(tUM('toastGenSelSuccess', { count: summary.success }), {
                description: `Password: ${DEFAULT_PASSWORD}`,
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
        mutationFn: async (targetGroup: string) => {
            if (!activeSchoolId) {
                throw new Error(
                    lang === 'id'
                        ? 'Pilih sekolah terlebih dahulu sebelum menjalankan generate massal.'
                        : 'Please select a school first before running bulk generation.'
                );
            }

            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error(
                    lang === 'id'
                        ? 'Sesi login telah berakhir. Silakan muat ulang halaman.'
                        : 'Session expired. Please reload the page.'
                );
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-accounts-from-master`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ targetGroup, schoolId: activeSchoolId }),
                }
            );

            let data: BulkGenerateResponse = {};
            try {
                data = (await response.json()) as BulkGenerateResponse;
            } catch {
                if (!response.ok) {
                    throw new Error(`Server error (${response.status})`);
                }
            }

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Terjadi kesalahan sistem');
            }
            return data;
        },
        onSuccess: (data) => {
            toast.success(lang === 'id' ? 'Proses Selesai' : 'Process Completed', {
                description: data.message,
            });
            const failedCount = data.failed ?? 0;
            const remainingCount = data.remaining ?? 0;
            if (failedCount > 0) {
                toast.warning(
                    lang === 'id'
                        ? `${failedCount} akun gagal diproses.`
                        : `${failedCount} accounts failed to process.`
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
                                ? 'Klik Generate Data lagi untuk melanjutkan.'
                                : 'Click Generate Data again to continue.',
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
        mutationFn: async (userIds: string[]) => {
            // Jangan pernah menghapus akun sendiri secara tidak sengaja melalui seleksi massal
            const safeIds = userIds.filter((id) => id !== currentUser?.id);
            if (safeIds.length === 0) {
                throw new Error(
                    lang === 'id'
                        ? 'Tidak ada akun valid yang dapat dihapus.'
                        : 'No valid accounts selected for deletion.'
                );
            }

            const results = await runWithConcurrency(safeIds, BULK_CONCURRENCY, (id) =>
                invokeSafe('delete-user', { targetUserId: id })
            );
            const summary = summarizeResults(results);
            if (summary.success === 0) throw new Error(summary.firstMessage);
            return summary;
        },
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
        mutationFn: async (targetGroup: string) => {
            if (!activeSchoolId) {
                throw new Error(
                    lang === 'id'
                        ? 'Pilih sekolah terlebih dahulu sebelum menghapus data massal.'
                        : 'Please select a school first before bulk deletion.'
                );
            }

            const { data, error } = await supabase.functions.invoke<EdgeFunctionBody>(
                'delete-users-by-role',
                {
                    body: { targetGroup, schoolId: activeSchoolId },
                }
            );
            if (error || data?.error) throw new Error(error?.message || data?.error);
            return data;
        },
        onSuccess: (data) => {
            toast.success(tGlobal('info'), { description: data?.message || 'Done!' });
            setIsDeleteAllModalOpen(false);
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    // ------------------------------------------
    // FILTER & SORT
    // ------------------------------------------
    const processedUsers = useMemo(() => {
        if (!users) return [];

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

    // ------------------------------------------
    // PAGINATION & SELECTION
    // ------------------------------------------
    const totalPages = Math.ceil(processedUsers.length / ITEMS_PER_PAGE);

    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        if (!users) return;
        const ids = new Set(users.map((u) => u.id));
        setSelectedUserIds((prev) => {
            const next = prev.filter((id) => ids.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [users]);

    const paginatedUsers = processedUsers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Periksa apakah SELURUH baris pada halaman aktif sedang terpilih
    const isAllPageSelected =
        paginatedUsers.length > 0 &&
        paginatedUsers.every((u) => selectedUserIds.includes(u.id));

    const getPageNumbers = () => {
        const pages: number[] = [];
        let start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    // ------------------------------------------
    // HANDLERS
    // ------------------------------------------
    const handleSort = (key: SortKey) => {
        if (sortConfig.key === key) {
            setSortConfig({
                key: sortConfig.direction === 'asc' ? key : 'none',
                direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
            });
        } else {
            setSortConfig({ key, direction: 'asc' });
        }
    };

    const handleManualPageKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const commitManualPage = () => {
        if (pageInput.trim() === '' || totalPages === 0) {
            setPageInput(currentPage.toString());
            return;
        }
        let targetPage = parseInt(pageInput, 10);
        if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
        if (targetPage > totalPages) targetPage = totalPages;
        setCurrentPage(targetPage);
        setPageInput(targetPage.toString());
    };

    const handleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
        const pageIds = paginatedUsers.map((u) => u.id);
        if (e.target.checked) {
            setSelectedUserIds((prev) => Array.from(new Set([...prev, ...pageIds])));
        } else {
            const pageIdSet = new Set(pageIds);
            setSelectedUserIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
        }
    };

    const handleToggleSelect = (userId: string) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    };

    // ------------------------------------------
    // HELPER TAMPILAN
    // ------------------------------------------
    const formatRoleName = (role: AppUserRole): string =>
        tUM(('role_' + role) as keyof typeof translations.id.userManagement);

    const getRoleBadgeColor = (role: AppUserRole): string => {
        if (role === 'SUPER_ADMIN') {
            return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30';
        }
        if (['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(role)) {
            return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30';
        }
        if (STAFF_ROLES.includes(role)) {
            return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
        }
        if (role === 'SISWA') {
            return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
        }
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30';
    };

    const roleSelectItems = ROLE_VALUES.map((r) => (
        <SelectItem key={r} value={r}>
            {tUM(('role_' + r) as keyof typeof translations.id.userManagement)}
        </SelectItem>
    ));

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

    const tabCounts = useMemo<Record<string, number>>(() => {
        const list = users ?? [];
        return {
            semua: list.length,
            manajemen: list.filter((u) => MANAGEMENT_ROLES.includes(u.role)).length,
            staff: list.filter((u) => STAFF_ROLES.includes(u.role)).length,
            siswa: list.filter((u) => u.role === 'SISWA').length,
            orangtua: list.filter((u) => u.role === 'ORANG_TUA').length,
        };
    }, [users]);

    const TAB_ITEMS = [
        { value: 'semua', label: tUM('tabAll'), icon: Users },
        { value: 'manajemen', label: tUM('tabManagement'), icon: ShieldCheck },
        { value: 'staff', label: tUM('tabStaff'), icon: UserCog },
        { value: 'siswa', label: tUM('tabStudent'), icon: GraduationCap },
        { value: 'orangtua', label: tUM('tabParent'), icon: Users2 },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative space-y-6"
        >
            {/* ================= MODALS ================= */}
            <AnimatePresence>
                {/* Modal: Tambah Pengguna */}
                {isAddUserModalOpen && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
                        >
                            <div className="mb-4 flex justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">{tUM('modalAddTitle')}</h3>
                                    <p className="text-sm text-muted-foreground">{tUM('modalAddSub')}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={tGlobal('cancel')}
                                    onClick={() => {
                                        setIsAddUserModalOpen(false);
                                        addUserForm.reset();
                                        setShowAddPassword(false);
                                    }}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <Form {...addUserForm}>
                                <form
                                    onSubmit={addUserForm.handleSubmit((data) =>
                                        addUserMutation.mutate(data)
                                    )}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={addUserForm.control}
                                        name="fullName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{tGlobal('name')}</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John Doe" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addUserForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="email"
                                                        placeholder="john@sekolah.com"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addUserForm.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{tUM('colRole')}</FormLabel>
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={tUM('roleReq')} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent
                                                        position="popper"
                                                        side="bottom"
                                                        className="max-h-50 overflow-y-auto"
                                                    >
                                                        {roleSelectItems}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={addUserForm.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl>
                                                    <div className="relative flex items-center">
                                                        <Input
                                                            type={showAddPassword ? 'text' : 'password'}
                                                            placeholder="••••••••"
                                                            {...field}
                                                            className="pr-10"
                                                        />
                                                        <button
                                                            type="button"
                                                            aria-label={
                                                                lang === 'id'
                                                                    ? 'Tampilkan atau sembunyikan password'
                                                                    : 'Show or hide password'
                                                            }
                                                            onClick={() => setShowAddPassword(!showAddPassword)}
                                                            className="absolute right-3 text-muted-foreground hover:text-foreground"
                                                        >
                                                            {showAddPassword ? (
                                                                <EyeOff size={16} />
                                                            ) : (
                                                                <Eye size={16} />
                                                            )}
                                                        </button>
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setIsAddUserModalOpen(false);
                                                addUserForm.reset();
                                                setShowAddPassword(false);
                                            }}
                                        >
                                            {tGlobal('cancel')}
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            disabled={addUserMutation.isPending}
                                        >
                                            {addUserMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plus className="mr-2 h-4 w-4" />
                                            )}{' '}
                                            {tGlobal('save')}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Edit Pengguna */}
                {userToEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
                        >
                            <div className="mb-4 flex justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">{tUM('modalEditTitle')}</h3>
                                    <p className="text-sm text-muted-foreground">{tUM('modalEditSub')}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={tGlobal('cancel')}
                                    onClick={() => setUserToEdit(null)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <Form {...editUserForm}>
                                <form
                                    onSubmit={editUserForm.handleSubmit((data) =>
                                        editUserMutation.mutate({ id: userToEdit.id, data })
                                    )}
                                    className="space-y-4"
                                >
                                    <div className="space-y-2">
                                        <FormLabel>Email</FormLabel>
                                        <Input value={userToEdit.email} disabled className="bg-muted" />
                                    </div>
                                    <FormField
                                        control={editUserForm.control}
                                        name="fullName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{tGlobal('name')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={editUserForm.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{tUM('colRole')}</FormLabel>
                                                <Select
                                                    value={field.value}
                                                    onValueChange={field.onChange}
                                                    disabled={!isSuperAdmin}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={tUM('roleReq')} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent
                                                        position="popper"
                                                        side="bottom"
                                                        className="max-h-50 overflow-y-auto"
                                                    >
                                                        {roleSelectItems}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setUserToEdit(null)}
                                        >
                                            {tGlobal('cancel')}
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-blue-600 text-white hover:bg-blue-700"
                                            disabled={editUserMutation.isPending}
                                        >
                                            {editUserMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Edit className="mr-2 h-4 w-4" />
                                            )}{' '}
                                            {tGlobal('save')}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Reset Password */}
                {userToReset && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl"
                        >
                            <div className="mb-4 flex justify-between">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                                    <KeyRound className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={tGlobal('cancel')}
                                    onClick={() => {
                                        setUserToReset(null);
                                        setShowResetPassword(false);
                                    }}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <h3 className="mb-1 text-xl font-bold">{tUM('modalResetTitle')}</h3>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {tUM('modalResetSub')} <strong>{userToReset.email}</strong>
                            </p>
                            <Form {...resetPassForm}>
                                <form
                                    onSubmit={resetPassForm.handleSubmit((data) =>
                                        resetPasswordMutation.mutate({
                                            userId: userToReset.id,
                                            newPass: data.newPassword,
                                        })
                                    )}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={resetPassForm.control}
                                        name="newPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{tUM('newPassword')}</FormLabel>
                                                <FormControl>
                                                    <div className="relative flex items-center">
                                                        <Input
                                                            type={showResetPassword ? 'text' : 'password'}
                                                            placeholder="••••••••"
                                                            {...field}
                                                            className="pr-10"
                                                        />
                                                        <button
                                                            type="button"
                                                            aria-label={
                                                                lang === 'id'
                                                                    ? 'Tampilkan atau sembunyikan password'
                                                                    : 'Show or hide password'
                                                            }
                                                            onClick={() => setShowResetPassword(!showResetPassword)}
                                                            className="absolute right-3 text-muted-foreground hover:text-foreground"
                                                        >
                                                            {showResetPassword ? (
                                                                <EyeOff size={16} />
                                                            ) : (
                                                                <Eye size={16} />
                                                            )}
                                                        </button>
                                                    </div>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setUserToReset(null);
                                                setShowResetPassword(false);
                                            }}
                                        >
                                            {tGlobal('cancel')}
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-blue-600 text-white hover:bg-blue-700"
                                            disabled={resetPasswordMutation.isPending}
                                        >
                                            {resetPasswordMutation.isPending ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <KeyRound className="mr-2 h-4 w-4" />
                                            )}{' '}
                                            {tGlobal('save')}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Hapus Satu Pengguna */}
                {userToDelete && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl"
                        >
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
                                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">{tUM('modalDelTitle')}</h3>
                            <p className="mb-1 text-sm text-muted-foreground">{tUM('modalDelSub')}</p>
                            <p className="mb-6 font-semibold text-foreground">{userToDelete.fullName}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setUserToDelete(null)}>
                                    {tGlobal('cancel')}
                                </Button>
                                <Button
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    onClick={() => deleteUserMutation.mutate(userToDelete.id)}
                                    disabled={deleteUserMutation.isPending}
                                >
                                    {deleteUserMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {tGlobal('delete')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Generate Akun Terpilih */}
                {isGenerateSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl"
                        >
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                                <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">
                                {tUM('modalGenSelTitle', { count: selectedUserIds.length })}
                            </h3>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {tUM('modalGenSelSub', { count: selectedUserIds.length })}
                            </p>
                            <div className="flex justify-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsGenerateSelectedModalOpen(false)}
                                >
                                    {tGlobal('cancel')}
                                </Button>
                                <Button
                                    className="bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={() =>
                                        generateSelectedMutation.mutate(
                                            processedUsers.filter((u) => selectedUserIds.includes(u.id))
                                        )
                                    }
                                    disabled={generateSelectedMutation.isPending}
                                >
                                    {generateSelectedMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {tGlobal('yes')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Generate Semua Akun di Tab Aktif */}
                {isGenerateAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl"
                        >
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                                <DatabaseZap className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">{tUM('modalGenAllTitle')}</h3>
                            <p className="mb-6 text-sm text-muted-foreground">{tUM('modalGenAllSub')}</p>
                            <div className="flex justify-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsGenerateAllModalOpen(false)}
                                >
                                    {tGlobal('cancel')}
                                </Button>
                                <Button
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    onClick={() => generateBulkMasterMutation.mutate(activeTab)}
                                    disabled={generateBulkMasterMutation.isPending}
                                >
                                    {generateBulkMasterMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <DatabaseZap className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {tUM('generateAll')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Hapus Akun Terpilih */}
                {isDeleteSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl"
                        >
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
                                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">
                                {tUM('modalDelSelTitle', { count: selectedUserIds.length })}
                            </h3>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {tUM('modalDelSelSub', { count: selectedUserIds.length })}
                            </p>
                            <div className="flex justify-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsDeleteSelectedModalOpen(false)}
                                >
                                    {tGlobal('cancel')}
                                </Button>
                                <Button
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    onClick={() => deleteSelectedMutation.mutate(selectedUserIds)}
                                    disabled={deleteSelectedMutation.isPending}
                                >
                                    {deleteSelectedMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {tGlobal('delete')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Hapus Semua Akun di Tab Aktif */}
                {isDeleteAllModalOpen && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm rounded-2xl border border-red-200 bg-card p-6 text-center shadow-2xl dark:border-red-500/30"
                        >
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
                                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">{tGlobal('warning')}</h3>
                            <p className="mb-6 text-sm text-muted-foreground">{tUM('modalDelAllSub')}</p>
                            <div className="flex justify-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsDeleteAllModalOpen(false)}
                                >
                                    {tGlobal('cancel')}
                                </Button>
                                <Button
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    onClick={() => deleteAllBulkMutation.mutate(activeTab)}
                                    disabled={deleteAllBulkMutation.isPending}
                                >
                                    {deleteAllBulkMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {tGlobal('yes')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
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
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-max">
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
                                onChange={(e) => setSearchQuery(e.target.value)}
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

                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'fullName', direction: 'asc' })}
                                        className="cursor-pointer"
                                    >
                                        <ArrowDownAZ className="mr-2 h-4 w-4 shrink-0" />{' '}
                                        {lang === 'id' ? 'Nama (A - Z)' : 'Name (A - Z)'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'fullName', direction: 'desc' })}
                                        className="cursor-pointer"
                                    >
                                        <ArrowUpZA className="mr-2 h-4 w-4 shrink-0" />{' '}
                                        {lang === 'id' ? 'Nama (Z - A)' : 'Name (Z - A)'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'role', direction: 'asc' })}
                                        className="cursor-pointer"
                                    >
                                        <ArrowDown className="mr-2 h-4 w-4 shrink-0" /> Role (A - Z)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'isActive', direction: 'asc' })}
                                        className="cursor-pointer"
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />{' '}
                                        {lang === 'id' ? 'Status Aktif' : 'Active Status'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'none', direction: 'asc' })}
                                        className={`cursor-pointer ${sortConfig.key === 'none' ? 'bg-primary/10 text-primary' : ''
                                            }`}
                                    >
                                        <ArrowUpDown className="mr-2 h-4 w-4 shrink-0" /> Reset (Default)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* GENERATE DATA */}
                            {BULK_TABS.includes(activeTab) && (
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

                                    <DropdownMenuContent align="end" className="w-52">
                                        <DropdownMenuItem
                                            className="cursor-pointer"
                                            onClick={() => setIsGenerateAllModalOpen(true)}
                                        >
                                            <DatabaseZap className="mr-2 h-4 w-4 shrink-0" />
                                            {tUM('generateAll')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="cursor-pointer"
                                            disabled={selectedUserIds.length === 0}
                                            onClick={() => setIsGenerateSelectedModalOpen(true)}
                                        >
                                            <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                                            <span className="truncate">
                                                {tUM('generateSelected')} ({selectedUserIds.length})
                                            </span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}

                            {/* HAPUS */}
                            {isSuperAdmin &&
                                (selectedUserIds.length > 0 ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 grow justify-center gap-2 whitespace-nowrap border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 sm:grow-0 sm:px-4"
                                        onClick={() => setIsDeleteSelectedModalOpen(true)}
                                    >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        <span>
                                            {tUM('deleteSelected')} ({selectedUserIds.length})
                                        </span>
                                    </Button>
                                ) : (
                                    BULK_TABS.includes(activeTab) && (
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

                {/* ================= TABEL DATA ================= */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="border-b border-border bg-muted/20">
                                <th className="w-10 px-4 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary accent-primary"
                                        aria-label={
                                            lang === 'id'
                                                ? 'Pilih semua di halaman ini'
                                                : 'Select all on this page'
                                        }
                                        checked={isAllPageSelected}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="w-16 px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                                    {tUM('colNo')}
                                </th>
                                <SortableHeader
                                    columnKey="fullName"
                                    label={tUM('colUser')}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                />
                                <SortableHeader
                                    columnKey="role"
                                    label={tUM('colRole')}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                />
                                <SortableHeader
                                    columnKey="isActive"
                                    label={tUM('colStatus')}
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                />
                                <th className="w-20 px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                                    {tUM('colAction')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedUsers.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="p-8 text-center italic text-muted-foreground"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                                        ) : (
                                            tUM('noUsers')
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((user: AppUser, index: number) => {
                                    const isSelf = currentUser?.id === user.id;
                                    const canEditRow = isSuperAdmin || user.role !== 'SUPER_ADMIN';

                                    return (
                                        <tr
                                            key={user.id}
                                            className={`transition-colors hover:bg-muted/30 ${selectedUserIds.includes(user.id) ? 'bg-primary/5' : ''
                                                }`}
                                        >
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary accent-primary"
                                                    aria-label={user.fullName}
                                                    checked={selectedUserIds.includes(user.id)}
                                                    onChange={() => handleToggleSelect(user.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                                {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                                        {user.fullName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold">{user.fullName}</p>
                                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${getRoleBadgeColor(
                                                        user.role
                                                    )}`}
                                                >
                                                    {formatRoleName(user.role)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.isActive
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-red-600 dark:text-red-400'
                                                        }`}
                                                >
                                                    <span
                                                        className={`h-2 w-2 rounded-full ${user.isActive
                                                                ? 'animate-pulse bg-emerald-500'
                                                                : 'bg-red-500'
                                                            }`}
                                                    />
                                                    {user.isActive ? tUM('statusActive') : tUM('statusBlocked')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={tUM('colAction')}
                                                            className="h-8 w-8"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        className="w-48 bg-card text-card-foreground"
                                                    >
                                                        {canEditRow && (
                                                            <DropdownMenuItem onClick={() => setUserToEdit(user)}>
                                                                <Edit className="mr-2 h-4 w-4" /> {tUM('actionEdit')}
                                                            </DropdownMenuItem>
                                                        )}

                                                        {isSuperAdmin && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => setUserToReset(user)}>
                                                                    <KeyRound className="mr-2 h-4 w-4" />{' '}
                                                                    {tUM('actionResetPass')}
                                                                </DropdownMenuItem>

                                                                {!isSelf && (
                                                                    <>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            className={
                                                                                user.isActive
                                                                                    ? 'text-red-600'
                                                                                    : 'text-emerald-600'
                                                                            }
                                                                            onClick={() =>
                                                                                toggleStatusMutation.mutate({
                                                                                    userId: user.id,
                                                                                    currentStatus: user.isActive,
                                                                                })
                                                                            }
                                                                        >
                                                                            {user.isActive ? (
                                                                                <Ban className="mr-2 h-4 w-4" />
                                                                            ) : (
                                                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                                            )}
                                                                            {user.isActive
                                                                                ? tUM('actionBlock')
                                                                                : tUM('actionUnblock')}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-500/10"
                                                                            onClick={() => setUserToDelete(user)}
                                                                        >
                                                                            <Trash2 className="mr-2 h-4 w-4" />{' '}
                                                                            {tUM('actionDelete')}
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ================= PAGINATION ================= */}
                {processedUsers.length > 0 && (
                    <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 xl:flex-row">
                        <span className="text-center text-sm text-muted-foreground xl:text-left">
                            {tGlobal('showing')}{' '}
                            <span className="font-medium text-foreground">
                                {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                            </span>{' '}
                            -{' '}
                            <span className="font-medium text-foreground">
                                {Math.min(currentPage * ITEMS_PER_PAGE, processedUsers.length)}
                            </span>{' '}
                            {tGlobal('of')}{' '}
                            <span className="font-medium text-foreground">{processedUsers.length}</span>{' '}
                            {tGlobal('entries')}
                        </span>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 text-muted-foreground"
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 text-muted-foreground"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                {getPageNumbers().map((pageNum) => (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? 'default' : 'outline'}
                                        size="icon"
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`h-8 w-8 font-medium ${currentPage === pageNum
                                                ? 'bg-primary font-bold text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                            }`}
                                    >
                                        {pageNum}
                                    </Button>
                                ))}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="h-8 w-8 text-muted-foreground"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="h-8 w-8 text-muted-foreground"
                                >
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="flex items-center gap-2 border-border sm:ml-4 sm:border-l sm:pl-4">
                                <span className="hidden text-sm text-muted-foreground sm:inline-block">
                                    {lang === 'id' ? 'Ke Halaman:' : 'Go to Page:'}
                                </span>
                                <Input
                                    value={pageInput}
                                    onChange={(e) => setPageInput(e.target.value)}
                                    onKeyDown={handleManualPageKeyDown}
                                    onBlur={commitManualPage}
                                    className="h-8 w-14 px-1 text-center"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}