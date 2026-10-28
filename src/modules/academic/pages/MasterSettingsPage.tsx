import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Trash2, CheckCircle2, School, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
import { LocationPickerMap } from '@/components/map/LocationPickerMap';

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
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    attendanceRadiusMeters: z.coerce.number().min(10, 'Radius minimal 10 meter / Radius min 10 meters'),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

// Fix TypeScript Error untuk Prop 'radius' dengan melakukan type casting sementara
const MapComponent = LocationPickerMap as any;

function SchoolProfileForm({ schoolData, authUser, onSuccess }: { schoolData: any, authUser: any, onSuccess: any }) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isEdit = !!schoolData?.id;

    const t = {
        alert: locale === 'id' ? 'Anda belum memiliki data sekolah. Silakan isi form di bawah ini untuk mendaftarkan institusi Anda.' : 'You have no school data yet. Please fill out the form below to register your institution.',
        nameLabel: locale === 'id' ? 'Nama Sekolah' : 'School Name',
        levelLabel: locale === 'id' ? 'Jenjang' : 'Level',
        statusLabel: locale === 'id' ? 'Status' : 'Status',
        contactLabel: locale === 'id' ? 'Alamat & Kontak' : 'Address & Contact',
        address: locale === 'id' ? 'Alamat Lengkap' : 'Full Address',
        city: locale === 'id' ? 'Kabupaten / Kota' : 'City / District',
        province: locale === 'id' ? 'Provinsi' : 'Province',
        phone: locale === 'id' ? 'Telepon' : 'Phone',
        gpsLabel: locale === 'id' ? 'Pengaturan Lokasi GPS (Absensi)' : 'GPS Location Settings (Attendance)',
        radiusLabel: locale === 'id' ? 'Radius Toleransi (Meter)' : 'Tolerance Radius (Meters)',
        btnSave: locale === 'id' ? 'Simpan Perubahan' : 'Save Changes',
        btnCreate: locale === 'id' ? 'Buat Institusi Baru' : 'Create New Institution',
        toastSave: locale === 'id' ? 'Profil sekolah berhasil disimpan' : 'School profile successfully saved',
        toastCreate: locale === 'id' ? 'Sekolah baru berhasil dibuat!' : 'New school successfully created!',
        phLevel: locale === 'id' ? 'Pilih Jenjang' : 'Select Level',
        phStatus: locale === 'id' ? 'Pilih Status' : 'Select Status',
        statusPublic: locale === 'id' ? 'NEGERI / PUBLIC' : 'PUBLIC',
        statusPrivate: locale === 'id' ? 'SWASTA / PRIVATE' : 'PRIVATE',
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
            latitude: schoolData?.latitude ?? null,
            longitude: schoolData?.longitude ?? null,
            attendanceRadiusMeters: schoolData?.attendanceRadiusMeters ?? 200,
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
                    await supabase.from('users').upsert({ id: authUser.id, schoolId: newSchoolId, email: authUser.email || '', fullName: authUser.user_metadata?.full_name || 'Administrator', role: 'ADMIN' });
                }
                return newSchool;
            }
        },
        onSuccess: async (data) => {
            toast.success(isEdit ? t.toastSave : t.toastCreate);
            onSuccess(data);
            queryClient.setQueryData(['school-profile', data.id], data);

            if (!isEdit && authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                const { data: updatedProfile } = await supabase.from('users').select('*').eq('id', authUser.id).single();
                if (updatedProfile) useAuthStore.getState().setUser(updatedProfile);
            }
        },
        onError: (error: Error) => toast.error(error.message)
    });

    const onSubmitSchool = (data: SchoolFormValues) => {
        saveSchoolMutation.mutate({ ...data, level: data.level.trim().toUpperCase(), type: data.type.trim().toUpperCase() });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitSchool)} className="space-y-6">
                {!isEdit && (
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6 border border-blue-200 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p>{t.alert}</p>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>{t.nameLabel}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="npsn" render={({ field }) => (<FormItem><FormLabel>NPSN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="level" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.levelLabel}</FormLabel>
                            <Select value={field.value || ''} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.phLevel} /></SelectTrigger></FormControl>
                                <SelectContent>{['TK', 'SD', 'SMP', 'SMA', 'SMK', 'MI', 'MTs', 'MA'].map(lvl => <SelectItem key={lvl} value={lvl}>{lvl}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="type" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.statusLabel}</FormLabel>
                            <Select value={field.value || ''} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.phStatus} /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="NEGERI">{t.statusPublic}</SelectItem><SelectItem value="SWASTA">{t.statusPrivate}</SelectItem></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="font-medium">{t.contactLabel}</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>{t.address}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>{t.city}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>{t.province}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>{t.phone}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="font-medium text-emerald-600">{t.gpsLabel}</h4>
                    <div className="mb-6">
                        <MapComponent
                            latitude={form.watch('latitude') ?? null}
                            longitude={form.watch('longitude') ?? null}
                            radius={form.watch('attendanceRadiusMeters') ?? 0}
                            onChange={(lat: number, lng: number) => { form.setValue('latitude', lat); form.setValue('longitude', lng); }}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField control={form.control} name="latitude" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="longitude" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="attendanceRadiusMeters" render={({ field }) => (<FormItem><FormLabel>{t.radiusLabel}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>
                <div className="flex justify-end pt-6">
                    <Button type="submit" disabled={saveSchoolMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {saveSchoolMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {isEdit ? t.btnSave : t.btnCreate}
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
    const isSuperAdmin = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN'].includes(user?.role as string);

    const [activeTab, setActiveTab] = useState(location.state?.tab || 'profil');
    const [ayToDelete, setAyToDelete] = useState<{ id: string; name: string } | null>(null);
    const [deleteModalType, setDeleteModalType] = useState<'single' | 'bulk' | 'all'>('single');

    const [selectedAys, setSelectedAys] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'startYear', direction: 'desc' });

    const t = {
        title: locale === 'id' ? 'Data Master Sekolah' : 'Master School Data',
        desc: locale === 'id' ? 'Pengaturan terpusat untuk Profil Institusi, Tahun Ajaran, dan Kelas.' : 'Centralized settings for Institution Profile, Academic Years, and Classes.',
        tabProfile: locale === 'id' ? 'Profil Sekolah' : 'School Profile',
        tabAy: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        tabClass: locale === 'id' ? 'Data Kelas' : 'Class Data',
        ayListTitle: locale === 'id' ? 'Daftar Tahun Ajaran' : 'Academic Year List',
        ayListDesc: locale === 'id' ? 'Kelola tahun ajaran yang tersedia.' : 'Manage available academic years.',
        btnDeleteSel: locale === 'id' ? 'Hapus Pilihan' : 'Delete Selected',
        btnCreateNew: locale === 'id' ? 'Buat Baru' : 'Create New',
        colNo: 'No.',
        colAy: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        colStatus: 'Status',
        colAction: locale === 'id' ? 'Aksi' : 'Action',
        emptyData: locale === 'id' ? 'Belum ada data.' : 'No data available.',
        statusActive: locale === 'id' ? 'SEDANG AKTIF' : 'CURRENTLY ACTIVE',
        statusInactive: locale === 'id' ? 'Tidak Aktif' : 'Inactive',
        btnSetActive: locale === 'id' ? 'Jadikan Aktif' : 'Set Active',
        confirmDelTitle: locale === 'id' ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        confirmDelBulk: (n: number) => locale === 'id' ? `Yakin ingin menghapus ${n} data?` : `Are you sure you want to delete ${n} items?`,
        confirmDelAll: locale === 'id' ? 'Yakin ingin mengosongkan SEMUA data tahun ajaran?' : 'Are you sure you want to delete ALL academic year data?',
        confirmDelSingle: (name: string) => locale === 'id' ? `Yakin ingin menghapus tahun ajaran "${name}"?` : `Are you sure you want to delete academic year "${name}"?`,
        btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
        btnDelete: locale === 'id' ? 'Hapus' : 'Delete',
        toastAyCreated: locale === 'id' ? 'Tahun ajaran berhasil dibuat' : 'Academic year successfully created',
        toastAyActive: locale === 'id' ? 'Tahun ajaran aktif diperbarui' : 'Active academic year updated',
        toastAyDeleted: locale === 'id' ? 'Data terpilih berhasil dihapus' : 'Selected data successfully deleted',
        identitas: locale === 'id' ? 'Identitas Institusi' : 'Institution Identity'
    };

    const { data: schoolData, isLoading: isSchoolLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            const { data } = await supabase.from('schools').select('*').eq('id', authSchool.id).single();
            return data;
        },
    });

    const { data: academicYearsResponse, isLoading: isAyLoading } = useQuery({
        queryKey: ['academic-years', authSchool?.id],
        queryFn: () => academicService.getAcademicYears(authSchool?.id || ''),
        enabled: !!authSchool?.id,
    });
    const academicYears = academicYearsResponse?.data || [];

    const sortedAcademicYears = useMemo(() => {
        let sortable = [...academicYears];
        if (sortConfig !== null) {
            sortable.sort((a, b) => {
                let aValue = a[sortConfig.key as keyof typeof a];
                let bValue = b[sortConfig.key as keyof typeof b];
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [academicYears, sortConfig]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const toggleRow = (id: string) => setSelectedAys(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
    const toggleAll = () => {
        if (selectedAys.length === academicYears.length && academicYears.length > 0) setSelectedAys([]);
        else setSelectedAys(academicYears.map(ay => ay.id));
    };

    const generateNewAcademicYear = useMutation({
        mutationFn: async () => {
            let nextStartYear = new Date().getFullYear();
            if (academicYears.length > 0) {
                const maxYear = Math.max(...academicYears.map(ay => ay.startYear));
                nextStartYear = maxYear + 1;
            }
            const { error } = await supabase.from('academic_years').insert({
                id: crypto.randomUUID(),
                schoolId: authSchool?.id || '',
                name: `${nextStartYear}/${nextStartYear + 1}`,
                startYear: nextStartYear,
                endYear: nextStartYear + 1,
                isActive: false
            });
            if (error) throw new Error(error.message);
        },
        onSuccess: () => { toast.success(t.toastAyCreated); queryClient.invalidateQueries({ queryKey: ['academic-years'] }); },
        onError: (e: Error) => toast.error(e.message)
    });

    const setActiveAcademicYear = useMutation({
        mutationFn: async (id: string) => {
            await supabase.from('academic_years').update({ isActive: false }).eq('schoolId', authSchool?.id || '');
            const { error } = await supabase.from('academic_years').update({ isActive: true }).eq('id', id);
            if (error) throw new Error(error.message);
        },
        onSuccess: () => { toast.success(t.toastAyActive); queryClient.invalidateQueries({ queryKey: ['academic-years'] }); }
    });

    const deleteBulkAyMutation = useMutation({
        mutationFn: (ids: string[]) => academicService.deleteBulkAcademicYears(ids),
        onSuccess: () => {
            toast.success(t.toastAyDeleted);
            queryClient.invalidateQueries({ queryKey: ['academic-years'] });
            setSelectedAys([]); setAyToDelete(null);
        },
        onError: (e: Error) => { toast.error(e.message); setAyToDelete(null); }
    });

    const confirmDelete = () => {
        if (deleteModalType === 'single' && ayToDelete) deleteBulkAyMutation.mutate([ayToDelete.id]);
        else if (deleteModalType === 'bulk') deleteBulkAyMutation.mutate(selectedAys);
        else if (deleteModalType === 'all') deleteBulkAyMutation.mutate(academicYears.map(ay => ay.id));
    };

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
                            <h3 className="text-xl font-bold mb-2">{t.confirmDelTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                {deleteModalType === 'bulk' ? t.confirmDelBulk(selectedAys.length) : deleteModalType === 'all' ? t.confirmDelAll : t.confirmDelSingle(ayToDelete.name)}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setAyToDelete(null)} disabled={deleteBulkAyMutation.isPending}>{t.btnCancel}</Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={deleteBulkAyMutation.isPending}>
                                    {deleteBulkAyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {t.btnDelete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div>
                <h1 className="text-2xl font-bold">{t.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="w-full overflow-x-auto pb-2">
                    <TabsList className="flex w-max min-w-full md:grid md:grid-cols-3 h-auto p-1 max-w-2xl">
                        <TabsTrigger value="profil" className="py-2.5 px-6">{t.tabProfile}</TabsTrigger>
                        <TabsTrigger value="tahun-ajaran" className="py-2.5 px-6" disabled={!hasSchool}>{t.tabAy}</TabsTrigger>
                        <TabsTrigger value="kelas" className="py-2.5 px-6" disabled={!hasSchool}>{t.tabClass}</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="profil" className="mt-6">
                    <Card className="border-border shadow-sm max-w-4xl">
                        <CardHeader className="bg-muted/20 border-b border-border">
                            <CardTitle className="text-lg flex items-center gap-2"><School className="w-5 h-5 text-emerald-600" /> {t.identitas}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {isSchoolLoading ? <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div> : <SchoolProfileForm schoolData={schoolData} authUser={user} onSuccess={setSchool} />}
                        </CardContent>
                    </Card>
                </TabsContent>

                {hasSchool && (
                    <>
                        <TabsContent value="tahun-ajaran" className="mt-6">
                            <Card className="border-border shadow-sm max-w-4xl">
                                <CardHeader className="bg-muted/20 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-lg">{t.ayListTitle}</CardTitle>
                                        <CardDescription>{t.ayListDesc}</CardDescription>
                                    </div>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        {selectedAys.length > 0 && (
                                            <Button variant="destructive" onClick={() => { setDeleteModalType('bulk'); setAyToDelete({ id: 'bulk', name: 'bulk' }); }}>
                                                <Trash2 className="w-4 h-4 mr-2" /> {t.btnDeleteSel} ({selectedAys.length})
                                            </Button>
                                        )}
                                        <Button onClick={() => generateNewAcademicYear.mutate()} disabled={generateNewAcademicYear.isPending} className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">
                                            <Plus className="w-4 h-4 mr-2" /> {t.btnCreateNew}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 p-0">
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-border/50 bg-muted/30 whitespace-nowrap">
                                                    <th className="p-4 w-12 text-center">
                                                        <input type="checkbox" checked={selectedAys.length === academicYears.length && academicYears.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer" />
                                                    </th>
                                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase w-16">{t.colNo}</th>
                                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('name')}>
                                                        <div className="flex items-center gap-1">{t.colAy} {sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                                    </th>
                                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-center cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('isActive')}>
                                                        <div className="flex items-center justify-center gap-1">{t.colStatus} {sortConfig?.key === 'isActive' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                                    </th>
                                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-right">{t.colAction}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                {isAyLoading ? (
                                                    <tr><td colSpan={5} className="px-6 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" /></td></tr>
                                                ) : sortedAcademicYears.length === 0 ? (
                                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">{t.emptyData}</td></tr>
                                                ) : (
                                                    sortedAcademicYears.map((ay, idx) => (
                                                        <tr key={ay.id} className="hover:bg-muted/30 transition-colors whitespace-nowrap">
                                                            <td className="p-4 text-center">
                                                                <input type="checkbox" checked={selectedAys.includes(ay.id)} onChange={() => toggleRow(ay.id)} className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer" />
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{idx + 1}</td>
                                                            <td className="px-6 py-4 font-semibold text-foreground text-base">{ay.name}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                {ay.isActive ? (
                                                                    <span className="inline-flex items-center bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {t.statusActive}</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center bg-muted text-muted-foreground border border-border px-3 py-1 rounded-full text-xs font-medium">{t.statusInactive}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end space-x-2">
                                                                    {!ay.isActive && <Button variant="outline" size="sm" onClick={() => setActiveAcademicYear.mutate(ay.id)} disabled={setActiveAcademicYear.isPending}>{t.btnSetActive}</Button>}
                                                                    {isSuperAdmin && (
                                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => { setDeleteModalType('single'); setAyToDelete({ id: ay.id, name: ay.name }); }}>
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
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="kelas" className="mt-6">
                            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm">
                                <ClassListPage />
                            </div>
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </motion.div>
    );
}