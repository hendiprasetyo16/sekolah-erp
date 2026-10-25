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
    ChevronsLeft, ChevronsRight, UserPlus, Trash2, DatabaseZap, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';

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
    fullName: z.string().min(3, 'Nama minimal 3 karakter'),
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(6, 'Password minimal 6 karakter'),
    role: z.enum([
        'SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'BENDAHARA',
        'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS',
        'ORANG_TUA', 'SISWA'
    ], { required_error: 'Pilih role' }),
});
type CreateUserFormValues = z.infer<typeof createUserSchema>;

const editUserSchema = z.object({
    fullName: z.string().min(3, 'Nama minimal 3 karakter'),
    role: z.enum([
        'SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'BENDAHARA',
        'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS',
        'ORANG_TUA', 'SISWA'
    ], { required_error: 'Pilih role' }),
});
type EditUserFormValues = z.infer<typeof editUserSchema>;

const resetPasswordSchema = z.object({
    newPassword: z.string().min(6, 'Password minimal 6 karakter'),
});
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export function UserManagementPage() {
    const { school, user: currentUser } = useAuthStore();
    const queryClient = useQueryClient();

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

    // State Filter & Search
    const [activeTab, setActiveTab] = useState<string>('semua');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // State Pagination & Selection
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>('1');
    const ITEMS_PER_PAGE = 10;
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

    useEffect(() => {
        setCurrentPage(1);
        setPageInput('1');
        setSelectedUserIds([]);
    }, [searchQuery, activeTab]);

    useEffect(() => {
        setPageInput(currentPage.toString());
    }, [currentPage]);

    // State Modals (Individual Actions)
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);
    const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
    const [userToReset, setUserToReset] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

    // State Modals (Bulk Actions)
    const [isGenerateSelectedModalOpen, setIsGenerateSelectedModalOpen] = useState<boolean>(false);
    const [isGenerateAllModalOpen, setIsGenerateAllModalOpen] = useState<boolean>(false);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState<boolean>(false);
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);

    const [showAddPassword, setShowAddPassword] = useState<boolean>(false);
    const [showResetPassword, setShowResetPassword] = useState<boolean>(false);

    // ========================================================================
    // MUTATIONS (API CALLS)
    // ========================================================================

    const generateSelectedMutation = useMutation({
        mutationFn: async (usersTarget: AppUser[]) => {
            const defaultPassword = 'Password123!';
            const promises = usersTarget.map(user =>
                supabase.functions.invoke('create-user', {
                    body: { email: user.email, password: defaultPassword, fullName: user.fullName, role: user.role, schoolId: user.schoolId, existingUserId: user.id }
                })
            );
            await Promise.all(promises);
            return usersTarget.length;
        },
        onSuccess: (count) => {
            toast.success(`${count} Akun terpilih berhasil di-generate!`, { description: 'Password bawaan: Password123!' });
            setIsGenerateSelectedModalOpen(false);
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const generateBulkMasterMutation = useMutation({
        mutationFn: async (targetGroup: string) => {
            const { data, error } = await supabase.functions.invoke('generate-accounts-from-master', {
                body: { targetGroup, schoolId: school?.id }
            });
            if (error) throw new Error(error.message);
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (data) => {
            // PERBAIKAN: Menampilkan pesan notifikasi langsung dari respons Edge Function
            // yang sudah kita modifikasi (akan memberi tahu jika harus diklik ulang/isTruncated)
            toast.success(`Info Sinkronisasi`, { description: data.message });
            setIsGenerateAllModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const deleteSelectedMutation = useMutation({
        mutationFn: async (userIds: string[]) => {
            const promises = userIds.map(id =>
                supabase.functions.invoke('delete-user', { body: { targetUserId: id } })
            );
            await Promise.all(promises);
            return userIds.length;
        },
        onSuccess: (count) => {
            toast.success(`${count} Pengguna terpilih berhasil dihapus!`);
            setIsDeleteSelectedModalOpen(false);
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const deleteAllBulkMutation = useMutation({
        mutationFn: async (targetGroup: string) => {
            const { data, error } = await supabase.functions.invoke('delete-users-by-role', {
                body: { targetGroup, schoolId: school?.id }
            });
            if (error) throw new Error(error.message);
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (data) => {
            // PERBAIKAN: Support respon dinamis jika menggunakan sistem Chunking/Batching
            toast.success(`Info Penghapusan`, { description: data.message || "Berhasil dibersihkan!" });
            setIsDeleteAllModalOpen(false);
            setSelectedUserIds([]);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const addUserMutation = useMutation({
        mutationFn: async (payload: CreateUserFormValues) => {
            const { data, error } = await supabase.functions.invoke('create-user', { body: { ...payload, schoolId: school?.id } });
            if (error) throw new Error(error.message);
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            toast.success("Pengguna baru berhasil ditambahkan!");
            setIsAddUserModalOpen(false);
            addUserForm.reset();
            setShowAddPassword(false);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        }
    });

    const editUserMutation = useMutation({
        mutationFn: async (payload: { id: string, data: EditUserFormValues }) => {
            const { data, error } = await supabase.from('users').update({ fullName: payload.data.fullName, role: payload.data.role }).eq('id', payload.id).select();
            if (error || !data) throw new Error(error?.message || "Gagal perbarui profil");
        },
        onSuccess: () => {
            toast.success("Profil berhasil diperbarui!");
            setUserToEdit(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        }
    });

    const resetPasswordMutation = useMutation({
        mutationFn: async (payload: { userId: string, newPass: string }) => {
            const { data, error } = await supabase.functions.invoke('reset-password', { body: { targetUserId: payload.userId, newPassword: payload.newPass } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => {
            toast.success("Password berhasil di-reset!");
            setUserToReset(null);
            resetPassForm.reset();
            setShowResetPassword(false);
        }
    });

    const toggleStatusMutation = useMutation({
        mutationFn: async (payload: { userId: string, currentStatus: boolean }) => {
            const { error } = await supabase.from('users').update({ isActive: !payload.currentStatus }).eq('id', payload.userId);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success("Status akun berhasil diubah!");
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        }
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            const { data, error } = await supabase.functions.invoke('delete-user', { body: { targetUserId: userId } });
            if (error || data?.error) throw new Error(error?.message || data?.error);
        },
        onSuccess: () => {
            toast.success("Pengguna berhasil dihapus secara permanen!");
            setUserToDelete(null);
            queryClient.invalidateQueries({ queryKey: ['users-list'] });
        }
    });

    // ========================================================================
    // FETCHING & FILTERING
    // ========================================================================
    const { data: users, isLoading, isError, error, refetch } = useQuery<AppUser[], Error>({
        queryKey: ['users-list', school?.id, isSuperAdmin],
        queryFn: async () => {
            if (!isSuperAdmin && !school?.id) return [];
            let query = supabase.from('users').select('*').order('createdAt', { ascending: false });
            if (!isSuperAdmin && school) query = query.eq('schoolId', school.id);
            const { data, error: fetchError } = await query;
            if (fetchError) throw new Error(fetchError.message);
            return (data as AppUser[]) || [];
        },
        enabled: isSuperAdmin || !!school?.id,
    });

    const filteredUsers: AppUser[] = (users || []).filter((user: AppUser) => {
        const matchesSearch = user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || user.email.toLowerCase().includes(searchQuery.toLowerCase());
        let matchesTab = true;
        if (activeTab === 'manajemen') matchesTab = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(user.role);
        else if (activeTab === 'staff') matchesTab = ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'].includes(user.role);
        else if (activeTab === 'siswa') matchesTab = user.role === 'SISWA';
        else if (activeTab === 'orangtua') matchesTab = user.role === 'ORANG_TUA';
        return matchesSearch && matchesTab;
    });

    // ========================================================================
    // PAGINATION LOGIC
    // ========================================================================
    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getPageNumbers = () => {
        const pages = [];
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    // Fungsi submit halaman manual (Tekan Enter / Klik di luar)
    const handleManualPageSubmit = (e?: React.KeyboardEvent<HTMLInputElement>) => {
        if (e && e.key !== 'Enter') return;

        let targetPage = parseInt(pageInput, 10);
        if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
        if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;

        setCurrentPage(targetPage);
        setPageInput(targetPage.toString());
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedUserIds(paginatedUsers.map(u => u.id));
        else setSelectedUserIds([]);
    };

    const handleToggleSelect = (userId: string) => {
        setSelectedUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
    };

    // Forms Init
    const addUserForm = useForm<CreateUserFormValues>({ resolver: zodResolver(createUserSchema), defaultValues: { fullName: '', email: '', password: '', role: 'GURU' } });
    const editUserForm = useForm<EditUserFormValues>({ resolver: zodResolver(editUserSchema), defaultValues: { fullName: '', role: 'GURU' } });
    const resetPassForm = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { newPassword: '' } });

    useEffect(() => {
        if (userToEdit) editUserForm.reset({ fullName: userToEdit.fullName, role: userToEdit.role });
    }, [userToEdit, editUserForm]);

    const formatRoleName = (role: AppUserRole): string => role.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    const getRoleBadgeColor = (role: AppUserRole): string => {
        if (['SUPER_ADMIN'].includes(role)) return 'bg-rose-100 text-rose-700 border-rose-200';
        if (['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(role)) return 'bg-purple-100 text-purple-700 border-purple-200';
        if (['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'].includes(role)) return 'bg-blue-100 text-blue-700 border-blue-200';
        if (role === 'SISWA') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        return 'bg-slate-100 text-slate-700 border-slate-200';
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative">

            {/* ============================== */}
            {/* 1. MODALS */}
            {/* ============================== */}
            <AnimatePresence>
                {/* Modal Tambah Pengguna */}
                {isAddUserModalOpen && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-md w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div><h3 className="text-xl font-bold">Tambah Pengguna Baru</h3><p className="text-muted-foreground text-sm">Buat akun untuk memberi hak akses ke sistem.</p></div>
                                <Button variant="ghost" size="icon" onClick={() => { setIsAddUserModalOpen(false); addUserForm.reset(); setShowAddPassword(false); }}><X className="w-5 h-5" /></Button>
                            </div>
                            <Form {...addUserForm}>
                                <form onSubmit={addUserForm.handleSubmit((data) => addUserMutation.mutate(data))} className="space-y-4">
                                    <FormField control={addUserForm.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={addUserForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@sekolah.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={addUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Role" /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-50 overflow-y-auto">
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
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showAddPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    <button type="button" onClick={() => setShowAddPassword(!showAddPassword)} className="absolute right-3 text-muted-foreground"><Eye size={16} /></button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => { setIsAddUserModalOpen(false); addUserForm.reset(); setShowAddPassword(false); }}>Batal</Button>
                                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={addUserMutation.isPending}>{addUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Simpan</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal Edit Pengguna */}
                {userToEdit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-md w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div><h3 className="text-xl font-bold">Edit Profil</h3><p className="text-muted-foreground text-sm">Perbarui informasi pengguna ini.</p></div>
                                <Button variant="ghost" size="icon" onClick={() => setUserToEdit(null)}><X className="w-5 h-5" /></Button>
                            </div>
                            <Form {...editUserForm}>
                                <form onSubmit={editUserForm.handleSubmit((data) => editUserMutation.mutate({ id: userToEdit.id, data }))} className="space-y-4">
                                    <div className="space-y-2"><FormLabel>Email</FormLabel><Input value={userToEdit.email} disabled className="bg-muted" /></div>
                                    <FormField control={editUserForm.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={editUserForm.control} name="role" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange} disabled={!isSuperAdmin}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Role" /></SelectTrigger></FormControl>
                                                <SelectContent position="popper" side="bottom" className="max-h-50 overflow-y-auto">
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
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => setUserToEdit(null)}>Batal</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={editUserMutation.isPending}>{editUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit className="w-4 h-4 mr-2" />} Simpan</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal Reset Password */}
                {userToReset && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-sm w-full p-6">
                            <div className="flex justify-between mb-4">
                                <div className="w-12 h-12 bg-blue-100 flex items-center justify-center rounded-full"><KeyRound className="w-6 h-6 text-blue-600" /></div>
                                <Button variant="ghost" size="icon" onClick={() => { setUserToReset(null); setShowResetPassword(false); }}><X className="w-5 h-5" /></Button>
                            </div>
                            <h3 className="text-xl font-bold mb-1">Reset Password</h3>
                            <p className="text-muted-foreground text-sm mb-6">Atur ulang kata sandi untuk akun: <strong>{userToReset.email}</strong></p>
                            <Form {...resetPassForm}>
                                <form onSubmit={resetPassForm.handleSubmit((data) => resetPasswordMutation.mutate({ userId: userToReset.id, newPass: data.newPassword }))} className="space-y-4">
                                    <FormField control={resetPassForm.control} name="newPassword" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password Baru</FormLabel>
                                            <FormControl>
                                                <div className="relative flex items-center">
                                                    <Input type={showResetPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" />
                                                    <button type="button" onClick={() => setShowResetPassword(!showResetPassword)} className="absolute right-3 text-muted-foreground"><Eye size={16} /></button>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                        <Button type="button" variant="outline" onClick={() => { setUserToReset(null); setShowResetPassword(false); }}>Batal</Button>
                                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={resetPasswordMutation.isPending}>{resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />} Simpan</Button>
                                    </div>
                                </form>
                            </Form>
                        </motion.div>
                    </div>
                )}

                {/* Modal Hapus Individu */}
                {userToDelete && isSuperAdmin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border max-w-sm w-full p-6 text-center">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">Hapus Pengguna</h3>
                            <p className="text-muted-foreground text-sm mb-1">Apakah Anda yakin ingin menghapus akun ini permanen?</p>
                            <p className="font-semibold text-foreground mb-6">{userToDelete.fullName}</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setUserToDelete(null)}>Batal</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteUserMutation.mutate(userToDelete.id)} disabled={deleteUserMutation.isPending}>
                                    {deleteUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Hapus
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal Bulk Generate Selected */}
                {isGenerateSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-blue-100 flex items-center justify-center rounded-full mx-auto mb-4"><UserPlus className="w-6 h-6 text-blue-600" /></div>
                            <h3 className="text-xl font-bold mb-2">Generate {selectedUserIds.length} Akun</h3>
                            <p className="text-muted-foreground text-sm mb-6">Sistem akan membuatkan sandi bawaan untuk {selectedUserIds.length} data terpilih.</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsGenerateSelectedModalOpen(false)}>Batal</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => generateSelectedMutation.mutate(filteredUsers.filter(u => selectedUserIds.includes(u.id)))} disabled={generateSelectedMutation.isPending}>
                                    {generateSelectedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Lanjutkan
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal Bulk Generate All */}
                {isGenerateAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center rounded-full mx-auto mb-4"><DatabaseZap className="w-6 h-6 text-emerald-600" /></div>
                            <h3 className="text-xl font-bold mb-2">Sinkronisasi & Generate Masal</h3>
                            <p className="text-muted-foreground text-sm mb-6">Apakah Anda yakin ingin memproses seluruh data import di menu {activeTab.toUpperCase()} menjadi akun login?</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsGenerateAllModalOpen(false)}>Batal</Button>
                                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => generateBulkMasterMutation.mutate(activeTab)} disabled={generateBulkMasterMutation.isPending}>
                                    {generateBulkMasterMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseZap className="w-4 h-4 mr-2" />} Eksekusi Masal
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal Bulk Delete Selected */}
                {isDeleteSelectedModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><Trash2 className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">Hapus {selectedUserIds.length} Akun</h3>
                            <p className="text-muted-foreground text-sm mb-6">Data login untuk {selectedUserIds.length} pengguna yang dipilih akan dihapus permanen.</p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsDeleteSelectedModalOpen(false)}>Batal</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteSelectedMutation.mutate(selectedUserIds)} disabled={deleteSelectedMutation.isPending}>
                                    {deleteSelectedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Ya, Hapus
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal Bulk Delete All */}
                {isDeleteAllModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-card rounded-2xl shadow-2xl border border-red-200 p-6 text-center max-w-sm w-full">
                            <div className="w-12 h-12 bg-red-100 flex items-center justify-center rounded-full mx-auto mb-4"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                            <h3 className="text-xl font-bold mb-2">Peringatan Keras!</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                Anda akan MENGHAPUS SELURUH data login untuk kelompok <strong>{activeTab.toUpperCase()}</strong>. Lanjutkan?
                            </p>
                            <div className="flex justify-center gap-3">
                                <Button variant="outline" onClick={() => setIsDeleteAllModalOpen(false)}>Batal</Button>
                                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteAllBulkMutation.mutate(activeTab)} disabled={deleteAllBulkMutation.isPending}>
                                    {deleteAllBulkMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Bersihkan Semua
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ============================== */}
            {/* 2. HEADER & PAGE TITLE */}
            {/* ============================== */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" /> Manajemen Pengguna
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Kelola akses login, role, dan keamanan akun.</p>
                </div>
                {isSuperAdmin && (
                    <Button onClick={() => setIsAddUserModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                        <Plus className="w-4 h-4 mr-2" /> Tambah Pengguna
                    </Button>
                )}
            </div>

            <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">

                {/* ============================== */}
                {/* 3. TABS FILTER (KEMBALI KE KOMPONEN BAWAAN UI) */}
                {/* ============================== */}
                <div className="w-full overflow-x-auto pb-1">
                    {/* Menggunakan Tabs asli, dibungkus agar scrollable */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-max">
                        <TabsList className="bg-muted/50 p-1 flex">
                            <TabsTrigger value="semua" className="flex items-center gap-1.5 py-1.5"><Users size={14} /> Semua</TabsTrigger>
                            <TabsTrigger value="manajemen" className="flex items-center gap-1.5 py-1.5"><ShieldCheck size={14} /> Manajemen & Admin</TabsTrigger>
                            <TabsTrigger value="staff" className="flex items-center gap-1.5 py-1.5"><UserCog size={14} /> Guru & Staff</TabsTrigger>
                            <TabsTrigger value="siswa" className="flex items-center gap-1.5 py-1.5"><GraduationCap size={14} /> Siswa</TabsTrigger>
                            <TabsTrigger value="orangtua" className="flex items-center gap-1.5 py-1.5"><Users2 size={14} /> Orang Tua</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* ============================== */}
                {/* 4. TOOLBAR (SEARCH & DROPDOWN ACTION) */}
                {/* ============================== */}
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-border pb-4">

                    {/* Kolom Pencarian */}
                    <div className="relative w-full md:max-w-xs xl:max-w-sm">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Cari nama atau email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-full" />
                    </div>

                    {/* Grup Tombol Aksi (Tarik Turun / Dropdown) */}
                    <div className="flex flex-wrap items-center gap-3">

                        {/* Aksi Generate (Hanya muncul di Tab tertentu) */}
                        {['staff', 'siswa', 'orangtua'].includes(activeTab) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4">
                                        <DatabaseZap className="w-4 h-4 mr-2" />
                                        Generate Data <ChevronDown className="w-4 h-4 ml-2 opacity-70" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem className="cursor-pointer" onClick={() => setIsGenerateAllModalOpen(true)}>
                                        <DatabaseZap className="w-4 h-4 mr-2" /> Generate Semua
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer" disabled={selectedUserIds.length === 0} onClick={() => setIsGenerateSelectedModalOpen(true)}>
                                        <UserPlus className="w-4 h-4 mr-2" /> Generate Terpilih ({selectedUserIds.length})
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* Aksi Hapus (Hanya muncul untuk Super Admin) */}
                        {isSuperAdmin && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 h-9 px-4">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Opsi Hapus <ChevronDown className="w-4 h-4 ml-2 opacity-70" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    {/* Hapus Semua Data (Sembunyikan di tab Semua/Manajemen agar aman) */}
                                    {['staff', 'siswa', 'orangtua'].includes(activeTab) && (
                                        <>
                                            <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50" onClick={() => setIsDeleteAllModalOpen(true)}>
                                                <AlertCircle className="w-4 h-4 mr-2" /> Hapus Masal (Semua)
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                        </>
                                    )}
                                    <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50" disabled={selectedUserIds.length === 0} onClick={() => setIsDeleteSelectedModalOpen(true)}>
                                        <Trash2 className="w-4 h-4 mr-2" /> Hapus Terpilih ({selectedUserIds.length})
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                {/* ============================== */}
                {/* 5. TABLE */}
                {/* ============================== */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/20">
                                <th className="px-4 py-3 w-10 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 w-4 h-4 text-primary cursor-pointer accent-primary"
                                        checked={paginatedUsers.length > 0 && selectedUserIds.length === paginatedUsers.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-center w-12">No.</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Pengguna</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Role</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase text-right w-20">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                                        Tidak ada pengguna yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                paginatedUsers.map((user: AppUser, index: number) => (
                                    <tr key={user.id} className={`hover:bg-muted/30 transition-colors ${selectedUserIds.includes(user.id) ? 'bg-primary/5' : ''}`}>
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 w-4 h-4 text-primary cursor-pointer accent-primary"
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={() => handleToggleSelect(user.id)}
                                            />
                                        </td>
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
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.isActive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                                {user.isActive ? 'Aktif' : 'Diblokir'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 bg-card text-card-foreground">
                                                    <DropdownMenuItem onClick={() => setUserToEdit(user)}><Edit className="w-4 h-4 mr-2" /> Edit Profil</DropdownMenuItem>
                                                    {isSuperAdmin && (
                                                        <>
                                                            <DropdownMenuItem onClick={() => setUserToReset(user)}><KeyRound className="w-4 h-4 mr-2" /> Reset Password</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className={user.isActive ? 'text-red-600' : 'text-emerald-600'} onClick={() => toggleStatusMutation.mutate({ userId: user.id, currentStatus: user.isActive })}>
                                                                {user.isActive ? <Ban className="w-4 h-4 mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                                                {user.isActive ? 'Blokir Akses' : 'Aktifkan Akun'}
                                                            </DropdownMenuItem>

                                                            {currentUser?.id !== user.id && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => setUserToDelete(user)}>
                                                                        <Trash2 className="w-4 h-4 mr-2" /> Hapus Akun
                                                                    </DropdownMenuItem>
                                                                </>
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

                {/* ============================== */}
                {/* 6. PAGINATION DENGAN INPUT */}
                {/* ============================== */}
                {filteredUsers.length > 0 && (
                    <div className="flex flex-col xl:flex-row items-center justify-between gap-4 border-t border-border pt-4 mt-4">
                        <span className="text-sm text-muted-foreground text-center xl:text-left">
                            Menampilkan <span className="font-medium text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-medium text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)}</span> dari <span className="font-medium text-foreground">{filteredUsers.length}</span> pengguna
                        </span>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <div className="flex items-center gap-1">
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground">
                                    <ChevronsLeft className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 text-muted-foreground">
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

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

                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground">
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className="h-8 w-8 text-muted-foreground">
                                    <ChevronsRight className="w-4 h-4" />
                                </Button>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex items-center gap-2 ml-0 sm:ml-4 sm:pl-4 sm:border-l border-border">
                                    <span className="text-sm text-muted-foreground">Ke Hal:</span>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={totalPages}
                                        value={pageInput}
                                        onChange={(e) => setPageInput(e.target.value)}
                                        onKeyDown={handleManualPageSubmit}
                                        onBlur={() => handleManualPageSubmit()}
                                        className="w-16 h-8 text-center px-1 py-0"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}