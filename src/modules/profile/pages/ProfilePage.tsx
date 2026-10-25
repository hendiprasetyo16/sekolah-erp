import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
    User, Mail, ShieldCheck, KeyRound, Save, Loader2, Building2,
    Phone, MapPin, CreditCard
} from 'lucide-react';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { getInitials } from '@/utils/format';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// --- Zod Schemas ---
const profileSchema = z.object({
    fullName: z.string().min(3, 'Nama minimal 3 karakter'),
});

const passwordSchema = z.object({
    newPassword: z.string().min(6, 'Kata sandi minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi kata sandi minimal 6 karakter'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Kata sandi tidak cocok",
    path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
    const { locale } = useTranslation();
    const { user, school } = useAuthStore();
    const [activeTab, setActiveTab] = useState<string>('profil');

    const t = {
        title: locale === 'id' ? 'Profil Saya' : 'My Profile',
        subtitle: locale === 'id' ? 'Kelola informasi pribadi dan keamanan akun Anda.' : 'Manage your personal information and account security.',
        tabProfile: locale === 'id' ? 'Informasi Pribadi' : 'Personal Info',
        tabSecurity: locale === 'id' ? 'Keamanan' : 'Security',
        fName: locale === 'id' ? 'Nama Lengkap' : 'Full Name',
        fEmail: 'Email',
        newPass: locale === 'id' ? 'Kata Sandi Baru' : 'New Password',
        confirmPass: locale === 'id' ? 'Konfirmasi Kata Sandi' : 'Confirm Password',
        btnSave: locale === 'id' ? 'Simpan Perubahan' : 'Save Changes',
        updateSuccess: locale === 'id' ? 'Profil berhasil diperbarui!' : 'Profile updated successfully!',
        passSuccess: locale === 'id' ? 'Kata sandi berhasil diubah!' : 'Password changed successfully!',
    };

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: { fullName: user?.fullName || '' }
    });

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { newPassword: '', confirmPassword: '' }
    });

    // --- QUERY: Ambil Data Detail ---
    const { data: detailData, isLoading: detailLoading } = useQuery({
        queryKey: ['user-detail', user?.id, user?.role],
        queryFn: async () => {
            if (!user) return null;

            let tableName = '';
            if (user.role === 'SISWA') tableName = 'students';
            else if (['GURU', 'WALI_KELAS', 'STAFF_TU', 'STAFF_SARPRAS'].includes(user.role)) tableName = 'teachers';
            else if (user.role === 'ORANG_TUA') tableName = 'student_parents';

            if (!tableName) return null;

            let { data } = await supabase
                .from(tableName)
                .select('*')
                .eq('email', user.email)
                .maybeSingle();

            if (!data && user.schoolId) {
                const { data: fallbackData } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('schoolId', user.schoolId)
                    .eq('fullName', user.fullName)
                    .maybeSingle();
                data = fallbackData;
            }

            return data;
        },
        enabled: !!user,
    });

    // --- MUTATIONS ---
    const updateProfileMutation = useMutation({
        mutationFn: async (data: ProfileFormValues) => {
            if (!user) throw new Error("User not found");
            const { error } = await supabase
                .from('users')
                .update({ fullName: data.fullName })
                .eq('id', user.id);
            if (error) throw new Error(error.message);

            useAuthStore.setState({ user: { ...user, fullName: data.fullName } });
        },
        onSuccess: () => toast.success(t.updateSuccess),
        onError: (error: Error) => toast.error(error.message)
    });

    const updatePasswordMutation = useMutation({
        mutationFn: async (data: PasswordFormValues) => {
            const { error } = await supabase.auth.updateUser({
                password: data.newPassword
            });
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(t.passSuccess);
            passwordForm.reset();
        },
        onError: (error: Error) => toast.error(error.message)
    });

    if (!user) return null;

    const formatRoleName = (role: string): string => role.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

            {/* HEADER PROFIL ELEGAN & MINIMALIS */}
            <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm relative overflow-hidden">

                {/* Aksen warna halus di bagian atas (mengikuti tema warna primary aplikasi) */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-r from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10"></div>

                <div className="relative p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6">

                    {/* Avatar Modern */}
                    <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold shadow-md shrink-0 border-4 border-background z-10">
                        {getInitials(user.fullName)}
                    </div>

                    <div className="text-center md:text-left flex-1 mt-2 z-10">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">{user.fullName}</h1>

                        <div className="flex flex-col gap-2.5 mt-3">
                            {/* Baris 1: Informasi Utama */}
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5" title="Email">
                                    <Mail size={16} /> {user.email}
                                </span>
                                <span className="hidden md:inline text-border">•</span>

                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium" title="Peran/Role">
                                    <ShieldCheck size={16} /> {formatRoleName(user.role)}
                                </span>

                                {!detailLoading && detailData && (
                                    <>
                                        {detailData.nip ? (
                                            <>
                                                <span className="hidden md:inline text-border">•</span>
                                                <span className="flex items-center gap-1.5 text-foreground" title="NIP"><CreditCard size={16} className="text-muted-foreground" /> {detailData.nip}</span>
                                            </>
                                        ) : detailData.nuptk ? (
                                            <>
                                                <span className="hidden md:inline text-border">•</span>
                                                <span className="flex items-center gap-1.5 text-foreground" title="NUPTK"><CreditCard size={16} className="text-muted-foreground" /> {detailData.nuptk}</span>
                                            </>
                                        ) : detailData.nisn ? (
                                            <>
                                                <span className="hidden md:inline text-border">•</span>
                                                <span className="flex items-center gap-1.5 text-foreground" title="NISN"><CreditCard size={16} className="text-muted-foreground" /> {detailData.nisn}</span>
                                            </>
                                        ) : null}

                                        {detailData.phone && (
                                            <>
                                                <span className="hidden md:inline text-border">•</span>
                                                <span className="flex items-center gap-1.5 text-foreground" title="Nomor Handphone"><Phone size={16} className="text-muted-foreground" /> {detailData.phone}</span>
                                            </>
                                        )}
                                    </>
                                )}

                                {school && (
                                    <>
                                        <span className="hidden md:inline text-border">•</span>
                                        <span className="flex items-center gap-1.5" title="Institusi"><Building2 size={16} className="text-muted-foreground" /> {school.name}</span>
                                    </>
                                )}
                            </div>

                            {/* Baris 2: Alamat (jika ada) */}
                            {!detailLoading && detailData?.address && (
                                <div className="flex items-start justify-center md:justify-start gap-1.5 text-sm text-foreground/90 max-w-2xl mt-1" title="Alamat">
                                    <MapPin size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                                    <span className="text-left leading-relaxed">{detailData.address}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* KONTEN TAB */}
            <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="border-b border-border px-4 py-3">
                        <TabsList className="bg-muted/50">
                            <TabsTrigger value="profil" className="flex items-center gap-2"><User size={16} /> {t.tabProfile}</TabsTrigger>
                            <TabsTrigger value="keamanan" className="flex items-center gap-2"><KeyRound size={16} /> {t.tabSecurity}</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6">
                        <TabsContent value="profil" className="m-0 outline-none">
                            <div className="max-w-xl">
                                <h3 className="text-lg font-semibold mb-1">{t.tabProfile}</h3>
                                <p className="text-sm text-muted-foreground mb-6">{t.subtitle}</p>

                                <Form {...profileForm}>
                                    <form onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                                        <div className="space-y-2">
                                            <FormLabel>{t.fEmail}</FormLabel>
                                            <Input value={user.email} disabled className="bg-muted text-muted-foreground cursor-not-allowed" />
                                            <p className="text-xs text-muted-foreground">Email terikat dengan kredensial sistem dan tidak dapat diubah di sini.</p>
                                        </div>
                                        <FormField control={profileForm.control} name="fullName" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.fName}</FormLabel>
                                                <FormControl><Input {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <div className="pt-2 flex justify-end">
                                            <Button type="submit" disabled={updateProfileMutation.isPending} className="bg-primary hover:bg-primary/90">
                                                {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                {t.btnSave}
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>
                        </TabsContent>

                        <TabsContent value="keamanan" className="m-0 space-y-6 outline-none">
                            <div className="max-w-xl">
                                <h3 className="text-lg font-semibold mb-1">{t.tabSecurity}</h3>
                                <p className="text-sm text-muted-foreground mb-6">Perbarui kata sandi untuk menjaga keamanan akun Anda.</p>

                                <Form {...passwordForm}>
                                    <form onSubmit={passwordForm.handleSubmit((data) => updatePasswordMutation.mutate(data))} className="space-y-4">
                                        <FormField control={passwordForm.control} name="newPassword" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.newPass}</FormLabel>
                                                <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.confirmPass}</FormLabel>
                                                <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <div className="pt-4 border-t border-border flex justify-end">
                                            <Button type="submit" disabled={updatePasswordMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
                                                {updatePasswordMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                                                Perbarui Kata Sandi
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </motion.div>
    );
}