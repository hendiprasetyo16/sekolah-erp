// src/modules/subjects/pages/SubjectsPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    Plus,
    Search,
    Pencil,
    Trash2,
    Sparkles,
    CheckCircle2,
    XCircle,
    ArrowUpDown,
    Loader2,
    AlertCircle,
    X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
    SubjectItem,
    SubjectCategory,
    SubjectFormState,
} from '../types/subject.types';
import {
    getSubjectsBySchool,
    createSubject,
    updateSubject,
    deleteSubject,
    seedDefaultMerdekaSubjects,
} from '../services/subject.service';

const CATEGORY_OPTIONS: { value: SubjectCategory; label: string; badgeClass: string }[] = [
    {
        value: 'UMUM',
        label: 'Kelompok Umum / Wajib',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
    },
    {
        value: 'PILIHAN',
        label: 'Mata Pelajaran Pilihan',
        badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300',
    },
    {
        value: 'KEJURUAN',
        label: 'Kejuruan / Peminatan',
        badgeClass: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300',
    },
    {
        value: 'MUATAN_LOKAL',
        label: 'Muatan Lokal',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    {
        value: 'KOKURIKULER',
        label: 'Kokurikuler / Projek',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
    },
];

const INITIAL_FORM: SubjectFormState = {
    code: '',
    name: '',
    category: 'UMUM',
    sortOrder: 100,
    description: '',
    isActive: true,
};

export default function SubjectsPage() {
    const authUser = useAuthStore((state) => state.user);
    const authSchool = useAuthStore((state) => state.school);

    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isSeeding, setIsSeeding] = useState<boolean>(false);

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
        null
    );

    // State Modal Tambah / Edit
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
    const [form, setForm] = useState<SubjectFormState>(INITIAL_FORM);

    // 1. Ambil schoolId dari store atau profil public.users
    const resolveSchoolId = useCallback(async (): Promise<string | null> => {
        const fromStore = authSchool?.id || authUser?.schoolId;
        if (fromStore) return fromStore;

        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile } = await supabase
            .from('users')
            .select('schoolId')
            .eq('id', user.id)
            .single();

        return (profile?.schoolId as string | null) ?? null;
    }, [authSchool?.id, authUser?.schoolId]);

    // 2. Muat data mata pelajaran dari Supabase
    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const currentSchoolId = await resolveSchoolId();
            setSchoolId(currentSchoolId);

            if (!currentSchoolId) {
                setSubjects([]);
                return;
            }

            const items = await getSubjectsBySchool(currentSchoolId);
            setSubjects(items);
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.',
            });
        } finally {
            setIsLoading(false);
        }
    }, [resolveSchoolId]);

    useEffect(() => {
        void loadSubjects();
    }, [loadSubjects]);

    // Filter daftar mapel berdasarkan pencarian & kategori
    const filteredSubjects = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return subjects.filter((item) => {
            const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
            const matchesQuery =
                !q ||
                item.name.toLowerCase().includes(q) ||
                (item.code ?? '').toLowerCase().includes(q) ||
                (item.description ?? '').toLowerCase().includes(q);
            return matchesCategory && matchesQuery;
        });
    }, [subjects, searchQuery, categoryFilter]);

    const activeCount = useMemo(
        () => subjects.filter((s) => s.isActive).length,
        [subjects]
    );

    // Buka modal tambah
    const handleOpenCreate = () => {
        const nextOrder =
            subjects.length > 0 ? Math.max(...subjects.map((s) => s.sortOrder)) + 10 : 10;
        setEditingSubject(null);
        setForm({
            ...INITIAL_FORM,
            sortOrder: nextOrder,
        });
        setFeedback(null);
        setIsModalOpen(true);
    };

    // Buka modal edit
    const handleOpenEdit = (subject: SubjectItem) => {
        setEditingSubject(subject);
        setForm({
            code: subject.code ?? '',
            name: subject.name,
            category: (subject.category as SubjectCategory) || 'UMUM',
            sortOrder: subject.sortOrder,
            description: subject.description ?? '',
            isActive: subject.isActive,
        });
        setFeedback(null);
        setIsModalOpen(true);
    };

    // Simpan tambah / edit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId) {
            setFeedback({ type: 'error', message: 'Identitas sekolah belum terpilih.' });
            return;
        }
        if (!form.name.trim()) {
            setFeedback({ type: 'error', message: 'Nama mata pelajaran wajib diisi.' });
            return;
        }

        setIsSaving(true);
        setFeedback(null);

        try {
            if (editingSubject) {
                await updateSubject(editingSubject.id, schoolId, form);
                setFeedback({
                    type: 'success',
                    message: `Mata pelajaran "${form.name}" berhasil diperbarui.`,
                });
            } else {
                await createSubject({
                    schoolId,
                    ...form,
                });
                setFeedback({
                    type: 'success',
                    message: `Mata pelajaran "${form.name}" berhasil ditambahkan.`,
                });
            }
            setIsModalOpen(false);
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err instanceof Error ? err.message : 'Gagal menyimpan mata pelajaran.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Hapus mata pelajaran
    const handleDelete = async (subject: SubjectItem) => {
        if (!schoolId) return;
        const confirmed = window.confirm(
            `Hapus mata pelajaran "${subject.name}"? Tindakan ini tidak dapat dibatalkan.`
        );
        if (!confirmed) return;

        try {
            await deleteSubject(subject.id, schoolId);
            setFeedback({
                type: 'success',
                message: `Mata pelajaran "${subject.name}" berhasil dihapus.`,
            });
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err instanceof Error ? err.message : 'Gagal menghapus mata pelajaran.',
            });
        }
    };

    // Isi otomatis paket Kurikulum Merdeka
    const handleSeedDefaults = async () => {
        if (!schoolId) return;
        setIsSeeding(true);
        setFeedback(null);
        try {
            const existingCodes = subjects.map((s) => s.code ?? '');
            const inserted = await seedDefaultMerdekaSubjects(schoolId, existingCodes);
            if (inserted === 0) {
                setFeedback({
                    type: 'success',
                    message: 'Semua mata pelajaran standar Kurikulum Merdeka sudah tersedia.',
                });
            } else {
                setFeedback({
                    type: 'success',
                    message: `${inserted} mata pelajaran Kurikulum Merdeka berhasil ditambahkan.`,
                });
                await loadSubjects();
            }
        } catch (err) {
            setFeedback({
                type: 'error',
                message: err instanceof Error ? err.message : 'Gagal mengisi paket mata pelajaran.',
            });
        } finally {
            setIsSeeding(false);
        }
    };

    const getCategoryMeta = (category: string) => {
        return (
            CATEGORY_OPTIONS.find((opt) => opt.value === category) ?? {
                value: category,
                label: category,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
            }
        );
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header Halaman */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Master Mata Pelajaran
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Kelola daftar mata pelajaran dan urutan tampil pada Jadwal Pelajaran serta Cetak PDF
                        Raport.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={handleSeedDefaults}
                        disabled={isSeeding || !schoolId}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card text-foreground text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {isSeeding ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4 text-amber-500" />
                        )}
                        Isi Cepat Kurikulum Merdeka
                    </button>

                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        disabled={!schoolId}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Mata Pelajaran
                    </button>
                </div>
            </div>

            {/* Notifikasi Umpan Balik */}
            {feedback && (
                <div
                    className={cn(
                        'flex items-center justify-between gap-3 p-4 rounded-xl border text-sm',
                        feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
                    )}
                >
                    <div className="flex items-center gap-2.5">
                        {feedback.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                        ) : (
                            <AlertCircle className="w-5 h-5 shrink-0" />
                        )}
                        <span>{feedback.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="p-1 rounded-md hover:bg-black/5"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Ringkasan Statistik */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-sm">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-4 rounded-xl bg-blue-500/10">
                            <BookOpen className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Mata Pelajaran</p>
                            <p className="text-3xl font-bold">{subjects.length}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-4 rounded-xl bg-emerald-500/10">
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Mapel Aktif</p>
                            <p className="text-3xl font-bold">{activeCount}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-4 rounded-xl bg-indigo-500/10">
                            <ArrowUpDown className="w-6 h-6 text-indigo-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Integrasi Modul</p>
                            <p className="text-sm font-semibold text-foreground mt-1">
                                Jadwal Pelajaran &amp; PDF Raport
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabel Data Mata Pelajaran */}
            <Card className="border-none shadow-sm">
                <CardHeader className="pb-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg">Daftar Mata Pelajaran</CardTitle>
                        <CardDescription>
                            Kolom &ldquo;Urutan Raport&rdquo; menentukan posisi baris mata pelajaran saat cetak
                            raport PDF.
                        </CardDescription>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari kode atau nama mapel..."
                                className="pl-9 pr-3 py-2 text-sm rounded-lg border bg-background w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </div>

                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="ALL">Semua Kategori</option>
                            {CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm">Memuat daftar mata pelajaran...</p>
                        </div>
                    ) : filteredSubjects.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                            <BookOpen className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                            <p className="font-medium text-foreground">Belum ada data mata pelajaran</p>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                Tambahkan mata pelajaran secara manual atau klik tombol{' '}
                                <strong>Isi Cepat Kurikulum Merdeka</strong> di pojok kanan atas.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                    <tr>
                                        <th className="px-6 py-4 font-medium w-24">Urutan</th>
                                        <th className="px-6 py-4 font-medium w-28">Kode</th>
                                        <th className="px-6 py-4 font-medium">Nama Mata Pelajaran</th>
                                        <th className="px-6 py-4 font-medium">Kategori</th>
                                        <th className="px-6 py-4 font-medium">Status</th>
                                        <th className="px-6 py-4 font-medium text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSubjects.map((item) => {
                                        const catMeta = getCategoryMeta(item.category);
                                        return (
                                            <tr
                                                key={item.id}
                                                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                                            >
                                                <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                                                    #{item.sortOrder}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {item.code ? (
                                                        <span className="px-2.5 py-1 rounded-md bg-muted font-mono text-xs font-semibold">
                                                            {item.code}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-semibold text-foreground">{item.name}</div>
                                                    {item.description && (
                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                            {item.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className={cn('font-medium', catMeta.badgeClass)}>
                                                        {catMeta.label}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {item.isActive ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            Aktif
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                                            <XCircle className="w-3.5 h-3.5" />
                                                            Nonaktif
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEdit(item)}
                                                            title="Edit Mata Pelajaran"
                                                            className="p-2 rounded-lg border hover:bg-muted text-foreground transition-colors"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(item)}
                                                            title="Hapus Mata Pelajaran"
                                                            className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal Tambah / Edit Mata Pelajaran */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold">
                                {editingSubject ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-muted"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">
                                        Kode Mapel <span className="text-muted-foreground text-xs">(Opsional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                                        placeholder="Contoh: INF, KKA, MTK"
                                        className="w-full px-3 py-2 text-sm rounded-lg border bg-background uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Urutan di Raport</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        value={form.sortOrder}
                                        onChange={(e) =>
                                            setForm({ ...form, sortOrder: parseInt(e.target.value, 10) || 100 })
                                        }
                                        className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    Nama Mata Pelajaran <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Contoh: Koding dan Kecerdasan Artifisial"
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">Kategori Kelompok</label>
                                <select
                                    value={form.category}
                                    onChange={(e) =>
                                        setForm({ ...form, category: e.target.value as SubjectCategory })
                                    }
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    {CATEGORY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    Keterangan / Catatan <span className="text-muted-foreground text-xs">(Opsional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Misal: Kelas X Fase E Kurikulum Merdeka"
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>

                            <label className="flex items-center gap-2.5 text-sm cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                                    className="rounded border-gray-300"
                                />
                                <span>Mata pelajaran aktif (tampil pada pilihan jadwal &amp; input nilai)</span>
                            </label>

                            <div className="pt-4 border-t flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingSubject ? 'Simpan Perubahan' : 'Simpan Mata Pelajaran'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}