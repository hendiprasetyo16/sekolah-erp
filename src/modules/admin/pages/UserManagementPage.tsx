import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Users, ShieldCheck, UserCog, GraduationCap, Users2,
    Search, Plus, MoreVertical, Edit, KeyRound, Ban, CheckCircle2,
    Loader2, AlertCircle, X, Eye, EyeOff, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight, UserPlus, Trash2, DatabaseZap, ChevronDown,
    ArrowDownAZ, ArrowUpZA, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { translations } from '@/constants/translations';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ==========================================
// TYPES & INTERFACES
// Bentuk data yang dipakai di halaman ini
// ==========================================

// Daftar role (jabatan/hak akses) akun yang tersedia di sistem
export type AppUserRole =
    | 'SUPER_ADMIN' | 'ADMIN' | 'KEPALA_SEKOLAH' | 'OPERATOR'
    | 'BENDAHARA' | 'WALI_KELAS' | 'GURU' | 'STAFF_TU'
    | 'STAFF_SARPRAS' | 'ORANG_TUA' | 'SISWA';

// Satu baris data di tabel "users" Supabase
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

// Kolom yang boleh dijadikan dasar pengurutan ('none' = urutan bawaan database)
type SortKey = 'fullName' | 'role' | 'isActive' | 'none';
type SortConfig = { key: SortKey; direction: 'asc' | 'desc' };

// ==========================================
// KONSTANTA & SCHEMA
// Diletakkan di luar komponen supaya tidak dibuat ulang setiap render
// ==========================================

// Jumlah baris per halaman di tabel
const ITEMS_PER_PAGE = 10;

// Password sementara untuk fitur "Generate Akun Terpilih".
// TODO: sebaiknya diganti password acak per user / wajib ganti saat login pertama
const DEFAULT_PASSWORD = 'Password123!';

// Sumber tunggal daftar role: dipakai oleh schema zod DAN isi dropdown role
const ROLE_VALUES = [
    'SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'BENDAHARA',
    'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS', 'ORANG_TUA', 'SISWA',
] as const satisfies readonly AppUserRole[];

// Pengelompokan role untuk filter tab
const MANAGEMENT_ROLES: AppUserRole[] = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'];
const STAFF_ROLES: AppUserRole[] = ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'];

// Tab yang menampilkan tombol aksi massal (Generate Data / Hapus Semua)
const BULK_TABS = ['staff', 'siswa', 'orangtua'];

