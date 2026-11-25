// src/modules/admin/components/UserManagementTable.tsx
import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowDown,
    ArrowDownAZ,
    ArrowUp,
    ArrowUpDown,
    ArrowUpZA,
    Ban,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Edit,
    KeyRound,
    Link2,
    Loader2,
    MoreVertical,
    Trash2,
    X,
    ZoomIn,
} from 'lucide-react';

import { translations } from '@/constants/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ITEMS_PER_PAGE,
    ROLE_DISPLAY_NAMES,
    STAFF_ROLES,
    isProtectedAdminAccount,
    mapTugasTambahanToRoles,
    type AppUser,
    type AppUserRole,
    type SortConfig,
    type SortKey,
} from '../types/user-management.types';

type Lang = 'id' | 'en';
type UserPhotoPreviewState = { fullName: string; email: string; photoUrl: string } | null;

// ==========================================
// SUB-COMPONENT: USER AVATAR CELL
// ==========================================
interface UserAvatarCellProps {
    fullName: string;
    email: string;
    avatarUrl?: string | null;
    previewTitle: string;
    onPreview?: (preview: { fullName: string; email: string; photoUrl: string }) => void;
}

function UserAvatarCell({
    fullName,
    email,
    avatarUrl,
    previewTitle,
    onPreview,
}: UserAvatarCellProps) {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [avatarUrl]);

    const initial = (fullName || '?').trim().charAt(0).toUpperCase() || '?';
    const showImage = Boolean(avatarUrl && !hasError);

    if (showImage) {
        return (
            <button
                type="button"
                title={previewTitle}
                onClick={(e) => {
                    e.stopPropagation();
                    onPreview?.({ fullName, email, photoUrl: avatarUrl! });
                }}
                className="group/avatar relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-emerald-500/25 bg-muted shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
                <img
                    src={avatarUrl!}
                    alt={fullName}
                    loading="lazy"
                    onError={() => setHasError(true)}
                    className="h-full w-full object-cover transition-transform duration-150 group-hover/avatar:scale-105"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                    <ZoomIn className="h-3.5 w-3.5 text-white" />
                </span>
            </button>
        );
    }

    return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-100 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300">
            {initial}
        </div>
    );
}

interface SortableHeaderProps {
    columnKey: SortKey;
    label: string;
    sortConfig: SortConfig;
    onSort: (key: SortKey) => void;
}

