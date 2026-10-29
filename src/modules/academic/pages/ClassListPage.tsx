import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus, Edit, Trash2, Loader2, AlertCircle, Users, ArrowUpDown, ArrowUp,
    ArrowDown, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { academicService } from '../services/academic.service';
import type { AcademicYear, ClassItem } from '../types/academic.types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';

const ITEMS_PER_PAGE = 10;
type SortKey = 'name' | 'gradeLevel' | 'academic_years' | 'teachers';
type SortDirection = 'asc' | 'desc';
type DeleteModalType = 'single' | 'bulk' | 'all';
type DeleteTarget = { id: string; name: string } | null;

function generatePagination(current: number, total: number): Array<number | '...'> {
    if (total <= 0) return [];
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
}

function compareValues(a: string | number, b: string | number): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function ClassListPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { school, user } = useAuthStore();
    const schoolId = school?.id;
    const role = user?.role as string | undefined;
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const canManageData = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const canDeleteData = canManageData;

    const t = useMemo(() => ({
        title: locale === 'id' ? 'Manajemen Kelas' : 'Class Management',
        subtitle: locale === 'id' ? 'Kelola rombongan belajar (rombel) berdasarkan tahun ajaran.' : 'Manage study groups based on academic year.',
        addBtn: locale === 'id' ? 'Tambah Kelas' : 'Add Class',
        filterLabel: locale === 'id' ? 'Filter Tahun Ajaran:' : 'Filter Academic Year:',
        allYear: locale === 'id' ? 'Semua Tahun Ajaran' : 'All Academic Years',
        active: locale === 'id' ? '(Aktif)' : '(Active)',
        selected: locale === 'id' ? 'Terpilih' : 'Selected',
        delSelection: locale === 'id' ? 'Hapus Pilihan' : 'Delete Selection',
        clearAll: locale === 'id' ? 'Kosongkan Semua' : 'Clear All',
        thNo: 'No.', thName: locale === 'id' ? 'Nama Kelas' : 'Class Name',
        thGrade: locale === 'id' ? 'Tingkat' : 'Grade',
        thYear: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        thTeacher: locale === 'id' ? 'Wali Kelas' : 'Homeroom Teacher',
        thStudents: locale === 'id' ? 'Jumlah Siswa' : 'Total Students',
        thAction: locale === 'id' ? 'Aksi' : 'Action',
        loading: locale === 'id' ? 'Memuat...' : 'Loading...',
        error: locale === 'id' ? 'Gagal memuat data kelas.' : 'Failed to load classes.',
        yearsError: locale === 'id' ? 'Gagal memuat tahun ajaran.' : 'Failed to load academic years.',
        empty: locale === 'id' ? 'Tidak ada kelas yang ditemukan.' : 'No classes found.',
        noSchool: locale === 'id' ? 'Sekolah tidak ditemukan. Silakan masuk kembali.' : 'School context is missing. Please sign in again.',
        gradePrefix: locale === 'id' ? 'Kelas' : 'Grade',
        noTeacher: locale === 'id' ? 'Belum diatur' : 'Not set',
        toastDelSuccess: locale === 'id' ? 'Kelas terpilih berhasil dihapus.' : 'Selected classes deleted successfully.',
        confirmDelTitle: locale === 'id' ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        cancel: locale === 'id' ? 'Batal' : 'Cancel',
        deleteBtn: locale === 'id' ? 'Hapus' : 'Delete',
        delWarning: locale === 'id' ? 'Kelas yang sudah memiliki siswa tidak dapat dihapus.' : 'Classes with enrolled students cannot be deleted.',
        delMsgBulk: (count: number) => locale === 'id' ? `Yakin ingin menghapus ${count} kelas terpilih?` : `Delete ${count} selected classes?`,
        delMsgAll: locale === 'id' ? 'Yakin ingin menghapus semua kelas yang sedang ditampilkan untuk sekolah ini? Kelas dengan siswa tidak akan dihapus.' : 'Delete all classes currently shown for this school? Classes with students will not be deleted.',
        delMsgSingle: (name: string) => locale === 'id' ? `Yakin ingin menghapus kelas "${name}"?` : `Delete class "${name}"?`,
        entries: locale === 'id' ? 'entri' : 'entries',
        showing: locale === 'id' ? 'Menampilkan' : 'Showing',
        to: locale === 'id' ? '–' : 'to',
        of: locale === 'id' ? 'dari' : 'of',
        jumpTo: locale === 'id' ? 'Lompat ke:' : 'Go to:',
        superAdminOnly: locale === 'id' ? 'Hanya Super Admin yang dapat mengosongkan semua kelas.' : 'Only Super Admin can clear all classes.',
        noSelection: locale === 'id' ? 'Pilih setidaknya satu kelas.' : 'Select at least one class.',
        retry: locale === 'id' ? 'Coba lagi' : 'Retry',
    }), [locale]);

    const [selectedAcademicYear, setSelectedAcademicYear] = useState('all');
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
    const [deleteModalType, setDeleteModalType] = useState<DeleteModalType>('single');
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'gradeLevel', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInputValue, setPageInputValue] = useState('1');

    useEffect(() => {
        setCurrentPage(1);
        setPageInputValue('1');
        setSelectedClasses([]);
    }, [selectedAcademicYear]);

    const academicYearsQuery = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: () => {
            if (!schoolId) throw new Error(t.noSchool);
            return academicService.getAcademicYears(schoolId);
        },
        enabled: Boolean(schoolId),
    });

    const classesQuery = useQuery({
        queryKey: ['classes', schoolId, selectedAcademicYear],
        queryFn: () => {
            if (!schoolId) throw new Error(t.noSchool);
            return academicService.getClasses(schoolId, selectedAcademicYear === 'all' ? undefined : selectedAcademicYear);
        },
        enabled: Boolean(schoolId),
    });

    const academicYears: AcademicYear[] = academicYearsQuery.data?.data ?? [];
    const classes: ClassItem[] = classesQuery.data?.data ?? [];

    const sortedClasses = useMemo(() => {
        const copy = [...classes];
        copy.sort((a, b) => {
            let aValue: string | number = '';
            let bValue: string | number = '';
            switch (sortConfig.key) {
                case 'name': aValue = a.name; bValue = b.name; break;
                case 'gradeLevel': aValue = a.gradeLevel; bValue = b.gradeLevel; break;
                case 'academic_years': aValue = a.academic_years?.name ?? ''; bValue = b.academic_years?.name ?? ''; break;
                case 'teachers': aValue = a.teachers?.fullName ?? ''; bValue = b.teachers?.fullName ?? ''; break;
            }
            const result = compareValues(aValue, bValue);
            return sortConfig.direction === 'asc' ? result : -result;
        });
        return copy;
    }, [classes, sortConfig]);

    const totalItems = sortedClasses.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    useEffect(() => {
        if (safeCurrentPage !== currentPage) setCurrentPage(safeCurrentPage);
    }, [safeCurrentPage, currentPage]);
    useEffect(() => setPageInputValue(String(safeCurrentPage)), [safeCurrentPage]);

    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const paginatedClasses = sortedClasses.slice(startIndex, endIndex);
    const visibleIds = paginatedClasses.map((item) => item.id);
    const selectedVisibleCount = visibleIds.filter((id) => selectedClasses.includes(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

    // Remove stale IDs when the result set changes (e.g. another admin deleted a class).
    useEffect(() => {
        const available = new Set(classes.map((item) => item.id));
        setSelectedClasses((previous) => previous.filter((id) => available.has(id)));
    }, [classes]);

    const handleSort = useCallback((key: SortKey) => {
        setSortConfig((previous) => ({ key, direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }));
    }, []);

    const toggleRow = useCallback((id: string) => {
        setSelectedClasses((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
    }, []);

    const toggleAllVisible = useCallback(() => {
        setSelectedClasses((previous) => {
            if (allVisibleSelected) return previous.filter((id) => !visibleIds.includes(id));
            return [...new Set([...previous, ...visibleIds])];
        });
    }, [allVisibleSelected, visibleIds]);

    const handlePageSubmit = () => {
        const parsed = Number.parseInt(pageInputValue, 10);
        const nextPage = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), totalPages) : 1;
        setCurrentPage(nextPage);
        setPageInputValue(String(nextPage));
    };

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!schoolId) throw new Error(t.noSchool);
            const uniqueIds = [...new Set(ids)].filter(Boolean);
            if (uniqueIds.length === 0) throw new Error(t.noSelection);
            // Signature intentionally includes schoolId to prevent cross-tenant deletion.
            return academicService.deleteBulkClasses(schoolId, uniqueIds);
        },
        onSuccess: async () => {
            toast.success(t.toastDelSuccess);
            setSelectedClasses([]);
            setDeleteTarget(null);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['classes', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['class', schoolId] }),
            ]);
        },
        onError: (error: Error) => toast.error(error.message || t.error),
    });

    const openDelete = (type: DeleteModalType, target: DeleteTarget) => {
        setDeleteModalType(type);
        setDeleteTarget(target);
    };

    const confirmDelete = () => {
        if (!canDeleteData || deleteMutation.isPending) return;
        if (deleteModalType === 'single' && deleteTarget && deleteTarget.id !== 'all' && deleteTarget.id !== 'bulk') {
            deleteMutation.mutate([deleteTarget.id]);
            return;
        }
        if (deleteModalType === 'bulk') {
            if (selectedClasses.length === 0) { toast.error(t.noSelection); return; }
            deleteMutation.mutate(selectedClasses);
            return;
        }
        if (deleteModalType === 'all') {
            if (!isSuperAdmin) { toast.error(t.superAdminOnly); return; }
            deleteMutation.mutate(classes.map((item) => item.id));
        }
    };

    const sortIcon = (key: SortKey) => sortConfig.key === key
        ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)
        : <ArrowUpDown size={14} className="opacity-40" />;

    const columnCount = (canDeleteData ? 1 : 0) + 6 + (canManageData ? 1 : 0);

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-6">
            <AnimatePresence>
                {deleteTarget && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="presentation">
                        <motion.div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-100">
                                <AlertCircle className="h-6 w-6 text-red-600" />
                            </div>
                            <h2 id="delete-dialog-title" className="mb-2 text-xl font-bold">{t.confirmDelTitle}</h2>
                            <p className="mb-6 text-sm text-muted-foreground">
                                {deleteModalType === 'bulk' ? t.delMsgBulk(selectedClasses.length)
                                    : deleteModalType === 'all' ? t.delMsgAll
                                        : t.delMsgSingle(deleteTarget.name)}
                                <span className="mt-2 block text-xs text-red-500">{t.delWarning}</span>
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>{t.cancel}</Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
                                    {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    {t.deleteBtn}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {isSuperAdmin && (
                        <Button variant="outline" className="border-red-200 text-red-600 shadow-sm transition-colors hover:bg-red-50 hover:text-red-700" onClick={() => openDelete('all', { id: 'all', name: 'all' })} disabled={!classes.length || deleteMutation.isPending}>
                            <AlertCircle size={16} className="mr-2" /> {t.clearAll}
                        </Button>
                    )}
                    {canManageData && (
                        <Link to="/academic/classes/new" className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700">
                            <Plus size={16} /> <span>{t.addBtn}</span>
                        </Link>
                    )}
                </div>
            </div>

            {!schoolId && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{t.noSchool}</div>}

            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:flex-row sm:items-center">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="whitespace-nowrap text-sm font-medium text-muted-foreground">{t.filterLabel}</label>
                    <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                        <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder={t.filterLabel} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t.allYear}</SelectItem>
                            {academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name} {year.isActive ? t.active : ''}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {academicYearsQuery.isError && <span role="alert" className="text-sm text-destructive">{t.yearsError}</span>}
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {canDeleteData && selectedClasses.length > 0 && (
                        <div className="flex animate-in items-center gap-2 fade-in">
                            <span className="hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-600 sm:inline-block">{selectedClasses.length} {t.selected}</span>
                            <Button variant="destructive" size="sm" onClick={() => openDelete('bulk', { id: 'bulk', name: 'bulk' })} disabled={deleteMutation.isPending}>
                                <Trash2 size={16} className="mr-2" /> {t.delSelection}
                            </Button>
                            <button type="button" aria-label={t.cancel} onClick={() => setSelectedClasses([])} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X size={16} /></button>
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm">
                <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr className="whitespace-nowrap border-b border-border/50 bg-muted/30">
                                {canDeleteData && <th className="w-12 p-4 text-center"><input aria-label={locale === 'id' ? 'Pilih semua kelas di halaman ini' : 'Select all classes on this page'} type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600" /></th>}
                                <th className="w-16 px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">{t.thNo}</th>
                                <th scope="col" aria-sort={sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50" onClick={() => handleSort('name')}><div className="flex items-center gap-1">{t.thName} {sortIcon('name')}</div></th>
                                <th scope="col" aria-sort={sortConfig.key === 'gradeLevel' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50" onClick={() => handleSort('gradeLevel')}><div className="flex items-center gap-1">{t.thGrade} {sortIcon('gradeLevel')}</div></th>
                                <th scope="col" aria-sort={sortConfig.key === 'academic_years' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50" onClick={() => handleSort('academic_years')}><div className="flex items-center gap-1">{t.thYear} {sortIcon('academic_years')}</div></th>
                                <th scope="col" aria-sort={sortConfig.key === 'teachers' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="cursor-pointer select-none px-6 py-4 text-xs font-semibold uppercase text-muted-foreground hover:bg-muted/50" onClick={() => handleSort('teachers')}><div className="flex items-center gap-1">{t.thTeacher} {sortIcon('teachers')}</div></th>
                                <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-muted-foreground">{t.thStudents}</th>
                                {canManageData && <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-muted-foreground">{t.thAction}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {classesQuery.isLoading ? (
                                <tr><td colSpan={columnCount} className="px-6 py-12 text-center"><Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-emerald-600" />{t.loading}</td></tr>
                            ) : classesQuery.isError ? (
                                <tr><td colSpan={columnCount} className="px-6 py-12 text-center text-destructive"><p>{t.error}</p><Button className="mt-3" variant="outline" onClick={() => void classesQuery.refetch()}>{t.retry}</Button></td></tr>
                            ) : paginatedClasses.length === 0 ? (
                                <tr><td colSpan={columnCount} className="px-6 py-12 text-center text-muted-foreground">{t.empty}</td></tr>
                            ) : paginatedClasses.map((cls: ClassItem, index) => (
                                <motion.tr key={cls.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className={cn('whitespace-nowrap transition-colors hover:bg-muted/30', selectedClasses.includes(cls.id) && 'bg-emerald-500/5')}>
                                    {canDeleteData && <td className="p-4 text-center"><input aria-label={`${locale === 'id' ? 'Pilih kelas' : 'Select class'} ${cls.name}`} type="checkbox" checked={selectedClasses.includes(cls.id)} onChange={() => toggleRow(cls.id)} className="h-4 w-4 cursor-pointer rounded border-border bg-muted accent-emerald-600" /></td>}
                                    <td className="px-6 py-4 text-sm font-medium text-muted-foreground">{startIndex + index + 1}</td>
                                    <td className="px-6 py-4"><span className="text-base font-bold text-foreground">{cls.name}</span>{cls.major && <p className="mt-0.5 text-xs text-muted-foreground">{cls.major}</p>}</td>
                                    <td className="px-6 py-4"><span className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-medium">{t.gradePrefix} {cls.gradeLevel}</span></td>
                                    <td className="px-6 py-4 text-sm text-foreground">{cls.academic_years?.name ?? '—'}</td>
                                    <td className="px-6 py-4 text-sm text-muted-foreground">{cls.teachers?.fullName || <span className="italic">{t.noTeacher}</span>}</td>
                                    <td className="px-6 py-4 text-center"><div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-700"><Users size={14} /> {cls.studentCount ?? 0} / {cls.capacity}</div></td>
                                    {canManageData && <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2"><Link aria-label={`${locale === 'id' ? 'Edit kelas' : 'Edit class'} ${cls.name}`} to={`/academic/classes/${cls.id}/edit`} className="rounded-md p-2 text-emerald-600 transition-colors hover:bg-emerald-50"><Edit className="h-4 w-4" /></Link><button type="button" aria-label={`${locale === 'id' ? 'Hapus kelas' : 'Delete class'} ${cls.name}`} onClick={() => openDelete('single', { id: cls.id, name: cls.name })} className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></td>}
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {totalItems > 0 && !classesQuery.isError && (
                    <div className="flex flex-col items-center justify-between gap-4 rounded-b-xl border-t border-border bg-background p-4 text-sm lg:flex-row">
                        <div className="w-full text-center text-muted-foreground lg:w-auto lg:text-left">{t.showing} {startIndex + 1} {t.to} {endIndex} {t.of} {totalItems} {t.entries}</div>
                        <div className="flex max-w-full shrink-0 items-center justify-center gap-2 overflow-x-auto py-1 sm:gap-3 lg:justify-end">
                            <div className="flex shrink-0 items-center gap-2"><label htmlFor="class-page-jump" className="whitespace-nowrap text-muted-foreground">{t.jumpTo}</label><input id="class-page-jump" type="number" value={pageInputValue} onChange={(event) => setPageInputValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handlePageSubmit()} onBlur={handlePageSubmit} disabled={classesQuery.isLoading} className="h-9 w-14 rounded-md border border-border bg-background text-center font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min={1} max={totalPages} /></div>
                            <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block" />
                            <div className="flex shrink-0 items-center gap-1">
                                <button type="button" title={locale === 'id' ? 'Halaman pertama' : 'First page'} onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1 || classesQuery.isLoading} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"><ChevronsLeft size={16} /></button>
                                <button type="button" title={locale === 'id' ? 'Halaman sebelumnya' : 'Previous page'} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1 || classesQuery.isLoading} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"><ChevronLeft size={16} /></button>
                                {generatePagination(safeCurrentPage, totalPages).map((page, index) => <button type="button" key={`${page}-${index}`} disabled={page === '...' || classesQuery.isLoading} onClick={() => typeof page === 'number' && setCurrentPage(page)} aria-current={page === safeCurrentPage ? 'page' : undefined} className={cn('flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium shadow-sm transition-colors', page === '...' ? 'cursor-default border-transparent text-muted-foreground shadow-none' : page === safeCurrentPage ? 'border-transparent bg-emerald-600 text-white' : 'border border-border text-foreground hover:bg-muted')}>{page}</button>)}
                                <button type="button" title={locale === 'id' ? 'Halaman berikutnya' : 'Next page'} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages || classesQuery.isLoading} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"><ChevronRight size={16} /></button>
                                <button type="button" title={locale === 'id' ? 'Halaman terakhir' : 'Last page'} onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages || classesQuery.isLoading} className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground disabled:opacity-40"><ChevronsRight size={16} /></button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
