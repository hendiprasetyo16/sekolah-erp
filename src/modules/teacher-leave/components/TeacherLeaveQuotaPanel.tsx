// src/modules/teacher-leave/components/TeacherLeaveQuotaPanel.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Edit3,
    Loader2,
    RefreshCw,
    Search,
    Users,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { teacherLeaveService } from '../services/teacher-leave.service';
import type { TeacherLeaveQuotaWithTeacher } from '../types/teacher-leave.types';

interface TeacherLeaveQuotaPanelProps {
    schoolId: string;
    year: number;
    onYearChange: (year: number) => void;
    canManageQuotas: boolean;
    onQuotaUpdated?: () => void;
}

export function TeacherLeaveQuotaPanel({
    schoolId,
    year,
    onYearChange,
    canManageQuotas,
    onQuotaUpdated,
}: TeacherLeaveQuotaPanelProps) {
    const { t, locale } = useTranslation();

    const [quotas, setQuotas] = useState<TeacherLeaveQuotaWithTeacher[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>('');

    const [editingQuota, setEditingQuota] =
        useState<TeacherLeaveQuotaWithTeacher | null>(null);
    const [baseQuotaInput, setBaseQuotaInput] = useState<string>('12');
    const [carriedOverInput, setCarriedOverInput] = useState<string>('0');
    const [notesInput, setNotesInput] = useState<string>('');
    const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

    const currentYear = new Date().getFullYear();
    const availableYears = useMemo(
        () => [currentYear - 1, currentYear, currentYear + 1],
        [currentYear]
    );

    const loadQuotas = useCallback(async (): Promise<void> => {
        if (!schoolId) return;
        setIsLoading(true);
        try {
            const list = await teacherLeaveService.getSchoolQuotas(schoolId, year);
            setQuotas(list);
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal memuat daftar kuota cuti PTK.'
                        : 'Failed to load staff leave quotas.'
            );
        } finally {
            setIsLoading(false);
        }
    }, [schoolId, year, locale]);

    useEffect(() => {
        void loadQuotas();
    }, [loadQuotas]);

    const handleSyncAllActiveTeachers = async (): Promise<void> => {
        if (!schoolId || !canManageQuotas) return;
        setIsSyncing(true);
        try {
            const syncedCount = await teacherLeaveService.initializeSchoolQuotasForYear(
                schoolId,
                year
            );
            toast.success(
                t('teacherLeave.toastQuotasSynced')
                    .replace('{year}', String(year))
                    .replace('{count}', String(syncedCount))
            );
            await loadQuotas();
            onQuotaUpdated?.();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal menyinkronkan kuota PTK.'
                        : 'Failed to sync staff quotas.'
            );
        } finally {
            setIsSyncing(false);
        }
    };

    const openEditModal = (item: TeacherLeaveQuotaWithTeacher): void => {
        setEditingQuota(item);
        setBaseQuotaInput(String(item.baseQuota));
        setCarriedOverInput(String(item.carriedOver));
        setNotesInput(item.notes ?? '');
    };

    const handleSaveQuotaEdit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (!editingQuota) return;

        const parsedBase = Math.max(0, Math.floor(Number(baseQuotaInput) || 0));
        const parsedCarry = Math.max(0, Math.floor(Number(carriedOverInput) || 0));
        const totalAvailable = parsedBase + parsedCarry;

        if (totalAvailable < editingQuota.usedDays) {
            toast.error(
                t('teacherLeave.errQuotaBelowUsed')
                    .replace('{total}', String(totalAvailable))
                    .replace('{used}', String(editingQuota.usedDays))
            );
            return;
        }

        setIsSavingEdit(true);
        try {
            await teacherLeaveService.updateTeacherQuota({
                quotaId: editingQuota.id,
                schoolId,
                baseQuota: parsedBase,
                carriedOver: parsedCarry,
                notes: notesInput.trim() || null,
            });

            toast.success(t('teacherLeave.toastQuotaUpdated'));
            setEditingQuota(null);
            await loadQuotas();
            onQuotaUpdated?.();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : locale === 'id'
                        ? 'Gagal memperbarui kuota cuti PTK.'
                        : 'Failed to update staff leave quota.'
            );
        } finally {
            setIsSavingEdit(false);
        }
    };

    const filteredQuotas = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return quotas
            .filter((item) => {
                if (!q) return true;
                const name = item.teacher?.fullName?.toLowerCase() ?? '';
                const nip = item.teacher?.nip?.toLowerCase() ?? '';
                const nuptk = item.teacher?.nuptk?.toLowerCase() ?? '';
                return name.includes(q) || nip.includes(q) || nuptk.includes(q);
            })
            .sort((a, b) =>
                (a.teacher?.fullName ?? '').localeCompare(b.teacher?.fullName ?? '')
            );
    }, [quotas, searchTerm]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div>
                    <h2 className="text-sm font-bold text-foreground">
                        {t('teacherLeave.quotaPanelTitle')}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('teacherLeave.quotaPanelSubtitle')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="Tahun Kuota Cuti"
                        value={year}
                        onChange={(e) => onYearChange(Number(e.target.value))}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold tabular-nums text-foreground focus:border-emerald-500 focus:outline-none"
                    >
                        {availableYears.map((yr) => (
                            <option key={yr} value={yr}>
                                {yr}
                            </option>
                        ))}
                    </select>

                    {canManageQuotas && (
                        <Button
                            type="button"
                            size="sm"
                            disabled={isSyncing}
                            onClick={() => void handleSyncAllActiveTeachers()}
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                            {isSyncing ? (
                                <Loader2 size={14} className="mr-1.5 animate-spin" />
                            ) : (
                                <RefreshCw size={14} className="mr-1.5" />
                            )}
                            {isSyncing
                                ? t('teacherLeave.btnSyncingQuotas')
                                : t('teacherLeave.btnSyncAllQuotas')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="relative max-w-sm">
                <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('teacherLeave.searchQuotaPlaceholder')}
                    className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-xs text-foreground focus:border-emerald-500 focus:outline-none"
                />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                        <Loader2 size={18} className="mr-2 animate-spin text-emerald-600" />
                        {t('common.loading')}
                    </div>
                ) : filteredQuotas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                        <Users size={26} className="text-muted-foreground/60" />
                        <p className="mt-2 max-w-md text-xs text-muted-foreground">
                            {t('teacherLeave.emptyQuotas').replace('{year}', String(year))}
                        </p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 py-3">{t('teacherLeave.colTeacher')}</th>
                                <th className="px-4 py-3 text-right">
                                    {t('teacherLeave.colBaseQuota')}
                                </th>
                                <th className="px-4 py-3 text-right">
                                    {t('teacherLeave.colCarryOver')}
                                </th>
                                <th className="px-4 py-3 text-right">
                                    {t('teacherLeave.colUsedDays')}
                                </th>
                                <th className="px-4 py-3 text-right">
                                    {t('teacherLeave.colRemainingDays')}
                                </th>
                                <th className="px-4 py-3">{t('teacherLeave.colQuotaNotes')}</th>
                                {canManageQuotas && (
                                    <th className="px-4 py-3 text-right">
                                        {t('teacherLeave.colActions')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredQuotas.map((item) => (
                                <tr
                                    key={item.id}
                                    className="transition-colors hover:bg-muted/25"
                                >
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-foreground">
                                            {item.teacher?.fullName || 'PTK'}
                                        </p>
                                        <p className="font-mono text-[11px] text-muted-foreground">
                                            {item.teacher?.nip
                                                ? `NIP ${item.teacher.nip}`
                                                : item.teacher?.nuptk
                                                    ? `NUPTK ${item.teacher.nuptk}`
                                                    : '-'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                                        {item.baseQuota}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-sky-600 dark:text-sky-400">
                                        +{item.carriedOver}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium tabular-nums text-amber-600 dark:text-amber-400">
                                        {item.usedDays}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="inline-flex rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                            {item.remainingDays} {t('teacherLeave.daysUnit')}
                                        </span>
                                    </td>
                                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                                        {item.notes || '-'}
                                    </td>
                                    {canManageQuotas && (
                                        <td className="px-4 py-3 text-right">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEditModal(item)}
                                            >
                                                <Edit3 size={13} className="mr-1" />
                                                {t('teacherLeave.btnEditQuota')}
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editingQuota && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-quota-modal-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
                    onClick={() => {
                        if (!isSavingEdit) setEditingQuota(null);
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3
                                    id="edit-quota-modal-title"
                                    className="text-base font-bold text-foreground"
                                >
                                    {t('teacherLeave.modalEditQuotaTitle')}
                                </h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {editingQuota.teacher?.fullName || 'PTK'} • Tahun {year} (
                                    {t('teacherLeave.quotaUsedTitle')}: {editingQuota.usedDays}{' '}
                                    {t('teacherLeave.daysUnit')})
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={isSavingEdit}
                                onClick={() => setEditingQuota(null)}
                                aria-label={t('common.close')}
                                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => void handleSaveQuotaEdit(e)}
                            className="mt-4 space-y-3.5 text-xs"
                        >
                            <div>
                                <label
                                    htmlFor="edit-base-quota"
                                    className="mb-1 block font-semibold text-foreground"
                                >
                                    {t('teacherLeave.labelBaseQuota')}
                                </label>
                                <input
                                    id="edit-base-quota"
                                    type="number"
                                    min={0}
                                    max={60}
                                    required
                                    value={baseQuotaInput}
                                    disabled={isSavingEdit}
                                    onChange={(e) => setBaseQuotaInput(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-emerald-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="edit-carry-over"
                                    className="mb-1 block font-semibold text-foreground"
                                >
                                    {t('teacherLeave.labelCarryOver')}
                                </label>
                                <input
                                    id="edit-carry-over"
                                    type="number"
                                    min={0}
                                    max={30}
                                    required
                                    value={carriedOverInput}
                                    disabled={isSavingEdit}
                                    onChange={(e) => setCarriedOverInput(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-emerald-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="edit-quota-notes"
                                    className="mb-1 block font-semibold text-foreground"
                                >
                                    {t('teacherLeave.labelQuotaNotes')}
                                </label>
                                <input
                                    id="edit-quota-notes"
                                    type="text"
                                    maxLength={250}
                                    value={notesInput}
                                    disabled={isSavingEdit}
                                    placeholder={t('teacherLeave.placeholderQuotaNotes')}
                                    onChange={(e) => setNotesInput(e.target.value)}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-emerald-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isSavingEdit}
                                    onClick={() => setEditingQuota(null)}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={isSavingEdit}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {isSavingEdit && (
                                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                                    )}
                                    {t('common.save')}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}