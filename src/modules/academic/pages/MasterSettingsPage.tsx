import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Save,
    Loader2,
    Plus,
    Trash2,
    CheckCircle2,
    School,
    AlertCircle,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
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

const toNumberOrNull = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const schoolSchema = z
    .object({
        name: z.string().trim().min(3, 'Nama sekolah minimal 3 karakter / School name min 3 chars'),
        npsn: z.string().trim().regex(/^\d{8}$/, 'NPSN harus terdiri dari tepat 8 angka / NPSN must contain exactly 8 digits'),
        level: z.string().min(1, 'Jenjang wajib dipilih / Level is required'),
        type: z.string().min(1, 'Status wajib dipilih / Status is required'),
        address: z.string().trim().min(5, 'Alamat wajib diisi / Address is required'),
        city: z.string().trim().min(3, 'Kota wajib diisi / City is required'),
        province: z.string().trim().min(3, 'Provinsi wajib diisi / Province is required'),
        phone: z.string().optional(),
        email: z.string().email('Email tidak valid / Invalid email').optional().or(z.literal('')),
        latitude: z
            .number()
            .nullable()
            .refine((v) => v === null || (v >= -90 && v <= 90), 'Latitude harus antara -90 dan 90'),
        longitude: z
            .number()
            .nullable()
            .refine((v) => v === null || (v >= -180 && v <= 180), 'Longitude harus antara -180 dan 180'),
        attendanceRadiusMeters: z.coerce
            .number()
            .int('Radius harus berupa bilangan bulat')
            .min(10, 'Radius minimal 10 meter / Radius min 10 meters')
            .max(10000, 'Radius maksimal 10.000 meter / Radius max 10,000 meters'),
    })
    .refine(
        (data) => (data.latitude === null) === (data.longitude === null),
        {
            message: 'Latitude dan Longitude harus diisi keduanya atau dikosongkan keduanya / Both Latitude and Longitude must be set or empty',
            path: ['longitude'],
        }
    );

type SchoolFormValues = z.infer<typeof schoolSchema>;

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

const TAB_TRIGGER_CLASS =
    'flex-1 whitespace-nowrap rounded-md px-5 py-2.5 text-muted-foreground transition-all hover:text-foreground ' +
    'data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white ' +
    'disabled:opacity-50';

type DeleteModalState = { isOpen: boolean; type: 'single' | 'bulk'; id?: string; name?: string };

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
    canEdit: boolean;
    onSuccess: (school: SchoolRecord) => void;
};

// ==========================================
// FORM PROFIL SEKOLAH
// ==========================================