// Validasi form "Tambah Pengguna"
const createUserSchema = z.object({
    fullName: z.string().min(3, 'Minimal 3 char'),
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Minimal 6 char'),
    role: z.enum(ROLE_VALUES),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

// Validasi form "Edit Pengguna" (email tidak bisa diubah)
const editUserSchema = z.object({
    fullName: z.string().min(3, 'Minimal 3 char'),
    role: z.enum(ROLE_VALUES),
});
type EditUserFormValues = z.infer<typeof editUserSchema>;

// Validasi form "Reset Password"
const resetPasswordSchema = z.object({
    newPassword: z.string().min(6, 'Minimal 6 char'),
});
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Hitung hasil sukses/gagal dari banyak pemanggilan edge function sekaligus.
// supabase.functions.invoke TIDAK melempar error, ia mengembalikan { data, error },
// jadi hasilnya harus dicek satu per satu.
type InvokeResult = { data: any; error: { message: string } | null };
const summarizeResults = (results: InvokeResult[]) => {
    const failures = results.filter(r => r.error || r.data?.error);
    return {
        total: results.length,
        success: results.length - failures.length,
        failed: failures.length,
        firstMessage: failures[0]?.error?.message || failures[0]?.data?.error || 'Unknown error',
    };
};

// Ambil SEMUA akun dari tabel users.
// Supabase membatasi 1000 baris per query, jadi diambil bertahap (per 1000 baris)
// supaya daftar siswa + orang tua yang jumlahnya besar tidak terpotong.
const fetchAllUsers = async (schoolId: string | null, isSuperAdmin: boolean): Promise<AppUser[]> => {
    const size = 1000;
    const all: AppUser[] = [];
    for (let from = 0; ; from += size) {
        let query = supabase
            .from('users')
            .select('*')
            .order('createdAt', { ascending: false })
            .order('id', { ascending: true }) // urutan kedua agar hasil antar halaman stabil
            .range(from, from + size - 1);

        // Selain Super Admin, hanya boleh melihat akun milik sekolahnya sendiri
        if (!isSuperAdmin && schoolId) query = query.eq('schoolId', schoolId);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        all.push(...((data as AppUser[]) || []));
        if (!data || data.length < size) break; // halaman terakhir
    }
    return all;
};

// ==========================================
// SUB-KOMPONEN HEADER TABEL
// Header kolom yang bisa diklik untuk mengurutkan (asc -> desc -> reset)
// ==========================================
interface SortableHeaderProps {
    columnKey: SortKey;
    label: string;
    sortConfig: SortConfig;
    onSort: (key: SortKey) => void;
}

function SortableHeader({ columnKey, label, sortConfig, onSort }: SortableHeaderProps) {
    // Pilih ikon sesuai kondisi urutan kolom ini
    const renderIcon = () => {
        // Kolom ini sedang tidak dipakai mengurutkan -> ikon pudar
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 opacity-30 ml-1" />;
        // Kolom nama memakai ikon A-Z / Z-A
        if (columnKey === 'fullName') {
            return sortConfig.direction === 'asc'
                ? <ArrowDownAZ className="w-3 h-3 text-primary ml-1" />
                : <ArrowUpZA className="w-3 h-3 text-primary ml-1" />;
        }
        // Kolom lain memakai panah atas/bawah
        return sortConfig.direction === 'asc'
            ? <ArrowDown className="w-3 h-3 text-primary ml-1" />
            : <ArrowUp className="w-3 h-3 text-primary ml-1" />;
    };

    return (
        <th
            className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hover:bg-muted/50 cursor-pointer transition-colors select-none"
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

    // Bahasa aktif (id / en)
    const { locale } = useUIStore();
    const lang = locale === 'en' ? 'en' : 'id';

    // Ambil teks terjemahan umum (tombol Simpan, Batal, dsb.)
    const tGlobal = (key: keyof typeof translations.id.common): string => translations[lang].common[key];

    // Ambil teks terjemahan khusus halaman ini; {count} dst. diganti nilai di parameter `replace`
    const tUM = (key: keyof typeof translations.id.userManagement, replace?: Record<string, any>): string => {
        let text: string = translations[lang].userManagement[key];
        if (replace) {
            Object.keys(replace).forEach(k => { text = text.replace(`{${k}}`, String(replace[k])); });
        }
        return text;
    };

    // ------------------------------------------
    // STATES
    // ------------------------------------------
    const [activeTab, setActiveTab] = useState<string>('semua');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'none', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>('1');         // isi kotak "Ke Halaman"
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]); // checkbox yang dicentang

    // Kembali ke halaman 1 & kosongkan pilihan ketika filter, pencarian, atau urutan berubah
    useEffect(() => { setCurrentPage(1); setPageInput('1'); setSelectedUserIds([]); }, [searchQuery, activeTab, sortConfig]);
    // Sinkronkan kotak "Ke Halaman" dengan halaman yang sedang aktif
    useEffect(() => { setPageInput(currentPage.toString()); }, [currentPage]);

    // State untuk membuka/menutup setiap modal (popup)
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
    const [isGenerateSelectedModalOpen, setIsGenerateSelectedModalOpen] = useState(false);
    const [isGenerateAllModalOpen, setIsGenerateAllModalOpen] = useState(false);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
    const [showAddPassword, setShowAddPassword] = useState(false);     // tampilkan/sembunyikan password di form tambah
    const [showResetPassword, setShowResetPassword] = useState(false); // tampilkan/sembunyikan password di form reset

    // ------------------------------------------
    // FORMS (react-hook-form + validasi zod)
    // ------------------------------------------
    const addUserForm = useForm<CreateUserFormValues>({ resolver: zodResolver(createUserSchema), defaultValues: { fullName: '', email: '', password: '', role: 'GURU' } });
    const editUserForm = useForm<EditUserFormValues>({ resolver: zodResolver(editUserSchema), defaultValues: { fullName: '', role: 'GURU' } });
    const resetPassForm = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { newPassword: '' } });

    // Isi form edit dengan data user yang dipilih setiap kali modal edit dibuka
    useEffect(() => { if (userToEdit) editUserForm.reset({ fullName: userToEdit.fullName, role: userToEdit.role }); }, [userToEdit, editUserForm]);

    // ------------------------------------------
    // DATA FETCHING
    // ------------------------------------------

    // Ambil daftar akun. Daftar bisa berubah dari halaman lain (hapus guru/siswa, import, dsb.),
    // jadi selalu diambil ulang saat halaman dibuka, tab difokuskan, atau koneksi kembali.
    const { data: users, isLoading } = useQuery<AppUser[], Error>({
        queryKey: ['users-list', school?.id, isSuperAdmin],
        queryFn: async () => {
            if (!isSuperAdmin && !school?.id) return [];
            return fetchAllUsers(school?.id ?? null, isSuperAdmin);
        },
        enabled: isSuperAdmin || !!school?.id,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
    });

    // REALTIME: begitu tabel users berubah (dari halaman/perangkat mana pun), daftar ikut diperbarui.
    // BUGFIX: nama channel dibuat unik (UUID) supaya tidak bentrok saat React Strict Mode
    // menjalankan effect dua kali (error "cannot add postgres_changes callbacks ... after subscribe()").
    // Realtime hanya pelengkap, jadi kegagalannya cukup dicatat dan tidak boleh membuat halaman crash.
    // Catatan: tabel "users" harus diaktifkan untuk Realtime di dashboard Supabase.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        try {
            channel = supabase
                .channel(`users-list-${crypto.randomUUID()}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
                    // Debounce: hapus massal memicu ratusan event, cukup satu kali refetch
                    clearTimeout(timer);
                    timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['users-list'] }), 500);
                })
                .subscribe((status, err) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.warn('Realtime users tidak aktif:', status, err?.message);
                    }
                });
        } catch (e) {
            console.warn('Realtime gagal dipasang:', e);
        }

        // Bersihkan saat halaman ditutup
        return () => {
            clearTimeout(timer);
            if (channel) supabase.removeChannel(channel);
        };
    }, [queryClient]);

    // ------------------------------------------
    // MUTATIONS (aksi yang mengubah data)
    // Semua punya onError supaya user selalu melihat pesan kalau gagal
    // ------------------------------------------

    // Tambah satu pengguna baru (lewat edge function create-user)
    const addUserMutation = useMutation({
        mutationFn: async (payload: CreateUserFormValues) => {
            const { data, error } = await supabase.functions.invoke('create-user', { body: { ...payload, schoolId: school?.id } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
            return data;
        },
        onSuccess: () => {
            toast.success(tUM('toastAddSuccess'));
            setIsAddUserModalOpen(false); addUserForm.reset(); setShowAddPassword(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // Ubah nama & role pengguna
    const editUserMutation = useMutation({
        mutationFn: async (payload: { id: string, data: EditUserFormValues }) => {
            const { error } = await supabase.from('users').update({ fullName: payload.data.fullName, role: payload.data.role }).eq('id', payload.id);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(tUM('toastEditSuccess'));
            setUserToEdit(null); queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // Reset password satu pengguna
    const resetPasswordMutation = useMutation({
        mutationFn: async (payload: { userId: string, newPass: string }) => {
            const { data, error } = await supabase.functions.invoke('reset-password', { body: { targetUserId: payload.userId, newPassword: payload.newPass } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => {
            toast.success(tUM('toastResetSuccess'));
            setUserToReset(null); resetPassForm.reset(); setShowResetPassword(false);
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // Blokir / aktifkan kembali akun
    const toggleStatusMutation = useMutation({
        mutationFn: async (payload: { userId: string, currentStatus: boolean }) => {
            const { error } = await supabase.from('users').update({ isActive: !payload.currentStatus }).eq('id', payload.userId);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => { toast.success(tUM('toastStatusSuccess')); queryClient.invalidateQueries({ queryKey: ['users-list'] }); },
        onError: (error: Error) => toast.error(error.message)
    });

    // Hapus satu pengguna
    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            const { data, error } = await supabase.functions.invoke('delete-user', { body: { targetUserId: userId } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => { toast.success(tUM('toastDelSuccess')); setUserToDelete(null); queryClient.invalidateQueries({ queryKey: ['users-list'] }); },
        onError: (error: Error) => toast.error(error.message)
    });

    // Buatkan akun login untuk data (guru/siswa/ortu) yang dicentang, memakai password default
    const generateSelectedMutation = useMutation({
        mutationFn: async (usersTarget: AppUser[]) => {
            const results = await Promise.all(
                usersTarget.map(user => supabase.functions.invoke('create-user', {
                    body: { email: user.email, password: DEFAULT_PASSWORD, fullName: user.fullName, role: user.role, schoolId: user.schoolId, existingUserId: user.id }
                }))
            );
            const summary = summarizeResults(results as InvokeResult[]);
            if (summary.success === 0) throw new Error(summary.firstMessage); // semua gagal -> tampilkan error
            return summary;
        },
        onSuccess: (summary) => {
            toast.success(tUM('toastGenSelSuccess', { count: summary.success }), { description: `Password: ${DEFAULT_PASSWORD}` });
            // Sebagian gagal -> beri peringatan
            if (summary.failed > 0) toast.warning(`${summary.failed} akun gagal diproses.`, { description: summary.firstMessage });
            setIsGenerateSelectedModalOpen(false); setSelectedUserIds([]); queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // Buatkan akun login untuk SEMUA data di tab aktif (diproses bertahap oleh edge function)
    const generateBulkMasterMutation = useMutation({
        mutationFn: async (targetGroup: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-accounts-from-master`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ targetGroup, schoolId: school?.id })
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'Terjadi kesalahan sistem');
            return data;
        },
        onSuccess: (data) => {
            toast.success('Proses Selesai', { description: data.message });
            if (data.failed > 0) toast.warning(`${data.failed} akun gagal diproses.`);
            // Masih ada antrean -> modal dibiarkan terbuka agar user bisa klik lagi untuk melanjutkan
            if (data.remaining > 0) toast.info(`Tersisa ${data.remaining} antrean.`, { description: 'Klik Generate Data lagi.' });
            else setIsGenerateAllModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error('Gagal Generate', { description: error.message })
    });

    // Hapus akun yang dicentang
    const deleteSelectedMutation = useMutation({
        mutationFn: async (userIds: string[]) => {
            const results = await Promise.all(userIds.map(id => supabase.functions.invoke('delete-user', { body: { targetUserId: id } })));
            const summary = summarizeResults(results as InvokeResult[]);
            if (summary.success === 0) throw new Error(summary.firstMessage);
            return summary;
        },
        onSuccess: (summary) => {
            toast.success(tUM('toastDelSelSuccess', { count: summary.success }));
            if (summary.failed > 0) toast.warning(`${summary.failed} akun gagal dihapus.`, { description: summary.firstMessage });
            setIsDeleteSelectedModalOpen(false); setSelectedUserIds([]); queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // Hapus SEMUA akun pada tab aktif (staff / siswa / orang tua)
    const deleteAllBulkMutation = useMutation({
        mutationFn: async (targetGroup: string) => {
            const { data, error } = await supabase.functions.invoke('delete-users-by-role', { body: { targetGroup, schoolId: school?.id } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
            return data;
        },
        onSuccess: (data) => {
            toast.success(tGlobal('info'), { description: data.message || "Done!" });
            setIsDeleteAllModalOpen(false); setSelectedUserIds([]); queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // ==========================================
    // OPTIMASI PERFORMA: MEMOIZATION
    // Filter (tab + pencarian) lalu urutkan; hanya dihitung ulang kalau salah satu inputnya berubah
    // ==========================================
    const processedUsers = useMemo(() => {
        if (!users) return [];

        // 1) FILTER: cocokkan kata pencarian (nama/email) dan tab yang aktif
        let filtered = users.filter((u) => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);

            let matchesTab = true;
            if (activeTab === 'manajemen') matchesTab = MANAGEMENT_ROLES.includes(u.role);
            else if (activeTab === 'staff') matchesTab = STAFF_ROLES.includes(u.role);
            else if (activeTab === 'siswa') matchesTab = u.role === 'SISWA';
            else if (activeTab === 'orangtua') matchesTab = u.role === 'ORANG_TUA';

            return matchesSearch && matchesTab;
        });

        // 2) SORT: 'none' = biarkan urutan bawaan database
        if (sortConfig.key !== 'none') {
            filtered = filtered.sort((a, b) => {
                let comparison = 0;
                if (sortConfig.key === 'fullName') comparison = a.fullName.localeCompare(b.fullName);
                else if (sortConfig.key === 'role') comparison = a.role.localeCompare(b.role);
                else if (sortConfig.key === 'isActive') comparison = (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1; // asc = aktif di atas

                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return filtered;
    }, [users, searchQuery, activeTab, sortConfig]);

    // ------------------------------------------
    // PAGINATION
    // ------------------------------------------
    const totalPages = Math.ceil(processedUsers.length / ITEMS_PER_PAGE);

    // Kalau data menyusut (mis. dihapus dari tab lain), mundur ke halaman terakhir yang ada
    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    // Buang ID terpilih yang akunnya sudah tidak ada (mis. sudah terhapus lewat Realtime)
    useEffect(() => {
        if (!users) return;
        const ids = new Set(users.map(u => u.id));
        setSelectedUserIds(prev => {
            const next = prev.filter(id => ids.has(id));
            return next.length === prev.length ? prev : next; // tidak berubah -> hindari render ulang
        });
    }, [users]);

    // Potong data sesuai halaman aktif
    const paginatedUsers = processedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Tombol nomor halaman: maksimal 5 nomor, bergeser mengikuti halaman aktif
    const getPageNumbers = () => {
        const pages = [];
        let start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    // ------------------------------------------
    // HANDLERS
    // ------------------------------------------

    // Klik header kolom: asc -> desc -> reset (kembali ke urutan bawaan)
    const handleSort = (key: SortKey) => {
        if (sortConfig.key === key) {
            setSortConfig({ key: sortConfig.direction === 'asc' ? key : 'none', direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
        } else {
            setSortConfig({ key, direction: 'asc' });
        }
    };

    // Lompat ke halaman yang diketik manual (Enter / klik di luar kotak)
    const handleManualPageSubmit = (e?: React.KeyboardEvent<HTMLInputElement>) => {
        if (e && e.key !== 'Enter') return;
        let targetPage = parseInt(pageInput, 10);
        if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
        if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
        setCurrentPage(targetPage);
        setPageInput(targetPage.toString());
    };

    // Checkbox "pilih semua": hanya memilih baris di halaman yang sedang tampil
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedUserIds(e.target.checked ? paginatedUsers.map(u => u.id) : []);
    };
    // Checkbox per baris
    const handleToggleSelect = (userId: string) => {
        setSelectedUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
    };

    // ------------------------------------------
    // HELPER TAMPILAN
    // ------------------------------------------

    // Nama role sesuai bahasa aktif
    const formatRoleName = (role: AppUserRole): string => tUM(('role_' + role) as keyof typeof translations.id.userManagement);

    // Warna badge role di tabel
    const getRoleBadgeColor = (role: AppUserRole): string => {
        if (role === 'SUPER_ADMIN') return 'bg-rose-100 text-rose-700 border-rose-200';
        if (['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(role)) return 'bg-purple-100 text-purple-700 border-purple-200';
        if (STAFF_ROLES.includes(role)) return 'bg-blue-100 text-blue-700 border-blue-200';
        if (role === 'SISWA') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        return 'bg-slate-100 text-slate-700 border-slate-200';
    };

    // Isi dropdown role, dipakai bersama oleh form tambah & edit
    const roleSelectItems = ROLE_VALUES.map(r => (
        <SelectItem key={r} value={r}>{tUM(('role_' + r) as keyof typeof translations.id.userManagement)}</SelectItem>
    ));

    // Teks pada tombol Sortir sesuai urutan yang aktif
    const sortLabel = sortConfig.key === 'fullName' ? 'Sortir Nama' : sortConfig.key === 'role' ? 'Sortir Role' : sortConfig.key === 'isActive' ? 'Sortir Status' : 'Sortir';

    // Jumlah akun per tab (ditampilkan sebagai angka kecil di tiap tab).
    // Dihitung dari semua data, tidak terpengaruh kata pencarian.
    const tabCounts = useMemo<Record<string, number>>(() => {
        const list = users ?? [];
        return {
            semua: list.length,
            manajemen: list.filter(u => MANAGEMENT_ROLES.includes(u.role)).length,
            staff: list.filter(u => STAFF_ROLES.includes(u.role)).length,
            siswa: list.filter(u => u.role === 'SISWA').length,
            orangtua: list.filter(u => u.role === 'ORANG_TUA').length,
        };
    }, [users]);

    // Daftar tab: value harus sama dengan nilai yang dicek di processedUsers & BULK_TABS
    const TAB_ITEMS = [
        { value: 'semua', label: tUM('tabAll'), icon: Users },
        { value: 'manajemen', label: tUM('tabManagement'), icon: ShieldCheck },
        { value: 'staff', label: tUM('tabStaff'), icon: UserCog },
        { value: 'siswa', label: tUM('tabStudent'), icon: GraduationCap },
        { value: 'orangtua', label: tUM('tabParent'), icon: Users2 },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative">
            {/* ================= MODALS (popup) ================= */}
            <AnimatePresence>
                {/* Modal: Tambah Pengguna (hanya Super Admin) */}
                {isAddUserModalOpen && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-md w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div><h3 className="text-xl font-bold">{tUM('modalAddTitle')}</h3><p className="text-muted-foreground text-sm">{tUM('modalAddSub')}</p></div>
                                <Button variant="ghost" size="icon" onClick={() => { setIsAddUserModalOpen(false); addUserForm.reset(); setShowAddPassword(false); }}><X className="w-5 h-5" /></Button>
                            </div>
                            <Form {...addUserForm}>
                                <form onSubmit={addUserForm.handleSubmit((data) => addUserMutation.mutate(data))} className="space-y-4">
                                    <FormField control={addUserForm.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>{tGlobal('name')}</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={addUserForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@sekolah.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={addUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{tUM('colRole')}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl><SelectTrigger><SelectValue placeholder={tUM('roleReq')} /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-50 overflow-y-auto">
                                                    {roleSelectItems}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={addUserForm.control} name="password" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showAddPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    {/* Tombol mata: tampilkan / sembunyikan password */}
                                                    <button type="button" onClick={() => setShowAddPassword(!showAddPassword)} className="absolute right-3 text-muted-foreground">
                                                        {showAddPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => { setIsAddUserModalOpen(false); addUserForm.reset(); setShowAddPassword(false); }}>{tGlobal('cancel')}</Button>
                                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={addUserMutation.isPending}>{addUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} {tGlobal('save')}</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Edit Pengguna (email dikunci, role hanya bisa diubah Super Admin) */}
                {userToEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-md w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div><h3 className="text-xl font-bold">{tUM('modalEditTitle')}</h3><p className="text-muted-foreground text-sm">{tUM('modalEditSub')}</p></div>
                                <Button variant="ghost" size="icon" onClick={() => setUserToEdit(null)}><X className="w-5 h-5" /></Button>
                            </div>
                            <Form {...editUserForm}>
                                <form onSubmit={editUserForm.handleSubmit((data) => editUserMutation.mutate({ id: userToEdit.id, data }))} className="space-y-4">
                                    <div className="space-y-2"><FormLabel>Email</FormLabel><Input value={userToEdit.email} disabled className="bg-muted" /></div>
                                    <FormField control={editUserForm.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>{tGlobal('name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={editUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{tUM('colRole')}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange} disabled={!isSuperAdmin}>
                                                <FormControl><SelectTrigger><SelectValue placeholder={tUM('roleReq')} /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-50 overflow-y-auto">
                                                    {roleSelectItems}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => setUserToEdit(null)}>{tGlobal('cancel')}</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={editUserMutation.isPending}>{editUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit className="w-4 h-4 mr-2" />} {tGlobal('save')}</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Reset Password (hanya Super Admin) */}
                {userToReset && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-sm w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div className="w-12 h-12 bg-blue-100 flex items-center justify-center rounded-full"><KeyRound className="w-6 h-6 text-blue-600" /></div>
                                <Button variant="ghost" size="icon" onClick={() => { setUserToReset(null); setShowResetPassword(false); }}><X className="w-5 h-5" /></Button>
                            </div>
                            <h3 className="text-xl font-bold mb-1">{tUM('modalResetTitle')}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{tUM('modalResetSub')} <strong>{userToReset.email}</strong></p>
                            <Form {...resetPassForm}>
                                <form onSubmit={resetPassForm.handleSubmit((data) => resetPasswordMutation.mutate({ userId: userToReset.id, newPass: data.newPassword }))} className="space-y-4">
                                    <FormField control={resetPassForm.control} name="newPassword" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{tUM('newPassword')}</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showResetPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    {/* Tombol mata: tampilkan / sembunyikan password */}
                                                    <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-3 text-muted-foreground">
                                                        {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => { setUserToReset(null); setShowResetPassword(false); }}>{tGlobal('cancel')}</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={resetPasswordMutation.isPending}>{resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />} {tGlobal('save')}</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Konfirmasi hapus satu pengguna (hanya Super Admin) */}
                {userToDelete && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-sm w-full p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">{tUM('modalDelTitle')}</h3>
                            <p className="text-muted-foreground text-sm mb-1">{tUM('modalDelSub')}</p>
                            <p className="font-semibold text-foreground mb-6">{userToDelete.fullName}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setUserToDelete(null)}>{tGlobal('cancel')}</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteUserMutation.mutate(userToDelete.id)} disabled={deleteUserMutation.isPending}>
                                    {deleteUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {tGlobal('delete')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Konfirmasi generate akun untuk data yang dicentang */}
                {isGenerateSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-blue-100 flex items-center justify-center rounded-full mx-auto mb-4"><UserPlus className="w-6 h-6 text-blue-600" /></div>
                            <h3 className="text-xl font-bold mb-2">{tUM('modalGenSelTitle', { count: selectedUserIds.length })}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{tUM('modalGenSelSub', { count: selectedUserIds.length })}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsGenerateSelectedModalOpen(false)}>{tGlobal('cancel')}</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => generateSelectedMutation.mutate(processedUsers.filter(u => selectedUserIds.includes(u.id)))} disabled={generateSelectedMutation.isPending}>
                                    {generateSelectedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} {tGlobal('yes')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Konfirmasi generate akun untuk SEMUA data di tab aktif */}
                {isGenerateAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center rounded-full mx-auto mb-4"><DatabaseZap className="w-6 h-6 text-emerald-600" /></div>
                            <h3 className="text-xl font-bold mb-2">{tUM('modalGenAllTitle')}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{tUM('modalGenAllSub')}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsGenerateAllModalOpen(false)}>{tGlobal('cancel')}</Button>
                                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => generateBulkMasterMutation.mutate(activeTab)} disabled={generateBulkMasterMutation.isPending}>
                                    {generateBulkMasterMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseZap className="w-4 h-4 mr-2" />} {tUM('generateAll')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Konfirmasi hapus akun yang dicentang */}
                {isDeleteSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><Trash2 className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">{tUM('modalDelSelTitle', { count: selectedUserIds.length })}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{tUM('modalDelSelSub', { count: selectedUserIds.length })}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsDeleteSelectedModalOpen(false)}>{tGlobal('cancel')}</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteSelectedMutation.mutate(selectedUserIds)} disabled={deleteSelectedMutation.isPending}>
                                    {deleteSelectedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {tGlobal('delete')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal: Konfirmasi hapus SEMUA akun di tab aktif (peringatan keras) */}
                {isDeleteAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border border-red-200 p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">{tGlobal('warning')}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{tUM('modalDelAllSub')}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsDeleteAllModalOpen(false)}>{tGlobal('cancel')}</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteAllBulkMutation.mutate(activeTab)} disabled={deleteAllBulkMutation.isPending}>
                                    {deleteAllBulkMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {tGlobal('yes')}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================= HEADER & JUDUL HALAMAN ================= */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" /> {tUM('pageTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{tUM('pageSubtitle')}</p>
                </div>
                {/* Tombol Tambah Pengguna (hanya Super Admin) */}
                {isSuperAdmin && (
                    <Button onClick={() => setIsAddUserModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                        <Plus className="w-4 h-4 mr-2" /> {tUM('addUser')}
                    </Button>
                )}
            </div>

            <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
                {/* ================= TAB FILTER (Semua / Manajemen / Staff / Siswa / Orang Tua) =================
                    Tab yang sedang aktif diberi warna hijau penuh + teks putih, tab lain tampil redup.
                    Angka kecil di tiap tab = jumlah akun pada kelompok tersebut. */}
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
                                        {/* Jumlah akun di tab ini */}
                                        <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                                            {tabCounts[value] ?? 0}
                                        </span>
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                </div>

                {/* ================= TOOLBAR (pencarian + tombol aksi) =================
                    Memakai flexbox murni (tanpa grid / lebar tombol yang berubah per breakpoint) supaya hasilnya konsisten:
                    - Layar >= lg : pencarian di kiri (melebar), tombol aksi di kanan, SATU baris, tidak turun baris
                    - Layar kecil : pencarian di atas; tombol aksi di bawahnya, otomatis turun baris dan
                                    melebar mengisi baris (grow) sehingga tidak ada tombol yang "menggantung" */}
                <div className="border-b border-border pb-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

                        {/* SEARCH: cari berdasarkan nama atau email */}
                        <div className="relative w-full min-w-0 lg:max-w-md lg:flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={tUM('searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-10 w-full pl-9"
                            />
                        </div>

                        {/* ACTIONS: kumpulan tombol aksi.
                            Catatan kelas tombol: "grow" = melebar mengisi baris di layar kecil, "sm:grow-0" = ukuran sesuai isi
                            di layar >= sm. "whitespace-nowrap" mencegah teks tombol terpecah jadi dua baris. */}
                        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap lg:justify-end">

                            {/* SORTIR: dropdown pilihan urutan.
                                min-w dipasang karena teks tombol berubah (Sortir / Sortir Nama / ...),
                                supaya tombol lain di sebelahnya tidak ikut bergeser. */}
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
                                    <DropdownMenuItem onClick={() => setSortConfig({ key: 'fullName', direction: 'asc' })} className="cursor-pointer">
                                        <ArrowDownAZ className="mr-2 h-4 w-4 shrink-0" /> Nama (A - Z)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortConfig({ key: 'fullName', direction: 'desc' })} className="cursor-pointer">
                                        <ArrowUpZA className="mr-2 h-4 w-4 shrink-0" /> Nama (Z - A)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortConfig({ key: 'role', direction: 'asc' })} className="cursor-pointer">
                                        <ArrowDown className="mr-2 h-4 w-4 shrink-0" /> Role (A - Z)
                                    </DropdownMenuItem>
                                    {/* asc = akun aktif ditampilkan lebih dulu */}
                                    <DropdownMenuItem onClick={() => setSortConfig({ key: 'isActive', direction: 'asc' })} className="cursor-pointer">
                                        <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" /> Status Aktif
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {/* Kembali ke urutan bawaan database */}
                                    <DropdownMenuItem
                                        onClick={() => setSortConfig({ key: 'none', direction: 'asc' })}
                                        className={`cursor-pointer ${sortConfig.key === 'none' ? 'bg-primary/10 text-primary' : ''}`}
                                    >
                                        <ArrowUpDown className="mr-2 h-4 w-4 shrink-0" /> Reset (Default)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* GENERATE DATA: hanya di tab Staff / Siswa / Orang Tua */}
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
                                        {/* Buat akun untuk semua data di tab ini */}
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => setIsGenerateAllModalOpen(true)}>
                                            <DatabaseZap className="mr-2 h-4 w-4 shrink-0" />
                                            {tUM('generateAll')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {/* Buat akun hanya untuk baris yang dicentang (nonaktif kalau belum ada yang dicentang) */}
                                        <DropdownMenuItem
                                            className="cursor-pointer"
                                            disabled={selectedUserIds.length === 0}
                                            onClick={() => setIsGenerateSelectedModalOpen(true)}
                                        >
                                            <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                                            <span className="truncate">{tUM('generateSelected')} ({selectedUserIds.length})</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}

                            {/* HAPUS (hanya Super Admin):
                                - ada yang dicentang -> "Hapus Terpilih"
                                - tidak ada yang dicentang & di tab massal -> "Hapus Semua" */}
                            {isSuperAdmin && (
                                selectedUserIds.length > 0 ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 grow justify-center gap-2 whitespace-nowrap border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 sm:grow-0 sm:px-4"
                                        onClick={() => setIsDeleteSelectedModalOpen(true)}
                                    >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        <span>{tUM('deleteSelected')} ({selectedUserIds.length})</span>
                                    </Button>
                                ) : (
                                    BULK_TABS.includes(activeTab) && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 grow justify-center gap-2 whitespace-nowrap border-red-200 px-3 text-red-600 hover:bg-red-50 hover:text-red-700 sm:grow-0 sm:px-4"
                                            onClick={() => setIsDeleteAllModalOpen(true)}
                                        >
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{tUM('bulkDeleteAll')}</span>
                                        </Button>
                                    )
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* ================= TABEL DATA ================= */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/20">
                                {/* Checkbox pilih semua (halaman aktif) */}
                                <th className="px-4 py-3 w-10 text-center"><input type="checkbox" className="rounded border-gray-300 w-4 h-4 text-primary cursor-pointer accent-primary" checked={paginatedUsers.length > 0 && selectedUserIds.length === paginatedUsers.length} onChange={handleSelectAll} /></th>
                                {/* Nomor urut: tidak bisa diklik / diurutkan */}
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-center w-16">{tUM('colNo')}</th>
                                {/* Kolom yang bisa diklik untuk mengurutkan */}
                                <SortableHeader columnKey="fullName" label={tUM('colUser')} sortConfig={sortConfig} onSort={handleSort} />
                                <SortableHeader columnKey="role" label={tUM('colRole')} sortConfig={sortConfig} onSort={handleSort} />
                                <SortableHeader columnKey="isActive" label={tUM('colStatus')} sortConfig={sortConfig} onSort={handleSort} />
                                {/* Kolom aksi: tidak perlu diurutkan */}
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-right w-20">{tUM('colAction')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedUsers.length === 0 ? (
                                // Kosong: tampilkan loading saat mengambil data, atau pesan "tidak ada data"
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                                        {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /> : tUM('noUsers')}
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((user: AppUser, index: number) => (
                                    <tr key={user.id} className={`hover:bg-muted/30 transition-colors ${selectedUserIds.includes(user.id) ? 'bg-primary/5' : ''}`}>
                                        {/* Checkbox baris */}
                                        <td className="px-4 py-3 text-center"><input type="checkbox" className="rounded border-gray-300 w-4 h-4 text-primary cursor-pointer accent-primary" checked={selectedUserIds.includes(user.id)} onChange={() => handleToggleSelect(user.id)} /></td>
                                        {/* Nomor urut berlanjut antar halaman */}
                                        <td className="px-4 py-3 text-center text-sm text-muted-foreground font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                        {/* Avatar inisial + nama + email */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">{user.fullName.charAt(0).toUpperCase()}</div>
                                                <div><p className="font-semibold text-sm">{user.fullName}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
                                            </div>
                                        </td>
                                        {/* Badge role */}
                                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeColor(user.role)}`}>{formatRoleName(user.role)}</span></td>
                                        {/* Status aktif / diblokir */}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.isActive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                                {user.isActive ? tUM('statusActive') : tUM('statusBlocked')}
                                            </span>
                                        </td>
                                        {/* Menu aksi per baris (titik tiga) */}
                                        <td className="px-4 py-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 bg-card text-card-foreground">
                                                    <DropdownMenuItem onClick={() => setUserToEdit(user)}><Edit className="w-4 h-4 mr-2" /> {tUM('actionEdit')}</DropdownMenuItem>
                                                    {/* Aksi di bawah ini hanya untuk Super Admin */}
                                                    {isSuperAdmin && (
                                                        <>
                                                            <DropdownMenuItem onClick={() => setUserToReset(user)}><KeyRound className="w-4 h-4 mr-2" /> {tUM('actionResetPass')}</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            {/* Blokir / aktifkan akun */}
                                                            <DropdownMenuItem className={user.isActive ? 'text-red-600' : 'text-emerald-600'} onClick={() => toggleStatusMutation.mutate({ userId: user.id, currentStatus: user.isActive })}>
                                                                {user.isActive ? <Ban className="w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}{user.isActive ? tUM('actionBlock') : tUM('actionUnblock')}
                                                            </DropdownMenuItem>
                                                            {/* Akun sendiri tidak boleh dihapus */}
                                                            {currentUser?.id !== user.id && (
                                                                <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setUserToDelete(user)}><Trash2 className="w-4 h-4 mr-2" /> {tUM('actionDelete')}</DropdownMenuItem></>
                                                            )}
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ================= PAGINATION (dengan input halaman manual) ================= */}
                {processedUsers.length > 0 && (
                    <div className="flex flex-col xl:flex-row items-center justify-between gap-4 border-t border-border pt-4 mt-4">
                        {/* Info: "Menampilkan X - Y dari Z data" */}
                        <span className="text-sm text-muted-foreground text-center xl:text-left">
                            {tGlobal('showing')} <span className="font-medium text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-medium text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, processedUsers.length)}</span> {tGlobal('of')} <span className="font-medium text-foreground">{processedUsers.length}</span> {tGlobal('entries')}
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {/* Tombol panah: awal, sebelumnya, nomor halaman, berikutnya, akhir */}
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground"><ChevronsLeft className="w-4 h-4" /></Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground"><ChevronLeft className="w-4 h-4" /></Button>
                                {getPageNumbers().map((pageNum) => (
                                    <Button key={pageNum} variant={currentPage === pageNum ? "default" : "outline"} size="icon" onClick={() => setCurrentPage(pageNum)} className={`h-8 w-8 font-medium ${currentPage === pageNum ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{pageNum}</Button>
                                ))}
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground"><ChevronRight className="w-4 h-4" /></Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground"><ChevronsRight className="w-4 h-4" /></Button>
                            </div>
                            {/* Kotak input halaman manual */}
                            <div className="flex items-center gap-2 sm:ml-4 sm:border-l sm:pl-4 border-border">
                                <span className="text-sm text-muted-foreground hidden sm:inline-block">Ke Halaman:</span>
                                <Input value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={handleManualPageSubmit} onBlur={() => handleManualPageSubmit()} className="h-8 w-14 text-center px-1" />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
