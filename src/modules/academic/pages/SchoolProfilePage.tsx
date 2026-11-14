import type { ComponentType } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, School, AlertCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { LocationPickerMap } from '@/components/map/LocationPickerMap';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// ==========================================
// SCHEMA VALIDASI PROFIL SEKOLAH
// ==========================================

const toNumberOrNull = (v: unknown): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const schoolSchema = z
    .object({
        name: z.string().trim().min(3, 'Nama sekolah minimal 3 karakter / School name min 3 chars'),
        npsn: z
            .string()
            .trim()
            .regex(/^\d{8}$/, 'NPSN harus terdiri dari tepat 8 angka / NPSN must contain exactly 8 digits'),
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
    .refine((data) => (data.latitude === null) === (data.longitude === null), {
        message:
            'Latitude dan Longitude harus diisi keduanya atau dikosongkan keduanya / Both Latitude and Longitude must be set or empty',
        path: ['longitude'],
    });

type SchoolFormValues = z.infer<typeof schoolSchema>;

type LocationPickerMapProps = {
    latitude: number | null;
    longitude: number | null;
    radius: number;
    onChange: (latitude: number, longitude: number) => void;
};

const MapComponent = LocationPickerMap as unknown as ComponentType<LocationPickerMapProps>;

async function getSchoolRecord(id: string) {
    const { data, error } = await supabase.from('schools').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

type SchoolRecord = NonNullable<Awaited<ReturnType<typeof getSchoolRecord>>>;

interface SchoolProfileFormProps {
    schoolData: (Partial<SchoolFormValues> & { id?: string }) | null | undefined;
    canEdit: boolean;
    canCreate: boolean;
    onSuccess: (school: SchoolRecord) => void;
}

function SchoolProfileForm({ schoolData, canEdit, canCreate, onSuccess }: SchoolProfileFormProps) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const isEdit = Boolean(schoolData?.id);

    const t = {
        alertSuperAdmin: isId
            ? 'Belum ada data sekolah terpilih. Silakan lengkapi formulir di bawah ini untuk mendaftarkan institusi sekolah baru.'
            : 'No school selected yet. Please complete the form below to register a new school institution.',
        alertNoSchoolAccess: isId
            ? 'Akun Anda belum terhubung dengan data sekolah mana pun. Silakan hubungi Super Admin untuk menghubungkan akun Anda.'
            : 'Your account is not linked to any school yet. Please contact a Super Admin.',
        nameLabel: isId ? 'Nama Sekolah' : 'School Name',
        levelLabel: isId ? 'Jenjang' : 'Level',
        statusLabel: isId ? 'Status' : 'Status',
        contactLabel: isId ? 'Alamat & Kontak' : 'Address & Contact',
        address: isId ? 'Alamat Lengkap' : 'Full Address',
        city: isId ? 'Kabupaten / Kota' : 'City / District',
        province: isId ? 'Provinsi' : 'Province',
        phone: isId ? 'Telepon' : 'Phone',
        gpsLabel: isId ? 'Pengaturan Lokasi GPS (Absensi)' : 'GPS Location Settings (Attendance)',
        radiusLabel: isId ? 'Radius Toleransi (Meter)' : 'Tolerance Radius (Meters)',
        btnSave: isId ? 'Simpan Perubahan' : 'Save Changes',
        btnCreate: isId ? 'Buat Institusi Baru' : 'Create New Institution',
        toastSave: isId ? 'Profil sekolah berhasil disimpan' : 'School profile successfully saved',
        toastCreate: isId
            ? 'Sekolah baru berhasil dibuat! Tab Tahun Ajaran & Kelas kini sudah aktif.'
            : 'New school created! Academic Year & Class tabs are now unlocked.',
        phLevel: isId ? 'Pilih Jenjang' : 'Select Level',
        phStatus: isId ? 'Pilih Status' : 'Select Status',
        statusPublic: isId ? 'NEGERI / PUBLIC' : 'PUBLIC',
        statusPrivate: isId ? 'SWASTA / PRIVATE' : 'PRIVATE',
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
            }

            if (!canCreate) {
                throw new Error(t.alertNoSchoolAccess);
            }

            const newSchoolId = crypto.randomUUID();
            const { data: newSchool, error: schoolErr } = await supabase
                .from('schools')
                .insert({ ...normalizedPayload, id: newSchoolId })
                .select()
                .single();
            if (schoolErr) throw new Error(schoolErr.message);
            return newSchool;
        },
        onSuccess: (data) => {
            toast.success(isEdit ? t.toastSave : t.toastCreate);
            onSuccess(data);
            queryClient.setQueryData(['school-profile', data.id], data);
        },
        onError: (error: Error) => toast.error(error.message),
    });

    if (!isEdit && !canCreate) {
        return (
            <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{t.alertNoSchoolAccess}</p>
            </div>
        );
    }

    const isFormDisabled = (isEdit ? !canEdit : !canCreate) || saveSchoolMutation.isPending;

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit((data) => saveSchoolMutation.mutate(data))}
                className="space-y-6"
            >
                {!isEdit && (
                    <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p>{t.alertSuperAdmin}</p>
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
                                if (isFormDisabled) return;
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

                {(isEdit ? canEdit : canCreate) && (
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

/**
 * Komponen Konten Tab Profil Sekolah (digunakan di dalam MasterSettingsPage).
 */
export function SchoolProfileSection() {
    const { locale } = useTranslation();
    const { school: authSchool, setSchool, user } = useAuthStore();
    const isId = locale === 'id';

    const role = user?.role;
    const isAllowedRole = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const canEdit = isAllowedRole;
    const canCreate = role === 'SUPER_ADMIN';

    const { data: schoolData, isLoading } = useQuery({
        queryKey: ['school-profile', authSchool?.id],
        queryFn: async () => {
            if (!authSchool?.id) return null;
            return getSchoolRecord(authSchool.id);
        },
        enabled: isAllowedRole,
    });

    if (!isAllowedRole) {
        return (
            <Card className="max-w-2xl border-destructive/30 shadow-sm">
                <CardContent className="flex items-start gap-3 p-6 text-destructive">
                    <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" />
                    <div>
                        <h3 className="font-semibold">
                            {isId ? 'Akses Dibatasi' : 'Access Restricted'}
                        </h3>
                        <p className="mt-1 text-sm">
                            {isId
                                ? 'Profil Sekolah dan Pengaturan Lokasi GPS Absensi hanya dapat diakses oleh Super Admin dan Admin Sekolah.'
                                : 'School Profile and Attendance GPS Location Settings can only be accessed by Super Admin and School Admin.'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="max-w-4xl border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <School className="h-5 w-5 text-emerald-600" />
                    {isId ? 'Identitas Institusi & Titik GPS Absensi' : 'Institution Identity & Attendance GPS'}
                </CardTitle>
                <CardDescription>
                    {isId
                        ? 'Kelola identitas sekolah serta koordinat GPS dan radius toleransi kehadiran pegawai.'
                        : 'Manage school identity, GPS coordinates, and staff attendance tolerance radius.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                    </div>
                ) : (
                    <SchoolProfileForm
                        key={schoolData?.id ?? 'new-school'}
                        schoolData={schoolData}
                        canEdit={canEdit}
                        canCreate={canCreate}
                        onSuccess={setSchool}
                    />
                )}
            </CardContent>
        </Card>
    );
}

export function SchoolProfilePage() {
    return <SchoolProfileSection />;
}