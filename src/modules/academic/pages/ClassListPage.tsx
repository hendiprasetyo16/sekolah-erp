
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Edit,
    Trash2,
    Loader2,
    AlertCircle,
    Users,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { academicService } from '../services/academic.service';
import type { AcademicYear, ClassItem } from '../types/academic.types';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';

// ============================================================
// CONSTANTS & TYPES
// ============================================================

const ITEMS_PER_PAGE = 10;

type SortKey = 'name' | 'gradeLevel' | 'academic_years' | 'teachers';
type SortDirection = 'asc' | 'desc';

type SortConfig = {
    key: SortKey;
    direction: SortDirection;
};

type DeleteModalState =
    | { type: 'single'; id: string; name: string }
    | { type: 'bulk' }
    | { type: 'all' }
    | null;

type Translation = {
    title: string;
    subtitle: string;
    addBtn: string;
    filterLabel: string;
    allYear: string;
    active: string;
    selected: string;
    delSelection: string;
    clearAll: string;
    thNo: string;
    thName: string;
    thGrade: string;
    thYear: string;
    thTeacher: string;
    thStudents: string;
    thAction: string;
    loading: string;
    error: string;
    yearsError: string;
    empty: string;
    noSchool: string;
    gradePrefix: string;
    noTeacher: string;
    toastDelSuccess: string;
    confirmDelTitle: string;
    cancel: string;
    deleteBtn: string;
    delWarning: string;
    delMsgBulk: (count: number) => string;
    delMsgAll: (count: number, yearName: string) => string;
    delMsgSingle: (name: string) => string;
    entries: string;
    showing: string;
    to: string;
    of: string;
    jumpTo: string;
    superAdminOnly: string;
    noSelection: string;
    retry: string;
    editClass: string;
    deleteClass: string;
    selectAll: string;
    selectedCount: (count: number) => string;
};

function generatePagination(
    currentPage: number,
    totalPages: number,
): Array<number | '...'> {
    if (totalPages <= 0) return [];
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, '...', totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [
            1,
            '...',
            totalPages - 4,
            totalPages - 3,
            totalPages - 2,
            totalPages - 1,
            totalPages,
        ];
    }

    return [
        1,
        '...',
        currentPage - 1,
        currentPage,
        currentPage + 1,
        '...',
        totalPages,
    ];
}

function compareValues(
    first: string | number,
    second: string | number,
): number {
    if (typeof first === 'number' && typeof second === 'number') {
        return first - second;
    }

    return String(first).localeCompare(
        String(second),
        'id',
        {
            numeric: true,
            sensitivity: 'base',
        },
    );
}

function getSortValue(
    item: ClassItem,
    key: SortKey,
): string | number {
    switch (key) {
        case 'name':
            return item.name ?? '';

        case 'gradeLevel':
            return item.gradeLevel ?? 0;

        case 'academic_years':
            return item.academic_years?.name ?? '';

        case 'teachers':
            return item.teachers?.fullName ?? '';

        default:
            return '';
    }
}

function getErrorMessage(
    error: unknown,
    fallback: string,
): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return fallback;
}

// ============================================================
// COMPONENT
// ============================================================

