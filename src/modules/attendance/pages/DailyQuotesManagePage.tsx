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
    FlaskConical,
    RefreshCw,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { attendanceService } from '../services/attendance.service';
import type { SupportedAttendanceLocale } from '../types/attendance.types';

export type QuoteTargetRole = 'ALL' | 'SISWA' | 'GURU';

export interface DailyQuoteItem {
    id: string;
    schoolId: string | null;
    quoteText: string;
    author: string | null;
    targetRole: QuoteTargetRole;
    isActive: boolean;
    createdBy?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

function extractErrorMessage(err: unknown, fallbackMessage: string): string {
    if (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof (err as { message?: unknown }).message === 'string'
    ) {
        const msg = (err as { message: string }).message.trim();
        if (msg.length > 0) return msg;
    }
    if (err instanceof Error && err.message.trim().length > 0) {
        return err.message.trim();
    }
    return fallbackMessage;
}

export function DailyQuotesManagePage() {
    const { t } = useTranslation();
    const currentLang: SupportedAttendanceLocale =
        t('common.language') === 'Language' ? 'en' : 'id';
    const isEn = currentLang === 'en';
    const genericFallback = isEn
        ? 'An unexpected error occurred.'
        : 'Terjadi kesalahan tak terduga.';

    const { user, school, hasAnyRole } = useAuthStore();
    const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);

    const [simSchools, setSimSchools] = useState<
        Array<{ id: string; name: string; npsn: string }>
    >([]);
    const [simSchoolId, setSimSchoolId] = useState<string>('');
    const activeSchoolId = isSuperAdmin
        ? simSchoolId || school?.id || user?.schoolId || ''
        : school?.id || user?.schoolId || '';

    const [quotes, setQuotes] = useState<DailyQuoteItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [targetFilter, setTargetFilter] = useState<
        'ALL_FILTER' | QuoteTargetRole
    >('ALL_FILTER');

    // State Form Tambah / Edit
    const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [quoteText, setQuoteText] = useState<string>('');
    const [authorName, setAuthorName] = useState<string>('');
    const [targetRole, setTargetRole] = useState<QuoteTargetRole>('ALL');
    const [isActive, setIsActive] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // State Hapus & Toast
    const [deleteTarget, setDeleteTarget] = useState<DailyQuoteItem | null>(null);
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

    // Sinkronkan sekolah aktif secara instan ketika sekolah di header diganti
    useEffect(() => {
        if (isSuperAdmin && school?.id) {
            setSimSchoolId(school.id);
        }
    }, [isSuperAdmin, school?.id]);

    // Muat daftar sekolah jika SUPER_ADMIN
    useEffect(() => {
        if (!isSuperAdmin) return;
        attendanceService
            .getAllSchoolsForSimulation()
            .then((list) => {
                setSimSchools(list);
                if (school?.id) setSimSchoolId(school.id);
                else if (list.length > 0) setSimSchoolId((prev) => prev || list[0].id);
            })
            .catch(console.error);
    }, [isSuperAdmin, school?.id]);

    const loadQuotes = useCallback(async () => {
        if (!activeSchoolId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('daily_quotes')
                .select('*')
                .or(`schoolId.eq.${activeSchoolId},schoolId.is.null`)
                .order('createdAt', { ascending: false });

            if (error) throw error;
            setQuotes((data ?? []) as DailyQuoteItem[]);
        } catch (err: unknown) {
            const detail = extractErrorMessage(err, genericFallback);
            showToast(
                'error',
                isEn
                    ? `Failed to load quotes: ${detail}`
                    : `Gagal memuat daftar kutipan: ${detail}`
            );
        } finally {
            setIsLoading(false);
        }
    }, [activeSchoolId, showToast, isEn, genericFallback]);

    useEffect(() => {
        void loadQuotes();
    }, [loadQuotes]);

    const resetForm = () => {
        setEditingId(null);
        setQuoteText('');
        setAuthorName('');
        setTargetRole('ALL');
        setIsActive(true);
        setIsFormOpen(false);
    };

