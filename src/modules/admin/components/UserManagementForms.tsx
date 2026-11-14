import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    AlertCircle,
    DatabaseZap,
    Edit,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Plus,
    Sparkles,
    Trash2,
    UserPlus,
    X,
} from 'lucide-react';

import { translations } from '@/constants/translations';
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
import {
    ADDITIONAL_ROLE_OPTIONS,
    ROLE_DISPLAY_NAMES,
    ROLE_VALUES,
    mapTugasTambahanToRoles,
    type AppUser,
    type AppUserRole,
    type CreateUserFormValues,
    type EditUserFormValues,
    type ResetPasswordFormValues,
} from '../types/user-management.types';

type Lang = 'id' | 'en';

/**
 * Mengambil label tampilan role dengan fallback aman ke `ROLE_DISPLAY_NAMES`
 * agar role baru seperti `STAFF_PERPUS` tidak pernah kosong atau error.
 */
function getRoleLabel(role: AppUserRole, lang: Lang): string {
    const dict = translations[lang].userManagement as Record<string, string | undefined>;
    const translated = dict[`role_${role}`];
    if (typeof translated === 'string' && translated.trim().length > 0) {
        return translated;
    }
    return ROLE_DISPLAY_NAMES[role]?.[lang] ?? role;
}

/**
 * Mengecek apakah role utama berhak memiliki tugas tambahan pegawai sekolah.
 */
function canHaveAdditionalRoles(role: AppUserRole): boolean {
    return role !== 'SUPER_ADMIN' && role !== 'SISWA' && role !== 'ORANG_TUA';
}

interface BaseModalWrapperProps {
    onClose: () => void;
    children: ReactNode;
    maxWidthClass?: string;
    borderClass?: string;
    centered?: boolean;
}

function BaseModalWrapper({
    onClose,
    children,
    maxWidthClass = 'max-w-md',
    borderClass = 'border',
    centered = false,
}: BaseModalWrapperProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`max-h-[90dvh] w-full overflow-y-auto ${maxWidthClass} rounded-2xl ${borderClass} bg-card p-6 shadow-2xl ${centered ? 'text-center' : ''
                    }`}
            >
                {children}
            </motion.div>
        </div>
    );
}

// ==========================================
// 1. MODAL TAMBAH PENGGUNA
// ==========================================

interface AddUserModalProps {
    lang: Lang;
    activeSchoolId: string | null;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (values: CreateUserFormValues) => void;
}

