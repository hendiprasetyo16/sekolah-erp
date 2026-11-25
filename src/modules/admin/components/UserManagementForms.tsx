// src/modules/admin/components/UserManagementForms.tsx
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
    Search,
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
    ROLE_DISPLAY_NAMES,
    ROLE_VALUES,
    getAssignableAdditionalRoles,
    mapTugasTambahanToRoles,
    type AppUser,
    type AppUserRole,
    type BulkTargetGroup,
    type CreateUserFormValues,
    type EditUserFormValues,
    type MasterAccountCandidate,
    type ResetPasswordFormValues,
} from '../types/user-management.types';

type Lang = 'id' | 'en';

function getRoleLabel(role: AppUserRole, lang: Lang): string {
    const dict = translations[lang].userManagement as Record<string, string | undefined>;
    const translated = dict[`role_${role}`];
    if (typeof translated === 'string' && translated.trim().length > 0) {
        return translated;
    }
    return ROLE_DISPLAY_NAMES[role]?.[lang] ?? role;
}

function canHaveAdditionalRoles(role: AppUserRole): boolean {
    return role !== 'SUPER_ADMIN' && role !== 'SISWA' && role !== 'ORANG_TUA';
}

function UserModalAvatar({
    fullName,
    avatarUrl,
}: {
    fullName: string;
    avatarUrl?: string | null;
}) {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [avatarUrl]);

    const initial = (fullName || '?').trim().charAt(0).toUpperCase() || '?';

    if (avatarUrl && !hasError) {
        return (
            <img
                src={avatarUrl}
                alt={fullName}
                onError={() => setHasError(true)}
                className="h-11 w-11 shrink-0 rounded-full border border-emerald-500/25 object-cover shadow-xs"
            />
        );
    }

    return (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-100 text-sm font-bold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300">
            {initial}
        </div>
    );
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
    isSuperAdmin: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (values: CreateUserFormValues) => void;
}