    const handleOpenCreate = () => {
        setEditingId(null);
        setQuoteText('');
        setAuthorName('');
        setTargetRole('ALL');
        setIsActive(true);
        setIsFormOpen(true);
    };

    const handleOpenEdit = (item: DailyQuoteItem) => {
        setEditingId(item.id);
        setQuoteText(item.quoteText);
        setAuthorName(item.author ?? '');
        setTargetRole(item.targetRole);
        setIsActive(item.isActive);
        setIsFormOpen(true);
    };

    const handleSaveQuote = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanedQuote = quoteText.trim();
        if (!cleanedQuote) {
            showToast(
                'error',
                isEn
                    ? 'Motivational quote text cannot be empty.'
                    : 'Teks kutipan motivasi tidak boleh kosong.'
            );
            return;
        }
        if (!activeSchoolId) {
            showToast(
                'error',
                isEn ? 'No active school selected.' : 'Sekolah aktif belum dipilih.'
            );
            return;
        }

        setIsSaving(true);
        try {
            if (editingId) {
                let updateQuery = supabase
                    .from('daily_quotes')
                    .update({
                        quoteText: cleanedQuote,
                        author: authorName.trim() || null,
                        targetRole,
                        isActive,
                    })
                    .eq('id', editingId);

                if (!isSuperAdmin) {
                    updateQuery = updateQuery.eq('schoolId', activeSchoolId);
                }

                const { error } = await updateQuery;
                if (error) throw error;
                showToast(
                    'success',
                    isEn
                        ? 'Motivational quote updated successfully.'
                        : 'Kutipan motivasi berhasil diperbarui.'
                );
            } else {
                const { error } = await supabase.from('daily_quotes').insert({
                    schoolId: activeSchoolId,
                    quoteText: cleanedQuote,
                    author: authorName.trim() || null,
                    targetRole,
                    isActive,
                    createdBy: user?.id ?? null,
                });

                if (error) throw error;
                showToast(
                    'success',
                    isEn
                        ? 'New motivational quote added successfully.'
                        : 'Kutipan motivasi baru berhasil ditambahkan.'
                );
            }

            resetForm();
            await loadQuotes();
        } catch (err: unknown) {
            const detail = extractErrorMessage(err, genericFallback);
            showToast(
                'error',
                isEn
                    ? `Failed to save quote: ${detail}`
                    : `Gagal menyimpan kutipan: ${detail}`
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (item: DailyQuoteItem) => {
        if (!item.schoolId && !isSuperAdmin) return;
        try {
            let toggleQuery = supabase
                .from('daily_quotes')
                .update({ isActive: !item.isActive })
                .eq('id', item.id);

            if (!isSuperAdmin && activeSchoolId) {
                toggleQuery = toggleQuery.eq('schoolId', activeSchoolId);
            }

            const { error } = await toggleQuery;
            if (error) throw error;
            showToast(
                'success',
                item.isActive
                    ? isEn
                        ? 'Quote deactivated (hidden).'
                        : 'Kutipan dinonaktifkan (disembunyikan).'
                    : isEn
                        ? 'Quote activated and ready to display.'
                        : 'Kutipan diaktifkan dan siap tampil.'
            );
            await loadQuotes();
        } catch (err: unknown) {
            const detail = extractErrorMessage(err, genericFallback);
            showToast(
                'error',
                isEn
                    ? `Failed to update quote status: ${detail}`
                    : `Gagal mengubah status kutipan: ${detail}`
            );
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        if (!deleteTarget.schoolId && !isSuperAdmin) return;

        setIsDeleting(true);
        try {
            let deleteQuery = supabase
                .from('daily_quotes')
                .delete()
                .eq('id', deleteTarget.id);

            if (!isSuperAdmin && activeSchoolId) {
                deleteQuery = deleteQuery.eq('schoolId', activeSchoolId);
            }

            const { error } = await deleteQuery;
            if (error) throw error;

            showToast(
                'success',
                isEn
                    ? 'Motivational quote deleted successfully.'
                    : 'Kutipan motivasi berhasil dihapus.'
            );
            setDeleteTarget(null);
            await loadQuotes();
        } catch (err: unknown) {
            const detail = extractErrorMessage(err, genericFallback);
            showToast(
                'error',
                isEn
                    ? `Failed to delete quote: ${detail}`
                    : `Gagal menghapus kutipan: ${detail}`
            );
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredQuotes = quotes.filter((q) => {
        const matchesTarget =
            targetFilter === 'ALL_FILTER' || q.targetRole === targetFilter;
        const query = searchQuery.trim().toLowerCase();
        const matchesText =
            !query ||
            q.quoteText.toLowerCase().includes(query) ||
            (q.author ?? '').toLowerCase().includes(query);
        return matchesTarget && matchesText;
    });

    const renderTargetBadge = (role: QuoteTargetRole) => {
        if (role === 'SISWA') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                    {isEn ? 'Students Only' : 'Khusus Siswa'}
                </span>
            );
        }
        if (role === 'GURU') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                    {isEn ? 'Teachers & Staff Only' : 'Khusus Guru & Tendik'}
                </span>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25">
                {isEn ? 'All (Teachers & Students)' : 'Semua (Guru & Siswa)'}
            </span>
        );
    };

    return (
        <div className="space-y-5 max-w-5xl mx-auto">
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

            {/* Banner Simulasi Khusus SUPER_ADMIN */}
            {isSuperAdmin && simSchools.length > 0 && (
                <div
                    className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
                    style={{
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.35)',
                    }}
                >
                    <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-300">
                        <FlaskConical size={16} />
                        <span>
                            {isEn
                                ? 'Super Admin Mode — Manage School Quotes:'
                                : 'Mode Super Admin — Kelola Kutipan Sekolah:'}
                        </span>
                    </div>
                    <select
                        className="form-input min-w-60 text-xs"
                        value={simSchoolId}
                        onChange={(e) => setSimSchoolId(e.target.value)}
                    >
                        {simSchools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.npsn})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header Halaman */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Sparkles className="text-amber-500" size={24} />
                        {isEn ? 'Manage Daily Quotes' : 'Kelola Kutipan Harian'}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isEn
                            ? 'Configure daily inspirational & motivational quotes displayed on student and teacher attendance screens.'
                            : 'Atur kata-kata mutiara & motivasi harian yang tampil pada layar presensi siswa dan guru.'}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void loadQuotes()}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted transition cursor-pointer"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        {isEn ? 'Refresh' : 'Muat Ulang'}
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition cursor-pointer"
                    >
                        <Plus size={16} />
                        {isEn ? 'Add Quote' : 'Tambah Kutipan'}
                    </button>
                </div>
            </div>

            {/* Form Tambah / Edit Quote */}
            {isFormOpen && (
                <form
                    onSubmit={(e) => void handleSaveQuote(e)}
                    className="rounded-2xl border border-emerald-500/40 bg-card p-5 shadow-md space-y-4"
                >
                    <div className="flex items-center justify-between border-b border-border pb-3">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                            <Sparkles size={16} className="text-amber-500" />
                            {editingId
                                ? isEn
                                    ? 'Edit Motivational Quote'
                                    : 'Edit Kutipan Motivasi'
                                : isEn
                                    ? 'Add New Motivational Quote'
                                    : 'Tambah Kutipan Motivasi Baru'}
                        </h2>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="p-1 rounded-lg hover:bg-muted cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold block mb-1">
                                {isEn ? 'Quote Text' : 'Isi Kutipan / Kata Mutiara'}{' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={quoteText}
                                onChange={(e) => setQuoteText(e.target.value)}
                                placeholder={
                                    isEn
                                        ? 'Example: Education is the most powerful weapon which you can use to change the world.'
                                        : 'Contoh: Pendidikan adalah senjata paling mematikan yang bisa Anda gunakan untuk mengubah dunia.'
                                }
                                className="form-input w-full text-xs leading-relaxed"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-semibold block mb-1">
                                    {isEn
                                        ? 'Author / Source (Optional)'
                                        : 'Tokoh / Sumber (Opsional)'}
                                </label>
                                <input
                                    type="text"
                                    value={authorName}
                                    onChange={(e) => setAuthorName(e.target.value)}
                                    placeholder={
                                        isEn
                                            ? 'Example: Nelson Mandela'
                                            : 'Contoh: Ki Hajar Dewantara'
                                    }
                                    className="form-input w-full text-xs"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold block mb-1">
                                    {isEn ? 'Target Audience' : 'Target Tampilan'}
                                </label>
                                <select
                                    value={targetRole}
                                    onChange={(e) =>
                                        setTargetRole(e.target.value as QuoteTargetRole)
                                    }
                                    className="form-input w-full text-xs font-semibold"
                                >
                                    <option value="ALL">
                                        {isEn
                                            ? 'All (Teachers & Students)'
                                            : 'Semua (Guru & Siswa)'}
                                    </option>
                                    <option value="SISWA">
                                        {isEn ? 'Students Only' : 'Khusus Siswa'}
                                    </option>
                                    <option value="GURU">
                                        {isEn ? 'Teachers & Staff Only' : 'Khusus Guru & Tendik'}
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-semibold block mb-1">
                                    {isEn ? 'Display Status' : 'Status Tayang'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsActive((prev) => !prev)}
                                    className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${isActive
                                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                            : 'bg-muted/50 border-border opacity-70'
                                        }`}
                                >
                                    <Power size={14} />
                                    {isActive
                                        ? isEn
                                            ? 'Active (Displayed)'
                                            : 'Aktif (Ditampilkan)'
                                        : isEn
                                            ? 'Inactive (Draft)'
                                            : 'Nonaktif (Draf)'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted cursor-pointer"
                        >
                            {isEn ? 'Cancel' : 'Batal'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                        >
                            <Save size={14} />
                            {isSaving
                                ? isEn
                                    ? 'Saving...'
                                    : 'Menyimpan...'
                                : editingId
                                    ? isEn
                                        ? 'Save Changes'
                                        : 'Simpan Perubahan'
                                    : isEn
                                        ? 'Save Quote'
                                        : 'Simpan Kutipan'}
                        </button>
                    </div>
                </form>
            )}

            {/* Filter & Pencarian */}
            <div className="rounded-xl border border-border bg-card p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 flex-1 min-w-60 focus-within:ring-2 focus-within:ring-emerald-500/40">
                    <Search
                        size={15}
                        className="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                            isEn
                                ? 'Search quote text or author...'
                                : 'Cari isi kutipan atau nama tokoh...'
                        }
                        className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="p-0.5 rounded-md text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                            title={isEn ? 'Clear search' : 'Hapus pencarian'}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {(
                        [
                            {
                                key: 'ALL_FILTER',
                                label: isEn ? 'All Targets' : 'Semua Target',
                            },
                            {
                                key: 'ALL',
                                label: isEn
                                    ? 'All (Teachers & Students)'
                                    : 'Semua (Guru & Siswa)',
                            },
                            { key: 'SISWA', label: isEn ? 'Students' : 'Siswa' },
                            { key: 'GURU', label: isEn ? 'Teachers' : 'Guru' },
                        ] as const
                    ).map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setTargetFilter(f.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${targetFilter === f.key
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-background border-border opacity-75 hover:opacity-100'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Daftar Kutipan */}
            <div className="space-y-3">
                {isLoading ? (
                    <div className="rounded-xl border border-border bg-card p-10 text-center text-xs opacity-70">
                        {isEn
                            ? 'Loading motivational quotes...'
                            : 'Memuat daftar kutipan motivasi...'}
                    </div>
                ) : filteredQuotes.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-10 text-center space-y-2">
                        <Sparkles size={28} className="mx-auto text-amber-500 opacity-50" />
                        <p className="text-xs opacity-70">
                            {searchQuery || targetFilter !== 'ALL_FILTER'
                                ? isEn
                                    ? 'No quotes match the selected filter or search query.'
                                    : 'Tidak ada kutipan yang cocok dengan filter atau kata kunci pencarian.'
                                : isEn
                                    ? 'No daily quotes for this school yet. Click "Add Quote" to get started.'
                                    : 'Belum ada kutipan harian untuk sekolah ini. Klik "Tambah Kutipan" untuk mulai menambahkan.'}
                        </p>
                    </div>
                ) : (
                    filteredQuotes.map((item) => {
                        const isSystemGlobal = item.schoolId === null;
                        const canModify = !isSystemGlobal || isSuperAdmin;

                        return (
                            <div
                                key={item.id}
                                className={`rounded-2xl border p-4 transition ${item.isActive
                                        ? 'border-border bg-card'
                                        : 'border-border/60 bg-muted/30 opacity-70'
                                    }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    <div className="space-y-2 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {renderTargetBadge(item.targetRole)}
                                            {isSystemGlobal ? (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                                    {isEn
                                                        ? 'System Default (Global)'
                                                        : 'Bawaan Sistem (Global)'}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-500/15 text-slate-700 dark:text-slate-300">
                                                    {isEn ? 'School Quote' : 'Kutipan Sekolah'}
                                                </span>
                                            )}
                                            <span
                                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${item.isActive
                                                        ? 'bg-emerald-500/15 text-emerald-600'
                                                        : 'bg-red-500/15 text-red-500'
                                                    }`}
                                            >
                                                {item.isActive
                                                    ? isEn
                                                        ? 'ACTIVE'
                                                        : 'AKTIF'
                                                    : isEn
                                                        ? 'INACTIVE'
                                                        : 'NONAKTIF'}
                                            </span>
                                        </div>

                                        <blockquote className="text-sm font-medium italic text-foreground leading-relaxed">
                                            “{item.quoteText}”
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
                                                        ? isEn
                                                            ? 'Deactivate quote'
                                                            : 'Nonaktifkan kutipan'
                                                        : isEn
                                                            ? 'Activate quote'
                                                            : 'Aktifkan kutipan'
                                                }
                                            >
                                                <Power
                                                    size={14}
                                                    className={
                                                        item.isActive ? 'text-emerald-600' : 'opacity-40'
                                                    }
                                                />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-2 rounded-xl border border-border hover:bg-muted transition cursor-pointer"
                                                title={isEn ? 'Edit quote' : 'Edit kutipan'}
                                            >
                                                <Edit3 size={14} />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget(item)}
                                                className="p-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/15 transition cursor-pointer"
                                                title={isEn ? 'Delete quote' : 'Hapus kutipan'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal Konfirmasi Hapus */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => !isDeleting && setDeleteTarget(null)}
                >
                    <div
                        className="rounded-2xl border border-border bg-card max-w-sm w-full p-5 space-y-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-500 shrink-0">
                                <Trash2 size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">
                                    {isEn
                                        ? 'Delete Motivational Quote?'
                                        : 'Hapus Kutipan Motivasi?'}
                                </h3>
                                <p className="text-xs opacity-75 mt-1 leading-relaxed">
                                    {isEn
                                        ? 'Deleted quotes cannot be restored and will no longer appear on attendance pages.'
                                        : 'Kutipan yang dihapus tidak dapat dikembalikan dan tidak akan muncul lagi di halaman presensi.'}
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
                                {isEn ? 'Cancel' : 'Batal'}
                            </button>
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handleConfirmDelete()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                            >
                                {isDeleting
                                    ? isEn
                                        ? 'Deleting...'
                                        : 'Menghapus...'
                                    : isEn
                                        ? 'Yes, Delete'
                                        : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}