import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Loader2, AlertCircle, Users, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { academicService } from '../services/academic.service';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';

export function ClassListPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { school } = useAuthStore();

    // Kamus Bahasa (Bilingual Support)
    const t = {
        title: locale === 'id' ? 'Manajemen Kelas' : 'Class Management',
        subtitle: locale === 'id' ? 'Kelola rombongan belajar (rombel) berdasarkan tahun ajaran.' : 'Manage study groups based on academic year.',
        addBtn: locale === 'id' ? 'Tambah Kelas' : 'Add Class',
        filterLabel: locale === 'id' ? 'Filter Tahun Ajaran:' : 'Filter Academic Year:',
        allYear: locale === 'id' ? 'Semua Tahun Ajaran' : 'All Academic Years',
        active: locale === 'id' ? '(Aktif)' : '(Active)',
        selected: locale === 'id' ? 'Terpilih' : 'Selected',
        delSelection: locale === 'id' ? 'Hapus Pilihan' : 'Delete Selection',
        clearAll: locale === 'id' ? 'Kosongkan Semua' : 'Clear All',
        thNo: 'No.',
        thName: locale === 'id' ? 'Nama Kelas' : 'Class Name',
        thGrade: locale === 'id' ? 'Tingkat' : 'Grade',
        thYear: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        thTeacher: locale === 'id' ? 'Wali Kelas' : 'Homeroom Teacher',
        thStudents: locale === 'id' ? 'Jumlah Siswa' : 'Total Students',
        thAction: locale === 'id' ? 'Aksi' : 'Action',
        loading: locale === 'id' ? 'Memuat...' : 'Loading...',
        error: locale === 'id' ? 'Gagal memuat data' : 'Failed to load data',
        empty: locale === 'id' ? 'Tidak ada kelas yang ditemukan.' : 'No classes found.',
        gradePrefix: locale === 'id' ? 'Kelas' : 'Grade',
        noTeacher: locale === 'id' ? 'Belum diatur' : 'Not set',
        toastDelSuccess: locale === 'id' ? 'Kelas terpilih berhasil dihapus' : 'Selected classes deleted successfully',
        confirmDelTitle: locale === 'id' ? 'Konfirmasi Hapus' : 'Confirm Deletion',
        cancel: locale === 'id' ? 'Batal' : 'Cancel',
        deleteBtn: locale === 'id' ? 'Hapus' : 'Delete',
        delWarning: locale === 'id' ? '*Kelas yang sudah memiliki siswa tidak akan bisa dihapus.' : '*Classes with enrolled students cannot be deleted.',
        delMsgBulk: (count: number) => locale === 'id' ? `Yakin ingin menghapus ${count} kelas?` : `Are you sure you want to delete ${count} classes?`,
        delMsgAll: locale === 'id' ? 'PERINGATAN: Yakin ingin menghapus SEMUA kelas yang tertampil?' : 'WARNING: Are you sure you want to delete ALL displayed classes?',
        delMsgSingle: (name: string) => locale === 'id' ? `Yakin ingin menghapus kelas "${name}"?` : `Are you sure you want to delete class "${name}"?`,
        entries: locale === 'id' ? 'entri' : 'entries',
        showing: locale === 'id' ? 'Menampilkan' : 'Showing',
        to: locale === 'id' ? '-' : 'to',
        of: locale === 'id' ? 'dari' : 'of',
        jumpTo: locale === 'id' ? 'Lompat ke:' : 'Jump to:',
    };

    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('all');

    // States untuk Hapus & Select
    const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);
    const [deleteModalType, setDeleteModalType] = useState<'single' | 'bulk' | 'all'>('single');
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

    // State untuk Sorting
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'gradeLevel', direction: 'asc' });

    // State untuk Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInputValue, setPageInputValue] = useState('1');
    const itemsPerPage = 10;

    // Reset pagination ketika filter tahun ajaran berubah
    useEffect(() => {
        setCurrentPage(1);
        setPageInputValue('1');
    }, [selectedAcademicYear]);

    // Sinkronisasi input "Jump to" dengan state halaman saat ini
    useEffect(() => {
        setPageInputValue(currentPage.toString());
    }, [currentPage]);

    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', school?.id],
        queryFn: () => academicService.getAcademicYears(school?.id || ''),
        enabled: !!school?.id,
    });

    const { data: classesResponse, isLoading, isError } = useQuery({
        queryKey: ['classes', school?.id, selectedAcademicYear],
        queryFn: () => academicService.getClasses(school?.id || '', selectedAcademicYear === 'all' ? undefined : selectedAcademicYear),
        enabled: !!school?.id,
    });

    const classes = classesResponse?.data || [];

    // Sorting Logic
    const sortedClasses = useMemo(() => {
        let sortable = [...classes];
        if (sortConfig !== null) {
            sortable.sort((a, b) => {
                let aValue = a[sortConfig.key as keyof typeof a] ?? '';
                let bValue = b[sortConfig.key as keyof typeof b] ?? '';

                if (sortConfig.key === 'academic_years') {
                    aValue = a.academic_years?.name || '';
                    bValue = b.academic_years?.name || '';
                } else if (sortConfig.key === 'teachers') {
                    aValue = a.teachers?.fullName || '';
                    bValue = b.teachers?.fullName || '';
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [classes, sortConfig]);

    // Pagination Logic
    const totalItems = sortedClasses.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    // Potong data berdasarkan halaman yang aktif
    const paginatedClasses = sortedClasses.slice(startIndex, endIndex);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const toggleRow = (id: string) => setSelectedClasses(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
    const toggleAll = () => {
        if (selectedClasses.length === paginatedClasses.length && paginatedClasses.length > 0) setSelectedClasses([]);
        else setSelectedClasses(paginatedClasses.map(c => c.id));
    };

    const handlePageSubmit = () => {
        let p = parseInt(pageInputValue);
        if (isNaN(p) || p < 1) p = 1;
        if (p > totalPages && totalPages > 0) p = totalPages;
        setCurrentPage(p);
        setPageInputValue(p.toString());
    };

    const generatePagination = (current: number, total: number) => {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
        if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    // Delete Mutation
    const deleteBulkClassMutation = useMutation({
        mutationFn: (ids: string[]) => academicService.deleteBulkClasses(ids),
        onSuccess: () => {
            toast.success(t.toastDelSuccess);
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            setSelectedClasses([]); setClassToDelete(null);

            // Cek jika halaman ini kosong setelah dihapus, mundur 1 halaman
            if (paginatedClasses.length === selectedClasses.length && currentPage > 1) {
                setCurrentPage(prev => prev - 1);
            }
        },
        onError: (error: Error) => {
            toast.error(error.message); setClassToDelete(null);
        }
    });

    const confirmDelete = () => {
        if (deleteModalType === 'single' && classToDelete) deleteBulkClassMutation.mutate([classToDelete.id]);
        else if (deleteModalType === 'bulk') deleteBulkClassMutation.mutate(selectedClasses);
        else if (deleteModalType === 'all') deleteBulkClassMutation.mutate(classes.map(c => c.id));
    };

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* MODAL HAPUS */}
            <AnimatePresence>
                {classToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 border border-red-200">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">{t.confirmDelTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                {deleteModalType === 'bulk' ? t.delMsgBulk(selectedClasses.length)
                                    : deleteModalType === 'all' ? t.delMsgAll
                                        : t.delMsgSingle(classToDelete.name)}
                                <br /><span className="text-xs text-red-500 mt-2 block">{t.delWarning}</span>
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setClassToDelete(null)} disabled={deleteBulkClassMutation.isPending}>{t.cancel}</Button>
                                <Button variant="destructive" onClick={confirmDelete} disabled={deleteBulkClassMutation.isPending}>
                                    {deleteBulkClassMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {t.deleteBtn}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{t.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
                </div>
                <Link to="/academic/classes/new" className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all shadow-md">
                    <Plus size={16} /> <span>{t.addBtn}</span>
                </Link>
            </div>

            {/* ACTION BAR & FILTER */}
            <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                    <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">{t.filterLabel}</label>
                    <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                        <SelectTrigger className="w-full sm:w-64">
                            <SelectValue placeholder={t.filterLabel} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t.allYear}</SelectItem>
                            {academicYears?.data?.map((ay) => (
                                <SelectItem key={ay.id} value={ay.id}>{ay.name} {ay.isActive ? t.active : ''}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {selectedClasses.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in">
                            <span className="hidden sm:inline-block text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                                {selectedClasses.length} {t.selected}
                            </span>
                            <Button variant="destructive" size="sm" onClick={() => { setDeleteModalType('bulk'); setClassToDelete({ id: 'bulk', name: 'bulk' }); }}>
                                <Trash2 size={16} className="mr-2" /> {t.delSelection}
                            </Button>
                            <button onClick={() => setSelectedClasses([])} className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"><X size={16} /></button>
                        </div>
                    )}
                    <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => { setDeleteModalType('all'); setClassToDelete({ id: 'all', name: 'all' }); }}>
                        <Trash2 size={16} className="mr-2" /> {t.clearAll}
                    </Button>
                </div>
            </div>

            {/* TABEL */}
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border/50 bg-muted/30 whitespace-nowrap">
                                <th className="p-4 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedClasses.length === paginatedClasses.length && paginatedClasses.length > 0}
                                        onChange={toggleAll}
                                        className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                                    />
                                </th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase w-16">{t.thNo}</th>

                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">{t.thName} {sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                </th>

                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('gradeLevel')}>
                                    <div className="flex items-center gap-1">{t.thGrade} {sortConfig?.key === 'gradeLevel' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                </th>

                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('academic_years')}>
                                    <div className="flex items-center gap-1">{t.thYear} {sortConfig?.key === 'academic_years' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                </th>

                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => handleSort('teachers')}>
                                    <div className="flex items-center gap-1">{t.thTeacher} {sortConfig?.key === 'teachers' ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} className="opacity-40" />}</div>
                                </th>

                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-center">{t.thStudents}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase text-right">{t.thAction}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading ? (
                                <tr><td colSpan={8} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />{t.loading}</td></tr>
                            ) : isError ? (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-destructive">{t.error}</td></tr>
                            ) : paginatedClasses.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{t.empty}</td></tr>
                            ) : (
                                paginatedClasses.map((cls, idx) => (
                                    <motion.tr key={cls.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className={`hover:bg-muted/30 transition-colors whitespace-nowrap ${selectedClasses.includes(cls.id) ? 'bg-emerald-500/5' : ''}`}>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" checked={selectedClasses.includes(cls.id)} onChange={() => toggleRow(cls.id)} className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer" />
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{startIndex + idx + 1}</td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-foreground text-base">{cls.name}</span>
                                            {cls.major && <p className="text-xs text-muted-foreground mt-0.5">{cls.major}</p>}
                                        </td>
                                        <td className="px-6 py-4"><span className="bg-muted px-2.5 py-1 rounded-md text-sm font-medium border border-border">{t.gradePrefix} {cls.gradeLevel}</span></td>
                                        <td className="px-6 py-4 text-sm text-foreground">{cls.academic_years?.name || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">{cls.teachers?.fullName || <span className="italic">{t.noTeacher}</span>}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 font-semibold text-sm border border-blue-500/20">
                                                <Users size={14} /> {cls.studentCount} / {cls.capacity}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                <Link to={`/academic/classes/${cls.id}/edit`} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"><Edit className="h-4 w-4" /></Link>
                                                <button onClick={() => { setDeleteModalType('single'); setClassToDelete({ id: cls.id, name: cls.name }); }} className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION UI MODERN */}
                {totalItems > 0 && (
                    <div className="p-4 border-t border-border flex flex-col lg:flex-row items-center justify-between gap-4 text-sm bg-background rounded-b-xl">

                        {/* Kiri: Teks Informasi */}
                        <div className="text-muted-foreground w-full lg:w-auto text-center lg:text-left">
                            {t.showing} {paginatedClasses.length > 0 ? startIndex + 1 : 0} {t.to} {endIndex} {t.of} {totalItems} {t.entries}
                        </div>

                        {/* Kanan: Navigasi Paginasi (1 Baris Terkunci) */}
                        <div className="flex items-center justify-center lg:justify-end gap-2 sm:gap-3 shrink-0 overflow-x-auto max-w-full py-1">

                            {/* Input "Lompat ke:" */}
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-muted-foreground whitespace-nowrap">{t.jumpTo}</span>
                                <input
                                    type="number"
                                    value={pageInputValue}
                                    onChange={(e) => setPageInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePageSubmit()}
                                    onBlur={handlePageSubmit}
                                    disabled={isLoading}
                                    className="w-12 h-9 text-center font-medium border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                                    min={1}
                                    max={totalPages}
                                />
                            </div>

                            {/* Garis Pemisah Vertikal */}
                            <div className="hidden sm:block w-px h-5 bg-border shrink-0 mx-0.5"></div>

                            {/* Tombol Navigasi Angka */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    title="Pertama"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1 || isLoading}
                                    className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                                >
                                    <ChevronsLeft size={16} />
                                </button>
                                <button
                                    title="Sebelumnya"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1 || isLoading}
                                    className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                {/* Nomor Halaman Dinamis */}
                                {generatePagination(currentPage, totalPages).map((p, i) => (
                                    <button
                                        key={i}
                                        disabled={p === '...' || isLoading}
                                        onClick={() => typeof p === 'number' && setCurrentPage(p)}
                                        className={cn(
                                            "min-w-9 h-9 px-2 flex items-center justify-center rounded-md font-medium text-sm transition-colors shadow-sm",
                                            p === '...'
                                                ? "cursor-default text-muted-foreground border-transparent shadow-none"
                                                : p === currentPage
                                                    ? "bg-emerald-600 text-white border-transparent"
                                                    : "border border-border hover:bg-muted text-foreground"
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}

                                <button
                                    title="Selanjutnya"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || isLoading}
                                    className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button
                                    title="Terakhir"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages || isLoading}
                                    className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
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