export function ClassListPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { school, user } = useAuthStore();

    const schoolId = school?.id;
    const role = user?.role as string | undefined;
    const isId = locale === 'id';

    // --------------------------------------------------------
    // ACCESS CONTROL
    // --------------------------------------------------------

    const isSuperAdmin = role === 'SUPER_ADMIN';
    const canManageData = isSuperAdmin || role === 'ADMIN';
    const canDeleteData = canManageData;

    // --------------------------------------------------------
    // TRANSLATIONS
    // --------------------------------------------------------

    const t = useMemo<Translation>(() => ({
        title: isId ? 'Manajemen Kelas' : 'Class Management',
        subtitle: isId
            ? 'Kelola rombongan belajar (rombel) berdasarkan tahun ajaran.'
            : 'Manage study groups based on academic year.',
        addBtn: isId ? 'Tambah Kelas' : 'Add Class',
        filterLabel: isId ? 'Filter Tahun Ajaran:' : 'Filter Academic Year:',
        allYear: isId ? 'Semua Tahun Ajaran' : 'All Academic Years',
        active: isId ? '(Aktif)' : '(Active)',
        selected: isId ? 'Terpilih' : 'Selected',
        delSelection: isId ? 'Hapus Pilihan' : 'Delete Selection',
        clearAll: isId ? 'Kosongkan Semua' : 'Clear All',
        thNo: 'No.',
        thName: isId ? 'Nama Kelas' : 'Class Name',
        thGrade: isId ? 'Tingkat' : 'Grade',
        thYear: isId ? 'Tahun Ajaran' : 'Academic Year',
        thTeacher: isId ? 'Wali Kelas' : 'Homeroom Teacher',
        thStudents: isId ? 'Jumlah Siswa' : 'Total Students',
        thAction: isId ? 'Aksi' : 'Action',
        loading: isId ? 'Memuat...' : 'Loading...',
        error: isId
            ? 'Gagal memuat data kelas.'
            : 'Failed to load classes.',
        yearsError: isId
            ? 'Gagal memuat tahun ajaran.'
            : 'Failed to load academic years.',
        empty: isId
            ? 'Tidak ada kelas yang ditemukan.'
            : 'No classes found.',
        noSchool: isId
            ? 'Sekolah tidak ditemukan. Silakan masuk kembali.'
            : 'School context is missing. Please sign in again.',
        gradePrefix: isId ? 'Kelas' : 'Grade',
        noTeacher: isId ? 'Belum diatur' : 'Not set',
        toastDelSuccess: isId
            ? 'Kelas berhasil dihapus.'
            : 'Classes deleted successfully.',
        confirmDelTitle: isId
            ? 'Konfirmasi Hapus'
            : 'Confirm Deletion',
        cancel: isId ? 'Batal' : 'Cancel',
        deleteBtn: isId ? 'Hapus' : 'Delete',
        delWarning: isId
            ? 'Kelas yang sudah memiliki siswa tidak dapat dihapus.'
            : 'Classes with enrolled students cannot be deleted.',
        delMsgBulk: (count) => isId
            ? `Yakin ingin menghapus ${count} kelas terpilih?`
            : `Delete ${count} selected classes?`,
        delMsgAll: (count, yearName) => {
            if (isId) {
                return yearName
                    ? `Yakin ingin menghapus semua ${count} kelas pada tahun ajaran ${yearName}?`
                    : `Yakin ingin menghapus semua ${count} kelas yang sedang ditampilkan untuk sekolah ini?`;
            }

            return yearName
                ? `Delete all ${count} classes in academic year ${yearName}?`
                : `Delete all ${count} classes currently displayed for this school?`;
        },
        delMsgSingle: (name) => isId
            ? `Yakin ingin menghapus kelas "${name}"?`
            : `Delete class "${name}"?`,
        entries: isId ? 'entri' : 'entries',
        showing: isId ? 'Menampilkan' : 'Showing',
        to: isId ? '–' : 'to',
        of: isId ? 'dari' : 'of',
        jumpTo: isId ? 'Lompat ke:' : 'Go to:',
        superAdminOnly: isId
            ? 'Hanya Super Admin yang dapat mengosongkan semua kelas.'
            : 'Only Super Admin can clear all classes.',
        noSelection: isId
            ? 'Pilih setidaknya satu kelas.'
            : 'Select at least one class.',
        retry: isId ? 'Coba lagi' : 'Retry',
        editClass: isId ? 'Edit kelas' : 'Edit class',
        deleteClass: isId ? 'Hapus kelas' : 'Delete class',
        selectAll: isId
            ? 'Pilih semua kelas di halaman ini'
            : 'Select all classes on this page',
        selectedCount: (count) => isId
            ? `${count} kelas dipilih`
            : `${count} classes selected`,
    }), [isId]);

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------

    const [selectedAcademicYear, setSelectedAcademicYear] = useState('all');
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: 'gradeLevel',
        direction: 'asc',
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInputValue, setPageInputValue] = useState('1');
    const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null);

    // Reset pagination and selection when the year filter changes.
    useEffect(() => {
        setCurrentPage(1);
        setPageInputValue('1');
        setSelectedClasses([]);
    }, [selectedAcademicYear]);

    // --------------------------------------------------------
    // ACADEMIC YEAR QUERY
    // --------------------------------------------------------

    const academicYearsQuery = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: () => {
            if (!schoolId) {
                throw new Error(t.noSchool);
            }

            return academicService.getAcademicYears(schoolId);
        },
        enabled: Boolean(schoolId),
        staleTime: 5 * 60 * 1000,
    });

    const academicYears: AcademicYear[] =
        academicYearsQuery.data?.data ?? [];

    // --------------------------------------------------------
    // CLASS QUERY
    // --------------------------------------------------------

    const classesQuery = useQuery({
        queryKey: ['classes', schoolId, selectedAcademicYear],
        queryFn: () => {
            if (!schoolId) {
                throw new Error(t.noSchool);
            }

            return academicService.getClasses(
                schoolId,
                selectedAcademicYear === 'all'
                    ? undefined
                    : selectedAcademicYear,
            );
        },
        enabled: Boolean(schoolId),
        staleTime: 60 * 1000,
    });

    const classes: ClassItem[] = classesQuery.data?.data ?? [];

    // --------------------------------------------------------
    // SORTING
    // --------------------------------------------------------

    const sortedClasses = useMemo(() => {
        const result = [...classes];

        result.sort((first, second) => {
            const comparison = compareValues(
                getSortValue(first, sortConfig.key),
                getSortValue(second, sortConfig.key),
            );

            return sortConfig.direction === 'asc'
                ? comparison
                : -comparison;
        });

        return result;
    }, [classes, sortConfig]);

    // --------------------------------------------------------
    // PAGINATION
    // --------------------------------------------------------

    const totalItems = sortedClasses.length;
    const totalPages = Math.max(
        1,
        Math.ceil(totalItems / ITEMS_PER_PAGE),
    );

    const safeCurrentPage = Math.min(
        Math.max(currentPage, 1),
        totalPages,
    );

    useEffect(() => {
        if (currentPage !== safeCurrentPage) {
            setCurrentPage(safeCurrentPage);
        }
    }, [currentPage, safeCurrentPage]);

    useEffect(() => {
        setPageInputValue(String(safeCurrentPage));
    }, [safeCurrentPage]);

    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(
        startIndex + ITEMS_PER_PAGE,
        totalItems,
    );

    const paginatedClasses = sortedClasses.slice(
        startIndex,
        endIndex,
    );

    // --------------------------------------------------------
    // SELECTION
    // --------------------------------------------------------

    const availableClassIds = useMemo(
        () => new Set(classes.map((item) => item.id)),
        [classes],
    );

    // Remove IDs that no longer exist in the current query result.
    useEffect(() => {
        setSelectedClasses((previous) => {
            const next = previous.filter((id) =>
                availableClassIds.has(id),
            );

            return next.length === previous.length
                ? previous
                : next;
        });
    }, [availableClassIds]);

    const visibleIds = useMemo(
        () => paginatedClasses.map((item) => item.id),
        [paginatedClasses],
    );

    const selectedVisibleCount = visibleIds.filter((id) =>
        selectedClasses.includes(id),
    ).length;

    const allVisibleSelected =
        visibleIds.length > 0 &&
        selectedVisibleCount === visibleIds.length;

    const someVisibleSelected =
        selectedVisibleCount > 0 && !allVisibleSelected;

    const toggleRow = useCallback((id: string) => {
        setSelectedClasses((previous) => (
            previous.includes(id)
                ? previous.filter((item) => item !== id)
                : [...previous, id]
        ));
    }, []);

    const toggleAllVisible = useCallback(() => {
        setSelectedClasses((previous) => {
            if (allVisibleSelected) {
                return previous.filter(
                    (id) => !visibleIds.includes(id),
                );
            }

            return [...new Set([...previous, ...visibleIds])];
        });
    }, [allVisibleSelected, visibleIds]);

    // --------------------------------------------------------
    // SORT HANDLER
    // --------------------------------------------------------

    const handleSort = useCallback((key: SortKey) => {
        setSortConfig((previous) => ({
            key,
            direction:
                previous.key === key && previous.direction === 'asc'
                    ? 'desc'
                    : 'asc',
        }));

        setCurrentPage(1);
    }, []);

    const renderSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) {
            return (
                <ArrowUpDown
                    size={14}
                    className="opacity-40"
                    aria-hidden="true"
                />
            );
        }

        return sortConfig.direction === 'asc'
            ? <ArrowUp size={14} aria-hidden="true" />
            : <ArrowDown size={14} aria-hidden="true" />;
    };

    // --------------------------------------------------------
    // PAGE HANDLERS
    // --------------------------------------------------------

    const handlePageSubmit = useCallback(() => {
        const parsed = Number.parseInt(pageInputValue, 10);

        const nextPage = Number.isFinite(parsed)
            ? Math.min(Math.max(parsed, 1), totalPages)
            : 1;

        setCurrentPage(nextPage);
        setPageInputValue(String(nextPage));
    }, [pageInputValue, totalPages]);

    // --------------------------------------------------------
    // DELETE MUTATION
    // --------------------------------------------------------

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!schoolId) {
                throw new Error(t.noSchool);
            }

            if (!canDeleteData) {
                throw new Error(t.superAdminOnly);
            }

            const uniqueIds = [...new Set(ids)].filter(
                (id) => typeof id === 'string' && id.trim().length > 0,
            );

            if (uniqueIds.length === 0) {
                throw new Error(t.noSelection);
            }

            // IMPORTANT:
            // Keep schoolId in the service call to enforce tenant scoping.
            // Database RLS must still enforce authorization independently.
            return academicService.deleteBulkClasses(
                schoolId,
                uniqueIds,
            );
        },

        onSuccess: async () => {
            toast.success(t.toastDelSuccess);

            setSelectedClasses([]);
            setDeleteModal(null);

            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['classes', schoolId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['class', schoolId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['classes-list'],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['students'],
                }),
            ]);
        },

        onError: (error: Error) => {
            toast.error(getErrorMessage(error, t.error));
        },
    });

    // --------------------------------------------------------
    // DELETE MODAL HANDLERS
    // --------------------------------------------------------

    const openSingleDelete = useCallback(
        (item: ClassItem) => {
            if (!canDeleteData) return;

            setDeleteModal({
                type: 'single',
                id: item.id,
                name: item.name,
            });
        },
        [canDeleteData],
    );

    const closeDeleteModal = useCallback(() => {
        if (deleteMutation.isPending) return;
        setDeleteModal(null);
    }, [deleteMutation.isPending]);

    const confirmDelete = useCallback(() => {
        if (!canDeleteData || deleteMutation.isPending || !deleteModal) {
            return;
        }

        if (deleteModal.type === 'single') {
            deleteMutation.mutate([deleteModal.id]);
            return;
        }

        if (deleteModal.type === 'bulk') {
            if (selectedClasses.length === 0) {
                toast.error(t.noSelection);
                return;
            }

            deleteMutation.mutate(selectedClasses);
            return;
        }

        if (deleteModal.type === 'all') {
            if (!isSuperAdmin) {
                toast.error(t.superAdminOnly);
                return;
            }

            // "All" means all classes in the currently displayed result,
            // respecting the selected academic-year filter.
            const ids = classes.map((item) => item.id);

            if (ids.length === 0) {
                setDeleteModal(null);
                return;
            }

            deleteMutation.mutate(ids);
        }
    }, [
        canDeleteData,
        deleteMutation,
        deleteModal,
        selectedClasses,
        t,
        isSuperAdmin,
        classes,
    ]);

    // --------------------------------------------------------
    // DELETE MESSAGE
    // --------------------------------------------------------

    const selectedYearName =
        academicYears.find(
            (year) => year.id === selectedAcademicYear,
        )?.name ?? '';

    const deleteMessage = useMemo(() => {
        if (!deleteModal) return '';

        if (deleteModal.type === 'single') {
            return t.delMsgSingle(deleteModal.name);
        }

        if (deleteModal.type === 'bulk') {
            return t.delMsgBulk(selectedClasses.length);
        }

        return t.delMsgAll(classes.length, selectedYearName);
    }, [
        deleteModal,
        selectedClasses.length,
        classes.length,
        selectedYearName,
        t,
    ]);

    // --------------------------------------------------------
    // TABLE CONFIGURATION
    // --------------------------------------------------------

    const columnCount =
        6 +
        (canDeleteData ? 1 : 0) +
        (canManageData ? 1 : 0);

    // --------------------------------------------------------
    // RENDER
    // --------------------------------------------------------

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative space-y-6"
        >
            {/* ================================================
                DELETE CONFIRMATION MODAL
            ================================================= */}

            <AnimatePresence>
                {deleteModal && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                        role="presentation"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                closeDeleteModal();
                            }
                        }}
                    >
                        <motion.div
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="class-delete-title"
                            aria-describedby="class-delete-description"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
                        >
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-100">
                                <AlertCircle
                                    className="h-6 w-6 text-red-600"
                                    aria-hidden="true"
                                />
                            </div>

                            <h2
                                id="class-delete-title"
                                className="mb-2 text-xl font-bold"
                            >
                                {t.confirmDelTitle}
                            </h2>

                            <p
                                id="class-delete-description"
                                className="mb-6 text-sm text-muted-foreground"
                            >
                                {deleteMessage}

                                <span className="mt-2 block text-xs text-red-500">
                                    {t.delWarning}
                                </span>
                            </p>

                            <div className="flex justify-end gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeDeleteModal}
                                    disabled={deleteMutation.isPending}
                                >
                                    {t.cancel}
                                </Button>

                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={confirmDelete}
                                    disabled={
                                        deleteMutation.isPending ||
                                        (deleteModal.type === 'bulk' &&
                                            selectedClasses.length === 0) ||
                                        (deleteModal.type === 'all' &&
                                            classes.length === 0)
                                    }
                                >
                                    {deleteMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}

                                    {t.deleteBtn}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ================================================
                HEADER
            ================================================= */}

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {t.title}
                    </h1>

                    <p className="mt-1 text-sm text-muted-foreground">
                        {t.subtitle}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {isSuperAdmin && (
                        <Button
                            type="button"
                            variant="outline"
                            className="border-red-200 text-red-600 shadow-sm transition-colors hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteModal({ type: 'all' })}
                            disabled={
                                classes.length === 0 ||
                                classesQuery.isLoading ||
                                deleteMutation.isPending ||
                                !schoolId
                            }
                        >
                            <AlertCircle
                                size={16}
                                className="mr-2"
                                aria-hidden="true"
                            />
                            {t.clearAll}
                        </Button>
                    )}

                    {canManageData && (
                        <Link
                            to="/academic/classes/new"
                            aria-disabled={!schoolId}
                            onClick={(event) => {
                                if (!schoolId) event.preventDefault();
                            }}
                            className={cn(
                                'flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700',
                                !schoolId && 'pointer-events-none opacity-50',
                            )}
                        >
                            <Plus size={16} aria-hidden="true" />
                            <span>{t.addBtn}</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* ================================================
                SCHOOL CONTEXT ERROR
            ================================================= */}

            {!schoolId && (
                <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
                >
                    {t.noSchool}
                </div>
            )}

            {/* ================================================
                FILTER & SELECTION TOOLBAR
            ================================================= */}

            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-center">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <label
                        htmlFor="class-academic-year-filter"
                        className="whitespace-nowrap text-sm font-medium text-muted-foreground"
                    >
                        {t.filterLabel}
                    </label>

                    <Select
                        value={selectedAcademicYear}
                        onValueChange={setSelectedAcademicYear}
                        disabled={!schoolId || academicYearsQuery.isLoading}
                    >
                        <SelectTrigger
                            id="class-academic-year-filter"
                            className="w-full sm:w-64"
                        >
                            <SelectValue placeholder={t.filterLabel} />
                        </SelectTrigger>

                        <SelectContent>
                            <SelectItem value="all">
                                {t.allYear}
                            </SelectItem>

                            {academicYears.map((year) => (
                                <SelectItem
                                    key={year.id}
                                    value={year.id}
                                >
                                    {year.name}{' '}
                                    {year.isActive ? t.active : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {academicYearsQuery.isError && (
                        <span
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {t.yearsError}
                        </span>
                    )}
                </div>

                {canDeleteData && selectedClasses.length > 0 && (
                    <div className="flex items-center justify-end gap-2">
                        <span className="hidden whitespace-nowrap shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 sm:inline-block">
                            {t.selectedCount(selectedClasses.length)}
                        </span>

                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteModal({ type: 'bulk' })}
                            disabled={deleteMutation.isPending}
                        >
                            <Trash2
                                size={16}
                                className="mr-2"
                                aria-hidden="true"
                            />
                            {t.delSelection}
                        </Button>

                        <button
                            type="button"
                            aria-label={t.cancel}
                            title={t.cancel}
                            onClick={() => setSelectedClasses([])}
                            disabled={deleteMutation.isPending}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>

            {/* ================================================
                CLASS TABLE
            ================================================= */}

            <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="whitespace-nowrap border-b border-border/50 bg-muted/30">
                                {canDeleteData && (
                                    <th
                                        scope="col"
                                        className="w-12 p-4 text-center"
                                    >
                                        <input
                                            type="checkbox"
                                            aria-label={t.selectAll}
                                            checked={allVisibleSelected}
                                            ref={(element) => {
                                                if (element) {
                                                    element.indeterminate =
                                                        someVisibleSelected;
                                                }
                                            }}
                                            onChange={toggleAllVisible}
                                            disabled={
                                                paginatedClasses.length === 0 ||
                                                deleteMutation.isPending
                                            }
                                            className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed"
                                        />
                                    </th>
                                )}

                                <th
                                    scope="col"
                                    className="w-16 px-6 py-4 text-xs font-semibold uppercase text-muted-foreground"
                                >
                                    {t.thNo}
                                </th>

                                {([
                                    ['name', t.thName],
                                    ['gradeLevel', t.thGrade],
                                    ['academic_years', t.thYear],
                                    ['teachers', t.thTeacher],
                                ] as const).map(([key, label]) => (
                                    <th
                                        key={key}
                                        scope="col"
                                        aria-sort={
                                            sortConfig.key === key
                                                ? sortConfig.direction === 'asc'
                                                    ? 'ascending'
                                                    : 'descending'
                                                : 'none'
                                        }
                                        className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:bg-muted/50"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSort(key)}
                                            className="flex items-center gap-1 text-left"
                                        >
                                            {label}
                                            {renderSortIcon(key)}
                                        </button>
                                    </th>
                                ))}

                                <th
                                    scope="col"
                                    className="px-6 py-4 text-center text-xs font-semibold uppercase text-muted-foreground"
                                >
                                    {t.thStudents}
                                </th>

                                {canManageData && (
                                    <th
                                        scope="col"
                                        className="px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground"
                                    >
                                        {t.thAction}
                                    </th>
                                )}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/50">
                            {classesQuery.isLoading ? (
                                <tr>
                                    <td
                                        colSpan={columnCount}
                                        className="px-6 py-12 text-center text-muted-foreground"
                                    >
                                        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-600" />
                                        {t.loading}
                                    </td>
                                </tr>
                            ) : classesQuery.isError ? (
                                <tr>
                                    <td
                                        colSpan={columnCount}
                                        className="px-6 py-12 text-center text-destructive"
                                    >
                                        <p>{getErrorMessage(classesQuery.error, t.error)}</p>

                                        <Button
                                            type="button"
                                            className="mt-3"
                                            variant="outline"
                                            onClick={() => {
                                                void classesQuery.refetch();
                                            }}
                                        >
                                            {t.retry}
                                        </Button>
                                    </td>
                                </tr>
                            ) : paginatedClasses.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={columnCount}
                                        className="px-6 py-12 text-center text-muted-foreground"
                                    >
                                        {t.empty}
                                    </td>
                                </tr>
                            ) : (
                                paginatedClasses.map((item, index) => {
                                    const isSelected =
                                        selectedClasses.includes(item.id);

                                    return (
                                        <motion.tr
                                            key={item.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                delay: index * 0.02,
                                            }}
                                            className={cn(
                                                'whitespace-nowrap transition-colors hover:bg-muted/30',
                                                isSelected && 'bg-emerald-500/5',
                                            )}
                                        >
                                            {canDeleteData && (
                                                <td className="p-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`${isId ? 'Pilih kelas' : 'Select class'} ${item.name}`}
                                                        checked={isSelected}
                                                        onChange={() => toggleRow(item.id)}
                                                        disabled={deleteMutation.isPending}
                                                        className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600 disabled:cursor-not-allowed"
                                                    />
                                                </td>
                                            )}

                                            <td className="px-6 py-4 text-sm font-medium text-muted-foreground">
                                                {startIndex + index + 1}
                                            </td>

                                            <td className="px-6 py-4">
                                                <span className="text-base font-bold text-foreground">
                                                    {item.name}
                                                </span>

                                                {item.major && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {item.major}
                                                    </p>
                                                )}
                                            </td>

                                            <td className="px-6 py-4">
                                                <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-medium">
                                                    {t.gradePrefix} {item.gradeLevel}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 text-sm text-foreground">
                                                {item.academic_years?.name ?? '—'}
                                            </td>

                                            <td className="px-6 py-4 text-sm text-muted-foreground">
                                                {item.teachers?.fullName || (
                                                    <span className="italic">
                                                        {t.noTeacher}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-center">
                                                <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-700">
                                                    <Users
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                    {item.studentCount ?? 0} / {item.capacity}
                                                </div>
                                            </td>

                                            {canManageData && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link
                                                            aria-label={`${t.editClass} ${item.name}`}
                                                            to={`/academic/classes/${encodeURIComponent(item.id)}/edit`}
                                                            className="rounded-md p-2 text-emerald-600 transition-colors hover:bg-emerald-50"
                                                        >
                                                            <Edit
                                                                className="h-4 w-4"
                                                                aria-hidden="true"
                                                            />
                                                        </Link>

                                                        {canDeleteData && (
                                                            <button
                                                                type="button"
                                                                aria-label={`${t.deleteClass} ${item.name}`}
                                                                onClick={() => openSingleDelete(item)}
                                                                disabled={deleteMutation.isPending}
                                                                className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                <Trash2
                                                                    className="h-4 w-4"
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ============================================
                    PAGINATION
                ============================================= */}

                {totalItems > 0 && !classesQuery.isError && (
                    <div className="flex flex-col items-center justify-between gap-4 border-t border-border bg-background p-4 text-sm lg:flex-row">
                        <div className="w-full text-center text-muted-foreground lg:w-auto lg:text-left">
                            {t.showing} {startIndex + 1} {t.to} {endIndex} {t.of} {totalItems} {t.entries}
                        </div>

                        <div className="flex max-w-full shrink-0 items-center justify-center gap-2 overflow-x-auto py-1 sm:gap-3 lg:justify-end">
                            <div className="flex shrink-0 items-center gap-2">
                                <label
                                    htmlFor="class-page-jump"
                                    className="whitespace-nowrap text-muted-foreground"
                                >
                                    {t.jumpTo}
                                </label>

                                <input
                                    id="class-page-jump"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={totalPages}
                                    step={1}
                                    value={pageInputValue}
                                    onChange={(event) => {
                                        setPageInputValue(event.target.value);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            handlePageSubmit();
                                        }
                                    }}
                                    onBlur={handlePageSubmit}
                                    disabled={classesQuery.isLoading}
                                    className="h-9 w-14 rounded-md border border-border bg-background text-center font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                            </div>

                            <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />

                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    title={isId ? 'Halaman pertama' : 'First page'}
                                    aria-label={isId ? 'Halaman pertama' : 'First page'}
                                    onClick={() => setCurrentPage(1)}
                                    disabled={
                                        safeCurrentPage === 1 ||
                                        classesQuery.isLoading
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"
                                >
                                    <ChevronsLeft size={16} />
                                </button>

                                <button
                                    type="button"
                                    title={isId ? 'Halaman sebelumnya' : 'Previous page'}
                                    aria-label={isId ? 'Halaman sebelumnya' : 'Previous page'}
                                    onClick={() => {
                                        setCurrentPage((page) =>
                                            Math.max(1, page - 1),
                                        );
                                    }}
                                    disabled={
                                        safeCurrentPage === 1 ||
                                        classesQuery.isLoading
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                {generatePagination(
                                    safeCurrentPage,
                                    totalPages,
                                ).map((page, index) => (
                                    <button
                                        type="button"
                                        key={`${page}-${index}`}
                                        disabled={
                                            page === '...' ||
                                            classesQuery.isLoading
                                        }
                                        onClick={() => {
                                            if (typeof page === 'number') {
                                                setCurrentPage(page);
                                            }
                                        }}
                                        aria-current={
                                            page === safeCurrentPage
                                                ? 'page'
                                                : undefined
                                        }
                                        className={cn(
                                            'flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium shadow-sm transition-colors',
                                            page === '...'
                                                ? 'cursor-default border-transparent text-muted-foreground shadow-none'
                                                : page === safeCurrentPage
                                                    ? 'border-transparent bg-emerald-600 text-white'
                                                    : 'border border-border text-foreground hover:bg-muted',
                                        )}
                                    >
                                        {page}
                                    </button>
                                ))}

                                <button
                                    type="button"
                                    title={isId ? 'Halaman berikutnya' : 'Next page'}
                                    aria-label={isId ? 'Halaman berikutnya' : 'Next page'}
                                    onClick={() => {
                                        setCurrentPage((page) =>
                                            Math.min(totalPages, page + 1),
                                        );
                                    }}
                                    disabled={
                                        safeCurrentPage === totalPages ||
                                        classesQuery.isLoading
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"
                                >
                                    <ChevronRight size={16} />
                                </button>

                                <button
                                    type="button"
                                    title={isId ? 'Halaman terakhir' : 'Last page'}
                                    aria-label={isId ? 'Halaman terakhir' : 'Last page'}
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={
                                        safeCurrentPage === totalPages ||
                                        classesQuery.isLoading
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"
                                >
                                    <ChevronsRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
