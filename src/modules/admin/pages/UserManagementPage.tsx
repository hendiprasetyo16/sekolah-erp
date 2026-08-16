import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Users, ShieldCheck, UserCog, GraduationCap, Users2,
    Search, Plus, MoreVertical, Edit, KeyRound, Ban, CheckCircle2,
    Loader2, AlertCircle, X, Eye, EyeOff, ChevronLeft, ChevronRight,
    ChevronsLeft, ChevronsRight // <-- Tambahan Ikon Halaman Awal/Akhir
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// 1. STRICT TYPESCRIPT INTERFACES
// ============================================================================
export type AppUserRole =
    | 'SUPER_ADMIN' | 'ADMIN' | 'KEPALA_SEKOLAH' | 'OPERATOR'
    | 'BENDAHARA' | 'WALI_KELAS' | 'GURU' | 'STAFF_TU'
    | 'STAFF_SARPRAS' | 'ORANG_TUA' | 'SISWA';

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

// ============================================================================
// 2. ZOD SCHEMAS
// ============================================================================
const createUserSchema = z.object({
    fullName: z.string().min(3, 'Nama minimal 3 karakter / Name min 3 chars'),
    email: z.string().email('Format email tidak valid / Invalid email format'),
    password: z.string().min(6, 'Password minimal 6 karakter / Password min 6 chars'),
    role: z.enum([
        'SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'BENDAHARA',
        'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS',
        'ORANG_TUA', 'SISWA'
    ], { required_error: 'Pilih role / Select a role' }),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
    fullName: z.string().min(3, 'Nama minimal 3 karakter / Name min 3 chars'),
    role: z.enum([
        'SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'BENDAHARA',
        'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS',
        'ORANG_TUA', 'SISWA'
    ], { required_error: 'Pilih role / Select a role' }),
});
type EditUserFormValues = z.infer<typeof editUserSchema>;

