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

// Bilingual Zod Schema
const schoolSchema = z.object({
    name: z.string().min(3, 'Nama sekolah wajib diisi / School name is required'),
    npsn: z.string().min(8, 'NPSN tidak valid / Invalid NPSN'),
    level: z.string().min(1, 'Jenjang wajib dipilih / Level is required'),
    type: z.string().min(1, 'Status wajib dipilih / Status is required'),
    address: z.string().min(5, 'Alamat wajib diisi / Address is required'),
    city: z.string().min(3, 'Kota wajib diisi / City is required'),
    province: z.string().min(3, 'Provinsi wajib diisi / Province is required'),
    phone: z.string().optional(),
    email: z.string().email('Email tidak valid / Invalid email').optional().or(z.literal('')),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

function SchoolProfileForm({ schoolData, authUser, onSuccess }: { schoolData: any, authUser: any, onSuccess: any }) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isEdit = !!schoolData?.id;

    const t = {
        alert: locale === 'id' ? 'Anda belum memiliki data sekolah. Silakan isi form di bawah ini untuk mendaftarkan institusi Anda. Akun Anda akan otomatis diatur sebagai SUPER ADMIN untuk institusi ini.' : 'You have no school data yet. Please fill out the form below to register your institution. Your account will automatically be set as SUPER ADMIN for this institution.',
        nameLabel: locale === 'id' ? 'Nama Sekolah' : 'School Name',
        levelLabel: locale === 'id' ? 'Jenjang' : 'Level',
        levelPlaceholder: locale === 'id' ? 'Pilih Jenjang' : 'Select Level',
        statusLabel: locale === 'id' ? 'Status' : 'Status',
        statusPlaceholder: locale === 'id' ? 'Pilih Status' : 'Select Status',
        contactLabel: locale === 'id' ? 'Alamat & Kontak' : 'Address & Contact',
        addressLabel: locale === 'id' ? 'Alamat Lengkap' : 'Full Address',
        cityLabel: locale === 'id' ? 'Kabupaten / Kota' : 'City / District',
        provinceLabel: locale === 'id' ? 'Provinsi' : 'Province',
        phoneLabel: locale === 'id' ? 'Nomor Telepon' : 'Phone Number',
        btnSave: locale === 'id' ? 'Simpan Perubahan' : 'Save Changes',
        btnCreate: locale === 'id' ? 'Buat Institusi Baru' : 'Create New Institution',
        toastUpdate: locale === 'id' ? 'Profil sekolah berhasil disimpan' : 'School profile saved successfully',
        toastCreate: locale === 'id' ? 'Sekolah baru berhasil dibuat!' : 'New school created successfully!',
    };

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
                const { data, error } = await supabase.from('schools').update(payload).eq('id', schoolData.id).select().single();
                if (error) throw new Error(error.message);
                return data;
            } else {
                const newSchoolId = crypto.randomUUID();
                const { data: newSchool, error: schoolErr } = await supabase.from('schools').insert({ ...payload, id: newSchoolId }).select().single();
                if (schoolErr) throw new Error(schoolErr.message);

                if (authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                    const { error: userErr } = await supabase.from('users').upsert({
                        id: authUser.id,
                        schoolId: newSchoolId,
                        email: authUser.email || '',
                        fullName: authUser.user_metadata?.full_name || 'Administrator',
                        role: 'ADMIN'
                    });
                    if (userErr) throw new Error(userErr.message);
                }
                return newSchool;
            }
        },
        onSuccess: async (data) => {
            toast.success(isEdit ? t.toastUpdate : t.toastCreate);
            onSuccess(data);

            if (!isEdit && authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                const { data: updatedProfile } = await supabase.from('users').select('*').eq('id', authUser.id).single();
                if (updatedProfile) useAuthStore.getState().setUser(updatedProfile);
            }
            queryClient.invalidateQueries({ queryKey: ['school-profile'] });
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const onSubmitSchool = (data: SchoolFormValues) => {
        saveSchoolMutation.mutate({
            ...data,
            level: data.level.trim().toUpperCase(),
            type: data.type.trim().toUpperCase(),
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitSchool)} className="space-y-6">
                {!isEdit && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg text-sm mb-6 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p dangerouslySetInnerHTML={{ __html: t.alert }}></p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>{t.nameLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="npsn" render={({ field }) => (
                        <FormItem><FormLabel>NPSN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                    <FormField control={form.control} name="level" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.levelLabel}</FormLabel>
                            <Select value={field.value || ''} onValueChange={(value) => field.onChange(value)}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.levelPlaceholder} /></SelectTrigger></FormControl>
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
                            <FormLabel>{t.statusLabel}</FormLabel>
                            <Select value={field.value || ''} onValueChange={(value) => field.onChange(value)}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.statusPlaceholder} /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="NEGERI">NEGERI / PUBLIC</SelectItem>
                                    <SelectItem value="SWASTA">SWASTA / PRIVATE</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="font-medium">{t.contactLabel}</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>{t.addressLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>{t.cityLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>{t.provinceLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>{t.phoneLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>

                <div className="flex justify-end pt-6">
                    <Button type="submit" disabled={saveSchoolMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {saveSchoolMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {isEdit ? t.btnSave : t.btnCreate}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

export function MasterSettingsPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const location = useLocation();

    const { school: authSchool, setSchool, user } = useAuthStore();
    const userRole = user?.role as string | undefined;
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMIN' || userRole === 'ADMIN';

    const [activeTab, setActiveTab] = useState(location.state?.tab || 'profil');
    const [ayToDelete, setAyToDelete] = useState<{ id: string; name: string } | null>(null);

    // Kamus Halaman Utama Master
    const t = {
        title: locale === 'id' ? 'Data Master Sekolah' : 'School Master Data',
        subtitle: locale === 'id' ? 'Pengaturan terpusat untuk Profil Institusi, Tahun Ajaran, dan Kelas.' : 'Centralized settings for Institution Profile, Academic Years, and Classes.',
        tabProfile: locale === 'id' ? 'Profil Sekolah' : 'School Profile',
        tabYear: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        tabClass: locale === 'id' ? 'Data Kelas' : 'Classes Data',

        cardProfileTitle: locale === 'id' ? 'Identitas Institusi' : 'Institution Identity',
        cardProfileDesc: locale === 'id' ? 'Informasi ini akan digunakan pada kop surat, laporan, dan kuitansi.' : 'This information will be used on letterheads, reports, and receipts.',
        cardProfileDescEmpty: locale === 'id' ? 'Lengkapi data awal sekolah Anda untuk memulai.' : 'Complete your initial school data to get started.',

        cardYearTitle: locale === 'id' ? 'Daftar Tahun Ajaran' : 'Academic Year List',
        cardYearDesc: locale === 'id' ? 'Kelola tahun ajaran yang tersedia.' : 'Manage available academic years.',
        btnCreate: locale === 'id' ? 'Buat Baru' : 'Create New',

        thNo: 'No.',
        thYear: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        thStatus: locale === 'id' ? 'Status' : 'Status',
        thAction: locale === 'id' ? 'Aksi' : 'Action',

        statusActive: locale === 'id' ? 'SEDANG AKTIF' : 'CURRENTLY ACTIVE',
        statusInactive: locale === 'id' ? 'Tidak Aktif' : 'Inactive',
        btnMakeActive: locale === 'id' ? 'Jadikan Aktif' : 'Set Active',
        emptyData: locale === 'id' ? 'Belum ada data.' : 'No data available.',

        delTitle: locale === 'id' ? 'Hapus Tahun Ajaran?' : 'Delete Academic Year?',
        delDesc1: locale === 'id' ? 'Yakin ingin menghapus tahun ajaran' : 'Are you sure you want to delete the academic year',
        delDesc2: locale === 'id' ? '? Pastikan belum ada kelas yang terkait.' : '? Make sure no classes are linked to it.',
        cancel: locale === 'id' ? 'Batal' : 'Cancel',
        delete: locale === 'id' ? 'Hapus' : 'Delete',

        toastNewYear: locale === 'id' ? 'Tahun ajaran baru berhasil dibuat' : 'New academic year created successfully',
        toastActiveYear: locale === 'id' ? 'Tahun ajaran aktif berhasil diubah' : 'Active academic year updated',
        toastDelYear: locale === 'id' ? 'Tahun ajaran berhasil dihapus' : 'Academic year deleted successfully',
    };

    const { data: schoolData, isLoading: isSchoolLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            const { data, error } = await supabase.from('schools').select('*').eq('id', authSchool.id).single();
            if (error) return null;
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
                id: crypto.randomUUID(),
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
            toast.success(t.toastNewYear);
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
            toast.success(t.toastActiveYear);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
        }
    });

    const deleteAyMutation = useMutation({
        mutationFn: (id: string) => academicService.deleteAcademicYear(id),
        onSuccess: () => {
            toast.success(t.toastDelYear);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            setAyToDelete(null);
        },
        onError: (error: Error) => {
            toast.error(error.message);
            setAyToDelete(null);
        }
    });

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
                            <h3 className="text-xl font-bold text-foreground mb-2">{t.delTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                {t.delDesc1} "{ayToDelete.name}"{t.delDesc2}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setAyToDelete(null)} disabled={deleteAyMutation.isPending}>{t.cancel}</Button>
                                <Button variant="destructive" onClick={() => deleteAyMutation.mutate(ayToDelete.id)} disabled={deleteAyMutation.isPending}>
                                    {deleteAyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {t.delete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div>
                <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-auto p-1 max-w-2xl">
                    <TabsTrigger value="profil" className="py-2.5">{t.tabProfile}</TabsTrigger>
                    <TabsTrigger value="tahun-ajaran" className="py-2.5" disabled={!hasSchool}>{t.tabYear}</TabsTrigger>
                    <TabsTrigger value="kelas" className="py-2.5" disabled={!hasSchool}>{t.tabClass}</TabsTrigger>
                </TabsList>

                <TabsContent value="profil" className="mt-6">
                    <Card className="border-border shadow-sm max-w-4xl">
                        <CardHeader className="bg-muted/20 border-b border-border">
                            <CardTitle className="text-lg flex items-center gap-2"><School className="w-5 h-5 text-emerald-600" /> {t.cardProfileTitle}</CardTitle>
                            <CardDescription>
                                {hasSchool ? t.cardProfileDesc : t.cardProfileDescEmpty}
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
                                        <CardTitle className="text-lg">{t.cardYearTitle}</CardTitle>
                                        <CardDescription>{t.cardYearDesc}</CardDescription>
                                    </div>
                                    <Button onClick={() => generateNewAcademicYear.mutate()} disabled={generateNewAcademicYear.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                                        <Plus className="w-4 h-4 mr-2" /> {t.btnCreate}
                                    </Button>
                                </CardHeader>
                                <CardContent className="pt-0 p-0">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/50 bg-muted/30">
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase w-16">{t.thNo}</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase">{t.thYear}</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-center">{t.thStatus}</th>
                                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-right">{t.thAction}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {isAyLoading ? (
                                                <tr><td colSpan={4} className="px-6 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" /></td></tr>
                                            ) : academicYears.length === 0 ? (
                                                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">{t.emptyData}</td></tr>
                                            ) : (
                                                academicYears.map((ay, idx) => (
                                                    <tr key={ay.id} className="hover:bg-muted/30 transition-colors">
                                                        <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{idx + 1}</td>
                                                        <td className="px-6 py-4 font-semibold text-foreground text-base">{ay.name}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            {ay.isActive ? (
                                                                <span className="inline-flex items-center bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {t.statusActive}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center bg-muted text-muted-foreground border border-border px-3 py-1 rounded-full text-xs font-medium">
                                                                    {t.statusInactive}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end space-x-2">
                                                                {!ay.isActive && (
                                                                    <Button variant="outline" size="sm" onClick={() => setActiveAcademicYear.mutate(ay.id)} disabled={setActiveAcademicYear.isPending}>
                                                                        {t.btnMakeActive}
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