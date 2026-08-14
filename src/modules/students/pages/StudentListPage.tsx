import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2,
  Loader2, AlertCircle, X
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { studentService } from '../services/student.service';
import { supabase } from '@/services/supabase.client';
import { Button } from '@/components/ui/button';

export function StudentListPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // State untuk Custom Modal Konfirmasi Hapus
  const [studentToDelete, setStudentToDelete] = useState<{ id: string, name: string } | null>(null);

  const pageSize = 10;

  // Fetch Classes
  const { data: classesData } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string; gradeLevel: number }[];
    }
  });

  // Fetch Students
  const { data: studentsResponse, isLoading, isError } = useQuery({
    queryKey: ['students', currentPage, pageSize, searchQuery, selectedClass],
    queryFn: () => studentService.list({
      page: currentPage,
      limit: pageSize,
      search: searchQuery,
      classId: selectedClass === 'all' ? undefined : selectedClass
    }),
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentService.delete(id),
    onSuccess: () => {
      toast.success(locale === 'id' ? 'Siswa berhasil dihapus' : 'Student deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedRows([]);
      setStudentToDelete(null); // Tutup modal
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setStudentToDelete(null);
    }
  });

  const students = studentsResponse?.data?.data || [];
  const meta = studentsResponse?.data?.meta;

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === students.length && students.length > 0) {
      setSelectedRows([]);
    } else {
      setSelectedRows(students.map(s => s.id));
    }
  };

  const getStatusConfig = (status: string) => {
    const config: Record<string, { id: string; en: string; color: string }> = {
      AKTIF: { id: 'Aktif', en: 'Active', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
      MUTASI_KELUAR: { id: 'Mutasi', en: 'Transferred', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
      LULUS: { id: 'Lulus', en: 'Graduated', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
      DO: { id: 'DO', en: 'Dropped Out', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
      CUTI: { id: 'Cuti', en: 'On Leave', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    };
    return config[status] || { id: status, en: status, color: 'bg-muted text-muted-foreground' };
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* --- MODAL KONFIRMASI HAPUS (MODERN) --- */}
      <AnimatePresence>
        {studentToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {locale === 'id' ? 'Hapus Data Siswa?' : 'Delete Student Data?'}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {locale === 'id'
                    ? `Apakah Anda yakin ingin menghapus siswa bernama `
                    : `Are you sure you want to delete `}
                  <span className="font-semibold text-foreground">"{studentToDelete.name}"</span>?
                  {locale === 'id'
                    ? ' Data yang sudah dihapus tidak dapat dikembalikan.'
                    : ' This action cannot be undone.'}
                </p>
              </div>
              <div className="bg-muted/50 p-4 flex justify-end gap-3 border-t border-border/50">
                <Button variant="outline" onClick={() => setStudentToDelete(null)} disabled={deleteMutation.isPending}>
                  {locale === 'id' ? 'Batal' : 'Cancel'}
                </Button>
                <Button variant="destructive" onClick={() => deleteMutation.mutate(studentToDelete.id)} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  {locale === 'id' ? 'Ya, Hapus' : 'Yes, Delete'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header & Buttons (Import/Export Dikembalikan) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('students.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'id' ? `Total ${meta?.total || 0} siswa terdaftar` : `${meta?.total || 0} students registered`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Import Excel */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm">
            <Upload size={16} />
            <span className="hidden sm:inline">{locale === 'id' ? 'Import Excel' : 'Import Excel'}</span>
          </button>

          {/* Tombol Export */}
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm">
            <Download size={16} />
            <span className="hidden sm:inline">{locale === 'id' ? 'Export Data' : 'Export Data'}</span>
          </button>

          {/* Tombol Tambah */}
          <Link to="/students/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all shadow-md">
            <Plus size={16} />
            <span>{t('students.addStudent')}</span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('students.search')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 sm:pb-0">
            <button
              onClick={() => { setSelectedClass('all'); setCurrentPage(1); }}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border',
                selectedClass === 'all' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {locale === 'id' ? 'Semua Kelas' : 'All Classes'}
            </button>
            {classesData?.map(cls => (
              <button
                key={cls.id}
                onClick={() => { setSelectedClass(cls.id); setCurrentPage(1); }}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border',
                  selectedClass === cls.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50'
                )}
              >
                {cls.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="p-4 w-12">
                  <input type="checkbox" checked={selectedRows.length === students.length && students.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-border accent-emerald-600" />
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{locale === 'id' ? 'NIS / NISN' : 'NIS / NISN'}</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('students.fullName')}</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('students.class')}</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('students.gender')}</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('students.status')}</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
                    <p className="text-muted-foreground">{t('common.loading')}</p>
                  </td>
                </tr>
              ) : isError ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-red-500">{t('common.error')}</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              ) : (
                students.map((student, idx) => {
                  const statusConf = getStatusConfig(student.status);
                  return (
                    <motion.tr key={student.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className={cn("hover:bg-muted/30 transition-colors", selectedRows.includes(student.id) && "bg-emerald-500/5")}>
                      <td className="p-4">
                        <input type="checkbox" checked={selectedRows.includes(student.id)} onChange={() => toggleRow(student.id)} className="w-4 h-4 rounded border-border accent-emerald-600" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">{student.nis}</span>
                          <span className="text-xs font-mono text-muted-foreground">{student.nisn}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                            {student.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{student.fullName}</p>
                            <p className="text-xs text-muted-foreground">{student.phone || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-foreground">{student.className}</span></td>
                      <td className="px-4 py-3">
                        <span className={cn('text-sm', student.gender === 'L' ? 'text-blue-500' : 'text-pink-500')}>
                          {student.gender === 'L' ? (locale === 'id' ? 'Laki-laki' : 'Male') : (locale === 'id' ? 'Perempuan' : 'Female')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-md border', statusConf.color)}>
                          {locale === 'id' ? statusConf.id : statusConf.en}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Link to={`/students/${student.id}`} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors" title={t('common.detail')}><Eye className="h-4 w-4" /></Link>
                          <Link to={`/students/${student.id}/edit`} className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title={t('common.edit')}><Edit className="h-4 w-4" /></Link>
                          {/* Tombol Hapus memanggil Modal Modern */}
                          <button onClick={() => setStudentToDelete({ id: student.id, name: student.fullName })} className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors" title={t('common.delete')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}