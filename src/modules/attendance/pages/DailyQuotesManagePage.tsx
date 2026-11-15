// src/modules/attendance/pages/DailyQuotesManagePage.tsx
import { useState, useEffect, useCallback } from 'react';
import {
    Sparkles,
    Plus,
    Edit3,
    Trash2,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Globe,
    Building2,
    AlertTriangle,
    Save,
    X,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';

export interface DailyQuoteItem {
    id: string;
    schoolId: string | null;
    quote: string;
    author?: string | null;
    isActive: boolean;
    createdAt?: string;
}

export function DailyQuotesManagePage() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isAdmin = user?.role === 'ADMIN';
    const canManage = isSuperAdmin || isAdmin;

    const [quotes, setQuotes] = useState<DailyQuoteItem[]>([]);
    const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // State Form Tambah / Edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [quoteText, setQuoteText] = useState<string>('');
    const [authorText, setAuthorText] = useState<string>('');
    const [targetSchoolId, setTargetSchoolId] = useState<string>('GLOBAL');
    const [isActive, setIsActive] = useState<boolean>(true);

    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    // Muat daftar sekolah jika SUPER_ADMIN
    useEffect(() => {
        if (!isSuperAdmin) {
            if (school?.id) setTargetSchoolId(school.id);
            return;
        }

        supabase
            .from('schools')
            .select('id, name')
            .order('name')
            .then(({ data }) => {
                setSchools(data ?? []);
            });
    }, [isSuperAdmin, school?.id]);

    // Muat daftar Quotes dari Supabase
    const loadQuotes = useCallback(async () => {
        if (!canManage) return;
        setIsLoading(true);
        try {
            let query = supabase
                .from('daily_quotes')
                .select('*')
                .order('createdAt', { ascending: false });

            if (!isSuperAdmin && school?.id) {
                query = query.or(`schoolId.eq.${school.id},schoolId.is.null`);
            }

            const { data, error } = await query;
            if (error) throw error;
            setQuotes((data ?? []) as DailyQuoteItem[]);
        } catch (err: any) {
            showToast(
                'error',
                err.message ??
                'Tabel daily_quotes belum tersedia. Jalankan skrip SQL di Supabase terlebih dahulu.'
            );
        } finally {
            setIsLoading(false);
        }
    }, [canManage, isSuperAdmin, school?.id]);

    useEffect(() => {
        loadQuotes();
    }, [loadQuotes]);

    const resetForm = () => {
        setEditingId(null);
        setQuoteText('');
        setAuthorText('');
        setIsActive(true);
        setTargetSchoolId(isSuperAdmin ? 'GLOBAL' : school?.id || '');
    };

    const handleEditClick = (item: DailyQuoteItem) => {
        setEditingId(item.id);
        setQuoteText(item.quote);
        setAuthorText(item.author ?? '');
        setIsActive(item.isActive);
        setTargetSchoolId(item.schoolId ?? 'GLOBAL');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) return;
        if (quoteText.trim().length < 10) {
            showToast('error', 'Isi kutipan minimal 10 karakter agar bermakna.');
            return;
        }

        setIsSaving(true);
        try {
            const resolvedSchoolId = isSuperAdmin
                ? targetSchoolId === 'GLOBAL'
                    ? null
                    : targetSchoolId
                : school?.id ?? null;

            if (editingId) {
                const { error } = await supabase
                    .from('daily_quotes')
                    .update({
                        quote: quoteText.trim(),
                        author: authorText.trim() || null,
                        schoolId: resolvedSchoolId,
                        isActive,
                    })
                    .eq('id', editingId);

                if (error) throw error;
                showToast('success', 'Kata Hari Ini berhasil diperbarui!');
            } else {
                const { error } = await supabase.from('daily_quotes').insert({
                    quote: quoteText.trim(),
                    author: authorText.trim() || null,
                    schoolId: resolvedSchoolId,
                    isActive,
                    createdBy: user?.id ?? null,
                });

                if (error) throw error;
                showToast('success', 'Kata Hari Ini baru berhasil ditambahkan!');
            }

            resetForm();
            await loadQuotes();
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal menyimpan Kata Hari Ini.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (item: DailyQuoteItem) => {
        // Admin sekolah tidak boleh mengubah quote Global milik Super Admin
        if (!isSuperAdmin && item.schoolId === null) {
            showToast('error', 'Quote Global hanya dapat diubah oleh Super Admin.');
            return;
        }

        try {
            const { error } = await supabase
                .from('daily_quotes')
                .update({ isActive: !item.isActive })
                .eq('id', item.id);

            if (error) throw error;
            showToast(
                'success',
                !item.isActive ? 'Kutipan diaktifkan.' : 'Kutipan dinonaktifkan.'
            );
            await loadQuotes();
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal mengubah status kutipan.');
        }
    };

    const handleDelete = async (item: DailyQuoteItem) => {
        if (!isSuperAdmin && item.schoolId === null) {
            showToast('error', 'Quote Global hanya dapat dihapus oleh Super Admin.');
            return;
        }

        if (!window.confirm('Yakin ingin menghapus kutipan ini?')) return;

        try {
            const { error } = await supabase
                .from('daily_quotes')
                .delete()
                .eq('id', item.id);

            if (error) throw error;
            showToast('success', 'Kutipan berhasil dihapus.');
            if (editingId === item.id) resetForm();
            await loadQuotes();
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal menghapus kutipan.');
        }
    };

    if (!canManage) {
        return (
            <div className="page-container">
                <div className="data-card p-6 text-center space-y-2">
                    <AlertTriangle size={32} className="mx-auto text-amber-500" />
                    <h2 className="font-bold text-base">Akses Terbatas</h2>
                    <p className="text-xs opacity-75">
                        Halaman pengelolaan Kata Hari Ini hanya tersedia untuk Admin Sekolah
                        dan Super Admin.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container space-y-5">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <Sparkles size={22} className="text-amber-500" />
                        Kelola Kata Hari Ini (Quotes)
                    </h1>
                    <p className="page-subtitle">
                        Atur kata mutiara & motivasi harian yang tampil pada aplikasi
                        presensi guru
                    </p>
                </div>
                <button
                    type="button"
                    onClick={loadQuotes}
                    disabled={isLoading}
                    className="btn-secondary"
                >
                    <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Toast */}
            {toast && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${toast.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                        : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
                        }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : (
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    )}
                    <span>{toast.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Form Tambah / Edit Quote (5 Kolom) */}
                <div className="lg:col-span-5">
                    <form onSubmit={handleSubmit} className="data-card p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <h2 className="font-bold text-sm flex items-center gap-2">
                                {editingId ? <Edit3 size={16} /> : <Plus size={16} />}
                                {editingId ? 'Edit Kata Hari Ini' : 'Tambah Kata Hari Ini'}
                            </h2>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="text-xs text-red-500 flex items-center gap-1 hover:underline"
                                >
                                    <X size={14} /> Batal Edit
                                </button>
                            )}
                        </div>

                        {isSuperAdmin && (
                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    Target Tampilan Sekolah
                                </label>
                                <select
                                    className="form-input w-full text-xs"
                                    value={targetSchoolId}
                                    onChange={(e) => setTargetSchoolId(e.target.value)}
                                >
                                    <option value="GLOBAL">
                                        Semua Sekolah (Global Super Admin)
                                    </option>
                                    {schools.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            Khusus: {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold mb-1">
                                Isi Kutipan / Kata Motivasi *
                            </label>
                            <textarea
                                rows={4}
                                required
                                value={quoteText}
                                onChange={(e) => setQuoteText(e.target.value)}
                                placeholder="Contoh: Keteladanan guru hari ini adalah inspirasi masa depan bagi setiap peserta didik."
                                className="form-input w-full text-xs"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold mb-1">
                                Sumber / Tokoh (Opsional)
                            </label>
                            <input
                                type="text"
                                value={authorText}
                                onChange={(e) => setAuthorText(e.target.value)}
                                placeholder="Contoh: Ki Hajar Dewantara / Kepala Sekolah"
                                className="form-input w-full text-xs"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="rounded"
                            />
                            <span>Aktifkan kutipan ini agar tampil di layar presensi</span>
                        </label>

                        <button
                            type="submit"
                            disabled={isSaving}
                            className="btn-primary w-full justify-center py-2.5 text-xs font-bold"
                        >
                            <Save size={15} />
                            {isSaving
                                ? 'Menyimpan...'
                                : editingId
                                    ? 'Simpan Perubahan'
                                    : 'Tambahkan Kutipan'}
                        </button>
                    </form>
                </div>

                {/* Daftar Quotes Tersimpan (7 Kolom) */}
                <div className="lg:col-span-7">
                    <div className="data-card p-5 space-y-3">
                        <h2 className="font-bold text-sm border-b border-border pb-3">
                            Daftar Kata Hari Ini ({quotes.length})
                        </h2>

                        {isLoading ? (
                            <div className="py-10 text-center text-xs opacity-70 flex items-center justify-center gap-2">
                                <RefreshCw size={16} className="spin" /> Memuat daftar...
                            </div>
                        ) : quotes.length === 0 ? (
                            <div className="py-10 text-center text-xs opacity-60">
                                Belum ada kutipan tersimpan di database. Tambahkan kutipan baru
                                di samping!
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-135 overflow-y-auto pr-1">
                                {quotes.map((item) => {
                                    const isGlobal = item.schoolId === null;
                                    const lockedForAdmin = !isSuperAdmin && isGlobal;

                                    return (
                                        <div
                                            key={item.id}
                                            className={`p-4 rounded-2xl border transition ${item.isActive
                                                ? 'bg-muted/30 border-border'
                                                : 'bg-muted/10 border-border/50 opacity-60'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1.5 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {isGlobal ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300">
                                                                <Globe size={11} /> Global
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300">
                                                                <Building2 size={11} /> Sekolah
                                                            </span>
                                                        )}

                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.isActive
                                                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                                                : 'bg-slate-500/15 text-slate-500'
                                                                }`}
                                                        >
                                                            {item.isActive ? 'Aktif' : 'Nonaktif'}
                                                        </span>
                                                    </div>

                                                    <p className="text-xs leading-relaxed italic">
                                                        "{item.quote}"
                                                    </p>
                                                    {item.author && (
                                                        <p className="text-[11px] font-semibold opacity-70">
                                                            — {item.author}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Tombol Aksi */}
                                                {!lockedForAdmin && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleActive(item)}
                                                            className="p-1.5 rounded-lg hover:bg-muted transition"
                                                            title={
                                                                item.isActive
                                                                    ? 'Nonaktifkan kutipan'
                                                                    : 'Aktifkan kutipan'
                                                            }
                                                        >
                                                            {item.isActive ? (
                                                                <CheckCircle2
                                                                    size={15}
                                                                    className="text-emerald-500"
                                                                />
                                                            ) : (
                                                                <XCircle size={15} className="text-slate-400" />
                                                            )}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditClick(item)}
                                                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-500/15 transition"
                                                            title="Edit kutipan"
                                                        >
                                                            <Edit3 size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(item)}
                                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                                                            title="Hapus kutipan"
                                                        >
                                                            <Trash2 size={15} />
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
            </div>
        </div>
    );
}