export function AddUserModal({
    lang,
    activeSchoolId,
    isSuperAdmin,
    isSubmitting,
    onClose,
    onSubmit,
}: AddUserModalProps) {
    const [showPassword, setShowPassword] = useState(false);

    const tGlobal = (key: keyof typeof translations.id.common) => translations[lang].common[key];
    const tUM = (key: keyof typeof translations.id.userManagement) =>
        translations[lang].userManagement[key];

    const availableRoles = useMemo(
        () =>
            ROLE_VALUES.filter((role) => {
                if (!isSuperAdmin) {
                    return role !== 'SUPER_ADMIN' && role !== 'ADMIN';
                }
                return true;
            }),
        [isSuperAdmin]
    );

    const assignableDutyOptions = useMemo(
        () => getAssignableAdditionalRoles(isSuperAdmin),
        [isSuperAdmin]
    );

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
                                        {availableRoles.map((r) => (
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
                                {assignableDutyOptions
                                    .filter((opt) => opt !== selectedRole)
                                    .map((dutyRole) => {
                                        const isChecked =
                                            selectedAdditionalRoles.includes(dutyRole);
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

    const editableRoles = useMemo(
        () =>
            ROLE_VALUES.filter((role) => {
                if (user.role === 'SUPER_ADMIN') return role === 'SUPER_ADMIN';
                return role !== 'SUPER_ADMIN';
            }),
        [user.role]
    );

    const assignableDutyOptions = useMemo(
        () => getAssignableAdditionalRoles(isSuperAdmin),
        [isSuperAdmin]
    );

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
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <UserModalAvatar fullName={user.fullName} avatarUrl={user.avatarUrl} />
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold">{tUM('modalEditTitle')}</h3>
                        <p className="truncate text-sm text-muted-foreground">{tUM('modalEditSub')}</p>
                    </div>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tGlobal('cancel')}
                    onClick={onClose}
                    className="shrink-0"
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label
                            htmlFor="edit-user-email"
                            className="block text-sm font-medium leading-none text-foreground"
                        >
                            Email
                        </label>
                        <Input
                            id="edit-user-email"
                            value={user.email}
                            disabled
                            className="bg-muted"
                        />
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
                                    disabled={!isSuperAdmin || user.role === 'SUPER_ADMIN'}
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
                                        {editableRoles.map((r) => (
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
                                {assignableDutyOptions
                                    .filter((opt) => opt !== selectedRole)
                                    .map((dutyRole) => {
                                        const isFromDapodik = dapodikAutoRoles.includes(dutyRole);
                                        const isChecked =
                                            isFromDapodik ||
                                            selectedAdditionalRoles.includes(dutyRole);

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
// 4. MODAL KONFIRMASI (HAPUS & RESET / GENERATE MASSAL)
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
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
                    <KeyRound className="h-6 w-6 text-amber-600 dark:text-amber-400" />
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
        variant === 'generate-selected'
            ? 'bg-amber-600 text-white hover:bg-amber-700'
            : variant === 'generate-all'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-red-600 text-white hover:bg-red-700';

    const ActionIcon =
        variant === 'generate-selected'
            ? KeyRound
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

// ==========================================
// 5. MODAL PILIH DATA MASTER (AKTIVASI AKUN SELEKTIF)
// ==========================================

interface SelectMasterCandidatesModalProps {
    targetGroup: BulkTargetGroup;
    lang: Lang;
    candidates: MasterAccountCandidate[];
    isLoading: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onConfirm: (selected: MasterAccountCandidate[]) => void;
}

export function SelectMasterCandidatesModal({
    targetGroup,
    lang,
    candidates,
    isLoading,
    isSubmitting,
    onClose,
    onConfirm,
}: SelectMasterCandidatesModalProps) {
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const groupLabel =
        targetGroup === 'staff'
            ? lang === 'id'
                ? 'Guru & Staff'
                : 'Teachers & Staff'
            : targetGroup === 'siswa'
                ? lang === 'id'
                    ? 'Siswa'
                    : 'Students'
                : lang === 'id'
                    ? 'Orang Tua / Wali'
                    : 'Parents / Guardians';

    const filteredCandidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return candidates;
        return candidates.filter(
            (c) =>
                c.fullName.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                c.identifier.toLowerCase().includes(q) ||
                (c.subtitle ?? '').toLowerCase().includes(q)
        );
    }, [candidates, search]);

    const selectableFiltered = useMemo(
        () => filteredCandidates.filter((c) => c.hasValidEmail),
        [filteredCandidates]
    );

    const isAllFilteredSelected =
        selectableFiltered.length > 0 &&
        selectableFiltered.every((c) => selectedIds.includes(c.masterId));

    const handleToggleAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) =>
                Array.from(new Set([...prev, ...selectableFiltered.map((c) => c.masterId)]))
            );
        } else {
            const removeSet = new Set(selectableFiltered.map((c) => c.masterId));
            setSelectedIds((prev) => prev.filter((id) => !removeSet.has(id)));
        }
    };

    const handleToggleOne = (masterId: string) => {
        setSelectedIds((prev) =>
            prev.includes(masterId) ? prev.filter((id) => id !== masterId) : [...prev, masterId]
        );
    };

    const selectedCandidates = useMemo(
        () => candidates.filter((c) => selectedIds.includes(c.masterId) && c.hasValidEmail),
        [candidates, selectedIds]
    );

    const invalidEmailCount = useMemo(
        () => candidates.filter((c) => !c.hasValidEmail).length,
        [candidates]
    );

    return (
        <BaseModalWrapper onClose={onClose} maxWidthClass="max-w-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold">
                        <UserPlus className="h-5 w-5 text-blue-600" />
                        {lang === 'id'
                            ? `Aktifkan Akun ${groupLabel} dari Data Master`
                            : `Activate ${groupLabel} Accounts from Master Data`}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {lang === 'id'
                            ? 'Centang data master yang belum memiliki akun login untuk dibuatkan akun secara selektif.'
                            : 'Select unlinked master records to create and activate login accounts selectively.'}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Search & Select All Bar */}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={
                            lang === 'id'
                                ? 'Cari nama, email, atau NIP/NISN...'
                                : 'Search name, email, or ID...'
                        }
                        className="h-9 pl-9 text-sm"
                    />
                </div>

                {selectableFiltered.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium">
                        <input
                            type="checkbox"
                            checked={isAllFilteredSelected}
                            onChange={(e) => handleToggleAll(e.target.checked)}
                            className="h-4 w-4 rounded accent-blue-600"
                        />
                        <span>
                            {lang === 'id'
                                ? `Pilih Semua (${selectableFiltered.length})`
                                : `Select All (${selectableFiltered.length})`}
                        </span>
                    </label>
                )}
            </div>

            {invalidEmailCount > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                        {lang === 'id'
                            ? `${invalidEmailCount} data tidak memiliki email valid di master sehingga tidak dapat dicentang.`
                            : `${invalidEmailCount} record(s) have missing/invalid email in master data and cannot be selected.`}
                    </span>
                </div>
            )}

            {/* Daftar Kandidat */}
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        <span>
                            {lang === 'id'
                                ? 'Memuat data master belum aktif...'
                                : 'Loading unlinked master records...'}
                        </span>
                    </div>
                ) : filteredCandidates.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                        {candidates.length === 0
                            ? lang === 'id'
                                ? `Semua data ${groupLabel} sudah memiliki akun login.`
                                : `All ${groupLabel} records already have active accounts.`
                            : lang === 'id'
                                ? 'Data tidak ditemukan untuk kata kunci tersebut.'
                                : 'No matching records found.'}
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {filteredCandidates.map((item) => {
                            const checked = selectedIds.includes(item.masterId);
                            return (
                                <label
                                    key={item.masterId}
                                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors ${!item.hasValidEmail
                                            ? 'cursor-not-allowed bg-muted/20 opacity-60'
                                            : checked
                                                ? 'cursor-pointer bg-blue-500/10'
                                                : 'cursor-pointer hover:bg-muted/40'
                                        }`}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <input
                                            type="checkbox"
                                            disabled={!item.hasValidEmail || isSubmitting}
                                            checked={checked}
                                            onChange={() => handleToggleOne(item.masterId)}
                                            className="h-4 w-4 shrink-0 rounded accent-blue-600"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-foreground">
                                                {item.fullName}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {item.hasValidEmail
                                                    ? item.email
                                                    : lang === 'id'
                                                        ? 'Email belum diisi di data master'
                                                        : 'Email missing in master record'}
                                                {item.subtitle ? ` • ${item.subtitle}` : ''}
                                            </p>
                                        </div>
                                    </div>

                                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                                        {item.identifier}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex flex-col-reverse items-center justify-between gap-3 border-t pt-4 sm:flex-row">
                <span className="text-xs text-muted-foreground">
                    {lang === 'id'
                        ? `${selectedCandidates.length} dari ${candidates.length} data master dipilih`
                        : `${selectedCandidates.length} of ${candidates.length} master records selected`}
                </span>

                <div className="flex w-full justify-end gap-2 sm:w-auto">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        {lang === 'id' ? 'Batal' : 'Cancel'}
                    </Button>
                    <Button
                        type="button"
                        disabled={selectedCandidates.length === 0 || isSubmitting}
                        onClick={() => onConfirm(selectedCandidates)}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                        {isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <UserPlus className="mr-2 h-4 w-4" />
                        )}
                        {lang === 'id'
                            ? `Aktifkan (${selectedCandidates.length})`
                            : `Activate (${selectedCandidates.length})`}
                    </Button>
                </div>
            </div>
        </BaseModalWrapper>
    );
}