import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Trash2, CheckCircle2, School, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ClassListPage } from './ClassListPage';
import { academicService } from '../services/academic.service';

const schoolSchema = z.object({
    name: z.string().min(3, 'Nama sekolah wajib diisi'),
    npsn: z.string().min(8, 'NPSN tidak valid'),
    level: z.string().min(1, 'Jenjang wajib dipilih'),
    type: z.string().min(1, 'Status wajib dipilih'),
    address: z.string().min(5, 'Alamat wajib diisi'),
    city: z.string().min(3, 'Kota wajib diisi'),
    province: z.string().min(3, 'Provinsi wajib diisi'),
    phone: z.string().optional(),
    email: z.string().email('Email tidak valid').optional().or(z.literal('')),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

// ============================================================================
// SUB-KOMPONEN PROFIL SEKOLAH (Mode Edit & Create)
// ============================================================================
function SchoolProfileForm({ schoolData, authUser, onSuccess }: { schoolData: any, authUser: any, onSuccess: any }) {
    const queryClient = useQueryClient();
    const isEdit = !!schoolData?.id; // Tentukan apakah sedang edit atau buat baru

    const form = useForm<SchoolFormValues>({
        resolver: zodResolver(schoolSchema),
        defaultValues: {
            name: schoolData?.name ?? '',
            npsn: schoolData?.npsn ?? '',
            level: String(schoolData?.level ?? '').trim().toUpperCase(),
            type: String(schoolData?.type ?? '').trim().toUpperCase(),
            address: schoolData?.address ?? '',
            city: schoolData?.city ?? '',
            province: schoolData?.province ?? '',
            phone: schoolData?.phone ?? '',
            email: schoolData?.email ?? '',
        }
    });

    const saveSchoolMutation = useMutation({
        mutationFn: async (payload: SchoolFormValues) => {
            if (isEdit) {
                // MODE UPDATE
                const { data, error } = await supabase.from('schools').update(payload).eq('id', schoolData.id).select().single();
                if (error) throw new Error(error.message);
                return data;
            } else {
                // MODE CREATE BARU
                const newSchoolId = crypto.randomUUID(); // Buat ID unik untuk sekolah

                // 1. Buat Sekolah
                const { data: newSchool, error: schoolErr } = await supabase
                    .from('schools')
                    .insert({ ...payload, id: newSchoolId })
                    .select()
                    .single();
                if (schoolErr) throw new Error('Gagal membuat sekolah: ' + schoolErr.message);

                // 2. Hubungkan User saat ini ke Sekolah baru (PENTING AGAR RLS TERBUKA)
                // Menggunakan UPSERT berjaga-jaga jika public.users belum ada row untuk user ini
                if (authUser?.id) {
                    const { error: userErr } = await supabase.from('users').upsert({
                        id: authUser.id,
                        schoolId: newSchoolId,
                        email: authUser.email || '',
                        fullName: authUser.user_metadata?.full_name || 'Administrator',
                        role: 'SUPER_ADMIN',
                        passwordHash: 'auth-supabase' // Placeholder karena auth dihandle supabase
                    });
                    if (userErr) throw new Error('Gagal menghubungkan user: ' + userErr.message);
                }

                return newSchool;
            }
        },
        onSuccess: async (data) => {
            toast.success(isEdit ? 'Profil sekolah berhasil disimpan' : 'Sekolah baru berhasil dibuat!');

            // 1. Update data sekolah di Zustand Store
            onSuccess(data);

            // 2. Perbarui data User di Zustand Store agar tau kalau sekarang dia punya schoolId
            if (!isEdit && authUser?.id) {
                const { data: updatedProfile } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();

                if (updatedProfile) {
                    useAuthStore.getState().setUser(updatedProfile);
                }
            }

            // 3. Beritahu React Query untuk merender ulang komponen tanpa merefresh halaman
            queryClient.invalidateQueries({ queryKey: ['school-profile'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const onSubmitSchool = (data: SchoolFormValues) => {
        const payload = {
            ...data,
            level: data.level.trim().toUpperCase(),
            type: data.type.trim().toUpperCase(),
        };
        saveSchoolMutation.mutate(payload);
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitSchool)} className="space-y-6">
                {!isEdit && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg text-sm mb-6 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p>Anda belum memiliki data sekolah. Silakan isi form di bawah ini untuk mendaftarkan institusi Anda. Akun Anda akan otomatis diatur sebagai <b>SUPER ADMIN</b> untuk institusi ini.</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Nama Sekolah</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="npsn" render={({ field }) => (
                        <FormItem><FormLabel>NPSN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                    <FormField control={form.control} name="level" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Jenjang</FormLabel>
                            <Select value={field.value || ''} onValueChange={(value) => field.onChange(value)}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Jenjang" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {['TK', 'SD', 'SMP', 'SMA', 'SMK', 'MI', 'MTs', 'MA'].map(lvl => (
                                        <SelectItem key={lvl} value={lvl}>{lvl}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select value={field.value || ''} onValueChange={(value) => field.onChange(value)}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Status" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="NEGERI">NEGERI</SelectItem>
                                    <SelectItem value="SWASTA">SWASTA</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="font-medium">Alamat & Kontak</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>Alamat Lengkap</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>Kabupaten / Kota</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>Provinsi</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Nomor Telepon</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>

                <div className="flex justify-end pt-6">
                    <Button type="submit" disabled={saveSchoolMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {saveSchoolMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {isEdit ? 'Simpan Perubahan' : 'Buat Institusi Baru'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

// ============================================================================
// KOMPONEN UTAMA
// ============================================================================
export function MasterSettingsPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const location = useLocation();

    // Pastikan user dari authStore memiliki informasi yang cukup
    const { school: authSchool, setSchool, user } = useAuthStore();
    const userRole = user?.role as string | undefined;
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMIN' || userRole === 'ADMIN';

    const [activeTab, setActiveTab] = useState(location.state?.tab || 'profil');
    const [ayToDelete, setAyToDelete] = useState<{ id: string; name: string } | null>(null);

    // Fetch School Data (Akan error diam-diam jika kosong karena RLS, jadi kita tangani dengan fallback null)
    const { data: schoolData, isLoading: isSchoolLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            const { data, error } = await supabase.from('schools').select('*').eq('id', authSchool.id).single();
            if (error) return null; // Jika error/kosong kembalikan null agar pindah ke mode Create
            return data;
        },
    });

    const { data: academicYearsResponse, isLoading: isAyLoading } = useQuery({
        queryKey: ['academic-years', authSchool?.id],
        queryFn: () => academicService.getAcademicYears(authSchool?.id || ''),
        enabled: !!authSchool?.id,
    });
    const academicYears = academicYearsResponse?.data || [];

    const generateNewAcademicYear = useMutation({
        mutationFn: async () => {
            const currentYear = new Date().getFullYear();
            const payload = {
                id: crypto.randomUUID(), // <--- TAMBAHKAN BARIS INI
                schoolId: authSchool?.id || '',
                name: `${currentYear}/${currentYear + 1}`,
                startYear: currentYear,
                endYear: currentYear + 1,
                isActive: false
            };
            const { error } = await supabase.from('academic_years').insert(payload);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success('Tahun ajaran baru berhasil dibuat');
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const setActiveAcademicYear = useMutation({
        mutationFn: async (id: string) => {
            await supabase.from('academic_years').update({ isActive: false }).eq('schoolId', authSchool?.id || '');
            const { error } = await supabase.from('academic_years').update({ isActive: true }).eq('id', id);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success('Tahun ajaran aktif berhasil diubah');
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
        }
    });

    const deleteAyMutation = useMutation({
        mutationFn: (id: string) => academicService.deleteAcademicYear(id),
        onSuccess: () => {
            toast.success('Tahun ajaran berhasil dihapus');
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            setAyToDelete(null);
        },
        onError: (error: Error) => {
            toast.error(error.message);
            setAyToDelete(null);
        }
    });

    // Jika belum punya sekolah, paksa hanya tab profil yang terbuka
    const hasSchool = !!schoolData;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <AnimatePresence>
                {ayToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 border border-red-200">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">Hapus Tahun Ajaran?</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                Yakin ingin menghapus tahun ajaran "{ayToDelete.name}"? Pastikan belum ada kelas yang terkait.
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setAyToDelete(null)} disabled={deleteAyMutation.isPending}>Batal</Button>
                                <Button variant="destructive" onClick={() => deleteAyMutation.mutate(ayToDelete.id)} disabled={deleteAyMutation.isPending}>
                                    {deleteAyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Hapus
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div>
                <h1 className="text-2xl font-bold text-foreground">Data Master Sekolah</h1>
                <p className="text-sm text-muted-foreground mt-1">Pengaturan terpusat untuk Profil Institusi, Tahun Ajaran, dan Kelas.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-auto p-1 max-w-2xl">
                    <TabsTrigger value="profil" className="py-2.5">Profil Sekolah</TabsTrigger>
                    <TabsTrigger value="tahun-ajaran" className="py-2.5" disabled={!hasSchool}>Tahun Ajaran</TabsTrigger>
                    <TabsTrigger value="kelas" className="py-2.5" disabled={!hasSchool}>Data Kelas</TabsTrigger>
                </TabsList>

                <TabsContent value="profil" className="mt-6">
                    <Card className="border-border shadow-sm max-w-4xl">
                        <CardHeader className="bg-muted/20 border-b border-border">
                            <CardTitle className="text-lg flex items-center gap-2"><School className="w-5 h-5 text-emerald-600" /> Identitas Institusi</CardTitle>
                            <CardDescription>
                                {hasSchool ? 'Informasi ini akan digunakan pada kop surat, laporan, dan kuitansi.' : 'Lengkapi data awal sekolah Anda untuk memulai.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {isSchoolLoading ? (
                                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
                            ) : (
                                <SchoolProfileForm schoolData={schoolData} authUser={user} onSuccess={setSchool} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {hasSchool && (
                    <>
                        <TabsContent value="tahun-ajaran" className="mt-6">
                            <Card className="border-border shadow-sm max-w-4xl">
                                <CardHeader className="bg-muted/20 border-b border-border flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg">Daftar Tahun Ajaran</CardTitle>
                                        <CardDescription>Kelola tahun ajaran yang tersedia.</CardDescription>
                                    </div>
                                    <Button onClick={() => generateNewAcademicYear.mutate()} disabled={generateNewAcademicYear.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                                        <Plus className="w-4 h-4 mr-2" /> Buat Baru
                                    </Button>
                                </CardHeader>
                                <CardContent className="pt-0 p-0">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/50 bg-muted/30">
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase w-16">No.</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase">Tahun Ajaran</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-center">Status</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {isAyLoading ? (
                                                <tr><td colSpan={4} className="px-6 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" /></td></tr>
                                            ) : academicYears.length === 0 ? (
                                                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">Belum ada data.</td></tr>
                                            ) : (
                                                academicYears.map((ay, idx) => (
                                                    <tr key={ay.id} className="hover:bg-muted/30 transition-colors">
                                                        <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{idx + 1}</td>
                                                        <td className="px-6 py-4 font-semibold text-foreground text-base">{ay.name}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            {ay.isActive ? (
                                                                <span className="inline-flex items-center bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> SEDANG AKTIF
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center bg-muted text-muted-foreground border border-border px-3 py-1 rounded-full text-xs font-medium">
                                                                    Tidak Aktif
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end space-x-2">
                                                                {!ay.isActive && (
                                                                    <Button variant="outline" size="sm" onClick={() => setActiveAcademicYear.mutate(ay.id)} disabled={setActiveAcademicYear.isPending}>
                                                                        Jadikan Aktif
                                                                    </Button>
                                                                )}
                                                                {isSuperAdmin && (
                                                                    <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50 hover:text-red-700" onClick={() => setAyToDelete({ id: ay.id, name: ay.name })}>
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="kelas" className="mt-6">
                            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                                <ClassListPage />
                            </div>
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </motion.div>
    );
}