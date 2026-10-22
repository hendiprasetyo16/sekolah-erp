import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Loader2, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { academicService } from '../services/academic.service';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ClassListPage() {
    const { locale } = useTranslation();
    const queryClient = useQueryClient();
    const { school } = useAuthStore();

    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('all');
    const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);

    // Kamus Bahasa
    const t = {
        title: locale === 'id' ? 'Manajemen Kelas' : 'Class Management',
        subtitle: locale === 'id' ? 'Kelola rombongan belajar (rombel) berdasarkan tahun ajaran.' : 'Manage study groups based on the academic year.',
        addBtn: locale === 'id' ? 'Tambah Kelas' : 'Add Class',
        filterLabel: locale === 'id' ? 'Tahun Ajaran:' : 'Academic Year:',
        allYear: locale === 'id' ? 'Semua Tahun Ajaran' : 'All Academic Years',
        ayActive: locale === 'id' ? '(Aktif)' : '(Active)',

        // Table Headers
        thNo: 'No.',
        thName: locale === 'id' ? 'Nama Kelas' : 'Class Name',
        thGrade: locale === 'id' ? 'Tingkat' : 'Grade',
        thYear: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        thTeacher: locale === 'id' ? 'Wali Kelas' : 'Homeroom Teacher',
        thStudents: locale === 'id' ? 'Jumlah Siswa' : 'Total Students',
        thAction: locale === 'id' ? 'Aksi' : 'Action',

        // Table Content
        loading: locale === 'id' ? 'Memuat...' : 'Loading...',
        errorLoad: locale === 'id' ? 'Gagal memuat data' : 'Failed to load data',
        empty: locale === 'id' ? 'Tidak ada kelas yang ditemukan.' : 'No classes found.',
        noTeacher: locale === 'id' ? 'Belum diatur' : 'Not set',
        classPrefix: locale === 'id' ? 'Kelas' : 'Grade',

        // Delete Modal
        delTitle: locale === 'id' ? 'Hapus Kelas?' : 'Delete Class?',
        delDesc1: locale === 'id' ? 'Yakin ingin menghapus kelas' : 'Are you sure you want to delete class',
        delDesc2: locale === 'id' ? '? Anda tidak bisa menghapus kelas yang sudah memiliki siswa di dalamnya.' : '? You cannot delete a class that already has students.',
        cancel: locale === 'id' ? 'Batal' : 'Cancel',
        delete: locale === 'id' ? 'Hapus' : 'Delete',
        toastSuccess: locale === 'id' ? 'Kelas berhasil dihapus' : 'Class deleted successfully',
    };

    // Fetch Academic Years
    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', school?.id],
        queryFn: () => academicService.getAcademicYears(school?.id || ''),
        enabled: !!school?.id,
    });

    // Fetch Classes
    const { data: classesResponse, isLoading, isError } = useQuery({
        queryKey: ['classes', school?.id, selectedAcademicYear],
        queryFn: () => academicService.getClasses(school?.id || '', selectedAcademicYear === 'all' ? undefined : selectedAcademicYear),
        enabled: !!school?.id,
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => academicService.deleteClass(id),
        onSuccess: () => {
            toast.success(t.toastSuccess);
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            setClassToDelete(null);
        },
        onError: (error: Error) => {
            toast.error(error.message);
            setClassToDelete(null);
        }
    });

    const classes = classesResponse?.data || [];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Modal Hapus */}
            <AnimatePresence>
                {classToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4 border border-red-200 dark:border-red-800">
                                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">{t.delTitle}</h3>
                            <p className="text-muted-foreground text-sm mb-6">
                                {t.delDesc1} <span className="font-semibold text-foreground">"{classToDelete.name}"</span>{t.delDesc2}
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setClassToDelete(null)} disabled={deleteMutation.isPending}>{t.cancel}</Button>
                                <Button variant="destructive" onClick={() => deleteMutation.mutate(classToDelete.id)} disabled={deleteMutation.isPending}>
                                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} {t.delete}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
                </div>
                <Link to="/academic/classes/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all shadow-md">
                    <Plus size={16} /> <span>{t.addBtn}</span>
                </Link>
            </div>

            {/* Filter Tahun Ajaran */}
            <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm flex items-center gap-4">
                <label className="text-sm font-medium text-muted-foreground">{t.filterLabel}</label>
                <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder={t.filterLabel} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t.allYear}</SelectItem>
                        {academicYears?.data?.map((ay) => (
                            <SelectItem key={ay.id} value={ay.id}>
                                {ay.name} {ay.isActive ? t.ayActive : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">{t.thNo}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.thName}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.thGrade}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.thYear}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.thTeacher}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">{t.thStudents}</th>
                                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t.thAction}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" /><p className="text-muted-foreground">{t.loading}</p></td></tr>
                            ) : isError ? (
                                <tr><td colSpan={7} className="px-6 py-12 text-center text-destructive">{t.errorLoad}</td></tr>
                            ) : classes.length === 0 ? (
                                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">{t.empty}</td></tr>
                            ) : (
                                classes.map((cls, idx) => (
                                    <motion.tr key={cls.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4 text-sm text-muted-foreground font-medium">{idx + 1}</td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-foreground text-base">{cls.name}</span>
                                            {cls.major && <p className="text-xs text-muted-foreground mt-0.5">{cls.major}</p>}
                                        </td>
                                        <td className="px-6 py-4"><span className="bg-muted px-2.5 py-1 rounded-md text-sm font-medium border border-border">{t.classPrefix} {cls.gradeLevel}</span></td>
                                        <td className="px-6 py-4 text-sm text-foreground">{cls.academic_years?.name || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">{cls.teachers?.fullName || <span className="italic">{t.noTeacher}</span>}</td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold text-sm border border-blue-500/20">
                                                <Users size={14} /> {cls.studentCount} / {cls.capacity}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                <Link to={`/academic/classes/${cls.id}/edit`} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition-colors"><Edit className="h-4 w-4" /></Link>
                                                <button onClick={() => setClassToDelete({ id: cls.id, name: cls.name })} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
}