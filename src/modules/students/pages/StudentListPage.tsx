import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Plus, Upload, Download, Search, Filter,
  MoreHorizontal, Eye, Edit, Trash2, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight,
  FileSpreadsheet, FileText, ArrowUpDown, Loader2
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate } from '@/utils/format';
import { studentService } from '../services/student.service';

const statusConfig: Record<string, { label: string; color: string }> = {
  AKTIF: { label: 'Aktif', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  MUTASI_KELUAR: { label: 'Mutasi', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  LULUS: { label: 'Lulus', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  DO: { label: 'DO', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export function StudentListPage() {
  const { t, locale } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const pageSize = 10;

  const { data: studentsResponse, isLoading, isError } = useQuery({
    queryKey: ['students', currentPage, pageSize, searchQuery, selectedClass],
    queryFn: () => studentService.list({ 
      page: currentPage, 
      limit: pageSize,
      search: searchQuery,
      classId: selectedClass === 'all' ? undefined : selectedClass
    }),
  });

  const students = studentsResponse?.data?.data || [];
  const meta = studentsResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === students.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(students.map(s => s.id));
    }
  };

  const classes = ['all', 'RPL', 'TKJ', 'MM', 'AKL', 'OTKP'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('students.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === 'id'
              ? `Total ${meta?.total || 0} siswa terdaftar`
              : `${meta?.total || 0} students registered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground hover:bg-muted/50 transition-colors">
            <Upload size={16} />
            <span className="hidden sm:inline">{t('students.importExcel')}</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground hover:bg-muted/50 transition-colors">
            <Download size={16} />
            <span className="hidden sm:inline">{t('students.exportData')}</span>
          </button>
          <Link to="/students/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20">
            <Plus size={16} />
            <span>{t('students.addStudent')}</span>
          </Link>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('students.search')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/50 bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {classes.map(cls => (
              <button
                key={cls}
                onClick={() => { setSelectedClass(cls); setCurrentPage(1); }}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border',
                  selectedClass === cls
                    ? 'bg-primary/10 border-primary/50 text-primary'
                    : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/40'
                )}
              >
                {cls === 'all' ? (locale === 'id' ? 'Semua' : 'All') : cls}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/students/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700 h-10 px-4 py-2">
              <Plus className="mr-2 h-4 w-4" />
              {t('common.create')} Siswa
            </Link>
            <button className="flex items-center px-4 py-2 text-sm font-medium border border-border bg-background rounded-lg hover:bg-muted text-foreground transition-colors shadow-sm">
              <Upload className="mr-2 h-4 w-4" />
              {t('common.import')}
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="p-4 w-12">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === students.length && students.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-border bg-muted accent-primary"
                  />
                </th>
                {[
                  { key: 'nisn', label: t('students.nisn') },
                  { key: 'name', label: t('students.fullName') },
                  { key: 'class', label: t('students.class') },
                  { key: 'gender', label: t('students.gender') },
                  { key: 'birthDate', label: locale === 'id' ? 'Tanggal Lahir' : 'Birth Date' },
                  { key: 'status', label: t('students.status') },
                  { key: 'actions', label: t('common.actions') },
                ].map(col => (
                  <th key={col.key} className="px-4 py-3 text-left">
                    <button className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                      {col.label}
                      {col.key !== 'actions' && <ArrowUpDown size={12} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-4" />
                        <p>Memuat data siswa...</p>
                      </div>
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-red-500">
                      Gagal memuat data siswa. Silakan coba lagi.
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  students.map((student, idx) => (
                <motion.tr
                  key={student.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={cn(
                    'border-b border-border/30 table-row-hover',
                    selectedRows.includes(student.id) && 'bg-primary/5'
                  )}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(student.id)}
                      onChange={() => toggleRow(student.id)}
                      className="w-4 h-4 rounded border-border bg-muted accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-muted-foreground">{student.nisn}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground">{student.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground bg-muted/30 px-2 py-1 rounded">{student.className}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-sm',
                      student.gender === 'L' ? 'text-blue-400' : 'text-pink-400'
                    )}>
                      {student.gender === 'L' ? (locale === 'id' ? 'Laki-laki' : 'Male') : (locale === 'id' ? 'Perempuan' : 'Female')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{formatDate(student.entryDate, 'DD MMM YYYY')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-xs font-medium px-2.5 py-1 rounded-full border',
                      statusConfig[student.status]?.color || 'bg-muted text-muted-foreground'
                    )}>
                      {statusConfig[student.status]?.label || student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Link to={`/students/${student.id}`} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-colors" title={t('common.detail')}>
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link to={`/students/${student.id}/edit`} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors" title={t('common.edit')}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors" title={t('common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              )))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-border/50 gap-3">
          <div className="text-xs text-muted-foreground">
            {t('common.showing')} {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, meta?.total || 0)} {t('common.of')} {meta?.total || 0} {t('common.entries')}
            {selectedRows.length > 0 && (
              <span className="ml-2 text-primary font-medium">
                ({selectedRows.length} {locale === 'id' ? 'dipilih' : 'selected'})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  page === currentPage
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