const resetPasswordSchema = z.object({
    newPassword: z.string().min(6, 'Password minimal 6 karakter / Password min 6 chars'),
});
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export function UserManagementPage() {
    const { locale } = useTranslation();
    const { school, user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

    // State Filter & Search
    const [activeTab, setActiveTab] = useState<string>('semua');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // State Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeTab]);

    // State Modal & Visibilitas Password
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [showAddPassword, setShowAddPassword] = useState<boolean>(false);
    const [showResetPassword, setShowResetPassword] = useState<boolean>(false);

    const t = {
        title: locale === 'id' ? 'Manajemen Pengguna' : 'User Management',
        subtitle: locale === 'id' ? 'Kelola akses login, role, dan keamanan akun.' : 'Manage login access, roles, and account security.',
        searchPlaceholder: locale === 'id' ? 'Cari nama atau email...' : 'Search name or email...',
        btnAdd: locale === 'id' ? 'Tambah Pengguna' : 'Add User',
        tabAll: locale === 'id' ? 'Semua' : 'All',
        tabManagement: locale === 'id' ? 'Manajemen & Admin' : 'Management & Admin',
        tabStaff: locale === 'id' ? 'Guru & Staff' : 'Teachers & Staff',
        tabStudent: locale === 'id' ? 'Siswa' : 'Students',
        tabParent: locale === 'id' ? 'Orang Tua' : 'Parents',

        thNo: 'No.',
        thName: locale === 'id' ? 'Pengguna' : 'User',
        thRole: 'Role',
        thStatus: 'Status',
        thAction: locale === 'id' ? 'Aksi' : 'Action',

        statusActive: locale === 'id' ? 'Aktif' : 'Active',
        statusBlocked: locale === 'id' ? 'Diblokir' : 'Blocked',
        empty: locale === 'id' ? 'Tidak ada pengguna yang ditemukan.' : 'No users found.',

        pageInfo: locale === 'id' ? 'Menampilkan' : 'Showing',
        pageOf: locale === 'id' ? 'dari' : 'of',
        pageUsers: locale === 'id' ? 'pengguna' : 'users',

        addTitle: locale === 'id' ? 'Tambah Pengguna Baru' : 'Add New User',
        addDesc: locale === 'id' ? 'Buat akun untuk memberi hak akses ke sistem.' : 'Create an account to grant system access.',
        editTitle: locale === 'id' ? 'Edit Profil Pengguna' : 'Edit User Profile',
        editDesc: locale === 'id' ? 'Perbarui nama atau role pengguna ini.' : 'Update this user name or role.',
        fName: locale === 'id' ? 'Nama Lengkap' : 'Full Name',
        fEmail: 'Email',
        fRole: locale === 'id' ? 'Peran (Role)' : 'Role',
        fPass: locale === 'id' ? 'Kata Sandi Sementara' : 'Temporary Password',
        btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
        btnSave: locale === 'id' ? 'Simpan' : 'Save',

        resetTitle: locale === 'id' ? 'Reset Kata Sandi' : 'Reset Password',
        resetDesc: locale === 'id' ? 'Atur ulang kata sandi untuk akun:' : 'Reset password for account:',
        newPass: locale === 'id' ? 'Kata Sandi Baru' : 'New Password',

        toastAddSuccess: locale === 'id' ? 'Pengguna berhasil ditambahkan!' : 'User added successfully!',
        toastEditSuccess: locale === 'id' ? 'Profil berhasil diperbarui!' : 'Profile updated successfully!',
        toastResetSuccess: locale === 'id' ? 'Kata sandi berhasil di-reset!' : 'Password reset successfully!',
        toastBlockSuccess: locale === 'id' ? 'Status akun berhasil diubah!' : 'Account status changed!',
    };

    // ========================================================================
    // MUTATIONS
    // ========================================================================
    const addUserMutation = useMutation({
        mutationFn: async (payload: CreateUserFormValues) => {
            return new Promise((resolve) => setTimeout(resolve, 1500));
        },
        onSuccess: () => {
            toast.success(t.toastAddSuccess);
            setIsAddUserModalOpen(false);
            addUserForm.reset();
            setShowAddPassword(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const editUserMutation = useMutation({
        mutationFn: async (payload: { id: string, data: EditUserFormValues }) => {
            const { error } = await supabase
                .from('users')
                .update({ fullName: payload.data.fullName, role: payload.data.role })
                .eq('id', payload.id);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(t.toastEditSuccess);
            setUserToEdit(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const resetPasswordMutation = useMutation({
        mutationFn: async (payload: { userId: string, newPass: string }) => {
            // Simulasi API Admin Update Password
            return new Promise((resolve) => setTimeout(resolve, 1000));
        },
        onSuccess: () => {
            toast.success(t.toastResetSuccess);
            setUserToReset(null);
            resetPassForm.reset();
            setShowResetPassword(false);
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const toggleStatusMutation = useMutation({
        mutationFn: async (payload: { userId: string, currentStatus: boolean }) => {
            const { error } = await supabase
                .from('users')
                .update({ isActive: !payload.currentStatus })
                .eq('id', payload.userId);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(t.toastBlockSuccess);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    // ========================================================================
    // FETCHING & FILTERING
    // ========================================================================
    const { data: users, isLoading } = useQuery<AppUser[], Error>({
        queryKey: ['users-list', school?.id, isSuperAdmin],
        queryFn: async () => {
            if (!isSuperAdmin && !school?.id) return [];

            let query = supabase
                .from('users')
                .select('*')
                .order('createdAt', { ascending: false });

            if (!isSuperAdmin && school) {
                query = query.eq('schoolId', school.id);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);

            return (data as AppUser[]) || [];
        },
        enabled: isSuperAdmin || !!school?.id,
    });

    const filteredUsers: AppUser[] = (users || []).filter((user: AppUser) => {
        const matchesSearch = user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesTab = true;
        if (activeTab === 'manajemen') matchesTab = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(user.role);
        else if (activeTab === 'staff') matchesTab = ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'].includes(user.role);
        else if (activeTab === 'siswa') matchesTab = user.role === 'SISWA';
        else if (activeTab === 'orangtua') matchesTab = user.role === 'ORANG_TUA';

        return matchesSearch && matchesTab;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Generator Custom Nomor Halaman (Contoh: 1 2 3 4 5)
    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    // ========================================================================
    // FORMS
    // ========================================================================
    const addUserForm = useForm<CreateUserFormValues>({
        resolver: zodResolver(createUserSchema),
        defaultValues: { fullName: '', email: '', password: '', role: 'GURU' }
    });

    const editUserForm = useForm<EditUserFormValues>({
        resolver: zodResolver(editUserSchema),
        defaultValues: { fullName: '', role: 'GURU' }
    });

    // Sinkronisasi data user yang dipilih ke form edit
    useEffect(() => {
        if (userToEdit) {
            editUserForm.reset({
                fullName: userToEdit.fullName,
                role: userToEdit.role,
            });
        }
    }, [userToEdit, editUserForm]);

    const resetPassForm = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { newPassword: '' }
    });

    const formatRoleName = (role: AppUserRole): string => role.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    const getRoleBadgeColor = (role: AppUserRole): string => {
        if (['SUPER_ADMIN'].includes(role)) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200';
        if (['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(role)) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200';
        if (['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'].includes(role)) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200';
        if (role === 'SISWA') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200';
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative">

            {/* =================================================================== */}
            {/* MODAL: ADD USER */}
            {/* =================================================================== */}
            <AnimatePresence>
                {isAddUserModalOpen && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card text-card-foreground rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold">{t.addTitle}</h3>
                                    <p className="text-muted-foreground text-sm">{t.addDesc}</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsAddUserModalOpen(false)}><X className="w-5 h-5" /></Button>
                            </div>

                            <Form {...addUserForm}>
                                <form onSubmit={addUserForm.handleSubmit((data) => addUserMutation.mutate(data))} className="space-y-4">
                                    <FormField control={addUserForm.control} name="fullName" render={({ field }) => (
                                        <FormItem><FormLabel>{t.fName}</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={addUserForm.control} name="email" render={({ field }) => (
                                        <FormItem><FormLabel>{t.fEmail}</FormLabel><FormControl><Input type="email" placeholder="john@sekolah.com" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={addUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fRole}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Role" /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-[200px] overflow-y-auto z-[9999]">
                                                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                                                    <SelectItem value="ADMIN">Admin IT</SelectItem>
                                                    <SelectItem value="KEPALA_SEKOLAH">Kepala Sekolah</SelectItem>
                                                    <SelectItem value="OPERATOR">Operator</SelectItem>
                                                    <SelectItem value="BENDAHARA">Bendahara</SelectItem>
                                                    <SelectItem value="WALI_KELAS">Wali Kelas</SelectItem>
                                                    <SelectItem value="GURU">Guru</SelectItem>
                                                    <SelectItem value="STAFF_TU">Staff TU</SelectItem>
                                                    <SelectItem value="STAFF_SARPRAS">Staff Sarpras</SelectItem>
                                                    <SelectItem value="ORANG_TUA">Orang Tua</SelectItem>
                                                    <SelectItem value="SISWA">Siswa</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={addUserForm.control} name="password" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fPass}</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showAddPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    <button type="button" onClick={() => setShowAddPassword(!showAddPassword)} className="absolute right-3 text-muted-foreground hover:text-foreground focus:outline-none">
                                                        {showAddPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                                        <Button type="button" variant="outline" onClick={() => setIsAddUserModalOpen(false)} disabled={addUserMutation.isPending}>{t.btnCancel}</Button>
                                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={addUserMutation.isPending}>
                                            {addUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} {t.btnSave}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* =================================================================== */}
            {/* MODAL: EDIT USER */}
            {/* =================================================================== */}
            <AnimatePresence>
                {userToEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card text-card-foreground rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-bold">{t.editTitle}</h3>
                                    <p className="text-muted-foreground text-sm">{t.editDesc}</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setUserToEdit(null)}><X className="w-5 h-5" /></Button>
                            </div>

                            <Form {...editUserForm}>
                                <form onSubmit={editUserForm.handleSubmit((data) => editUserMutation.mutate({ id: userToEdit.id, data }))} className="space-y-4">
                                    <div className="space-y-2">
                                        <FormLabel>{t.fEmail}</FormLabel>
                                        <Input type="email" value={userToEdit.email} disabled className="bg-muted text-muted-foreground" />
                                    </div>
                                    <FormField control={editUserForm.control} name="fullName" render={({ field }) => (
                                        <FormItem><FormLabel>{t.fName}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={editUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.fRole}</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange} disabled={!isSuperAdmin}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Role" /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-[200px] overflow-y-auto z-[9999]">
                                                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                                                    <SelectItem value="ADMIN">Admin IT</SelectItem>
                                                    <SelectItem value="KEPALA_SEKOLAH">Kepala Sekolah</SelectItem>
                                                    <SelectItem value="OPERATOR">Operator</SelectItem>
                                                    <SelectItem value="BENDAHARA">Bendahara</SelectItem>
                                                    <SelectItem value="WALI_KELAS">Wali Kelas</SelectItem>
                                                    <SelectItem value="GURU">Guru</SelectItem>
                                                    <SelectItem value="STAFF_TU">Staff TU</SelectItem>
                                                    <SelectItem value="STAFF_SARPRAS">Staff Sarpras</SelectItem>
                                                    <SelectItem value="ORANG_TUA">Orang Tua</SelectItem>
                                                    <SelectItem value="SISWA">Siswa</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                                        <Button type="button" variant="outline" onClick={() => setUserToEdit(null)} disabled={editUserMutation.isPending}>{t.btnCancel}</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={editUserMutation.isPending}>
                                            {editUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit className="w-4 h-4 mr-2" />} {t.btnSave}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* =================================================================== */}
            {/* MODAL: RESET PASSWORD */}
            {/* =================================================================== */}
            <AnimatePresence>
                {userToReset && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card text-card-foreground rounded-2xl shadow-2xl border border-border max-w-sm w-full p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                                    <KeyRound className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setUserToReset(null)}><X className="w-5 h-5" /></Button>
                            </div>

                            <h3 className="text-xl font-bold mb-1">{t.resetTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">{t.resetDesc} <strong className="text-foreground">{userToReset.email}</strong></p>

                            <Form {...resetPassForm}>
                                <form onSubmit={resetPassForm.handleSubmit((data) => resetPasswordMutation.mutate({ userId: userToReset.id, newPass: data.newPassword }))} className="space-y-4">
                                    <FormField control={resetPassForm.control} name="newPassword" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.newPass}</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showResetPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-3 text-muted-foreground hover:text-foreground focus:outline-none">
                                                        {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                                        <Button type="button" variant="outline" onClick={() => setUserToReset(null)} disabled={resetPasswordMutation.isPending}>{t.btnCancel}</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={resetPasswordMutation.isPending}>
                                            {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />} {t.btnSave}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* =================================================================== */}
            {/* MAIN HEADER & FILTERS */}
            {/* =================================================================== */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" /> {t.title}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
                </div>
                {isSuperAdmin && (
                    <Button onClick={() => setIsAddUserModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                        <Plus className="w-4 h-4 mr-2" /> {t.btnAdd}
                    </Button>
                )}
            </div>

            <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto overflow-x-auto">
                        <TabsList className="bg-muted/50 p-1">
                            <TabsTrigger value="semua" className="flex items-center gap-1.5 py-2"><Users size={14} /> {t.tabAll}</TabsTrigger>
                            <TabsTrigger value="manajemen" className="flex items-center gap-1.5 py-2"><ShieldCheck size={14} /> {t.tabManagement}</TabsTrigger>
                            <TabsTrigger value="staff" className="flex items-center gap-1.5 py-2"><UserCog size={14} /> {t.tabStaff}</TabsTrigger>
                            <TabsTrigger value="siswa" className="flex items-center gap-1.5 py-2"><GraduationCap size={14} /> {t.tabStudent}</TabsTrigger>
                            <TabsTrigger value="orangtua" className="flex items-center gap-1.5 py-2"><Users2 size={14} /> {t.tabParent}</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="relative w-full md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t.searchPlaceholder}
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            className="pl-9 h-10 w-full"
                        />
                    </div>
                </div>

                {/* =================================================================== */}
                {/* TABLE */}
                {/* =================================================================== */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/20">
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-center w-16">{t.thNo}</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t.thName}</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t.thRole}</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t.thStatus}</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-right w-20">{t.thAction}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center">
                                        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    </td>
                                </tr>
                            ) : paginatedUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                                        {t.empty}
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((user: AppUser, index: number) => (
                                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 text-center text-sm text-muted-foreground font-medium">
                                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                                    {user.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm">{user.fullName}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getRoleBadgeColor(user.role)}`}>
                                                {formatRoleName(user.role)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {user.isActive ? (
                                                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    {t.statusActive}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-medium">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    {t.statusBlocked}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 bg-card text-card-foreground border-border">
                                                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Aksi Akun</DropdownMenuLabel>

                                                    {/* KLIK EDIT PROFIL TERHUBUNG KE FUNGSI setUserToEdit */}
                                                    <DropdownMenuItem className="cursor-pointer" onClick={() => setUserToEdit(user)}>
                                                        <Edit className="w-4 h-4 mr-2" /> Edit Profil
                                                    </DropdownMenuItem>

                                                    {isSuperAdmin && (
                                                        <>
                                                            <DropdownMenuItem className="cursor-pointer" onClick={() => setUserToReset(user)}>
                                                                <KeyRound className="w-4 h-4 mr-2" /> Reset Password
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator className="bg-border" />
                                                            <DropdownMenuItem
                                                                className={`cursor-pointer ${user.isActive ? 'text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30' : 'text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/30'}`}
                                                                onClick={() => toggleStatusMutation.mutate({ userId: user.id, currentStatus: user.isActive })}
                                                            >
                                                                {user.isActive ? <Ban className="w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                                                {user.isActive ? 'Blokir Akses' : 'Aktifkan Akun'}
                                                            </DropdownMenuItem>
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

                {/* =================================================================== */}
                {/* PAGINATION CONTROLS (AWAL, AKHIR & NOMOR HALAMAN CUSTOM) */}
                {/* =================================================================== */}
                {filteredUsers.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4 mt-4">
                        <span className="text-sm text-muted-foreground">
                            {t.pageInfo} <span className="font-medium text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-medium text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}</span> {t.pageOf} <span className="font-medium text-foreground">{filteredUsers.length}</span> {t.pageUsers}
                        </span>

                        <div className="flex items-center gap-1.5">
                            {/* Tombol Halaman Awal */}
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground">
                                <ChevronsLeft className="w-4 h-4" />
                            </Button>

                            {/* Tombol Sebelumnya */}
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground">
                                <ChevronLeft className="w-4 h-4" />
                            </Button>

                            {/* Custom Nomor Halaman Dinamis */}
                            {getPageNumbers().map((pageNum) => (
                                <Button
                                    key={pageNum}
                                    variant={currentPage === pageNum ? "default" : "outline"}
                                    size="icon"
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`h-8 w-8 font-medium ${currentPage === pageNum ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                                >
                                    {pageNum}
                                </Button>
                            ))}

                            {/* Tombol Selanjutnya */}
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground">
                                <ChevronRight className="w-4 h-4" />
                            </Button>

                            {/* Tombol Halaman Akhir */}
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground">
                                <ChevronsRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}