export function AddUserModal({
    lang,
    activeSchoolId,
    isSubmitting,
    onClose,
    onSubmit,
}: AddUserModalProps) {
    const [showPassword, setShowPassword] = useState(false);

    const tGlobal = (key: keyof typeof translations.id.common) => translations[lang].common[key];
    const tUM = (key: keyof typeof translations.id.userManagement) =>
        translations[lang].userManagement[key];

    const schema = useMemo(
        () =>
            z.object({
                fullName: z
                    .string()
                    .trim()
                    .min(3, lang === 'id' ? 'Minimal 3 karakter' : 'Minimum 3 characters'),
                email: z
                    .string()
                    .trim()
                    .email(lang === 'id' ? 'Format email tidak valid' : 'Invalid email format'),
                password: z
                    .string()
                    .min(8, lang === 'id' ? 'Minimal 8 karakter' : 'Minimum 8 characters'),
                role: z.enum(ROLE_VALUES),
                additionalRoles: z.array(z.enum(ROLE_VALUES)),
            }),
        [lang]
    );

    const form = useForm<CreateUserFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            fullName: '',
            email: '',
            password: '',
            role: 'GURU',
            additionalRoles: [],
        },
    });

    const selectedRole = form.watch('role');
    const selectedAdditionalRoles = form.watch('additionalRoles');
    const missingSchoolWarning = selectedRole !== 'SUPER_ADMIN' && !activeSchoolId;
    const showAdditionalSelector = canHaveAdditionalRoles(selectedRole);

    const handleToggleAdditionalRole = (dutyRole: AppUserRole, checked: boolean) => {
        const current = form.getValues('additionalRoles') ?? [];
        const next = checked
            ? Array.from(new Set([...current, dutyRole]))
            : current.filter((item) => item !== dutyRole);
        form.setValue('additionalRoles', next, { shouldDirty: true });
    };

    const handleClose = () => {
        form.reset();
        setShowPassword(false);
        onClose();
    };

    return (
        <BaseModalWrapper onClose={handleClose} maxWidthClass="max-w-lg">
            <div className="mb-4 flex justify-between">
                <div>
                    <h3 className="text-xl font-bold">{tUM('modalAddTitle')}</h3>
                    <p className="text-sm text-muted-foreground">{tUM('modalAddSub')}</p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tGlobal('cancel')}
                    onClick={handleClose}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {missingSchoolWarning && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {lang === 'id'
                            ? 'Belum ada sekolah aktif yang dipilih. Pilih sekolah terlebih dahulu sebelum membuat akun selain Super Admin.'
                            : 'No active school selected. Please select a school before creating non-Super Admin accounts.'}
                    </span>
                </div>
            )}

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tGlobal('name')}</FormLabel>
                                <FormControl>
                                    <Input placeholder="John Doe" {...field} />
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
                                    <Input
                                        type="email"
                                        placeholder="john@sekolah.sch.id"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {lang === 'id' ? 'Role Utama' : 'Primary Role'}
                                </FormLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={(nextRole) => {
                                        const typedRole = nextRole as AppUserRole;
                                        field.onChange(typedRole);
                                        if (!canHaveAdditionalRoles(typedRole)) {
                                            form.setValue('additionalRoles', []);
                                        } else {
                                            const filtered = (
                                                form.getValues('additionalRoles') ?? []
                                            ).filter((r) => r !== typedRole);
                                            form.setValue('additionalRoles', filtered);
                                        }
                                    }}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={tUM('roleReq')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent
                                        position="popper"
                                        side="bottom"
                                        className="max-h-52 overflow-y-auto"
                                    >
                                        {ROLE_VALUES.map((r) => (
                                            <SelectItem key={r} value={r}>
                                                {getRoleLabel(r, lang)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Pilihan Tugas Tambahan (Multi-Role Otomatis) */}
                    {showAdditionalSelector && (
                        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3.5">
                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    {lang === 'id'
                                        ? 'Tugas Tambahan (Opsional)'
                                        : 'Additional Duties (Optional)'}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {lang === 'id'
                                        ? 'Menu dan hak akses akan digabung otomatis sesuai tugas yang dicentang.'
                                        : 'Menus and permissions will be merged automatically based on checked duties.'}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                                {ADDITIONAL_ROLE_OPTIONS.filter(
                                    (opt) => opt !== selectedRole
                                ).map((dutyRole) => {
                                    const isChecked = selectedAdditionalRoles.includes(dutyRole);
                                    return (
                                        <label
                                            key={dutyRole}
                                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${isChecked
                                                ? 'border-emerald-500/50 bg-emerald-500/10 font-medium text-foreground'
                                                : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) =>
                                                    handleToggleAdditionalRole(
                                                        dutyRole,
                                                        e.target.checked
                                                    )
                                                }
                                                className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                                            />
                                            <span className="truncate">
                                                {getRoleLabel(dutyRole, lang)}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <div className="relative flex items-center">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            {...field}
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            aria-label={
                                                lang === 'id'
                                                    ? 'Tampilkan atau sembunyikan password'
                                                    : 'Show or hide password'
                                            }
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            className="absolute right-3 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                        <Button type="button" variant="outline" onClick={handleClose}>
                            {tGlobal('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={isSubmitting || missingSchoolWarning}
                        >
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="mr-2 h-4 w-4" />
                            )}
                            {tGlobal('save')}
                        </Button>
                    </div>
                </form>
            </Form>
        </BaseModalWrapper>
    );
}

// ==========================================
// 2. MODAL EDIT PENGGUNA
// ==========================================

interface EditUserModalProps {
    user: AppUser;
    lang: Lang;
    isSuperAdmin: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (values: EditUserFormValues) => void;
}

export function EditUserModal({
    user,
    lang,
    isSuperAdmin,
    isSubmitting,
    onClose,
    onSubmit,
}: EditUserModalProps) {
    const tGlobal = (key: keyof typeof translations.id.common) => translations[lang].common[key];
    const tUM = (key: keyof typeof translations.id.userManagement) =>
        translations[lang].userManagement[key];

    const schema = useMemo(
        () =>
            z.object({
                fullName: z
                    .string()
                    .trim()
                    .min(3, lang === 'id' ? 'Minimal 3 karakter' : 'Minimum 3 characters'),
                role: z.enum(ROLE_VALUES),
                additionalRoles: z.array(z.enum(ROLE_VALUES)),
            }),
        [lang]
    );

    const form = useForm<EditUserFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            fullName: user.fullName,
            role: user.role,
            additionalRoles: Array.isArray(user.additionalRoles) ? user.additionalRoles : [],
        },
    });

    useEffect(() => {
        form.reset({
            fullName: user.fullName,
            role: user.role,
            additionalRoles: Array.isArray(user.additionalRoles) ? user.additionalRoles : [],
        });
    }, [user, form]);

    const selectedRole = form.watch('role');
    const selectedAdditionalRoles = form.watch('additionalRoles');
    const showAdditionalSelector = canHaveAdditionalRoles(selectedRole);

    // Deteksi role yang sudah otomatis didapat dari teks tugasTambahan Dapodik
    const dapodikAutoRoles = useMemo(
        () => mapTugasTambahanToRoles(user.tugasTambahan),
        [user.tugasTambahan]
    );

    const handleToggleAdditionalRole = (dutyRole: AppUserRole, checked: boolean) => {
        const current = form.getValues('additionalRoles') ?? [];
        const next = checked
            ? Array.from(new Set([...current, dutyRole]))
            : current.filter((item) => item !== dutyRole);
        form.setValue('additionalRoles', next, { shouldDirty: true });
    };

    return (
        <BaseModalWrapper onClose={onClose} maxWidthClass="max-w-lg">
            <div className="mb-4 flex justify-between">
                <div>
                    <h3 className="text-xl font-bold">{tUM('modalEditTitle')}</h3>
                    <p className="text-sm text-muted-foreground">{tUM('modalEditSub')}</p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tGlobal('cancel')}
                    onClick={onClose}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <FormLabel>Email</FormLabel>
                        <Input value={user.email} disabled className="bg-muted" />
                    </div>
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tGlobal('name')}</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                {user.role === 'SISWA' && (
                                    <p className="text-[11px] text-muted-foreground">
                                        {lang === 'id'
                                            ? 'Perubahan nama juga akan disinkronkan ke data master siswa.'
                                            : 'Name changes will also sync to the student master record.'}
                                    </p>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {lang === 'id' ? 'Role Utama' : 'Primary Role'}
                                </FormLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={(nextRole) => {
                                        const typedRole = nextRole as AppUserRole;
                                        field.onChange(typedRole);
                                        if (!canHaveAdditionalRoles(typedRole)) {
                                            form.setValue('additionalRoles', []);
                                        } else {
                                            const filtered = (
                                                form.getValues('additionalRoles') ?? []
                                            ).filter((r) => r !== typedRole);
                                            form.setValue('additionalRoles', filtered);
                                        }
                                    }}
                                    disabled={!isSuperAdmin}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={tUM('roleReq')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent
                                        position="popper"
                                        side="bottom"
                                        className="max-h-52 overflow-y-auto"
                                    >
                                        {ROLE_VALUES.map((r) => (
                                            <SelectItem key={r} value={r}>
                                                {getRoleLabel(r, lang)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Pilihan Tugas Tambahan & Info Dapodik */}
                    {showAdditionalSelector && (
                        <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3.5">
                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    {lang === 'id'
                                        ? 'Tugas Tambahan (Multi-Role)'
                                        : 'Additional Duties (Multi-Role)'}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {lang === 'id'
                                        ? 'Centang tugas tambahan di luar role utama agar menu terkait terbuka otomatis.'
                                        : 'Check additional duties beyond the primary role to unlock related menus.'}
                                </p>
                            </div>

                            {user.tugasTambahan && (
                                <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[11px] text-sky-800 dark:text-sky-300">
                                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <div>
                                        <span className="font-semibold">
                                            {lang === 'id'
                                                ? 'Data Dapodik PTK: '
                                                : 'Dapodik PTK Record: '}
                                        </span>
                                        <span>{user.tugasTambahan}</span>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-2 pt-0.5 sm:grid-cols-2">
                                {ADDITIONAL_ROLE_OPTIONS.filter(
                                    (opt) => opt !== selectedRole
                                ).map((dutyRole) => {
                                    const isFromDapodik = dapodikAutoRoles.includes(dutyRole);
                                    const isChecked =
                                        isFromDapodik || selectedAdditionalRoles.includes(dutyRole);

                                    return (
                                        <label
                                            key={dutyRole}
                                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${isFromDapodik
                                                ? 'cursor-default border-sky-500/40 bg-sky-500/10 font-medium text-foreground'
                                                : isChecked
                                                    ? 'cursor-pointer border-emerald-500/50 bg-emerald-500/10 font-medium text-foreground'
                                                    : 'cursor-pointer border-border bg-background text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
                                            <span className="flex items-center gap-2 truncate">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={isFromDapodik}
                                                    onChange={(e) =>
                                                        handleToggleAdditionalRole(
                                                            dutyRole,
                                                            e.target.checked
                                                        )
                                                    }
                                                    className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                                                />
                                                <span className="truncate">
                                                    {getRoleLabel(dutyRole, lang)}
                                                </span>
                                            </span>

                                            {isFromDapodik && (
                                                <span className="shrink-0 rounded bg-sky-600/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-300">
                                                    Dapodik
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {tGlobal('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            className="bg-blue-600 text-white hover:bg-blue-700"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Edit className="mr-2 h-4 w-4" />
                            )}
                            {tGlobal('save')}
                        </Button>
                    </div>
                </form>
            </Form>
        </BaseModalWrapper>
    );
}

// ==========================================
// 3. MODAL RESET PASSWORD
// ==========================================

interface ResetPasswordModalProps {
    user: AppUser;
    lang: Lang;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (values: ResetPasswordFormValues) => void;
}

export function ResetPasswordModal({
    user,
    lang,
    isSubmitting,
    onClose,
    onSubmit,
}: ResetPasswordModalProps) {
    const [showPassword, setShowPassword] = useState(false);

    const tGlobal = (key: keyof typeof translations.id.common) => translations[lang].common[key];
    const tUM = (key: keyof typeof translations.id.userManagement) =>
        translations[lang].userManagement[key];

    const schema = useMemo(
        () =>
            z.object({
                newPassword: z
                    .string()
                    .min(8, lang === 'id' ? 'Minimal 8 karakter' : 'Minimum 8 characters'),
            }),
        [lang]
    );

    const form = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { newPassword: '' },
    });

    const handleClose = () => {
        form.reset();
        setShowPassword(false);
        onClose();
    };

    return (
        <BaseModalWrapper onClose={handleClose} maxWidthClass="max-w-sm">
            <div className="mb-4 flex justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                    <KeyRound className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tGlobal('cancel')}
                    onClick={handleClose}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            <h3 className="mb-1 text-xl font-bold">{tUM('modalResetTitle')}</h3>
            <p className="mb-6 text-sm text-muted-foreground">
                {tUM('modalResetSub')} <strong>{user.email}</strong>
            </p>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="newPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tUM('newPassword')}</FormLabel>
                                <FormControl>
                                    <div className="relative flex items-center">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            {...field}
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            aria-label={
                                                lang === 'id'
                                                    ? 'Tampilkan atau sembunyikan password'
                                                    : 'Show or hide password'
                                            }
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            className="absolute right-3 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                        <Button type="button" variant="outline" onClick={handleClose}>
                            {tGlobal('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            className="bg-blue-600 text-white hover:bg-blue-700"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <KeyRound className="mr-2 h-4 w-4" />
                            )}
                            {tGlobal('save')}
                        </Button>
                    </div>
                </form>
            </Form>
        </BaseModalWrapper>
    );
}

// ==========================================
// 4. MODAL KONFIRMASI (HAPUS & GENERATE MASSAL)
// ==========================================

export type ConfirmDialogVariant =
    | 'delete-single'
    | 'generate-selected'
    | 'generate-all'
    | 'delete-selected'
    | 'delete-all';

interface ConfirmUserActionModalProps {
    variant: ConfirmDialogVariant;
    title: string;
    description: string;
    highlightText?: string;
    subNote?: string;
    confirmLabel: string;
    cancelLabel: string;
    isPending: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function ConfirmUserActionModal({
    variant,
    title,
    description,
    highlightText,
    subNote,
    confirmLabel,
    cancelLabel,
    isPending,
    onClose,
    onConfirm,
}: ConfirmUserActionModalProps) {
    const renderIcon = () => {
        if (variant === 'generate-selected') {
            return (
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                    <UserPlus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
            );
        }
        if (variant === 'generate-all') {
            return (
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                    <DatabaseZap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
            );
        }
        if (variant === 'delete-selected') {
            return (
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
                    <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
            );
        }
        return (
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
        );
    };

    const buttonClass =
        variant === 'generate-selected' || variant === 'generate-all'
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-red-600 text-white hover:bg-red-700';

    const ActionIcon =
        variant === 'generate-selected'
            ? UserPlus
            : variant === 'generate-all'
                ? DatabaseZap
                : Trash2;

    return (
        <BaseModalWrapper
            onClose={onClose}
            maxWidthClass="max-w-sm"
            borderClass={
                variant === 'delete-all'
                    ? 'border border-red-200 dark:border-red-500/30'
                    : 'border'
            }
            centered
        >
            {renderIcon()}
            <h3 className="mb-2 text-xl font-bold">{title}</h3>
            <p className={`text-sm text-muted-foreground ${highlightText ? 'mb-1' : 'mb-4'}`}>
                {description}
            </p>
            {highlightText && (
                <p className="mb-4 font-semibold text-foreground">{highlightText}</p>
            )}
            {subNote && (
                <p className="mb-5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    {subNote}
                </p>
            )}

            <div className="mt-2 flex justify-center gap-3">
                <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                    {cancelLabel}
                </Button>
                <Button
                    type="button"
                    className={buttonClass}
                    onClick={onConfirm}
                    disabled={isPending}
                >
                    {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <ActionIcon className="mr-2 h-4 w-4" />
                    )}
                    {confirmLabel}
                </Button>
            </div>
        </BaseModalWrapper>
    );
}