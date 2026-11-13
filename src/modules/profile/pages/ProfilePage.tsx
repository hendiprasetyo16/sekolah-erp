import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
    User,
    Mail,
    ShieldCheck,
    KeyRound,
    Save,
    Loader2,
    Building2,
    Phone,
    MapPin,
    CreditCard,
    Eye,
    EyeOff,
    CheckCircle2,
    Lock,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { ROLE_LABELS } from '@/constants/app.constants';
import { getInitials } from '@/utils/format';

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

/**
 * Representasi data detail pengguna dari tabel relasi (`teachers`, `students`, atau `student_parents`).
 */
interface LinkedMemberDetail {
    id: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    nip?: string | null;
    nuptk?: string | null;
    nisn?: string | null;
}

type LinkedTableName = 'students' | 'teachers' | 'student_parents';

interface ProfileFormValues {
    fullName: string;
    phone?: string;
    address?: string;
}

interface PasswordFormValues {
    newPassword: string;
    confirmPassword: string;
}

/**
 * Menentukan tabel relasi profil berdasarkan peran pengguna.
 */
function resolveLinkedTable(role: string): LinkedTableName | null {
    if (role === 'SISWA') return 'students';
    if (['GURU', 'WALI_KELAS', 'STAFF_TU', 'STAFF_SARPRAS'].includes(role)) return 'teachers';
    if (role === 'ORANG_TUA') return 'student_parents';
    return null;
}

/**
 * Menghitung skor kekuatan kata sandi (0 - 4) untuk umpan balik visual.
 */
function evaluatePasswordStrength(password: string): number {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
}

