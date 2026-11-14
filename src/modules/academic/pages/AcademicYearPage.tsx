import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Loader2,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    CalendarRange,
    Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { academicService } from '../services/academic.service';
import type { AcademicYear, Semester, SemesterType } from '../types/academic.types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type DeleteModalState = {
    isOpen: boolean;
    type: 'single' | 'bulk';
    id?: string;
    name?: string;
};

export function AcademicYearPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { school: authSchool, user } = useAuthStore();
    const isId = locale === 'id';

    const schoolId = authSchool?.id;
    const role = user?.role;
    const canManageMaster = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const canDeleteData = canManageMaster;

    // State Tahun Ajaran
    const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedStartYear, setSelectedStartYear] = useState<number>(new Date().getFullYear());
    const [autoCreateSemesters, setAutoCreateSemesters] = useState<boolean>(true);
    const [selectedAys, setSelectedAys] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: keyof AcademicYear; direction: 'asc' | 'desc' }>({
        key: 'startYear',
        direction: 'desc',
    });

    // State Semester
    const [managedYearId, setManagedYearId] = useState<string>('');
    const [semesterDrafts, setSemesterDrafts] = useState<
        Record<SemesterType, { startDate: string; endDate: string }>
    >({
        GANJIL: { startDate: '', endDate: '' },
        GENAP: { startDate: '', endDate: '' },
    });

    const modalRef = useRef<HTMLDivElement>(null);

    const t = {
        ayListTitle: isId ? 'Daftar Tahun Ajaran' : 'Academic Year List',
        ayListDesc: isId
            ? 'Kelola tahun ajaran sekolah. Tahun ajaran yang aktif menjadi acuan default kelas dan siswa.'
            : 'Manage school academic years. The active year serves as default for classes and students.',
        btnDeleteSel: isId ? 'Hapus Pilihan' : 'Delete Selected',
        btnCreateNew: isId ? 'Tambah Tahun Ajaran' : 'Add Academic Year',
        colNo: 'No.',
        colAy: isId ? 'Tahun Ajaran' : 'Academic Year',
        colStatus: 'Status',
        colAction: isId ? 'Aksi' : 'Action',
        emptyData: isId ? 'Belum ada data tahun ajaran.' : 'No academic year data available.',
        statusActive: isId ? 'SEDANG AKTIF' : 'CURRENTLY ACTIVE',
        statusInactive: isId ? 'Tidak Aktif' : 'Inactive',
        btnSetActive: isId ? 'Jadikan Aktif' : 'Set Active',
        titleActiveNoDelete: isId
            ? 'Tahun ajaran aktif tidak dapat dihapus'
            : 'The active academic year cannot be deleted',
        confirmDelTitle: isId ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        confirmDelBulk: (n: number) =>
            isId
                ? `Yakin ingin menghapus ${n} data tahun ajaran terpilih?`
                : `Are you sure you want to delete ${n} selected academic years?`,
        confirmDelSingle: (name: string) =>
            isId
                ? `Yakin ingin menghapus tahun ajaran "${name}"?`
                : `Are you sure you want to delete academic year "${name}"?`,
        btnCancel: isId ? 'Batal' : 'Cancel',
        btnDelete: isId ? 'Hapus' : 'Delete',
        btnSave: isId ? 'Simpan' : 'Save',
        createModalTitle: isId ? 'Tambah Tahun Ajaran Baru' : 'Add New Academic Year',
        startYearLabel: isId ? 'Tahun Mulai' : 'Start Year',
        autoSemLabel: isId
            ? 'Otomatis buat Semester Ganjil & Genap'
            : 'Automatically create Odd & Even Semesters',
        toastAyCreated: isId ? 'Tahun ajaran berhasil dibuat.' : 'Academic year created.',
        toastAyActive: isId ? 'Tahun ajaran aktif diperbarui.' : 'Active academic year updated.',
        toastAyDeleted: isId ? 'Data tahun ajaran berhasil dihapus.' : 'Academic years deleted.',
        toastActiveBlocked: isId
            ? 'Tahun ajaran yang sedang aktif tidak boleh dihapus.'
            : 'The active academic year cannot be deleted.',
        selectAllLabel: isId ? 'Pilih semua tahun ajaran non-aktif' : 'Select all inactive academic years',
        semTitle: isId ? 'Pengaturan Semester (Ganjil & Genap)' : 'Semester Settings (Odd & Even)',
        semDesc: isId
            ? 'Atur periode tanggal dan semester yang sedang aktif berjalan.'
            : 'Configure semester date ranges and set the active semester.',
        semYearLabel: isId ? 'Pilih Tahun Ajaran:' : 'Select Academic Year:',
        semOdd: isId ? 'Semester Ganjil' : 'Odd Semester (Ganjil)',
        semEven: isId ? 'Semester Genap' : 'Even Semester (Genap)',
        semStart: isId ? 'Tanggal Mulai' : 'Start Date',
        semEnd: isId ? 'Tanggal Selesai' : 'End Date',
        semSaved: isId ? 'Periode semester berhasil disimpan.' : 'Semester period saved.',
        semActivated: isId ? 'Semester aktif berhasil diperbarui.' : 'Active semester updated.',
    };

    // Query Tahun Ajaran
    const { data: academicYearsResponse, isLoading: isAyLoading } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: () => academicService.getAcademicYears(schoolId || ''),
        enabled: Boolean(schoolId),
    });

    const academicYears = useMemo(
        () => academicYearsResponse?.data ?? [],
        [academicYearsResponse?.data]
    );

    // Sinkronkan default tahun mulai saat membuka modal tambah
    const openCreateModal = () => {
        const nextYear =
            academicYears.length > 0
                ? Math.max(...academicYears.map((ay) => ay.startYear)) + 1
                : new Date().getFullYear();
        setSelectedStartYear(nextYear);
        setAutoCreateSemesters(true);
        setCreateModalOpen(true);
    };

    // Sinkronkan tahun ajaran terpilih pada bagian Semester
    useEffect(() => {
        if (academicYears.length === 0) {
            setManagedYearId('');
            return;
        }
        if (!managedYearId || !academicYears.some((ay) => ay.id === managedYearId)) {
            const active = academicYears.find((ay) => ay.isActive);
            setManagedYearId(active?.id ?? academicYears[0].id);
        }
    }, [academicYears, managedYearId]);

    // Query Semester untuk tahun ajaran terpilih
    const { data: semestersResponse, isLoading: isSemLoading } = useQuery({
        queryKey: ['semesters', schoolId, managedYearId],
        queryFn: () => academicService.getSemesters(schoolId || '', managedYearId),
        enabled: Boolean(schoolId && managedYearId),
    });

    const semesters = useMemo(
        () => semestersResponse?.data ?? [],
        [semestersResponse?.data]
    );

    // Isi draft tanggal semester setiap kali data semester atau tahun ajaran berubah
    useEffect(() => {
        const targetYear = academicYears.find((ay) => ay.id === managedYearId);
        const startY = targetYear?.startYear ?? new Date().getFullYear();
        const endY = targetYear?.endYear ?? startY + 1;

        const ganjil = semesters.find((s) => s.type === 'GANJIL');
        const genap = semesters.find((s) => s.type === 'GENAP');

        setSemesterDrafts({
            GANJIL: {
                startDate: ganjil?.startDate ?? `${startY}-07-01`,
                endDate: ganjil?.endDate ?? `${startY}-12-31`,
            },
            GENAP: {
                startDate: genap?.startDate ?? `${endY}-01-01`,
                endDate: genap?.endDate ?? `${endY}-06-30`,
            },
        });
    }, [semesters, managedYearId, academicYears]);

    const deletableAys = useMemo(
        () => academicYears.filter((ay) => !ay.isActive),
        [academicYears]
    );

    useEffect(() => {
        const allowedIds = new Set(deletableAys.map((ay) => ay.id));
        setSelectedAys((prev) => {
            const next = prev.filter((id) => allowedIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [deletableAys]);

    const sortedAcademicYears = useMemo(() => {
        const sortable = [...academicYears];
        sortable.sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            const comparison = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, {
                numeric: true,
                sensitivity: 'base',
            });
            if (comparison < 0) return sortConfig.direction === 'asc' ? -1 : 1;
            if (comparison > 0) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sortable;
    }, [academicYears, sortConfig]);

    const handleSort = (key: keyof AcademicYear) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const toggleRow = (id: string) => {
        const row = academicYears.find((ay) => ay.id === id);
        if (!row || row.isActive) return;
        setSelectedAys((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
    };

    const toggleAll = () => {
        if (selectedAys.length === deletableAys.length && deletableAys.length > 0) {
            setSelectedAys([]);
        } else {
            setSelectedAys(deletableAys.map((ay) => ay.id));
        }
    };

    const closeDeleteModal = useCallback(() => {
        setDeleteModal({ isOpen: false, type: 'single' });
    }, []);

    useEffect(() => {
        if (!deleteModal.isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeDeleteModal();
        };
        window.addEventListener('keydown', onKeyDown);
        const timer = setTimeout(() => modalRef.current?.focus(), 50);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            clearTimeout(timer);
        };
    }, [deleteModal.isOpen, closeDeleteModal]);

    // Mutasi Tahun Ajaran
    const createYearMutation = useMutation({
        mutationFn: () => {
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            return academicService.createAcademicYear({
                schoolId,
                startYear: selectedStartYear,
                autoCreateSemesters,
            });
        },
        onSuccess: async (res) => {
            toast.success(res.message || t.toastAyCreated);
            setCreateModalOpen(false);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['semesters', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['active-academic-year'] }),
            ]);
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const setActiveYearMutation = useMutation({
        mutationFn: (id: string) => {
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            return academicService.setActiveAcademicYear(schoolId, id);
        },
        onSuccess: async () => {
            toast.success(t.toastAyActive);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['active-academic-year'] }),
            ]);
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const deleteBulkAyMutation = useMutation({
        mutationFn: (ids: string[]) => {
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            return academicService.deleteBulkAcademicYears(schoolId, ids);
        },
        onSuccess: async () => {
            toast.success(t.toastAyDeleted);
            setSelectedAys([]);
            closeDeleteModal();
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['semesters', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['active-academic-year'] }),
            ]);
        },
        onError: (e: Error) => {
            toast.error(e.message);
            closeDeleteModal();
        },
    });

    // Mutasi Semester
    const saveSemesterMutation = useMutation({
        mutationFn: async ({
            type,
            existing,
        }: {
            type: SemesterType;
            existing?: Semester;
        }) => {
            if (!schoolId || !managedYearId) throw new Error('Data tahun ajaran belum dipilih.');
            const draft = semesterDrafts[type];
            if (existing) {
                return academicService.updateSemester(schoolId, existing.id, {
                    startDate: draft.startDate,
                    endDate: draft.endDate,
                });
            }
            return academicService.createSemester({
                schoolId,
                academicYearId: managedYearId,
                type,
                startDate: draft.startDate,
                endDate: draft.endDate,
                isActive: false,
            });
        },
        onSuccess: async () => {
            toast.success(t.semSaved);
            await queryClient.invalidateQueries({ queryKey: ['semesters', schoolId, managedYearId] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const activateSemesterMutation = useMutation({
        mutationFn: (semesterId: string) => {
            if (!schoolId) throw new Error('School ID tidak ditemukan.');
            return academicService.setActiveSemester(schoolId, semesterId);
        },
        onSuccess: async () => {
            toast.success(t.semActivated);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['semesters', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['active-academic-year'] }),
            ]);
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const confirmDelete = () => {
        if (!canDeleteData) {
            closeDeleteModal();
            return;
        }

        const ids =
            deleteModal.type === 'single' && deleteModal.id
                ? [deleteModal.id]
                : deleteModal.type === 'bulk'
                    ? selectedAys
                    : [];

        if (ids.length === 0) {
            closeDeleteModal();
            return;
        }

        if (academicYears.some((ay) => ids.includes(ay.id) && ay.isActive)) {
            toast.error(t.toastActiveBlocked);
            closeDeleteModal();
            return;
        }

        deleteBulkAyMutation.mutate(ids);
    };

    const yearOptions = useMemo(() => {
        const current = new Date().getFullYear();
        const years: number[] = [];
        for (let y = current - 3; y <= current + 3; y++) {
            years.push(y);
        }
        return years;
    }, []);

    return (
        <div className="space-y-6">
            {/* ================= MODAL TAMBAH TAHUN AJARAN ================= */}
            <AnimatePresence>
                {createModalOpen && canManageMaster && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget && !createYearMutation.isPending) {
                                setCreateModalOpen(false);
                            }
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
                        >
                            <h3 className="mb-4 text-lg font-bold">{t.createModalTitle}</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium">
                                        {t.startYearLabel}
                                    </label>
                                    <Select
                                        value={String(selectedStartYear)}
                                        onValueChange={(v) => setSelectedStartYear(Number(v))}
                                        disabled={createYearMutation.isPending}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {yearOptions.map((yr) => (
                                                <SelectItem key={yr} value={String(yr)}>
                                                    {yr}/{yr + 1}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-3 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={autoCreateSemesters}
                                        onChange={(e) => setAutoCreateSemesters(e.target.checked)}
                                        disabled={createYearMutation.isPending}
                                        className="h-4 w-4 rounded border-border accent-emerald-600"
                                    />
                                    <span>{t.autoSemLabel}</span>
                                </label>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCreateModalOpen(false)}
                                    disabled={createYearMutation.isPending}
                                >
                                    {t.btnCancel}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => createYearMutation.mutate()}
                                    disabled={createYearMutation.isPending}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {createYearMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="mr-2 h-4 w-4" />
                                    )}
                                    {t.btnSave}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================= MODAL KONFIRMASI HAPUS ================= */}
            <AnimatePresence>
                {deleteModal.isOpen && canDeleteData && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget && !deleteBulkAyMutation.isPending) {
                                closeDeleteModal();
                            }
                        }}
                    >
                        <motion.div
                            ref={modalRef}
                            tabIndex={-1}
                            role="alertdialog"
                            aria-modal="true"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl outline-none"
                        >
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-100 dark:border-red-500/30 dark:bg-red-500/20">
                                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold">{t.confirmDelTitle}</h3>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {deleteModal.type === 'bulk'
                                    ? t.confirmDelBulk(selectedAys.length)
                                    : t.confirmDelSingle(deleteModal.name || '')}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="outline"
                                    onClick={closeDeleteModal}
                                    disabled={deleteBulkAyMutation.isPending}
                                >
                                    {t.btnCancel}
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={confirmDelete}
                                    disabled={deleteBulkAyMutation.isPending}
                                >
                                    {deleteBulkAyMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}
                                    {t.btnDelete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================= KARTU 1: DAFTAR TAHUN AJARAN ================= */}
            <Card className="max-w-4xl border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-lg">{t.ayListTitle}</CardTitle>
                            <CardDescription className="mt-1">{t.ayListDesc}</CardDescription>
                        </div>
                        {canManageMaster && (
                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                                {canDeleteData && selectedAys.length > 0 && (
                                    <Button
                                        variant="destructive"
                                        onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                                        className="h-10 grow justify-center gap-2 whitespace-nowrap sm:grow-0 sm:px-4"
                                    >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        <span>
                                            {t.btnDeleteSel} ({selectedAys.length})
                                        </span>
                                    </Button>
                                )}
                                <Button
                                    onClick={openCreateModal}
                                    disabled={createYearMutation.isPending || !schoolId}
                                    className="h-10 grow justify-center gap-2 whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700 sm:grow-0 sm:px-4"
                                >
                                    <Plus className="h-4 w-4 shrink-0" />
                                    <span>{t.btnCreateNew}</span>
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="p-0 pt-0">
                    <div className="w-full overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="whitespace-nowrap border-b border-border/50 bg-muted/30">
                                    {canDeleteData && (
                                        <th className="w-12 p-4 text-center">
                                            <input
                                                type="checkbox"
                                                aria-label={t.selectAllLabel}
                                                checked={
                                                    selectedAys.length === deletableAys.length &&
                                                    deletableAys.length > 0
                                                }
                                                disabled={deletableAys.length === 0}
                                                onChange={toggleAll}
                                                className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                            />
                                        </th>
                                    )}
                                    <th className="w-16 px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">
                                        {t.colNo}
                                    </th>
                                    <th
                                        className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50"
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            {t.colAy}
                                            {sortConfig.key === 'name' ? (
                                                sortConfig.direction === 'asc' ? (
                                                    <ArrowUp size={14} />
                                                ) : (
                                                    <ArrowDown size={14} />
                                                )
                                            ) : (
                                                <ArrowUpDown size={14} className="opacity-40" />
                                            )}
                                        </div>
                                    </th>
                                    <th
                                        className="cursor-pointer select-none px-6 py-4 text-center text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50"
                                        onClick={() => handleSort('isActive')}
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            {t.colStatus}
                                            {sortConfig.key === 'isActive' ? (
                                                sortConfig.direction === 'asc' ? (
                                                    <ArrowUp size={14} />
                                                ) : (
                                                    <ArrowDown size={14} />
                                                )
                                            ) : (
                                                <ArrowUpDown size={14} className="opacity-40" />
                                            )}
                                        </div>
                                    </th>
                                    {canManageMaster && (
                                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground">
                                            {t.colAction}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {isAyLoading ? (
                                    <tr>
                                        <td
                                            colSpan={canDeleteData ? 5 : canManageMaster ? 4 : 3}
                                            className="px-6 py-12 text-center"
                                        >
                                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                                        </td>
                                    </tr>
                                ) : sortedAcademicYears.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={canDeleteData ? 5 : canManageMaster ? 4 : 3}
                                            className="px-6 py-8 text-center text-muted-foreground"
                                        >
                                            {t.emptyData}
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAcademicYears.map((ay, idx) => (
                                        <tr
                                            key={ay.id}
                                            className="whitespace-nowrap transition-colors hover:bg-muted/30"
                                        >
                                            {canDeleteData && (
                                                <td className="p-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={ay.name}
                                                        checked={selectedAys.includes(ay.id)}
                                                        onChange={() => toggleRow(ay.id)}
                                                        disabled={ay.isActive}
                                                        title={
                                                            ay.isActive
                                                                ? t.titleActiveNoDelete
                                                                : undefined
                                                        }
                                                        className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-4 text-sm font-medium text-muted-foreground">
                                                {idx + 1}
                                            </td>
                                            <td className="px-6 py-4 text-base font-semibold text-foreground">
                                                {ay.name}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {ay.isActive ? (
                                                    <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                                        {t.statusActive}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                                                        {t.statusInactive}
                                                    </span>
                                                )}
                                            </td>
                                            {canManageMaster && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                                        {!ay.isActive && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="shrink-0 whitespace-nowrap"
                                                                onClick={() =>
                                                                    setActiveYearMutation.mutate(ay.id)
                                                                }
                                                                disabled={
                                                                    setActiveYearMutation.isPending ||
                                                                    deleteBulkAyMutation.isPending
                                                                }
                                                            >
                                                                {t.btnSetActive}
                                                            </Button>
                                                        )}
                                                        {canDeleteData && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                aria-label={`${t.btnDelete} ${ay.name}`}
                                                                disabled={ay.isActive}
                                                                title={
                                                                    ay.isActive
                                                                        ? t.titleActiveNoDelete
                                                                        : undefined
                                                                }
                                                                className="h-8 w-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-500/10"
                                                                onClick={() =>
                                                                    setDeleteModal({
                                                                        isOpen: true,
                                                                        type: 'single',
                                                                        id: ay.id,
                                                                        name: ay.name,
                                                                    })
                                                                }
                                                            >
                                                                <Trash2 className="h-4 w-4 shrink-0" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* ================= KARTU 2: PENGATURAN SEMESTER ================= */}
            {academicYears.length > 0 && (
                <Card className="max-w-4xl border-border shadow-sm">
                    <CardHeader className="border-b border-border bg-muted/20 p-4 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <CalendarRange className="h-5 w-5 text-emerald-600" />
                                    {t.semTitle}
                                </CardTitle>
                                <CardDescription className="mt-1">{t.semDesc}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap text-sm text-muted-foreground">
                                    {t.semYearLabel}
                                </span>
                                <Select value={managedYearId} onValueChange={setManagedYearId}>
                                    <SelectTrigger className="w-44">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {academicYears.map((ay) => (
                                            <SelectItem key={ay.id} value={ay.id}>
                                                {ay.name} {ay.isActive ? '(Aktif)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6">
                        {isSemLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                {(['GANJIL', 'GENAP'] as SemesterType[]).map((type) => {
                                    const existing = semesters.find((s) => s.type === type);
                                    const draft = semesterDrafts[type];

                                    return (
                                        <div
                                            key={type}
                                            className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm"
                                        >
                                            <div>
                                                <div className="mb-4 flex items-center justify-between">
                                                    <h4 className="font-bold text-foreground">
                                                        {type === 'GANJIL' ? t.semOdd : t.semEven}
                                                    </h4>
                                                    {existing?.isActive ? (
                                                        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                                            {t.statusActive}
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                                                            {t.statusInactive}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                                            {t.semStart}
                                                        </label>
                                                        <Input
                                                            type="date"
                                                            value={draft.startDate}
                                                            disabled={!canManageMaster}
                                                            onChange={(e) =>
                                                                setSemesterDrafts((prev) => ({
                                                                    ...prev,
                                                                    [type]: {
                                                                        ...prev[type],
                                                                        startDate: e.target.value,
                                                                    },
                                                                }))
                                                            }
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                                            {t.semEnd}
                                                        </label>
                                                        <Input
                                                            type="date"
                                                            value={draft.endDate}
                                                            disabled={!canManageMaster}
                                                            onChange={(e) =>
                                                                setSemesterDrafts((prev) => ({
                                                                    ...prev,
                                                                    [type]: {
                                                                        ...prev[type],
                                                                        endDate: e.target.value,
                                                                    },
                                                                }))
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {canManageMaster && (
                                                <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                                                    {existing && !existing.isActive && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                activateSemesterMutation.mutate(existing.id)
                                                            }
                                                            disabled={activateSemesterMutation.isPending}
                                                        >
                                                            {t.btnSetActive}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() =>
                                                            saveSemesterMutation.mutate({ type, existing })
                                                        }
                                                        disabled={saveSemesterMutation.isPending}
                                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                                    >
                                                        <Save className="mr-1.5 h-3.5 w-3.5" />
                                                        {t.btnSave}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}