function SortableHeader({ columnKey, label, sortConfig, onSort }: SortableHeaderProps) {
    const renderIcon = () => {
        if (sortConfig.key !== columnKey) {
            return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
        }
        if (columnKey === 'fullName') {
            return sortConfig.direction === 'asc' ? (
                <ArrowDownAZ className="ml-1 h-3 w-3 text-primary" />
            ) : (
                <ArrowUpZA className="ml-1 h-3 w-3 text-primary" />
            );
        }
        return sortConfig.direction === 'asc' ? (
            <ArrowDown className="ml-1 h-3 w-3 text-primary" />
        ) : (
            <ArrowUp className="ml-1 h-3 w-3 text-primary" />
        );
    };

    return (
        <th
            className="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:bg-muted/50"
            onClick={() => onSort(columnKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                {renderIcon()}
            </div>
        </th>
    );
}

const getRoleBadgeColor = (role: AppUserRole): string => {
    if (role === 'SUPER_ADMIN') {
        return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30';
    }
    if (['ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'].includes(role)) {
        return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30';
    }
    if (STAFF_ROLES.includes(role)) {
        return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';
    }
    if (role === 'SISWA') {
        return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30';
};

// ==========================================
// TABEL PENGGUNA
// ==========================================

interface UserManagementTableProps {
    users: AppUser[];
    totalFilteredCount: number;
    isLoading: boolean;
    lang: Lang;
    currentPage: number;
    totalPages: number;
    sortConfig: SortConfig;
    selectedUserIds: string[];
    currentUserId?: string;
    isSuperAdmin: boolean;
    canManageUsers: boolean;
    onSort: (key: SortKey) => void;
    onPageChange: (page: number) => void;
    onSelectAllPage: (checked: boolean) => void;
    onToggleSelectUser: (userId: string) => void;
    onEditUser: (user: AppUser) => void;
    onResetPassword: (user: AppUser) => void;
    onToggleStatus: (user: AppUser) => void;
    onDeleteUser: (user: AppUser) => void;
}

export function UserManagementTable({
    users,
    totalFilteredCount,
    isLoading,
    lang,
    currentPage,
    totalPages,
    sortConfig,
    selectedUserIds,
    currentUserId,
    isSuperAdmin,
    canManageUsers,
    onSort,
    onPageChange,
    onSelectAllPage,
    onToggleSelectUser,
    onEditUser,
    onResetPassword,
    onToggleStatus,
    onDeleteUser,
}: UserManagementTableProps) {
    const [pageInput, setPageInput] = useState<string>(String(currentPage));
    const [photoPreview, setPhotoPreview] = useState<UserPhotoPreviewState>(null);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    useEffect(() => {
        if (!photoPreview) return;
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') setPhotoPreview(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [photoPreview]);

    const tGlobal = (key: keyof typeof translations.id.common) => translations[lang].common[key];
    const tUM = (key: keyof typeof translations.id.userManagement) =>
        translations[lang].userManagement[key];

    const formatRoleName = (role: AppUserRole): string => {
        const dict = translations[lang].userManagement as Record<string, string | undefined>;
        const translated = dict[`role_${role}`];
        if (typeof translated === 'string' && translated.trim().length > 0) {
            return translated;
        }
        return ROLE_DISPLAY_NAMES[role]?.[lang] ?? role;
    };

    const selectablePageUsers = users.filter(
        (u) => u.id !== currentUserId && !isProtectedAdminAccount(u, isSuperAdmin)
    );

    const isAllPageSelected =
        selectablePageUsers.length > 0 &&
        selectablePageUsers.every((u) => selectedUserIds.includes(u.id));

    const handleSelectAllChange = (e: ChangeEvent<HTMLInputElement>) => {
        onSelectAllPage(e.target.checked);
    };

    const handleManualPageKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const commitManualPage = () => {
        if (pageInput.trim() === '' || totalPages === 0) {
            setPageInput(String(currentPage));
            return;
        }
        let targetPage = parseInt(pageInput, 10);
        if (Number.isNaN(targetPage) || targetPage < 1) targetPage = 1;
        if (targetPage > totalPages) targetPage = totalPages;
        onPageChange(targetPage);
        setPageInput(String(targetPage));
    };

    const getPageNumbers = () => {
        const pages: number[] = [];
        let start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    };

    return (
        <>
            {/* LIGHTBOX PRATINJAU FOTO PROFIL PENGGUNA */}
            <AnimatePresence>
                {photoPreview && (
                    <div
                        className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
                        onClick={() => setPhotoPreview(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                        {photoPreview.fullName}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {photoPreview.email}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPhotoPreview(null)}
                                    aria-label={lang === 'id' ? 'Tutup pratinjau' : 'Close preview'}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex justify-center overflow-hidden rounded-xl bg-muted/40">
                                <img
                                    src={photoPreview.photoUrl}
                                    alt={photoPreview.fullName}
                                    className="max-h-[70vh] w-auto object-contain"
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-border bg-muted/20">
                            <th className="w-10 px-4 py-3 text-center">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={
                                        lang === 'id'
                                            ? 'Pilih semua di halaman ini'
                                            : 'Select all on this page'
                                    }
                                    disabled={!canManageUsers || selectablePageUsers.length === 0}
                                    checked={isAllPageSelected}
                                    onChange={handleSelectAllChange}
                                />
                            </th>
                            <th className="w-16 px-4 py-3 text-center text-xs font-semibold uppercase text-muted-foreground">
                                {tUM('colNo')}
                            </th>
                            <SortableHeader
                                columnKey="fullName"
                                label={tUM('colUser')}
                                sortConfig={sortConfig}
                                onSort={onSort}
                            />
                            <SortableHeader
                                columnKey="role"
                                label={tUM('colRole')}
                                sortConfig={sortConfig}
                                onSort={onSort}
                            />
                            <SortableHeader
                                columnKey="isActive"
                                label={tUM('colStatus')}
                                sortConfig={sortConfig}
                                onSort={onSort}
                            />
                            <th className="w-20 px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                                {tUM('colAction')}
                            </th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border">
                        {users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="p-8 text-center italic text-muted-foreground"
                                >
                                    {isLoading ? (
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                                    ) : (
                                        tUM('noUsers')
                                    )}
                                </td>
                            </tr>
                        ) : (
                            users.map((user, index) => {
                                const isSelf = currentUserId === user.id;
                                const isProtectedTarget = isProtectedAdminAccount(
                                    user,
                                    isSuperAdmin
                                );
                                const canEditRow =
                                    canManageUsers && (isSelf || !isProtectedTarget);
                                const canControlOtherRow =
                                    canManageUsers && !isSelf && !isProtectedTarget;

                                const extraDuties = Array.from(
                                    new Set<AppUserRole>([
                                        ...(Array.isArray(user.additionalRoles)
                                            ? user.additionalRoles
                                            : []),
                                        ...mapTugasTambahanToRoles(user.tugasTambahan),
                                    ])
                                ).filter((r) => r !== user.role);

                                return (
                                    <tr
                                        key={user.id}
                                        className={`transition-colors hover:bg-muted/30 ${selectedUserIds.includes(user.id) ? 'bg-primary/5' : ''
                                            }`}
                                    >
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={user.fullName}
                                                disabled={!canControlOtherRow}
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={() => onToggleSelectUser(user.id)}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <UserAvatarCell
                                                    fullName={user.fullName}
                                                    email={user.email}
                                                    avatarUrl={user.avatarUrl}
                                                    previewTitle={
                                                        lang === 'id'
                                                            ? 'Klik untuk memperbesar foto profil'
                                                            : 'Click to enlarge profile photo'
                                                    }
                                                    onPreview={setPhotoPreview}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="truncate text-sm font-semibold">
                                                            {user.fullName}
                                                        </p>
                                                        {user.isLinkedToMaster && (
                                                            <span
                                                                title={
                                                                    user.role === 'ORANG_TUA'
                                                                        ? lang === 'id'
                                                                            ? `Tertaut dengan ${user.linkedChildrenCount ?? 1} siswa`
                                                                            : `Linked to ${user.linkedChildrenCount ?? 1} student(s)`
                                                                        : lang === 'id'
                                                                            ? 'Tertaut dengan data master akademik'
                                                                            : 'Linked to master academic record'
                                                                }
                                                                className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                                                            >
                                                                <Link2 className="h-2.5 w-2.5" />
                                                                {user.role === 'ORANG_TUA' &&
                                                                    (user.linkedChildrenCount ?? 0) > 1
                                                                    ? `${user.linkedChildrenCount} Anak`
                                                                    : 'Master'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span
                                                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${getRoleBadgeColor(
                                                        user.role
                                                    )}`}
                                                >
                                                    {formatRoleName(user.role)}
                                                </span>

                                                {extraDuties.map((duty) => (
                                                    <span
                                                        key={duty}
                                                        title={
                                                            lang === 'id'
                                                                ? 'Tugas Tambahan'
                                                                : 'Additional Duty'
                                                        }
                                                        className="inline-flex items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                                                    >
                                                        +{formatRoleName(duty)}
                                                    </span>
                                                ))}
                                            </div>

                                            {user.tugasTambahan && (
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    Dapodik: {user.tugasTambahan}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.isActive
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                    }`}
                                            >
                                                <span
                                                    className={`h-2 w-2 rounded-full ${user.isActive
                                                            ? 'animate-pulse bg-emerald-500'
                                                            : 'bg-red-500'
                                                        }`}
                                                />
                                                {user.isActive
                                                    ? tUM('statusActive')
                                                    : tUM('statusBlocked')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canEditRow ? (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={tUM('colAction')}
                                                            className="h-8 w-8"
                                                        >
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        align="end"
                                                        className="w-48 bg-card text-card-foreground"
                                                    >
                                                        <DropdownMenuItem
                                                            onClick={() => onEditUser(user)}
                                                        >
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            {tUM('actionEdit')}
                                                        </DropdownMenuItem>

                                                        {canControlOtherRow && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        onResetPassword(user)
                                                                    }
                                                                >
                                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                                    {tUM('actionResetPass')}
                                                                </DropdownMenuItem>

                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className={
                                                                        user.isActive
                                                                            ? 'text-red-600'
                                                                            : 'text-emerald-600'
                                                                    }
                                                                    onClick={() =>
                                                                        onToggleStatus(user)
                                                                    }
                                                                >
                                                                    {user.isActive ? (
                                                                        <Ban className="mr-2 h-4 w-4" />
                                                                    ) : (
                                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                                    )}
                                                                    {user.isActive
                                                                        ? tUM('actionBlock')
                                                                        : tUM('actionUnblock')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-500/10"
                                                                    onClick={() =>
                                                                        onDeleteUser(user)
                                                                    }
                                                                >
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    {tUM('actionDelete')}
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    -
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {totalFilteredCount > 0 && (
                <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-border pt-4 xl:flex-row">
                    <span className="text-center text-sm text-muted-foreground xl:text-left">
                        {tGlobal('showing')}{' '}
                        <span className="font-medium text-foreground">
                            {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                        </span>{' '}
                        -{' '}
                        <span className="font-medium text-foreground">
                            {Math.min(currentPage * ITEMS_PER_PAGE, totalFilteredCount)}
                        </span>{' '}
                        {tGlobal('of')}{' '}
                        <span className="font-medium text-foreground">{totalFilteredCount}</span>{' '}
                        {tGlobal('entries')}
                    </span>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onPageChange(1)}
                                disabled={currentPage === 1}
                                className="h-8 w-8 text-muted-foreground"
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                                className="h-8 w-8 text-muted-foreground"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            {getPageNumbers().map((pageNum) => (
                                <Button
                                    key={pageNum}
                                    variant={currentPage === pageNum ? 'default' : 'outline'}
                                    size="icon"
                                    onClick={() => onPageChange(pageNum)}
                                    className={`h-8 w-8 font-medium ${currentPage === pageNum
                                            ? 'bg-primary font-bold text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                >
                                    {pageNum}
                                </Button>
                            ))}
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="h-8 w-8 text-muted-foreground"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onPageChange(totalPages)}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="h-8 w-8 text-muted-foreground"
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex items-center gap-2 border-border sm:ml-4 sm:border-l sm:pl-4">
                            <span className="hidden text-sm text-muted-foreground sm:inline-block">
                                {lang === 'id' ? 'Ke Halaman:' : 'Go to Page:'}
                            </span>
                            <Input
                                inputMode="numeric"
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={handleManualPageKeyDown}
                                onBlur={commitManualPage}
                                className="h-8 w-14 px-1 text-center"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}