export function ProfilePage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { user, school } = useAuthStore();

    const [activeTab, setActiveTab] = useState<'profil' | 'keamanan'>('profil');
    const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

    const activeSchoolId = school?.id ?? user?.schoolId ?? null;
    const linkedTable = user ? resolveLinkedTable(user.role) : null;

    // --- SKEMA VALIDASI ZOD DWIBAHASA ---
    const profileSchema = useMemo(
        () =>
            z.object({
                fullName: z
                    .string()
                    .trim()
                    .min(
                        3,
                        locale === 'id'
                            ? 'Nama lengkap minimal 3 karakter'
                            : 'Full name must be at least 3 characters'
                    ),
                phone: z.string().trim().optional(),
                address: z.string().trim().optional(),
            }),
        [locale]
    );

    const passwordSchema = useMemo(
        () =>
            z
                .object({
                    newPassword: z
                        .string()
                        .min(
                            8,
                            locale === 'id'
                                ? 'Kata sandi baru minimal 8 karakter'
                                : 'New password must be at least 8 characters'
                        ),
                    confirmPassword: z
                        .string()
                        .min(
                            8,
                            locale === 'id'
                                ? 'Konfirmasi kata sandi minimal 8 karakter'
                                : 'Confirm password must be at least 8 characters'
                        ),
                })
                .refine((data) => data.newPassword === data.confirmPassword, {
                    message:
                        locale === 'id'
                            ? 'Konfirmasi kata sandi tidak cocok'
                            : 'Password confirmation does not match',
                    path: ['confirmPassword'],
                }),
        [locale]
    );

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            fullName: user?.fullName ?? '',
            phone: '',
            address: '',
        },
    });

    const passwordForm = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordSchema),
        defaultValues: {
            newPassword: '',
            confirmPassword: '',
        },
    });

    const watchedNewPassword = passwordForm.watch('newPassword');
    const passwordStrength = evaluatePasswordStrength(watchedNewPassword);

    // --- QUERY: AMBIL DETAIL PROFIL TERKAIT (GURU / SISWA / ORANG TUA) ---
    const { data: detailData, isLoading: detailLoading } = useQuery<LinkedMemberDetail | null>({
        queryKey: ['user-detail', user?.id, user?.role, activeSchoolId],
        enabled: Boolean(user && linkedTable),
        queryFn: async () => {
            if (!user || !linkedTable) return null;

            let primaryQuery = supabase
                .from(linkedTable)
                .select('id, fullName, email, phone, address, nip, nuptk, nisn')
                .eq('email', user.email);

            if (activeSchoolId) {
                primaryQuery = primaryQuery.eq('schoolId', activeSchoolId);
            }

            const { data: primaryMatch } = await primaryQuery.maybeSingle();
            if (primaryMatch) {
                return primaryMatch as LinkedMemberDetail;
            }

            if (activeSchoolId) {
                const { data: fallbackMatch } = await supabase
                    .from(linkedTable)
                    .select('id, fullName, email, phone, address, nip, nuptk, nisn')
                    .eq('schoolId', activeSchoolId)
                    .eq('fullName', user.fullName)
                    .maybeSingle();

                if (fallbackMatch) {
                    return fallbackMatch as LinkedMemberDetail;
                }
            }

            return null;
        },
    });

    /**
     * Menyinkronkan nilai formulir ketika data pengguna atau detail relasi selesai dimuat.
     */
    useEffect(() => {
        if (!user) return;
        profileForm.reset({
            fullName: user.fullName ?? '',
            phone: detailData?.phone ?? '',
            address: detailData?.address ?? '',
        });
    }, [user, detailData, profileForm]);

    // --- MUTATION: SIMPAN PERUBAHAN PROFIL ---
    const updateProfileMutation = useMutation({
        mutationFn: async (values: ProfileFormValues): Promise<void> => {
            if (!user) throw new Error('User session not found');

            const { error: userUpdateError } = await supabase
                .from('users')
                .update({ fullName: values.fullName })
                .eq('id', user.id);

            if (userUpdateError) {
                throw new Error(userUpdateError.message);
            }

            await supabase.auth.updateUser({
                data: { full_name: values.fullName },
            });

            if (linkedTable && detailData?.id) {
                const linkedPayload: Record<string, string | null> = {
                    fullName: values.fullName,
                    phone: values.phone ? values.phone : null,
                    address: values.address ? values.address : null,
                };

                const { error: linkedError } = await supabase
                    .from(linkedTable)
                    .update(linkedPayload)
                    .eq('id', detailData.id);

                if (linkedError) {
                    throw new Error(linkedError.message);
                }
            }

            useAuthStore.setState({
                user: { ...user, fullName: values.fullName },
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['user-detail'] });
            toast.success(
                locale === 'id' ? 'Profil berhasil diperbarui.' : 'Profile updated successfully.'
            );
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    // --- MUTATION: PERBARUI KATA SANDI ---
    const updatePasswordMutation = useMutation({
        mutationFn: async (values: PasswordFormValues): Promise<void> => {
            const { error } = await supabase.auth.updateUser({
                password: values.newPassword,
            });

            if (error) {
                throw new Error(error.message);
            }
        },
        onSuccess: () => {
            toast.success(
                locale === 'id' ? 'Kata sandi berhasil diperbarui.' : 'Password updated successfully.'
            );
            passwordForm.reset();
            setShowNewPassword(false);
            setShowConfirmPassword(false);
        },
        onError: (err: Error) => {
            toast.error(err.message);
        },
    });

    if (!user) return null;

    const roleLabel = ROLE_LABELS[user.role]?.[locale] || user.role.replace(/_/g, ' ');

    const identityBadge = detailData?.nip
        ? { label: 'NIP', value: detailData.nip }
        : detailData?.nuptk
            ? { label: 'NUPTK', value: detailData.nuptk }
            : detailData?.nisn
                ? { label: 'NISN', value: detailData.nisn }
                : null;

    const strengthLabels =
        locale === 'id'
            ? ['Belum diisi', 'Lemah', 'Cukup', 'Kuat', 'Sangat Kuat']
            : ['Empty', 'Weak', 'Fair', 'Strong', 'Very Strong'];

    const strengthBarColors = [
        'bg-muted',
        'bg-rose-500',
        'bg-amber-500',
        'bg-emerald-500',
        'bg-teal-500',
    ];

    const hasMetadataRow =
        Boolean(school) ||
        (!detailLoading && (Boolean(identityBadge) || Boolean(detailData?.phone) || Boolean(detailData?.address)));

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-4xl space-y-6"
        >
            {/* =====================================================================
          HERO CARD PROFIL: EMERALD-TEAL GLASSMORPHISM (SELARAS TENANT SELECTOR)
         ===================================================================== */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-800/25 text-white shadow-md">
                {/* Lapisan 1: Gradien Emerald ke Teal */}
                <div className="absolute inset-0 bg-linear-to-br from-emerald-600 via-teal-700 to-emerald-950 dark:from-emerald-950 dark:via-teal-950 dark:to-slate-950" />

                {/* Lapisan 2: Pendar cahaya lembut (Ambient Glow) */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-20 -left-16 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
                    <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-teal-400/15 blur-3xl" />
                </div>

                {/* Lapisan 3: Pola grid halus */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)',
                        backgroundSize: '44px 44px',
                    }}
                />

                {/* Konten Utama di Atas Lapisan Kaca */}
                <div className="relative z-10 p-6 sm:p-8">
                    <div className="flex flex-col items-center justify-between gap-5 sm:flex-row sm:items-center">
                        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                            {/* Avatar Kaca (Frosted Glass Avatar) */}
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl font-bold text-white shadow-lg shadow-emerald-950/25 backdrop-blur-md sm:h-24 sm:w-24 sm:text-3xl">
                                {getInitials(user.fullName)}
                            </div>

                            <div>
                                <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                                        {user.fullName}
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-0.5 text-xs font-semibold text-emerald-50 backdrop-blur-md">
                                        <ShieldCheck size={13} />
                                        {roleLabel}
                                    </span>
                                </div>

                                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-emerald-100/90 sm:justify-start sm:text-sm">
                                    <Mail size={14} className="shrink-0 text-emerald-200" />
                                    <span>{user.email}</span>
                                </p>
                            </div>
                        </div>

                        {/* Lencana Status Verifikasi Kaca */}
                        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-3.5 py-2 text-xs font-semibold text-white shadow-xs backdrop-blur-md">
                            <CheckCircle2 size={14} className="text-emerald-200" />
                            <span>{locale === 'id' ? 'Akun Terverifikasi' : 'Verified Account'}</span>
                        </div>
                    </div>

                    {/* Baris Pill Metadata Kaca (Sekolah, Nomor Induk, Telepon, Alamat) */}
                    {hasMetadataRow && (
                        <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-white/15 pt-4">
                            {school && (
                                <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
                                    <Building2 size={14} className="shrink-0 text-emerald-200" />
                                    <span>{school.name}</span>
                                </div>
                            )}

                            {!detailLoading && identityBadge && (
                                <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 font-mono text-xs text-emerald-50 backdrop-blur-md">
                                    <CreditCard size={14} className="shrink-0 text-emerald-200" />
                                    <span>
                                        {identityBadge.label}: {identityBadge.value}
                                    </span>
                                </div>
                            )}

                            {!detailLoading && detailData?.phone && (
                                <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-emerald-50 backdrop-blur-md">
                                    <Phone size={14} className="shrink-0 text-emerald-200" />
                                    <span>{detailData.phone}</span>
                                </div>
                            )}

                            {!detailLoading && detailData?.address && (
                                <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-emerald-50 backdrop-blur-md">
                                    <MapPin size={14} className="shrink-0 text-emerald-200" />
                                    <span className="line-clamp-1">{detailData.address}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* =====================================================================
          KONTEN TAB PENGATURAN PROFIL & KEAMANAN SANDI
         ===================================================================== */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xs">
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => setActiveTab(val as 'profil' | 'keamanan')}
                >
                    <div className="border-b border-border bg-muted/20 px-4 py-3 sm:px-6">
                        <TabsList className="bg-muted/60">
                            <TabsTrigger value="profil" className="flex items-center gap-2 text-xs">
                                <User size={14} />
                                {locale === 'id' ? 'Informasi Pribadi' : 'Personal Information'}
                            </TabsTrigger>
                            <TabsTrigger value="keamanan" className="flex items-center gap-2 text-xs">
                                <KeyRound size={14} />
                                {locale === 'id' ? 'Keamanan & Sandi' : 'Security & Password'}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="p-6 sm:p-8">
                        {/* TAB 1: INFORMASI PRIBADI */}
                        <TabsContent value="profil" className="m-0 outline-none">
                            <div className="max-w-xl">
                                <h2 className="text-base font-bold text-foreground">
                                    {locale === 'id' ? 'Detail Identitas Pengguna' : 'User Identity Details'}
                                </h2>
                                <p className="mt-0.5 mb-6 text-xs text-muted-foreground">
                                    {locale === 'id'
                                        ? 'Perbarui nama tampilan dan informasi kontak yang terhubung dengan akun Anda.'
                                        : 'Update the display name and contact information linked to your account.'}
                                </p>

                                <Form {...profileForm}>
                                    <form
                                        onSubmit={profileForm.handleSubmit((data) =>
                                            updateProfileMutation.mutate(data)
                                        )}
                                        className="space-y-4"
                                    >
                                        {/* Email Read-Only */}
                                        <div className="space-y-1.5">
                                            <FormLabel className="text-xs font-semibold">
                                                {locale === 'id' ? 'Alamat Email Sistem' : 'System Email Address'}
                                            </FormLabel>
                                            <div className="relative">
                                                <Input
                                                    value={user.email}
                                                    disabled
                                                    className="cursor-not-allowed bg-muted/70 pr-9 text-muted-foreground"
                                                />
                                                <Lock
                                                    size={14}
                                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                {locale === 'id'
                                                    ? 'Email terikat dengan kredensial autentikasi utama dan hanya dapat diubah oleh Administrator.'
                                                    : 'Email is bound to primary authentication credentials and can only be changed by an Administrator.'}
                                            </p>
                                        </div>

                                        {/* Nama Lengkap */}
                                        <FormField
                                            control={profileForm.control}
                                            name="fullName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold">
                                                        {locale === 'id' ? 'Nama Lengkap' : 'Full Name'}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder={
                                                                locale === 'id'
                                                                    ? 'Masukkan nama lengkap beserta gelar'
                                                                    : 'Enter your full name'
                                                            }
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {/* Nomor Telepon & Alamat (Tampil jika akun tertaut dengan data Guru/Siswa/Orang Tua) */}
                                        {detailData && (
                                            <>
                                                <FormField
                                                    control={profileForm.control}
                                                    name="phone"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold">
                                                                {locale === 'id'
                                                                    ? 'Nomor Telepon / WhatsApp'
                                                                    : 'Phone / WhatsApp Number'}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input type="tel" placeholder="08xxxxxxxxxx" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={profileForm.control}
                                                    name="address"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-semibold">
                                                                {locale === 'id' ? 'Alamat Domisili' : 'Residential Address'}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    placeholder={
                                                                        locale === 'id'
                                                                            ? 'Masukkan alamat lengkap tempat tinggal'
                                                                            : 'Enter full residential address'
                                                                    }
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </>
                                        )}

                                        <div className="flex justify-end border-t border-border pt-4">
                                            <Button
                                                type="submit"
                                                disabled={updateProfileMutation.isPending}
                                                className="bg-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                                            >
                                                {updateProfileMutation.isPending ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Save className="mr-2 h-4 w-4" />
                                                )}
                                                {locale === 'id' ? 'Simpan Perubahan' : 'Save Changes'}
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>
                        </TabsContent>

                        {/* TAB 2: KEAMANAN & KATA SANDI */}
                        <TabsContent value="keamanan" className="m-0 outline-none">
                            <div className="max-w-xl">
                                <h2 className="text-base font-bold text-foreground">
                                    {locale === 'id' ? 'Pembaruan Kata Sandi' : 'Password Update'}
                                </h2>
                                <p className="mt-0.5 mb-6 text-xs text-muted-foreground">
                                    {locale === 'id'
                                        ? 'Gunakan kombinasi minimal 8 karakter berupa huruf besar, huruf kecil, dan angka untuk melindungi akun.'
                                        : 'Use at least 8 characters combining uppercase, lowercase, and numbers to protect your account.'}
                                </p>

                                <Form {...passwordForm}>
                                    <form
                                        onSubmit={passwordForm.handleSubmit((data) =>
                                            updatePasswordMutation.mutate(data)
                                        )}
                                        className="space-y-4"
                                    >
                                        {/* Kata Sandi Baru */}
                                        <FormField
                                            control={passwordForm.control}
                                            name="newPassword"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold">
                                                        {locale === 'id' ? 'Kata Sandi Baru' : 'New Password'}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Input
                                                                type={showNewPassword ? 'text' : 'password'}
                                                                placeholder="••••••••"
                                                                className="pr-10"
                                                                {...field}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowNewPassword((prev) => !prev)}
                                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                                                                aria-label={
                                                                    showNewPassword
                                                                        ? locale === 'id'
                                                                            ? 'Sembunyikan kata sandi'
                                                                            : 'Hide password'
                                                                        : locale === 'id'
                                                                            ? 'Lihat kata sandi'
                                                                            : 'Show password'
                                                                }
                                                            >
                                                                {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                                            </button>
                                                        </div>
                                                    </FormControl>

                                                    {/* Indikator Kekuatan Kata Sandi */}
                                                    {watchedNewPassword.length > 0 && (
                                                        <div className="pt-1.5">
                                                            <div className="grid grid-cols-4 gap-1.5">
                                                                {[1, 2, 3, 4].map((level) => (
                                                                    <div
                                                                        key={level}
                                                                        className={cn(
                                                                            'h-1.5 rounded-full transition-colors',
                                                                            passwordStrength >= level
                                                                                ? strengthBarColors[passwordStrength]
                                                                                : 'bg-muted'
                                                                        )}
                                                                    />
                                                                ))}
                                                            </div>
                                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                                {locale === 'id' ? 'Kekuatan sandi:' : 'Password strength:'}{' '}
                                                                <span className="font-semibold text-foreground">
                                                                    {strengthLabels[passwordStrength]}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    )}

                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {/* Konfirmasi Kata Sandi */}
                                        <FormField
                                            control={passwordForm.control}
                                            name="confirmPassword"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold">
                                                        {locale === 'id'
                                                            ? 'Konfirmasi Kata Sandi Baru'
                                                            : 'Confirm New Password'}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Input
                                                                type={showConfirmPassword ? 'text' : 'password'}
                                                                placeholder="••••••••"
                                                                className="pr-10"
                                                                {...field}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowConfirmPassword((prev) => !prev)}
                                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                                                                aria-label={
                                                                    showConfirmPassword
                                                                        ? locale === 'id'
                                                                            ? 'Sembunyikan konfirmasi kata sandi'
                                                                            : 'Hide confirm password'
                                                                        : locale === 'id'
                                                                            ? 'Lihat konfirmasi kata sandi'
                                                                            : 'Show confirm password'
                                                                }
                                                            >
                                                                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                                            </button>
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <div className="flex justify-end border-t border-border pt-4">
                                            <Button
                                                type="submit"
                                                disabled={updatePasswordMutation.isPending}
                                                className="bg-emerald-600 text-white shadow-xs hover:bg-emerald-700"
                                            >
                                                {updatePasswordMutation.isPending ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                )}
                                                {locale === 'id' ? 'Perbarui Kata Sandi' : 'Update Password'}
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