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
    AlertTriangle,
    ShieldAlert,
    X,
} from 'lucide-react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
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
    deleteSubjectsByIds,
    deleteAllSubjectsBySchool,
    seedDefaultMerdekaSubjects,
} from '../services/subject.service';

const INITIAL_FORM: SubjectFormState = {
    code: '',
    name: '',
    category: 'UMUM',
    sortOrder: 100,
    description: '',
    isActive: true,
};

const MANAGER_ROLES = new Set([
    'SUPER_ADMIN',
    'ADMIN',
    'KEPALA_SEKOLAH',
    'OPERATOR',
    'STAFF_TU',
]);

export default function SubjectsPage() {
    const { t } = useTranslation();
    const authUser = useAuthStore((state) => state.user);
    const authSchool = useAuthStore((state) => state.school);

    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [schoolLevel, setSchoolLevel] = useState<string | null>(null);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isSeeding, setIsSeeding] = useState<boolean>(false);

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    // State Seleksi Baris (Multi-Select Checkbox)
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] =
        useState<boolean>(false);
    const [isDeletingSelected, setIsDeletingSelected] = useState<boolean>(false);

    // State Modal Tambah / Edit
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
    const [form, setForm] = useState<SubjectFormState>(INITIAL_FORM);

    // State Modal Konfirmasi Hapus Satuan
    const [deleteTarget, setDeleteTarget] = useState<SubjectItem | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // State Modal Konfirmasi Hapus Semua (Khusus SUPER_ADMIN)
    const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
    const [deleteAllConfirmText, setDeleteAllConfirmText] = useState<string>('');
    const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

    const categoryOptions = useMemo<
        {
            value: SubjectCategory;
            label: string;
            badgeClass: string;
        }[]
    >(
        () => [
            {
                value: 'UMUM',
                label: t('subjects.cat_UMUM'),
                badgeClass:
                    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
            },
            {
                value: 'PILIHAN',
                label: t('subjects.cat_PILIHAN'),
                badgeClass:
                    'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300',
            },
            {
                value: 'KEJURUAN',
                label: t('subjects.cat_KEJURUAN'),
                badgeClass:
                    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300',
            },
            {
                value: 'MUATAN_LOKAL',
                label: t('subjects.cat_MUATAN_LOKAL'),
                badgeClass:
                    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
            },
            {
                value: 'KOKURIKULER',
                label: t('subjects.cat_KOKURIKULER'),
                badgeClass:
                    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
            },
        ],
        [t]
    );

    const deleteAllKeyword = t('subjects.deleteAllKeyword');

    const canManageSubjects = useMemo(() => {
        const primaryRole = authUser?.role ?? '';
        const extraRoles = Array.isArray(authUser?.additionalRoles)
            ? authUser.additionalRoles
            : [];
        return (
            MANAGER_ROLES.has(primaryRole) ||
            extraRoles.some((r) => MANAGER_ROLES.has(r))
        );
    }, [authUser]);

    const isSuperAdmin = useMemo(() => {
        const primaryRole = authUser?.role ?? '';
        const extraRoles = Array.isArray(authUser?.additionalRoles)
            ? authUser.additionalRoles
            : [];
        return (
            primaryRole === 'SUPER_ADMIN' ||
            extraRoles.includes('SUPER_ADMIN')
        );
    }, [authUser]);

    const resolveSchoolContext = useCallback(async (): Promise<{
        id: string | null;
        level: string | null;
    }> => {
        const storeId = authSchool?.id || authUser?.schoolId || null;
        const storeLevel = authSchool?.level || null;

        if (storeId && storeLevel) {
            return { id: storeId, level: storeLevel };
        }

        let targetSchoolId = storeId;
        if (!targetSchoolId) {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return { id: null, level: null };

            const { data: profile } = await supabase
                .from('users')
                .select('schoolId')
                .eq('id', user.id)
                .single();

            targetSchoolId = (profile?.schoolId as string | null) ?? null;
        }

        if (!targetSchoolId) return { id: null, level: null };

        const { data: schoolRow } = await supabase
            .from('schools')
            .select('level')
            .eq('id', targetSchoolId)
            .single();

        return {
            id: targetSchoolId,
            level: (schoolRow?.level as string | null) ?? null,
        };
    }, [authSchool?.id, authSchool?.level, authUser?.schoolId]);

    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const ctx = await resolveSchoolContext();
            setSchoolId(ctx.id);
            setSchoolLevel(ctx.level);

            if (!ctx.id) {
                setSubjects([]);
                return;
            }

            const items = await getSubjectsBySchool(ctx.id);
            setSubjects(items);
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error ? err.message : t('subjects.errLoad'),
            });
        } finally {
            setIsLoading(false);
        }
    }, [resolveSchoolContext, t]);

    useEffect(() => {
        void loadSubjects();
    }, [loadSubjects]);

    const filteredSubjects = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return subjects.filter((item) => {
            const matchesCategory =
                categoryFilter === 'ALL' || item.category === categoryFilter;
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

    // Helper seleksi cepat
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const selectedSubjects = useMemo(
        () => subjects.filter((item) => selectedSet.has(item.id)),
        [subjects, selectedSet]
    );

    const isAllFilteredSelected = useMemo(() => {
        if (filteredSubjects.length === 0) return false;
        return filteredSubjects.every((item) => selectedSet.has(item.id));
    }, [filteredSubjects, selectedSet]);

    const isSomeFilteredSelected = useMemo(() => {
        if (filteredSubjects.length === 0) return false;
        const selectedInFilterCount = filteredSubjects.filter((item) =>
            selectedSet.has(item.id)
        ).length;
        return (
            selectedInFilterCount > 0 &&
            selectedInFilterCount < filteredSubjects.length
        );
    }, [filteredSubjects, selectedSet]);

    // Centang / batal centang 1 baris
    const handleToggleSelectOne = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    // Centang / batal centang semua baris yang sedang tampil di tabel
    const handleToggleSelectAllFiltered = () => {
        const filteredIds = filteredSubjects.map((item) => item.id);
        if (isAllFilteredSelected) {
            const filteredIdSet = new Set(filteredIds);
            setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
        } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
        }
    };

    const handleOpenCreate = () => {
        const nextOrder =
            subjects.length > 0
                ? Math.max(...subjects.map((s) => s.sortOrder)) + 10
                : 10;
        setEditingSubject(null);
        setForm({
            ...INITIAL_FORM,
            sortOrder: nextOrder,
        });
        setFeedback(null);
        setIsModalOpen(true);
    };

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId) {
            setFeedback({
                type: 'error',
                message: t('subjects.errNoSchool'),
            });
            return;
        }
        if (!form.name.trim()) {
            setFeedback({
                type: 'error',
                message: t('subjects.errNameRequired'),
            });
            return;
        }

        setIsSaving(true);
        setFeedback(null);

        try {
            if (editingSubject) {
                await updateSubject(editingSubject.id, schoolId, form);
                setFeedback({
                    type: 'success',
                    message: t('subjects.toastUpdateSuccess').replace(
                        '{name}',
                        form.name
                    ),
                });
            } else {
                await createSubject({
                    schoolId,
                    ...form,
                });
                setFeedback({
                    type: 'success',
                    message: t('subjects.toastCreateSuccess').replace(
                        '{name}',
                        form.name
                    ),
                });
            }
            setIsModalOpen(false);
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error ? err.message : t('subjects.errSave'),
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Eksekusi penghapusan satuan
    const handleConfirmDelete = async () => {
        if (!schoolId || !deleteTarget) return;
        setIsDeleting(true);
        setFeedback(null);

        try {
            await deleteSubject(deleteTarget.id, schoolId);
            setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
            setFeedback({
                type: 'success',
                message: t('subjects.toastDelSuccess').replace(
                    '{name}',
                    deleteTarget.name
                ),
            });
            setDeleteTarget(null);
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error ? err.message : t('subjects.errDelete'),
            });
            setDeleteTarget(null);
        } finally {
            setIsDeleting(false);
        }
    };

    // Eksekusi penghapusan beberapa mata pelajaran terpilih
    const handleConfirmDeleteSelected = async () => {
        if (!schoolId || selectedIds.length === 0) return;
        setIsDeletingSelected(true);
        setFeedback(null);

        try {
            const count = selectedIds.length;
            await deleteSubjectsByIds(selectedIds, schoolId);
            setFeedback({
                type: 'success',
                message: t('subjects.toastDelSelSuccess').replace(
                    '{count}',
                    String(count)
                ),
            });
            setSelectedIds([]);
            setIsDeleteSelectedModalOpen(false);
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error
                        ? err.message
                        : t('subjects.errDeleteSel'),
            });
            setIsDeleteSelectedModalOpen(false);
        } finally {
            setIsDeletingSelected(false);
        }
    };

    // Buka modal Hapus Semua
    const handleOpenDeleteAllModal = () => {
        setDeleteAllConfirmText('');
        setFeedback(null);
        setIsDeleteAllModalOpen(true);
    };

    // Eksekusi penghapusan seluruh mata pelajaran (Khusus SUPER_ADMIN)
    const handleConfirmDeleteAll = async () => {
        if (!schoolId || !isSuperAdmin) return;
        if (
            deleteAllConfirmText.trim().toUpperCase() !==
            deleteAllKeyword.toUpperCase()
        ) {
            return;
        }

        setIsDeletingAll(true);
        setFeedback(null);

        try {
            const totalDeleted = subjects.length;
            await deleteAllSubjectsBySchool(schoolId);
            setFeedback({
                type: 'success',
                message: t('subjects.toastDelAllSuccess').replace(
                    '{count}',
                    String(totalDeleted)
                ),
            });
            setSelectedIds([]);
            setIsDeleteAllModalOpen(false);
            setDeleteAllConfirmText('');
            await loadSubjects();
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error
                        ? err.message
                        : t('subjects.errDeleteAll'),
            });
            setIsDeleteAllModalOpen(false);
        } finally {
            setIsDeletingAll(false);
        }
    };

    const handleSeedDefaults = async () => {
        if (!schoolId) return;
        setIsSeeding(true);
        setFeedback(null);
        try {
            const existingCodes = subjects.map((s) => s.code ?? '');
            const inserted = await seedDefaultMerdekaSubjects(
                schoolId,
                existingCodes,
                schoolLevel
            );
            if (inserted === 0) {
                setFeedback({
                    type: 'success',
                    message: t('subjects.toastSeedExists'),
                });
            } else {
                setFeedback({
                    type: 'success',
                    message: t('subjects.toastSeedSuccess').replace(
                        '{count}',
                        String(inserted)
                    ),
                });
                await loadSubjects();
            }
        } catch (err) {
            setFeedback({
                type: 'error',
                message:
                    err instanceof Error ? err.message : t('subjects.errSeed'),
            });
        } finally {
            setIsSeeding(false);
        }
    };

    const getCategoryMeta = (category: string) => {
        return (
            categoryOptions.find((opt) => opt.value === category) ?? {
                value: category,
                label: category,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
            }
        );
    };

    const isDeleteAllKeywordValid =
        deleteAllConfirmText.trim().toUpperCase() ===
        deleteAllKeyword.toUpperCase();

    return (
        <div className="p-6 space-y-6">
            {/* Header Halaman */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {t('subjects.pageTitle')}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {t('subjects.pageSubtitle')}
                    </p>
                </div>

                {canManageSubjects && (
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Tombol Hapus Semua (Hanya tampil untuk SUPER_ADMIN jika data > 0) */}
                        {isSuperAdmin && subjects.length > 0 && (
                            <button
                                type="button"
                                onClick={handleOpenDeleteAllModal}
                                disabled={isLoading || !schoolId}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50/70 text-red-600 text-sm font-medium hover:bg-red-600 hover:text-white hover:border-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" />
                                {t('subjects.deleteAll')}
                            </button>
                        )}

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
                            {t('subjects.seedMerdeka')}
                        </button>

                        <button
                            type="button"
                            onClick={handleOpenCreate}
                            disabled={!schoolId}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {t('subjects.addSubject')}
                        </button>
                    </div>
                )}
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
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('subjects.totalSubjects')}
                            </p>
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
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('subjects.activeSubjects')}
                            </p>
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
                            <p className="text-sm font-medium text-muted-foreground">
                                {t('subjects.moduleIntegration')}
                            </p>
                            <p className="text-sm font-semibold text-foreground mt-1">
                                {t('subjects.moduleIntegrationDesc')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bilah Aksi Seleksi (Muncul saat minimal 1 mapel dicentang) */}
            {canManageSubjects && selectedIds.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2.5 text-sm">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold">
                            {selectedIds.length}
                        </span>
                        <span className="font-medium text-foreground">
                            {t('subjects.selectedCount')}
                        </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="px-3 py-1.5 rounded-lg border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            {t('subjects.clearSelection')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsDeleteSelectedModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors shadow-xs"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('subjects.deleteSelected').replace(
                                '{count}',
                                String(selectedIds.length)
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Tabel Data Mata Pelajaran */}
            <Card className="border-none shadow-sm">
                <CardHeader className="pb-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg">
                            {t('subjects.listTitle')}
                        </CardTitle>
                        <CardDescription>
                            {t('subjects.listSubtitle')}
                        </CardDescription>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('subjects.searchPlaceholder')}
                                className="pl-9 pr-3 py-2 text-sm rounded-lg border bg-background w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </div>

                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="ALL">
                                {t('subjects.allCategories')}
                            </option>
                            {categoryOptions.map((opt) => (
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
                            <p className="text-sm">
                                {t('subjects.loadingSubjects')}
                            </p>
                        </div>
                    ) : filteredSubjects.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                            <BookOpen className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                            <p className="font-medium text-foreground">
                                {t('subjects.emptyTitle')}
                            </p>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                {t('subjects.emptyDescPrefix')}
                                <strong>{t('subjects.emptyDescHighlight')}</strong>
                                {t('subjects.emptyDescSuffix')}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                    <tr>
                                        {canManageSubjects && (
                                            <th className="pl-6 pr-2 py-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllFilteredSelected}
                                                    ref={(el) => {
                                                        if (el) {
                                                            el.indeterminate =
                                                                isSomeFilteredSelected;
                                                        }
                                                    }}
                                                    onChange={handleToggleSelectAllFiltered}
                                                    aria-label={t('subjects.selectAllAria')}
                                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                                                />
                                            </th>
                                        )}
                                        <th className="px-6 py-4 font-medium w-24">
                                            {t('subjects.colOrder')}
                                        </th>
                                        <th className="px-6 py-4 font-medium w-28">
                                            {t('subjects.colCode')}
                                        </th>
                                        <th className="px-6 py-4 font-medium">
                                            {t('subjects.colName')}
                                        </th>
                                        <th className="px-6 py-4 font-medium">
                                            {t('subjects.colCategory')}
                                        </th>
                                        <th className="px-6 py-4 font-medium">
                                            {t('subjects.colStatus')}
                                        </th>
                                        {canManageSubjects && (
                                            <th className="px-6 py-4 font-medium text-right">
                                                {t('subjects.colActions')}
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSubjects.map((item) => {
                                        const catMeta = getCategoryMeta(item.category);
                                        const isSelected = selectedSet.has(item.id);
                                        return (
                                            <tr
                                                key={item.id}
                                                className={cn(
                                                    'group border-b last:border-0 transition-colors',
                                                    isSelected
                                                        ? 'bg-primary/5 hover:bg-primary/10'
                                                        : 'hover:bg-muted/30'
                                                )}
                                            >
                                                {canManageSubjects && (
                                                    <td className="pl-6 pr-2 py-4 w-10">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() =>
                                                                handleToggleSelectOne(item.id)
                                                            }
                                                            aria-label={t(
                                                                'subjects.selectOneAria'
                                                            ).replace('{name}', item.name)}
                                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                                                        />
                                                    </td>
                                                )}
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
                                                    <div className="font-semibold text-foreground">
                                                        {item.name}
                                                    </div>
                                                    {item.description && (
                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                            {item.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn('font-medium', catMeta.badgeClass)}
                                                    >
                                                        {catMeta.label}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {item.isActive ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            {t('subjects.statusActive')}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                                            <XCircle className="w-3.5 h-3.5" />
                                                            {t('subjects.statusInactive')}
                                                        </span>
                                                    )}
                                                </td>
                                                {canManageSubjects && (
                                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenEdit(item)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/80 bg-background text-xs font-medium text-foreground hover:bg-muted hover:border-border transition-all shadow-2xs"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                                                <span>{t('subjects.actionEdit')}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeleteTarget(item)}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200/80 bg-red-50/60 text-xs font-medium text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-all shadow-2xs"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>{t('subjects.actionDelete')}</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
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
            {isModalOpen && canManageSubjects && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold">
                                {editingSubject
                                    ? t('subjects.modalEditTitle')
                                    : t('subjects.modalAddTitle')}
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
                                        {t('subjects.labelCode')}{' '}
                                        <span className="text-muted-foreground text-xs">
                                            {t('subjects.optionalTag')}
                                        </span>
                                    </label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                                        placeholder={t('subjects.placeholderCode')}
                                        className="w-full px-3 py-2 text-sm rounded-lg border bg-background uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1.5">
                                        {t('subjects.labelOrder')}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        value={form.sortOrder}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                sortOrder: parseInt(e.target.value, 10) || 100,
                                            })
                                        }
                                        className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    {t('subjects.labelName')}{' '}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder={t('subjects.placeholderName')}
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    {t('subjects.labelCategory')}
                                </label>
                                <select
                                    value={form.category}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            category: e.target.value as SubjectCategory,
                                        })
                                    }
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                    {categoryOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    {t('subjects.labelDescription')}{' '}
                                    <span className="text-muted-foreground text-xs">
                                        {t('subjects.optionalTag')}
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                    placeholder={t('subjects.placeholderDescription')}
                                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            </div>

                            <label className="flex items-center gap-2.5 text-sm cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(e) =>
                                        setForm({ ...form, isActive: e.target.checked })
                                    }
                                    className="rounded border-gray-300"
                                />
                                <span>{t('subjects.checkboxActive')}</span>
                            </label>

                            <div className="pt-4 border-t flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted transition-colors"
                                >
                                    {t('subjects.btnCancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingSubject
                                        ? t('subjects.btnSaveChanges')
                                        : t('subjects.btnSaveSubject')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Hapus Satuan */}
            {deleteTarget && canManageSubjects && (
                <div
                    className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => !isDeleting && setDeleteTarget(null)}
                >
                    <div
                        className="bg-card border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-foreground">
                                        {t('subjects.modalDelTitle')}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {t('subjects.modalDelSub')}
                                    </p>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-xl bg-muted/60 border flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-sm text-foreground">
                                        {deleteTarget.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {t('subjects.modalDelMeta')
                                            .replace('{code}', deleteTarget.code || '-')
                                            .replace(
                                                '{order}',
                                                String(deleteTarget.sortOrder)
                                            )}
                                    </p>
                                </div>
                                <Badge variant="outline" className="text-xs shrink-0">
                                    {getCategoryMeta(deleteTarget.category).label}
                                </Badge>
                            </div>

                            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3">
                                <strong>{t('subjects.modalDelNoteLabel')}</strong>{' '}
                                {t('subjects.modalDelNote')}
                            </p>
                        </div>

                        <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-end gap-3">
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                {t('subjects.btnCancel')}
                            </button>
                            <button
                                type="button"
                                disabled={isDeleting}
                                onClick={handleConfirmDelete}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-xs disabled:opacity-50"
                            >
                                {isDeleting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                {isDeleting
                                    ? t('subjects.btnDeleting')
                                    : t('subjects.btnConfirmDelete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Hapus Terpilih (Multi-Select) */}
            {isDeleteSelectedModalOpen && canManageSubjects && (
                <div
                    className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() =>
                        !isDeletingSelected && setIsDeleteSelectedModalOpen(false)
                    }
                >
                    <div
                        className="bg-card border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-foreground">
                                        {t('subjects.modalDelSelTitle').replace(
                                            '{count}',
                                            String(selectedIds.length)
                                        )}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {t('subjects.modalDelSelSub')}
                                    </p>
                                </div>
                            </div>

                            {/* Daftar Preview Mapel Terpilih */}
                            <div className="max-h-44 overflow-y-auto rounded-xl bg-muted/60 border divide-y">
                                {selectedSubjects.map((item) => (
                                    <div
                                        key={item.id}
                                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                                    >
                                        <span className="font-semibold text-foreground truncate">
                                            {item.name}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-background border font-mono text-[11px] shrink-0">
                                            {item.code || `#${item.sortOrder}`}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3">
                                <strong>{t('subjects.modalDelNoteLabel')}</strong>{' '}
                                {t('subjects.modalDelSelNote')}
                            </p>
                        </div>

                        <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-end gap-3">
                            <button
                                type="button"
                                disabled={isDeletingSelected}
                                onClick={() => setIsDeleteSelectedModalOpen(false)}
                                className="px-4 py-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                {t('subjects.btnCancel')}
                            </button>
                            <button
                                type="button"
                                disabled={isDeletingSelected}
                                onClick={handleConfirmDeleteSelected}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-xs disabled:opacity-50"
                            >
                                {isDeletingSelected ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                {isDeletingSelected
                                    ? t('subjects.btnDeleting')
                                    : t('subjects.btnConfirmDeleteSel').replace(
                                        '{count}',
                                        String(selectedIds.length)
                                    )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Konfirmasi Hapus Semua (Khusus SUPER_ADMIN) */}
            {isDeleteAllModalOpen && isSuperAdmin && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => !isDeletingAll && setIsDeleteAllModalOpen(false)}
                >
                    <div
                        className="bg-card border border-red-200 dark:border-red-900/60 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
                                    <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />
                                </div>
                                <div className="space-y-1">
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[11px] font-semibold uppercase tracking-wide">
                                        {t('subjects.modalDelAllBadge')}
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground">
                                        {t('subjects.modalDelAllTitle')}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {t('subjects.modalDelAllSubPrefix')}
                                        <strong className="text-foreground">
                                            {t('subjects.modalDelAllSubCount').replace(
                                                '{count}',
                                                String(subjects.length)
                                            )}
                                        </strong>
                                        {t('subjects.modalDelAllSubSuffix')}
                                    </p>
                                </div>
                            </div>

                            <div className="text-xs text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg p-3 space-y-1">
                                <p className="font-semibold">
                                    {t('subjects.modalDelAllWarnTitle')}
                                </p>
                                <p>{t('subjects.modalDelAllWarnBody')}</p>
                            </div>

                            <div className="space-y-1.5 pt-1">
                                <label className="block text-xs font-medium text-muted-foreground">
                                    {t('subjects.modalDelAllTypePrefix')}
                                    <span className="font-mono font-bold text-foreground select-all">
                                        {deleteAllKeyword}
                                    </span>
                                    {t('subjects.modalDelAllTypeSuffix')}
                                </label>
                                <input
                                    type="text"
                                    value={deleteAllConfirmText}
                                    onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                                    placeholder={deleteAllKeyword}
                                    disabled={isDeletingAll}
                                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border bg-background uppercase focus:outline-none focus:ring-2 focus:ring-red-500/40"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-muted/30 border-t flex items-center justify-end gap-3">
                            <button
                                type="button"
                                disabled={isDeletingAll}
                                onClick={() => setIsDeleteAllModalOpen(false)}
                                className="px-4 py-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                {t('subjects.btnCancel')}
                            </button>
                            <button
                                type="button"
                                disabled={!isDeleteAllKeywordValid || isDeletingAll}
                                onClick={handleConfirmDeleteAll}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDeletingAll ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                {isDeletingAll
                                    ? t('subjects.btnDeletingAll')
                                    : t('subjects.btnConfirmDeleteAll').replace(
                                        '{count}',
                                        String(subjects.length)
                                    )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}