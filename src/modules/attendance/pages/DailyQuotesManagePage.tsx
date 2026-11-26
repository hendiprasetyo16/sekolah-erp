// src/modules/attendance/pages/DailyQuotesManagePage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Sparkles,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Search,
    Edit3,
    Save,
    X,
    Power,
    ShieldAlert,
    RefreshCw,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { attendanceService } from '../services/attendance.service';
import type { DailyQuoteRow } from '../types/attendance.types';

const GLOBAL_SCHOOL_VALUE = '__GLOBAL__';
const MIN_QUOTE_LENGTH = 10;

function isMissingTableError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const code =
        'code' in err && typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : '';
    const message =
        'message' in err &&
            typeof (err as { message?: unknown }).message === 'string'
            ? (err as { message: string }).message.toLowerCase()
            : '';

    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        message.includes('does not exist') ||
        message.includes('could not find the table')
    );
}

export function DailyQuotesManagePage() {
    const { t } = useTranslation();
    const { user, school, hasAnyRole } = useAuthStore();

    const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
    const canManageQuotes = hasAnyRole(['SUPER_ADMIN', 'ADMIN']);

    const [simSchools, setSimSchools] = useState<
        Array<{ id: string; name: string; npsn: string }>
    >([]);

    const defaultSchoolId = school?.id || user?.schoolId || '';

    // Target sekolah pada form (khusus SUPER_ADMIN dapat memilih GLOBAL atau sekolah tertentu)
    const [targetSchoolScope, setTargetSchoolScope] = useState<string>(
        defaultSchoolId || GLOBAL_SCHOOL_VALUE
    );

    // Filter cakupan list (ALL | GLOBAL | SCHOOL)
    const [scopeFilter, setScopeFilter] = useState<'ALL' | 'GLOBAL' | 'SCHOOL'>(
        'ALL'
    );
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [quotes, setQuotes] = useState<DailyQuoteRow[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // State Form Tambah / Edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [quoteContent, setQuoteContent] = useState<string>('');
    const [authorName, setAuthorName] = useState<string>('');
    const [isActive, setIsActive] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // State Modal Hapus & Toast
    const [deleteTarget, setDeleteTarget] = useState<DailyQuoteRow | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback(
        (type: 'success' | 'error', message: string) => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
            setToast({ type, message });
            toastTimerRef.current = setTimeout(() => {
                setToast(null);
                toastTimerRef.current = null;
            }, 4500);
        },
        []
    );

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!deleteTarget) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isDeleting) {
                setDeleteTarget(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteTarget, isDeleting]);

    // Sinkronkan pilihan sekolah saat sekolah aktif di header berubah
    useEffect(() => {
        if (!editingId) {
            if (school?.id) {
                setTargetSchoolScope(school.id);
            } else if (!isSuperAdmin && user?.schoolId) {
                setTargetSchoolScope(user.schoolId);
            }
        }
    }, [school?.id, user?.schoolId, isSuperAdmin, editingId]);

    // Muat daftar sekolah untuk SUPER_ADMIN
    useEffect(() => {
        if (!isSuperAdmin) return;
        attendanceService
            .getAllSchoolsForSimulation()
            .then((list) => {
                setSimSchools(list);
            })
            .catch(console.error);
    }, [isSuperAdmin]);

    const activeSchoolFilterId = isSuperAdmin
        ? targetSchoolScope !== GLOBAL_SCHOOL_VALUE
            ? targetSchoolScope
            : defaultSchoolId
        : defaultSchoolId;

    const loadQuotes = useCallback(async () => {
        if (!canManageQuotes) return;
        if (!isSuperAdmin && !activeSchoolFilterId) return;

        setIsLoading(true);
        try {
            let query = supabase
                .from('daily_quotes')
                .select('*')
                .order('createdAt', { ascending: false });

            if (activeSchoolFilterId) {
                query = query.or(
                    `schoolId.eq.${activeSchoolFilterId},schoolId.is.null`
                );
            } else if (isSuperAdmin) {
                query = query.is('schoolId', null);
            }

            const { data, error } = await query;
            if (error) throw error;

            setQuotes((data ?? []) as DailyQuoteRow[]);
        } catch (err: unknown) {
            showToast(
                'error',
                isMissingTableError(err)
                    ? t('dailyQuotes.errTableMissing')
                    : t('dailyQuotes.errSave')
            );
        } finally {
            setIsLoading(false);
        }
    }, [
        canManageQuotes,
        isSuperAdmin,
        activeSchoolFilterId,
        showToast,
        t,
    ]);

    useEffect(() => {
        void loadQuotes();
    }, [loadQuotes]);

    const resetForm = () => {
        setEditingId(null);
        setQuoteContent('');
        setAuthorName('');
        setIsActive(true);
        if (!isSuperAdmin) {
            setTargetSchoolScope(defaultSchoolId);
        }
    };

    const handleStartEdit = (item: DailyQuoteRow) => {
        if (item.schoolId === null && !isSuperAdmin) {
            showToast('error', t('dailyQuotes.errGlobalEditRestricted'));
            return;
        }
        setEditingId(item.id);
        setQuoteContent(item.quote);
        setAuthorName(item.author ?? '');
        setIsActive(item.isActive);
        if (isSuperAdmin) {
            setTargetSchoolScope(item.schoolId ?? GLOBAL_SCHOOL_VALUE);
        }
    };

    const handleSaveQuote = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanedQuote = quoteContent.trim();
        if (cleanedQuote.length < MIN_QUOTE_LENGTH) {
            showToast('error', t('dailyQuotes.errMinLength'));
            return;
        }

        const resolvedSchoolId: string | null = isSuperAdmin
            ? targetSchoolScope === GLOBAL_SCHOOL_VALUE
                ? null
                : targetSchoolScope
            : defaultSchoolId;

        if (!isSuperAdmin && !resolvedSchoolId) {
            showToast('error', t('dailyQuotes.errNoSchool'));
            return;
        }

        setIsSaving(true);
        try {
            if (editingId) {
                let updateQuery = supabase
                    .from('daily_quotes')
                    .update({
                        ...(isSuperAdmin ? { schoolId: resolvedSchoolId } : {}),
                        quote: cleanedQuote,
                        author: authorName.trim() || null,
                        isActive,
                    })
                    .eq('id', editingId);

                if (!isSuperAdmin && resolvedSchoolId) {
                    updateQuery = updateQuery.eq('schoolId', resolvedSchoolId);
                }

                const { error } = await updateQuery;
                if (error) throw error;

                showToast('success', t('dailyQuotes.toastUpdateSuccess'));
            } else {
                const { error } = await supabase.from('daily_quotes').insert({
                    schoolId: resolvedSchoolId,
                    quote: cleanedQuote,
                    author: authorName.trim() || null,
                    isActive,
                    createdBy: user?.id ?? null,
                });

                if (error) throw error;

                showToast('success', t('dailyQuotes.toastCreateSuccess'));
            }

            resetForm();
            await loadQuotes();
        } catch (err: unknown) {
            showToast(
                'error',
                isMissingTableError(err)
                    ? t('dailyQuotes.errTableMissing')
                    : t('dailyQuotes.errSave')
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (item: DailyQuoteRow) => {
        if (item.schoolId === null && !isSuperAdmin) {
            showToast('error', t('dailyQuotes.errGlobalEditRestricted'));
            return;
        }

        try {
            let toggleQuery = supabase
                .from('daily_quotes')
                .update({ isActive: !item.isActive })
                .eq('id', item.id);

            if (!isSuperAdmin && defaultSchoolId) {
                toggleQuery = toggleQuery.eq('schoolId', defaultSchoolId);
            }

            const { error } = await toggleQuery;
            if (error) throw error;

            showToast(
                'success',
                item.isActive
                    ? t('dailyQuotes.toastDeactivated')
                    : t('dailyQuotes.toastActivated')
            );
            await loadQuotes();
        } catch {
            showToast('error', t('dailyQuotes.errToggleStatus'));
        }
    };

    const handleRequestDelete = (item: DailyQuoteRow) => {
        if (item.schoolId === null && !isSuperAdmin) {
            showToast('error', t('dailyQuotes.errGlobalDeleteRestricted'));
            return;
        }
        setDeleteTarget(item);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        if (deleteTarget.schoolId === null && !isSuperAdmin) {
            showToast('error', t('dailyQuotes.errGlobalDeleteRestricted'));
            setDeleteTarget(null);
            return;
        }

        setIsDeleting(true);
        try {
            let deleteQuery = supabase
                .from('daily_quotes')
                .delete()
                .eq('id', deleteTarget.id);

            if (!isSuperAdmin && defaultSchoolId) {
                deleteQuery = deleteQuery.eq('schoolId', defaultSchoolId);
            }

            const { error } = await deleteQuery;
            if (error) throw error;

            showToast('success', t('dailyQuotes.toastDeleteSuccess'));
            if (editingId === deleteTarget.id) {
                resetForm();
            }
            setDeleteTarget(null);
            await loadQuotes();
        } catch {
            showToast('error', t('dailyQuotes.errDelete'));
        } finally {
            setIsDeleting(false);
        }
    };

    // Pembatasan akses jika bukan Admin Sekolah atau Super Admin
    if (!canManageQuotes) {
        return (
            <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-amber-500/30 bg-card p-6 text-center space-y-3 shadow-sm">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                    <ShieldAlert size={24} />
                </div>
                <h2 className="text-base font-bold">
                    {t('dailyQuotes.accessRestrictedTitle')}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {t('dailyQuotes.accessRestrictedDesc')}
                </p>
            </div>
        );
    }

    const schoolOptions = (() => {
        const map = new Map<string, { id: string; name: string }>();
        if (school?.id && school?.name) {
            map.set(school.id, { id: school.id, name: school.name });
        }
        for (const s of simSchools) {
            map.set(s.id, { id: s.id, name: s.name });
        }
        return Array.from(map.values());
    })();

    const filteredQuotes = quotes.filter((item) => {
        const matchesScope =
            scopeFilter === 'ALL' ||
            (scopeFilter === 'GLOBAL' && item.schoolId === null) ||
            (scopeFilter === 'SCHOOL' && item.schoolId !== null);

        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
            !q ||
            item.quote.toLowerCase().includes(q) ||
            (item.author ?? '').toLowerCase().includes(q);

        return matchesScope && matchesSearch;
    });

    return (
        <div className="space-y-5 max-w-6xl mx-auto">
            {/* Toast Notification */}
            {toast && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 shadow-sm ${toast.type === 'success'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                            : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                        }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                        <AlertCircle size={16} className="text-red-600 shrink-0" />
                    )}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Header Halaman */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Sparkles className="text-amber-500" size={24} />
                        {t('dailyQuotes.pageTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {t('dailyQuotes.pageSubtitle')}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void loadQuotes()}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted transition cursor-pointer self-start sm:self-auto"
                >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    {t('dailyQuotes.btnRefresh')}
                </button>
            </div>

            {/* Layout 2 Kolom: Form Tambah/Edit (Kiri) + Daftar Kutipan (Kanan) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Kolom Form */}
                <form
                    onSubmit={(e) => void handleSaveQuote(e)}
                    className="lg:col-span-5 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                            <Sparkles size={16} className="text-amber-500" />
                            {editingId
                                ? t('dailyQuotes.formEditTitle')
                                : t('dailyQuotes.formAddTitle')}
                        </h2>

                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-border hover:bg-muted cursor-pointer"
                            >
                                <X size={13} />
                                {t('dailyQuotes.btnCancelEdit')}
                            </button>
                        )}
                    </div>

                    <div className="space-y-3.5">
                        {isSuperAdmin && (
                            <div>
                                <label className="text-xs font-semibold block mb-1">
                                    {t('dailyQuotes.labelTargetSchool')}
                                </label>
                                <select
                                    value={targetSchoolScope}
                                    onChange={(e) => setTargetSchoolScope(e.target.value)}
                                    className="form-input w-full text-xs font-semibold"
                                >
                                    <option value={GLOBAL_SCHOOL_VALUE}>
                                        {t('dailyQuotes.optionGlobalSchool')}
                                    </option>
                                    {schoolOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {t('dailyQuotes.optionSpecificSchool', { name: s.name })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-semibold block mb-1">
                                {t('dailyQuotes.labelQuoteText')}
                            </label>
                            <textarea
                                rows={4}
                                value={quoteContent}
                                onChange={(e) => setQuoteContent(e.target.value)}
                                placeholder={t('dailyQuotes.placeholderQuoteText')}
                                className="form-input w-full text-xs leading-relaxed"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold block mb-1">
                                {t('dailyQuotes.labelAuthor')}
                            </label>
                            <input
                                type="text"
                                value={authorName}
                                onChange={(e) => setAuthorName(e.target.value)}
                                placeholder={t('dailyQuotes.placeholderAuthor')}
                                className="form-input w-full text-xs"
                            />
                        </div>

                        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-muted/30 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="mt-0.5 rounded border-border text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-medium leading-relaxed">
                                {t('dailyQuotes.checkboxActiveLabel')}
                            </span>
                        </label>
                    </div>

                    <div className="pt-2 border-t border-border flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 cursor-pointer transition"
                        >
                            {editingId ? <Save size={15} /> : <Plus size={15} />}
                            {isSaving
                                ? t('dailyQuotes.btnSaving')
                                : editingId
                                    ? t('dailyQuotes.btnSaveChanges')
                                    : t('dailyQuotes.btnAddQuote')}
                        </button>
                    </div>
                </form>

                {/* Kolom Daftar Kutipan */}
                <div className="lg:col-span-7 space-y-3">
                    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-bold">
                                {t('dailyQuotes.listTitle', { count: filteredQuotes.length })}
                            </h2>

                            <div className="flex items-center gap-1.5">
                                {(
                                    [
                                        { key: 'ALL', label: t('common.all') },
                                        { key: 'GLOBAL', label: t('dailyQuotes.badgeGlobal') },
                                        { key: 'SCHOOL', label: t('dailyQuotes.badgeSchool') },
                                    ] as const
                                ).map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setScopeFilter(item.key)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${scopeFilter === item.key
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : 'bg-background border-border opacity-75 hover:opacity-100'
                                            }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500/40">
                            <Search
                                size={15}
                                className="shrink-0 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('common.searchPlaceholder')}
                                className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="p-0.5 rounded-md text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="rounded-2xl border border-border bg-card p-10 text-center text-xs opacity-70">
                            {t('dailyQuotes.loadingList')}
                        </div>
                    ) : filteredQuotes.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-2">
                            <Sparkles
                                size={28}
                                className="mx-auto text-amber-500 opacity-50"
                            />
                            <p className="text-xs opacity-75 leading-relaxed">
                                {t('dailyQuotes.emptyList')}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredQuotes.map((item) => {
                                const isGlobal = item.schoolId === null;
                                const canModify = !isGlobal || isSuperAdmin;

                                return (
                                    <div
                                        key={item.id}
                                        className={`rounded-2xl border p-4 transition ${item.isActive
                                                ? 'border-border bg-card'
                                                : 'border-border/60 bg-muted/30 opacity-75'
                                            }`}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                            <div className="space-y-2 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {isGlobal ? (
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                                            {t('dailyQuotes.badgeGlobal')}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                                                            {t('dailyQuotes.badgeSchool')}
                                                        </span>
                                                    )}

                                                    <span
                                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${item.isActive
                                                                ? 'bg-emerald-500/15 text-emerald-600'
                                                                : 'bg-red-500/15 text-red-500'
                                                            }`}
                                                    >
                                                        {item.isActive
                                                            ? t('dailyQuotes.badgeActive')
                                                            : t('dailyQuotes.badgeInactive')}
                                                    </span>
                                                </div>

                                                <blockquote className="text-sm font-medium italic text-foreground leading-relaxed">
                                                    “{item.quote}”
                                                </blockquote>

                                                {item.author && (
                                                    <p className="text-xs font-semibold text-muted-foreground">
                                                        — {item.author}
                                                    </p>
                                                )}
                                            </div>

                                            {canModify && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleToggleActive(item)}
                                                        className="p-2 rounded-xl border border-border hover:bg-muted transition cursor-pointer"
                                                        title={
                                                            item.isActive
                                                                ? t('dailyQuotes.titleDeactivate')
                                                                : t('dailyQuotes.titleActivate')
                                                        }
                                                    >
                                                        <Power
                                                            size={14}
                                                            className={
                                                                item.isActive
                                                                    ? 'text-emerald-600'
                                                                    : 'opacity-40'
                                                            }
                                                        />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEdit(item)}
                                                        className="p-2 rounded-xl border border-border hover:bg-muted transition cursor-pointer"
                                                        title={t('dailyQuotes.titleEdit')}
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRequestDelete(item)}
                                                        className="p-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/15 transition cursor-pointer"
                                                        title={t('dailyQuotes.titleDelete')}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Konfirmasi Hapus */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => !isDeleting && setDeleteTarget(null)}
                >
                    <div
                        className="rounded-2xl border border-border bg-card max-w-md w-full p-5 space-y-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-500 shrink-0">
                                <Trash2 size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">
                                    {t('dailyQuotes.modalDeleteTitle')}
                                </h3>
                                <p className="text-xs opacity-75 mt-1 leading-relaxed">
                                    {t('dailyQuotes.modalDeleteDesc', {
                                        quote: deleteTarget.quote,
                                    })}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setDeleteTarget(null)}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted cursor-pointer"
                            >
                                {t('dailyQuotes.btnCancel')}
                            </button>
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handleConfirmDelete()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                            >
                                {isDeleting
                                    ? t('dailyQuotes.btnDeleting')
                                    : t('dailyQuotes.btnConfirmDelete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}