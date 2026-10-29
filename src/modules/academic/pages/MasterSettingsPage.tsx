import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Trash2, CheckCircle2, School, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ComponentType } from 'react';

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
import type { AcademicYear } from '../types/academic.types';
import { LocationPickerMap } from '@/components/map/LocationPickerMap';

// ==========================================
// SCHEMA FORM PROFIL SEKOLAH
// ==========================================

// Ubah nilai apa pun (string dari input, angka dari database, kosong) menjadi number atau null.
// Kolom kosong HARUS menjadi null, bukan 0: z.coerce.number() mengubah '' dan null menjadi 0,
// sehingga koordinat kosong tersimpan sebagai 0,0 dan titik absensi sekolah jadi salah.
// Konversi dilakukan di sisi input (onChange) supaya tipe schema tetap sederhana (number | null),
// dan tidak membuat tipe form "unknown" yang memicu error TypeScript pada resolver.
const toNumberOrNull = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const schoolSchema = z.object({
    name: z.string().min(3, 'Nama sekolah wajib diisi / School name is required'),
    npsn: z.string().trim().regex(/^\d{8}$/, 'NPSN harus terdiri dari tepat 8 angka / NPSN must contain exactly 8 digits'),
    level: z.string().min(1, 'Jenjang wajib dipilih / Level is required'),
    type: z.string().min(1, 'Status wajib dipilih / Status is required'),
    address: z.string().min(5, 'Alamat wajib diisi / Address is required'),
    city: z.string().min(3, 'Kota wajib diisi / City is required'),
    province: z.string().min(3, 'Provinsi wajib diisi / Province is required'),
    phone: z.string().optional(),
    email: z.string().email('Email tidak valid / Invalid email').optional().or(z.literal('')),
    latitude: z.number().nullable().refine((v) => v === null || (v >= -90 && v <= 90), 'Latitude harus antara -90 dan 90'),
    longitude: z.number().nullable().refine((v) => v === null || (v >= -180 && v <= 180), 'Longitude harus antara -180 dan 180'),
    attendanceRadiusMeters: z.coerce.number().int('Radius harus berupa bilangan bulat').min(10, 'Radius minimal 10 meter / Radius min 10 meters'),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

// Kontrak props peta yang dipakai halaman ini.
// Jika LocationPickerMap belum mendeklarasikan radius, sebaiknya tambahkan prop ini
// pada komponen aslinya agar tidak memerlukan type assertion.
type LocationPickerMapProps = {
    latitude: number | null;
    longitude: number | null;
    radius: number;
    onChange: (latitude: number, longitude: number) => void;
};

const MapComponent = LocationPickerMap as unknown as ComponentType<LocationPickerMapProps>;

// ==========================================
// KONSTANTA
// ==========================================

// Gaya tombol tab: tab aktif berwarna hijau penuh + teks putih (sama seperti halaman Manajemen Pengguna)
const TAB_TRIGGER_CLASS =
    'flex-1 whitespace-nowrap rounded-md px-5 py-2.5 text-muted-foreground transition-all hover:text-foreground ' +
    'data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white ' +
    'disabled:opacity-50';

// Status modal konfirmasi hapus: satu data / data terpilih / semua data
type DeleteModalState = { isOpen: boolean; type: 'single' | 'bulk' | 'all'; id?: string; name?: string };

// ==========================================
// FORM PROFIL SEKOLAH
// Dipakai untuk membuat sekolah baru (belum ada data) atau mengedit sekolah yang sudah ada
// ==========================================
async function getSchoolRecord(id: string) {
    const { data, error } = await supabase.from('schools').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

type SchoolRecord = NonNullable<Awaited<ReturnType<typeof getSchoolRecord>>>;

type SchoolAuthUser = {
    id?: string;
    role?: string;
    email?: string | null;
    user_metadata?: { full_name?: string | null };
};
type SchoolProfileFormProps = {
    schoolData: (Partial<SchoolFormValues> & { id?: string }) | null | undefined;
    authUser: SchoolAuthUser | null | undefined;
    onSuccess: (school: SchoolRecord) => void;
};

function SchoolProfileForm({ schoolData, authUser, onSuccess }: SchoolProfileFormProps) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isEdit = !!schoolData?.id;

    // Teks dua bahasa untuk form ini
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
        warnLinkUser: locale === 'id' ? 'Sekolah dibuat, tetapi akun Anda gagal dihubungkan ke sekolah ini. Silakan muat ulang halaman atau hubungi Super Admin.' : 'School created, but your account could not be linked to it. Please reload the page or contact a Super Admin.',
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
            latitude: toNumberOrNull(schoolData?.latitude),
            longitude: toNumberOrNull(schoolData?.longitude),
            attendanceRadiusMeters: schoolData?.attendanceRadiusMeters ?? 200,
        }
    });

    // Simpan profil: update kalau sudah ada, insert sekolah baru kalau belum
    const saveSchoolMutation = useMutation({
        mutationFn: async (payload: SchoolFormValues) => {
            if (schoolData?.id) {
                const { data, error } = await supabase.from('schools').update(payload).eq('id', schoolData.id).select().single();
                if (error) throw new Error(error.message);
                return data;
            } else {
                const newSchoolId = crypto.randomUUID();
                const { data: newSchool, error: schoolErr } = await supabase.from('schools').insert({ ...payload, id: newSchoolId }).select().single();
                if (schoolErr) throw new Error(schoolErr.message);

                // Hubungkan akun pembuat sekolah (selain Super Admin) sebagai ADMIN sekolah baru
                if (authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                    const { error: linkErr } = await supabase.from('users').upsert({ id: authUser.id, schoolId: newSchoolId, email: authUser.email || '', fullName: authUser.user_metadata?.full_name || 'Administrator', role: 'ADMIN' });
                    // Tidak dilempar sebagai error karena sekolah sudah terlanjur dibuat; cukup beri peringatan
                    if (linkErr) toast.warning(t.warnLinkUser, { description: linkErr.message });
                }
                return newSchool;
            }
        },
        onSuccess: async (data) => {
            toast.success(isEdit ? t.toastSave : t.toastCreate);
            onSuccess(data);
            queryClient.setQueryData(['school-profile', data.id], data);

            // Setelah membuat sekolah baru, muat ulang profil user agar schoolId-nya ikut terbaru
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
                {/* Pesan untuk pengguna yang belum punya data sekolah */}
                {!isEdit && (
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6 border border-blue-200 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p>{t.alert}</p>
                    </div>
                )}

                {/* IDENTITAS: nama, NPSN, jenjang, status */}
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

                {/* ALAMAT & KONTAK */}
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

                {/* LOKASI GPS UNTUK ABSENSI: peta + koordinat + radius toleransi */}
                <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="font-medium text-emerald-600">{t.gpsLabel}</h4>
                    <div className="mb-6">
                        <MapComponent
                            latitude={form.watch('latitude') ?? null}
                            longitude={form.watch('longitude') ?? null}
                            radius={form.watch('attendanceRadiusMeters') ?? 0}
                            onChange={(lat: number, lng: number) => { form.setValue('latitude', lat, { shouldDirty: true, shouldValidate: true }); form.setValue('longitude', lng, { shouldDirty: true, shouldValidate: true }); }}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField control={form.control} name="latitude" render={({ field }) => (<FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(toNumberOrNull(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="longitude" render={({ field }) => (<FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(toNumberOrNull(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="attendanceRadiusMeters" render={({ field }) => (<FormItem><FormLabel>{t.radiusLabel}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? 200} onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>

                {/* ACTIONS: Tombol simpan yang responsif */}
                <div className="flex flex-wrap justify-end gap-3 pt-6 border-t mt-8">
                    <Button
                        type="submit"
                        disabled={saveSchoolMutation.isPending}
                        className="h-10 w-full sm:w-auto grow justify-center gap-2 whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white sm:grow-0 px-6"
                    >
                        {saveSchoolMutation.isPending ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Save className="w-4 h-4 shrink-0" />}
                        <span>{isEdit ? t.btnSave : t.btnCreate}</span>
                    </Button>
                </div>
            </form>
        </Form>
    );
}

// ==========================================
// HALAMAN UTAMA: DATA MASTER SEKOLAH
// Tab: Profil Sekolah | Tahun Ajaran | Data Kelas
// ==========================================
export function MasterSettingsPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const location = useLocation();
    const { school: authSchool, setSchool, user } = useAuthStore();

    // ------------------------------------------
    // HAK AKSES (disamakan dengan halaman Siswa, Guru, dan Manajemen Pengguna)
    // - Super Admin : semua fitur, termasuk "kosongkan semua"
    // - Admin       : boleh menghapus satu / beberapa tahun ajaran, TIDAK bisa "kosongkan semua"
    // - Role lain   : tidak melihat tombol hapus sama sekali
    // ------------------------------------------
    const role = user?.role as string | undefined;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const canDeleteData = role === 'SUPER_ADMIN' || role === 'ADMIN';

    // ------------------------------------------
    // STATES
    // ------------------------------------------
    const [activeTab, setActiveTab] = useState(location.state?.tab || 'profil');
    const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });
    const [selectedAys, setSelectedAys] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof AcademicYear, direction: 'asc' | 'desc' } | null>({ key: 'startYear', direction: 'desc' });

    // Teks dua bahasa untuk halaman ini
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
        titleActiveNoDelete: locale === 'id' ? 'Tahun ajaran aktif tidak dapat dihapus' : 'The active academic year cannot be deleted',
        confirmDelTitle: locale === 'id' ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        confirmDelBulk: (n: number) => locale === 'id' ? `Yakin ingin menghapus ${n} data?` : `Are you sure you want to delete ${n} items?`,
        confirmDelAll: locale === 'id' ? 'Yakin ingin mengosongkan SEMUA data tahun ajaran?' : 'Are you sure you want to delete ALL academic year data?',
        confirmDelSingle: (name: string) => locale === 'id' ? `Yakin ingin menghapus tahun ajaran "${name}"?` : `Are you sure you want to delete academic year "${name}"?`,
        btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
        btnDelete: locale === 'id' ? 'Hapus' : 'Delete',
        toastAyCreated: locale === 'id' ? 'Tahun ajaran berhasil dibuat' : 'Academic year successfully created',
        toastAyActive: locale === 'id' ? 'Tahun ajaran aktif diperbarui' : 'Active academic year updated',
        toastAyDeleted: locale === 'id' ? 'Data terpilih berhasil dihapus' : 'Selected data successfully deleted',
        toastActiveBlocked: locale === 'id' ? 'Tahun ajaran yang sedang aktif tidak boleh dihapus. Jadikan tahun ajaran lain aktif terlebih dahulu.' : 'The active academic year cannot be deleted. Set another academic year as active first.',
        toastSuperOnly: locale === 'id' ? 'Hanya Super Admin yang dapat mengosongkan semua data.' : 'Only Super Admin can clear all data.',
        identitas: locale === 'id' ? 'Identitas Institusi' : 'Institution Identity'
    };

    // ------------------------------------------
    // DATA FETCHING
    // ------------------------------------------

    // Profil sekolah
    const { data: schoolData, isLoading: isSchoolLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            const { data, error } = await supabase.from('schools').select('*').eq('id', authSchool.id).maybeSingle();
            if (error) throw new Error(error.message);
            return data;
        },
    });

    // Daftar tahun ajaran
    const { data: academicYearsResponse, isLoading: isAyLoading } = useQuery({
        queryKey: ['academic-years', authSchool?.id],
        queryFn: () => academicService.getAcademicYears(authSchool?.id || ''),
        enabled: !!authSchool?.id,
    });
    const academicYears = academicYearsResponse?.data || [];

    // Tahun ajaran yang boleh dihapus (yang sedang aktif tidak boleh)
    const deletableAys = academicYears.filter(ay => !ay.isActive);

    // Bersihkan pilihan yang sudah tidak ada atau kini menjadi tahun ajaran aktif.
    useEffect(() => {
        const allowedIds = new Set(deletableAys.map((ay) => ay.id));
        setSelectedAys((prev) => {
            const next = prev.filter((id) => allowedIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [academicYears]);

    // Sekolah sudah terdaftar? Tab Tahun Ajaran & Kelas hanya bisa dibuka kalau sudah.
    const hasSchool = !!schoolData;
    // Kalau belum ada sekolah, paksa tetap di tab Profil (mencegah halaman kosong
    // saat tab awal dari navigasi adalah tab yang dikunci)
    const currentTab = hasSchool ? activeTab : 'profil';

    // Urutkan daftar tahun ajaran sesuai kolom yang diklik
    const sortedAcademicYears = useMemo(() => {
        let sortable = [...academicYears];
        if (sortConfig !== null) {
            sortable.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                const comparison = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
                if (comparison < 0) return sortConfig.direction === 'asc' ? -1 : 1;
                if (comparison > 0) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [academicYears, sortConfig]);

    // ------------------------------------------
    // HANDLERS
    // ------------------------------------------

    // Klik header kolom: asc -> desc
    const handleSort = (key: keyof AcademicYear) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    // Checkbox baris; tahun ajaran aktif tidak bisa dicentang karena tidak boleh dihapus
    const toggleRow = (id: string) => {
        const row = academicYears.find((ay) => ay.id === id);
        if (!row || row.isActive) return;
        setSelectedAys((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
    };
    const toggleAll = () => {
        if (selectedAys.length === deletableAys.length && deletableAys.length > 0) setSelectedAys([]);
        else setSelectedAys(deletableAys.map(ay => ay.id));
    };

    const closeDeleteModal = () => setDeleteModal({ isOpen: false, type: 'single' });

    // ------------------------------------------
    // MUTATIONS
    // ------------------------------------------

    // Buat tahun ajaran baru otomatis (tahun terakhir + 1)
    const generateNewAcademicYear = useMutation({
        mutationFn: async () => {
            const schoolId = authSchool?.id;
            if (!schoolId) throw new Error('School ID tidak ditemukan. Muat ulang halaman atau masuk kembali.');

            let nextStartYear = new Date().getFullYear();
            if (academicYears.length > 0) {
                const maxYear = Math.max(...academicYears.map(ay => ay.startYear));
                nextStartYear = maxYear + 1;
            }

            const proposedName = `${nextStartYear}/${nextStartYear + 1}`;
            if (academicYears.some((ay) => ay.name === proposedName || ay.startYear === nextStartYear)) {
                throw new Error(`Tahun ajaran ${proposedName} sudah tersedia.`);
            }

            const { error } = await supabase.from('academic_years').insert({
                id: crypto.randomUUID(),
                schoolId,
                name: proposedName,
                startYear: nextStartYear,
                endYear: nextStartYear + 1,
                isActive: false
            });
            if (error) throw new Error(error.message);
        },
        onSuccess: () => { toast.success(t.toastAyCreated); queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] }); queryClient.invalidateQueries({ queryKey: ['active-academic-year'] }); },
        onError: (e: Error) => toast.error(e.message)
    });

    // Jadikan satu tahun ajaran sebagai yang aktif (hanya boleh ada satu yang aktif)
    const setActiveAcademicYear = useMutation({
        mutationFn: async (id: string) => {
            const schoolId = authSchool?.id;
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            if (!academicYears.some((ay) => ay.id === id)) throw new Error('Tahun ajaran tidak ditemukan pada sekolah ini.');
            const previousActiveId = academicYears.find(ay => ay.isActive)?.id;

            // Nonaktifkan hanya tahun ajaran milik sekolah ini.
            const { error: offError } = await supabase.from('academic_years').update({ isActive: false }).eq('schoolId', schoolId);
            if (offError) throw new Error(offError.message);

            // 2) Aktifkan yang dipilih; kalau gagal, kembalikan tahun ajaran aktif sebelumnya
            //    supaya tidak berakhir dengan nol tahun ajaran aktif
            const { error } = await supabase.from('academic_years').update({ isActive: true }).eq('schoolId', schoolId).eq('id', id);
            if (error) {
                if (previousActiveId) await supabase.from('academic_years').update({ isActive: true }).eq('schoolId', schoolId).eq('id', previousActiveId);
                throw new Error(error.message);
            }
        },
        onSuccess: () => {
            toast.success(t.toastAyActive);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            // Halaman Siswa memakai tahun ajaran aktif saat import, jadi cache-nya ikut disegarkan
            queryClient.invalidateQueries({ queryKey: ['active-academic-year'] });
        },
        onError: (e: Error) => toast.error(e.message)
    });

    // Hapus satu / beberapa / semua tahun ajaran
    const deleteBulkAyMutation = useMutation({
        mutationFn: (ids: string[]) => {
            const schoolId = authSchool?.id;
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            return academicService.deleteBulkAcademicYears(schoolId, ids);
        },
        onSuccess: () => {
            toast.success(t.toastAyDeleted);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            queryClient.invalidateQueries({ queryKey: ['active-academic-year'] });
            queryClient.invalidateQueries({ queryKey: ['classes-list'] }); // kelas terkait tahun ajaran
            setSelectedAys([]); closeDeleteModal();
        },
        onError: (e: Error) => { toast.error(e.message); closeDeleteModal(); }
    });

    // Eksekusi hapus setelah user menekan tombol di modal konfirmasi
    const confirmDelete = () => {
        // Pengaman: role tanpa hak hapus tidak boleh menjalankan apa pun
        if (!canDeleteData) { closeDeleteModal(); return; }

        let ids: string[] = [];
        if (deleteModal.type === 'single' && deleteModal.id) {
            ids = [deleteModal.id];
        } else if (deleteModal.type === 'bulk') {
            ids = selectedAys;
        } else if (deleteModal.type === 'all') {
            // "Kosongkan semua" khusus Super Admin
            if (!isSuperAdmin) { toast.error(t.toastSuperOnly); closeDeleteModal(); return; }
            ids = academicYears.map(ay => ay.id);
        }
        if (ids.length === 0) { closeDeleteModal(); return; }

        // Tahun ajaran aktif tidak boleh dihapus (kecuali "kosongkan semua"), karena
        // tanpa tahun ajaran aktif fitur seperti import siswa tidak bisa membuat kelas otomatis
        if (deleteModal.type !== 'all' && academicYears.some(ay => ids.includes(ay.id) && ay.isActive)) {
            toast.error(t.toastActiveBlocked);
            closeDeleteModal();
            return;
        }

        deleteBulkAyMutation.mutate(ids);
    };

    // Daftar tab; tab selain Profil terkunci sampai sekolah terdaftar
    const TAB_ITEMS = [
        { value: 'profil', label: t.tabProfile, needsSchool: false },
        { value: 'tahun-ajaran', label: t.tabAy, needsSchool: true },
        { value: 'kelas', label: t.tabClass, needsSchool: true },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* ================= MODAL KONFIRMASI HAPUS =================
                Modal tipe "all" hanya bisa terbuka untuk Super Admin */}
            <AnimatePresence>
                {deleteModal.isOpen && canDeleteData && (deleteModal.type !== 'all' || isSuperAdmin) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 border border-red-200">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">{t.confirmDelTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                {deleteModal.type === 'bulk' ? t.confirmDelBulk(selectedAys.length) : deleteModal.type === 'all' ? t.confirmDelAll : t.confirmDelSingle(deleteModal.name || '')}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={closeDeleteModal} disabled={deleteBulkAyMutation.isPending}>{t.btnCancel}</Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={deleteBulkAyMutation.isPending}>
                                    {deleteBulkAyMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {t.btnDelete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================= JUDUL HALAMAN ================= */}
            <div>
                <h1 className="text-2xl font-bold">{t.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
            </div>

            <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
                {/* ================= MENU TAB =================
                    Dibuat responsif dan bisa discroll mendatar; tab aktif berwarna hijau penuh */}
                <div className="w-full overflow-x-auto pb-1">
                    <TabsList className="h-auto gap-1 bg-muted/50 p-1 w-max min-w-full sm:min-w-0 flex">
                        {TAB_ITEMS.map(({ value, label, needsSchool }) => (
                            <TabsTrigger key={value} value={value} disabled={needsSchool && !hasSchool} className={TAB_TRIGGER_CLASS}>
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* ================= TAB: PROFIL SEKOLAH ================= */}
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
                        {/* ================= TAB: TAHUN AJARAN ================= */}
                        <TabsContent value="tahun-ajaran" className="mt-6">
                            <Card className="border-border shadow-sm max-w-4xl">
                                {/* TOOLBAR AKSI: flexbox responsif ("grow" di HP, ukuran sesuai isi di layar >= sm) */}
                                <CardHeader className="bg-muted/20 border-b border-border p-4 sm:p-6">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <CardTitle className="text-lg">{t.ayListTitle}</CardTitle>
                                            <CardDescription className="mt-1">{t.ayListDesc}</CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                                            {/* Hapus Pilihan: hanya Super Admin & Admin, dan hanya saat ada yang dicentang */}
                                            {canDeleteData && selectedAys.length > 0 && (
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                                                    className="h-10 grow justify-center gap-2 whitespace-nowrap sm:grow-0 sm:px-4"
                                                >
                                                    <Trash2 className="h-4 w-4 shrink-0" />
                                                    <span>{t.btnDeleteSel} ({selectedAys.length})</span>
                                                </Button>
                                            )}
                                            {/* Buat tahun ajaran baru */}
                                            <Button
                                                onClick={() => generateNewAcademicYear.mutate()}
                                                disabled={generateNewAcademicYear.isPending}
                                                className="h-10 grow justify-center gap-2 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white sm:grow-0 sm:px-4"
                                            >
                                                {generateNewAcademicYear.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="h-4 w-4 shrink-0" />}
                                                <span>{t.btnCreateNew}</span>
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 p-0">
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-border/50 bg-muted/30 whitespace-nowrap">
                                                    {/* Checkbox pilih semua: hanya untuk yang boleh menghapus */}
                                                    {canDeleteData && (
                                                        <th className="p-4 w-12 text-center">
                                                            <input type="checkbox" checked={selectedAys.length === deletableAys.length && deletableAys.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer" />
                                                        </th>
                                                    )}
                                                    <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase w-16">{t.colNo}</th>
                                                    {/* Kolom yang bisa diklik untuk mengurutkan */}
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
                                                    <tr><td colSpan={canDeleteData ? 5 : 4} className="px-6 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" /></td></tr>
                                                ) : sortedAcademicYears.length === 0 ? (
                                                    <tr><td colSpan={canDeleteData ? 5 : 4} className="px-6 py-8 text-center text-muted-foreground">{t.emptyData}</td></tr>
                                                ) : (
                                                    sortedAcademicYears.map((ay, idx) => (
                                                        <tr key={ay.id} className="hover:bg-muted/30 transition-colors whitespace-nowrap">
                                                            {/* Checkbox baris (dikunci untuk tahun ajaran aktif) */}
                                                            {canDeleteData && (
                                                                <td className="p-4 text-center">
                                                                    <input type="checkbox" checked={selectedAys.includes(ay.id)} onChange={() => toggleRow(ay.id)} disabled={ay.isActive} title={ay.isActive ? t.titleActiveNoDelete : undefined} className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
                                                                </td>
                                                            )}
                                                            <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{idx + 1}</td>
                                                            <td className="px-6 py-4 font-semibold text-foreground text-base">{ay.name}</td>
                                                            {/* Status aktif / tidak aktif */}
                                                            <td className="px-6 py-4 text-center">
                                                                {ay.isActive ? (
                                                                    <span className="inline-flex items-center bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> {t.statusActive}</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center bg-muted text-muted-foreground border border-border px-3 py-1 rounded-full text-xs font-medium">{t.statusInactive}</span>
                                                                )}
                                                            </td>
                                                            {/* Aksi: jadikan aktif & hapus satu data */}
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                                                    {!ay.isActive && (
                                                                        <Button variant="outline" size="sm" className="whitespace-nowrap shrink-0" onClick={() => setActiveAcademicYear.mutate(ay.id)} disabled={setActiveAcademicYear.isPending || deleteBulkAyMutation.isPending}>
                                                                            {t.btnSetActive}
                                                                        </Button>
                                                                    )}
                                                                    {/* Hapus satu tahun ajaran: Super Admin & Admin; tahun ajaran aktif tidak bisa dihapus */}
                                                                    {canDeleteData && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            disabled={ay.isActive}
                                                                            title={ay.isActive ? t.titleActiveNoDelete : undefined}
                                                                            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 shrink-0 disabled:opacity-30"
                                                                            onClick={() => setDeleteModal({ isOpen: true, type: 'single', id: ay.id, name: ay.name })}
                                                                        >
                                                                            <Trash2 className="w-4 h-4 shrink-0" />
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

                        {/* ================= TAB: DATA KELAS ================= */}
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