function SchoolProfileForm({ schoolData, authUser, canEdit, onSuccess }: SchoolProfileFormProps) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isEdit = !!schoolData?.id;

    const t = {
        alert:
            locale === 'id'
                ? 'Anda belum memiliki data sekolah. Silakan isi form di bawah ini untuk mendaftarkan institusi Anda.'
                : 'You have no school data yet. Please fill out the form below to register your institution.',
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
        warnLinkUser:
            locale === 'id'
                ? 'Sekolah dibuat, tetapi akun Anda gagal dihubungkan ke sekolah ini. Silakan muat ulang halaman atau hubungi Super Admin.'
                : 'School created, but your account could not be linked to it. Please reload the page or contact a Super Admin.',
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
        },
    });

    const saveSchoolMutation = useMutation({
        mutationFn: async (payload: SchoolFormValues) => {
            const normalizedPayload = {
                name: payload.name.trim(),
                npsn: payload.npsn.trim(),
                level: payload.level.trim().toUpperCase(),
                type: payload.type.trim().toUpperCase(),
                address: payload.address.trim(),
                city: payload.city.trim(),
                province: payload.province.trim(),
                phone: payload.phone?.trim() || null,
                email: payload.email?.trim() || null,
                latitude: payload.latitude,
                longitude: payload.longitude,
                attendanceRadiusMeters: payload.attendanceRadiusMeters,
            };

            if (schoolData?.id) {
                const { data, error } = await supabase
                    .from('schools')
                    .update(normalizedPayload)
                    .eq('id', schoolData.id)
                    .select()
                    .single();
                if (error) throw new Error(error.message);
                return data;
            } else {
                const newSchoolId = crypto.randomUUID();
                const { data: newSchool, error: schoolErr } = await supabase
                    .from('schools')
                    .insert({ ...normalizedPayload, id: newSchoolId })
                    .select()
                    .single();
                if (schoolErr) throw new Error(schoolErr.message);

                if (authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                    const { error: linkErr } = await supabase.from('users').upsert({
                        id: authUser.id,
                        schoolId: newSchoolId,
                        email: authUser.email || '',
                        fullName: authUser.user_metadata?.full_name || 'Administrator',
                        role: 'ADMIN',
                    });
                    if (linkErr) toast.warning(t.warnLinkUser, { description: linkErr.message });
                }
                return newSchool;
            }
        },
        onSuccess: async (data) => {
            toast.success(isEdit ? t.toastSave : t.toastCreate);
            onSuccess(data);
            queryClient.setQueryData(['school-profile', data.id], data);

            if (!isEdit && authUser?.id && authUser?.role !== 'SUPER_ADMIN') {
                const { data: updatedProfile } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();
                if (updatedProfile) useAuthStore.getState().setUser(updatedProfile);
            }
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const isFormDisabled = !canEdit || saveSchoolMutation.isPending;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveSchoolMutation.mutate(data))} className="space-y-6">
                {!isEdit && (
                    <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>{t.alert}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.nameLabel}</FormLabel>
                                <FormControl>
                                    <Input {...field} disabled={isFormDisabled} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="npsn"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>NPSN</FormLabel>
                                <FormControl>
                                    <Input maxLength={8} inputMode="numeric" {...field} disabled={isFormDisabled} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="level"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.levelLabel}</FormLabel>
                                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isFormDisabled}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t.phLevel} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {['TK', 'SD', 'SMP', 'SMA', 'SMK', 'MI', 'MTs', 'MA'].map((lvl) => (
                                            <SelectItem key={lvl} value={lvl}>
                                                {lvl}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.statusLabel}</FormLabel>
                                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isFormDisabled}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t.phStatus} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="NEGERI">{t.statusPublic}</SelectItem>
                                        <SelectItem value="SWASTA">{t.statusPrivate}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="space-y-4 border-t border-border pt-4">
                    <h4 className="font-medium">{t.contactLabel}</h4>
                    <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.address}</FormLabel>
                                <FormControl>
                                    <Input {...field} disabled={isFormDisabled} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.city}</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled={isFormDisabled} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="province"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.province}</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled={isFormDisabled} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.phone}</FormLabel>
                                    <FormControl>
                                        <Input {...field} value={field.value ?? ''} disabled={isFormDisabled} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input type="email" {...field} value={field.value ?? ''} disabled={isFormDisabled} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-4 border-t border-border pt-4">
                    <h4 className="font-medium text-emerald-600 dark:text-emerald-400">{t.gpsLabel}</h4>
                    <div className="mb-6">
                        <MapComponent
                            latitude={form.watch('latitude') ?? null}
                            longitude={form.watch('longitude') ?? null}
                            radius={form.watch('attendanceRadiusMeters') ?? 0}
                            onChange={(lat: number, lng: number) => {
                                if (!canEdit) return;
                                form.setValue('latitude', lat, { shouldDirty: true, shouldValidate: true });
                                form.setValue('longitude', lng, { shouldDirty: true, shouldValidate: true });
                            }}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <FormField
                            control={form.control}
                            name="latitude"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="any"
                                            disabled={isFormDisabled}
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(toNumberOrNull(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="longitude"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="any"
                                            disabled={isFormDisabled}
                                            value={field.value ?? ''}
                                            onChange={(e) => field.onChange(toNumberOrNull(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="attendanceRadiusMeters"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.radiusLabel}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min={10}
                                            max={10000}
                                            step={1}
                                            disabled={isFormDisabled}
                                            value={field.value ?? 200}
                                            onChange={(e) =>
                                                field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                                            }
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {canEdit && (
                    <div className="mt-8 flex flex-wrap justify-end gap-3 border-t pt-6">
                        <Button
                            type="submit"
                            disabled={saveSchoolMutation.isPending}
                            className="h-10 w-full grow justify-center gap-2 whitespace-nowrap bg-emerald-600 px-6 text-white hover:bg-emerald-700 sm:w-auto sm:grow-0"
                        >
                            {saveSchoolMutation.isPending ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 shrink-0" />
                            )}
                            <span>{isEdit ? t.btnSave : t.btnCreate}</span>
                        </Button>
                    </div>
                )}
            </form>
        </Form>
    );
}

// ==========================================
// HALAMAN UTAMA: DATA MASTER SEKOLAH
// ==========================================

export function MasterSettingsPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const location = useLocation();
    const { school: authSchool, setSchool, user } = useAuthStore();

    const role = user?.role;
    const canManageMaster = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const canDeleteData = canManageMaster;

    const [activeTab, setActiveTab] = useState<string>(location.state?.tab || 'profil');
    const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });
    const [selectedAys, setSelectedAys] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof AcademicYear; direction: 'asc' | 'desc' } | null>({
        key: 'startYear',
        direction: 'desc',
    });

    const modalRef = useRef<HTMLDivElement>(null);

    const t = {
        title: locale === 'id' ? 'Data Master Sekolah' : 'Master School Data',
        desc:
            locale === 'id'
                ? 'Pengaturan terpusat untuk Profil Institusi, Tahun Ajaran, dan Kelas.'
                : 'Centralized settings for Institution Profile, Academic Years, and Classes.',
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
        titleActiveNoDelete:
            locale === 'id'
                ? 'Tahun ajaran aktif tidak dapat dihapus'
                : 'The active academic year cannot be deleted',
        confirmDelTitle: locale === 'id' ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        confirmDelBulk: (n: number) =>
            locale === 'id'
                ? `Yakin ingin menghapus ${n} data tahun ajaran?`
                : `Are you sure you want to delete ${n} academic years?`,
        confirmDelSingle: (name: string) =>
            locale === 'id'
                ? `Yakin ingin menghapus tahun ajaran "${name}"?`
                : `Are you sure you want to delete academic year "${name}"?`,
        btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
        btnDelete: locale === 'id' ? 'Hapus' : 'Delete',
        toastAyCreated: locale === 'id' ? 'Tahun ajaran berhasil dibuat' : 'Academic year successfully created',
        toastAyActive: locale === 'id' ? 'Tahun ajaran aktif diperbarui' : 'Active academic year updated',
        toastAyDeleted: locale === 'id' ? 'Data terpilih berhasil dihapus' : 'Selected data successfully deleted',
        toastActiveBlocked:
            locale === 'id'
                ? 'Tahun ajaran yang sedang aktif tidak boleh dihapus. Jadikan tahun ajaran lain aktif terlebih dahulu.'
                : 'The active academic year cannot be deleted. Set another academic year as active first.',
        identitas: locale === 'id' ? 'Identitas Institusi' : 'Institution Identity',
        selectAllLabel: locale === 'id' ? 'Pilih semua tahun ajaran non-aktif' : 'Select all inactive academic years',
    };

    const { data: schoolData, isLoading: isSchoolLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            return getSchoolRecord(authSchool.id);
        },
    });

    const { data: academicYearsResponse, isLoading: isAyLoading } = useQuery({
        queryKey: ['academic-years', authSchool?.id],
        queryFn: () => academicService.getAcademicYears(authSchool?.id || ''),
        enabled: !!authSchool?.id,
    });

    const academicYears = useMemo(
        () => academicYearsResponse?.data ?? [],
        [academicYearsResponse?.data]
    );

    const deletableAys = useMemo(
        () => academicYears.filter((ay) => !ay.isActive),
        [academicYears]
    );

    useEffect(() => {
        const allowedIds = new Set(deletableAys.map((ay) => ay.id));
        setSelectedAys((prev) => {
            const next = prev.filter((id) => allowedIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [deletableAys]);

    const hasSchool = !!schoolData;
    const currentTab = hasSchool ? activeTab : 'profil';

    const sortedAcademicYears = useMemo(() => {
        const sortable = [...academicYears];
        if (sortConfig !== null) {
            sortable.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                const comparison = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, {
                    numeric: true,
                    sensitivity: 'base',
                });
                if (comparison < 0) return sortConfig.direction === 'asc' ? -1 : 1;
                if (comparison > 0) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [academicYears, sortConfig]);

    const handleSort = (key: keyof AcademicYear) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const toggleRow = (id: string) => {
        const row = academicYears.find((ay) => ay.id === id);
        if (!row || row.isActive) return;
        setSelectedAys((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
    };

    const toggleAll = () => {
        if (selectedAys.length === deletableAys.length && deletableAys.length > 0) setSelectedAys([]);
        else setSelectedAys(deletableAys.map((ay) => ay.id));
    };

    const closeDeleteModal = useCallback(() => {
        setDeleteModal({ isOpen: false, type: 'single' });
    }, []);

    useEffect(() => {
        if (!deleteModal.isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeDeleteModal();
        };
        window.addEventListener('keydown', onKeyDown);
        const timer = setTimeout(() => modalRef.current?.focus(), 50);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            clearTimeout(timer);
        };
    }, [deleteModal.isOpen, closeDeleteModal]);

    const generateNewAcademicYear = useMutation({
        mutationFn: async () => {
            const schoolId = authSchool?.id;
            if (!schoolId) throw new Error('School ID tidak ditemukan. Muat ulang halaman atau masuk kembali.');

            let nextStartYear = new Date().getFullYear();
            if (academicYears.length > 0) {
                const maxYear = Math.max(...academicYears.map((ay) => ay.startYear));
                nextStartYear = maxYear + 1;
            }

            const proposedName = `${nextStartYear}/${nextStartYear + 1}`;
            if (academicYears.some((ay) => ay.name === proposedName || ay.startYear === nextStartYear)) {
                throw new Error(`Tahun ajaran ${proposedName} sudah tersedia.`);
            }

            // Jika belum ada satu pun tahun ajaran aktif, langsung aktifkan tahun ajaran pertama
            const shouldAutoActivate = !academicYears.some((ay) => ay.isActive);

            const { error } = await supabase.from('academic_years').insert({
                id: crypto.randomUUID(),
                schoolId,
                name: proposedName,
                startYear: nextStartYear,
                endYear: nextStartYear + 1,
                isActive: shouldAutoActivate,
            });
            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            toast.success(t.toastAyCreated);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            queryClient.invalidateQueries({ queryKey: ['active-academic-year'] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const setActiveAcademicYear = useMutation({
        mutationFn: async (id: string) => {
            const schoolId = authSchool?.id;
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            if (!academicYears.some((ay) => ay.id === id)) {
                throw new Error('Tahun ajaran tidak ditemukan pada sekolah ini.');
            }
            const previousActiveId = academicYears.find((ay) => ay.isActive)?.id;

            const { error: offError } = await supabase
                .from('academic_years')
                .update({ isActive: false })
                .eq('schoolId', schoolId);
            if (offError) throw new Error(offError.message);

            const { error } = await supabase
                .from('academic_years')
                .update({ isActive: true })
                .eq('schoolId', schoolId)
                .eq('id', id);
            if (error) {
                if (previousActiveId) {
                    await supabase
                        .from('academic_years')
                        .update({ isActive: true })
                        .eq('schoolId', schoolId)
                        .eq('id', previousActiveId);
                }
                throw new Error(error.message);
            }
        },
        onSuccess: () => {
            toast.success(t.toastAyActive);
            queryClient.invalidateQueries({ queryKey: ['academic-years', authSchool?.id] });
            queryClient.invalidateQueries({ queryKey: ['active-academic-year'] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

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
            queryClient.invalidateQueries({ queryKey: ['classes-list'] });
            setSelectedAys([]);
            closeDeleteModal();
        },
        onError: (e: Error) => {
            toast.error(e.message);
            closeDeleteModal();
        },
    });

    const confirmDelete = () => {
        if (!canDeleteData) {
            closeDeleteModal();
            return;
        }

        const ids =
            deleteModal.type === 'single' && deleteModal.id
                ? [deleteModal.id]
                : deleteModal.type === 'bulk'
                    ? selectedAys
                    : [];

        if (ids.length === 0) {
            closeDeleteModal();
            return;
        }

        if (academicYears.some((ay) => ids.includes(ay.id) && ay.isActive)) {
            toast.error(t.toastActiveBlocked);
            closeDeleteModal();
            return;
        }

        deleteBulkAyMutation.mutate(ids);
    };

    const TAB_ITEMS = [
        { value: 'profil', label: t.tabProfile, needsSchool: false },
        { value: 'tahun-ajaran', label: t.tabAy, needsSchool: true },
        { value: 'kelas', label: t.tabClass, needsSchool: true },
    ];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* ================= MODAL KONFIRMASI HAPUS ================= */}
            <AnimatePresence>
                {deleteModal.isOpen && canDeleteData && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget && !deleteBulkAyMutation.isPending) {
                                closeDeleteModal();
                            }
                        }}
                    >
                        <motion.div
                            ref={modalRef}
                            tabIndex={-1}
                            role="alertdialog"
                            aria-modal="true"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl outline-none"
                        >
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-100 dark:border-red-500/30 dark:bg-red-500/20">
                                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">{t.confirmDelTitle}</h3>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {deleteModal.type === 'bulk'
                                    ? t.confirmDelBulk(selectedAys.length)
                                    : t.confirmDelSingle(deleteModal.name || '')}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="outline"
                                    onClick={closeDeleteModal}
                                    disabled={deleteBulkAyMutation.isPending}
                                >
                                    {t.btnCancel}
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={confirmDelete}
                                    disabled={deleteBulkAyMutation.isPending}
                                >
                                    {deleteBulkAyMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}{' '}
                                    {t.btnDelete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================= JUDUL HALAMAN ================= */}
            <div>
                <h1 className="text-2xl font-bold">{t.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
            </div>

            <Tabs value={currentTab} onValueChange={setActiveTab} className="w-full">
                {/* ================= MENU TAB ================= */}
                <div className="w-full overflow-x-auto pb-1">
                    <TabsList className="flex h-auto w-max min-w-full gap-1 bg-muted/50 p-1 sm:min-w-0">
                        {TAB_ITEMS.map(({ value, label, needsSchool }) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                disabled={needsSchool && !hasSchool}
                                className={TAB_TRIGGER_CLASS}
                            >
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* ================= TAB: PROFIL SEKOLAH ================= */}
                <TabsContent value="profil" className="mt-6">
                    <Card className="max-w-4xl border-border shadow-sm">
                        <CardHeader className="border-b border-border bg-muted/20">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <School className="h-5 w-5 text-emerald-600" /> {t.identitas}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {isSchoolLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                                </div>
                            ) : (
                                <SchoolProfileForm
                                    key={schoolData?.id ?? 'new-school'}
                                    schoolData={schoolData}
                                    authUser={user}
                                    canEdit={canManageMaster}
                                    onSuccess={setSchool}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {hasSchool && (
                    <>
                        {/* ================= TAB: TAHUN AJARAN ================= */}
                        <TabsContent value="tahun-ajaran" className="mt-6">
                            <Card className="max-w-4xl border-border shadow-sm">
                                <CardHeader className="border-b border-border bg-muted/20 p-4 sm:p-6">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <CardTitle className="text-lg">{t.ayListTitle}</CardTitle>
                                            <CardDescription className="mt-1">{t.ayListDesc}</CardDescription>
                                        </div>
                                        {canManageMaster && (
                                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                                                {canDeleteData && selectedAys.length > 0 && (
                                                    <Button
                                                        variant="destructive"
                                                        onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                                                        className="h-10 grow justify-center gap-2 whitespace-nowrap sm:grow-0 sm:px-4"
                                                    >
                                                        <Trash2 className="h-4 w-4 shrink-0" />
                                                        <span>
                                                            {t.btnDeleteSel} ({selectedAys.length})
                                                        </span>
                                                    </Button>
                                                )}
                                                <Button
                                                    onClick={() => generateNewAcademicYear.mutate()}
                                                    disabled={generateNewAcademicYear.isPending}
                                                    className="h-10 grow justify-center gap-2 whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 sm:grow-0 sm:px-4"
                                                >
                                                    {generateNewAcademicYear.isPending ? (
                                                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                                    ) : (
                                                        <Plus className="h-4 w-4 shrink-0" />
                                                    )}
                                                    <span>{t.btnCreateNew}</span>
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 pt-0">
                                    <div className="w-full overflow-x-auto">
                                        <table className="w-full border-collapse text-left">
                                            <thead>
                                                <tr className="whitespace-nowrap border-b border-border/50 bg-muted/30">
                                                    {canDeleteData && (
                                                        <th className="w-12 p-4 text-center">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={t.selectAllLabel}
                                                                checked={
                                                                    selectedAys.length === deletableAys.length &&
                                                                    deletableAys.length > 0
                                                                }
                                                                disabled={deletableAys.length === 0}
                                                                onChange={toggleAll}
                                                                className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                            />
                                                        </th>
                                                    )}
                                                    <th className="w-16 px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">
                                                        {t.colNo}
                                                    </th>
                                                    <th
                                                        className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50"
                                                        onClick={() => handleSort('name')}
                                                    >
                                                        <div className="flex items-center gap-1">
                                                            {t.colAy}{' '}
                                                            {sortConfig?.key === 'name' ? (
                                                                sortConfig.direction === 'asc' ? (
                                                                    <ArrowUp size={14} />
                                                                ) : (
                                                                    <ArrowDown size={14} />
                                                                )
                                                            ) : (
                                                                <ArrowUpDown size={14} className="opacity-40" />
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th
                                                        className="cursor-pointer select-none px-6 py-4 text-center text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50"
                                                        onClick={() => handleSort('isActive')}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            {t.colStatus}{' '}
                                                            {sortConfig?.key === 'isActive' ? (
                                                                sortConfig.direction === 'asc' ? (
                                                                    <ArrowUp size={14} />
                                                                ) : (
                                                                    <ArrowDown size={14} />
                                                                )
                                                            ) : (
                                                                <ArrowUpDown size={14} className="opacity-40" />
                                                            )}
                                                        </div>
                                                    </th>
                                                    {canManageMaster && (
                                                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground">
                                                            {t.colAction}
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                {isAyLoading ? (
                                                    <tr>
                                                        <td
                                                            colSpan={canDeleteData ? 5 : canManageMaster ? 4 : 3}
                                                            className="px-6 py-12 text-center"
                                                        >
                                                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                                                        </td>
                                                    </tr>
                                                ) : sortedAcademicYears.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={canDeleteData ? 5 : canManageMaster ? 4 : 3}
                                                            className="px-6 py-8 text-center text-muted-foreground"
                                                        >
                                                            {t.emptyData}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sortedAcademicYears.map((ay, idx) => (
                                                        <tr
                                                            key={ay.id}
                                                            className="whitespace-nowrap transition-colors hover:bg-muted/30"
                                                        >
                                                            {canDeleteData && (
                                                                <td className="p-4 text-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        aria-label={ay.name}
                                                                        checked={selectedAys.includes(ay.id)}
                                                                        onChange={() => toggleRow(ay.id)}
                                                                        disabled={ay.isActive}
                                                                        title={
                                                                            ay.isActive
                                                                                ? t.titleActiveNoDelete
                                                                                : undefined
                                                                        }
                                                                        className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                                    />
                                                                </td>
                                                            )}
                                                            <td className="px-6 py-4 text-sm font-medium text-muted-foreground">
                                                                {idx + 1}
                                                            </td>
                                                            <td className="px-6 py-4 text-base font-semibold text-foreground">
                                                                {ay.name}
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                {ay.isActive ? (
                                                                    <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{' '}
                                                                        {t.statusActive}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                                                                        {t.statusInactive}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {canManageMaster && (
                                                                <td className="px-6 py-4 text-right">
                                                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                                                        {!ay.isActive && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="shrink-0 whitespace-nowrap"
                                                                                onClick={() =>
                                                                                    setActiveAcademicYear.mutate(ay.id)
                                                                                }
                                                                                disabled={
                                                                                    setActiveAcademicYear.isPending ||
                                                                                    deleteBulkAyMutation.isPending
                                                                                }
                                                                            >
                                                                                {t.btnSetActive}
                                                                            </Button>
                                                                        )}
                                                                        {canDeleteData && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                aria-label={`${t.btnDelete} ${ay.name}`}
                                                                                disabled={ay.isActive}
                                                                                title={
                                                                                    ay.isActive
                                                                                        ? t.titleActiveNoDelete
                                                                                        : undefined
                                                                                }
                                                                                className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-500/10"
                                                                                onClick={() =>
                                                                                    setDeleteModal({
                                                                                        isOpen: true,
                                                                                        type: 'single',
                                                                                        id: ay.id,
                                                                                        name: ay.name,
                                                                                    })
                                                                                }
                                                                            >
                                                                                <Trash2 className="h-4 w-4 shrink-0" />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            )}
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
                            <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                                <ClassListPage />
                            </div>
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </motion.div>
    );
}