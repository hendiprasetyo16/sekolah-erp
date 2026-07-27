import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users, Plus, Upload, Download, Search, Filter,
  Eye, Edit, Trash2, Loader2, BookOpen
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { teacherService } from '../services/teacher.service';

const statusConfig: Record<string, { label: string; color: string }> = {
  PNS: { label: 'PNS', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  CPNS: { label: 'CPNS', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  HONORER: { label: 'Honorer', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  GTY: { label: 'GTY', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  GTT: { label: 'GTT', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

export function TeacherListPage() {
  const { t, locale } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const pageSize = 10;

  const { data: teachersResponse, isLoading, isError } = useQuery({
    queryKey: ['teachers', currentPage, pageSize, searchQuery],
    queryFn: () => teacherService.list({ 
      page: currentPage, 
      limit: pageSize,
      search: searchQuery,
    }),
  });

  const teachers = teachersResponse?.data?.data || [];
  const meta = teachersResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;

  const toggleRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedRows.length === teachers.length && teachers.length > 0) {
      setSelectedRows([]);
    } else {
      setSelectedRows(teachers.map(t => t.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Guru & Pegawai</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total {meta?.total || 0} guru & pegawai terdaftar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors">
            <Download size={16} />
            <span className="hidden sm:inline">{t('common.export')}</span>
          </button>
          <Link to="/teachers/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={16} />
            <span>Tambah Data</span>
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama atau NIP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center px-4 py-2 text-sm font-medium border border-border bg-background rounded-lg hover:bg-muted text-foreground transition-colors shadow-sm">
              <Upload className="mr-2 h-4 w-4" />
              {t('common.import')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-4 w-12">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === teachers.length && teachers.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-border bg-muted accent-emerald-600"
                  />
                </th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Nama Lengkap</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">NIP/NUPTK</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Jabatan</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Status Kepegawaian</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">Status Sertifikasi</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-4" />
                      <p>Memuat data guru...</p>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-red-500">
                    Gagal memuat data guru. Silakan coba lagi.
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    Tidak ada data guru ditemukan
                  </td>
                </tr>
              ) : (
                teachers.map((teacher, idx) => (
                  <motion.tr
                    key={teacher.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "hover:bg-muted/50 transition-colors group cursor-pointer",
                      selectedRows.includes(teacher.id) ? "bg-emerald-500/5" : ""
                    )}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(teacher.id)}
                        onChange={() => toggleRow(teacher.id)}
                        className="w-4 h-4 rounded border-border bg-muted accent-emerald-600"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-medium text-xs">
                          {teacher.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{teacher.fullName}</p>
                          <p className="text-xs text-muted-foreground">{teacher.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{teacher.nip || '-'}</p>
                      <p className="text-xs text-muted-foreground">{teacher.nuptk || 'Tanpa NUPTK'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {teacher.position || 'Guru Kelas'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex px-2 py-1 text-xs font-medium rounded-md border",
                        statusConfig[teacher.status || 'HONORER']?.color || "bg-secondary text-secondary-foreground"
                      )}>
                        {statusConfig[teacher.status || 'HONORER']?.label || teacher.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex px-2 py-1 text-xs font-medium rounded-full",
                        teacher.isCertified ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      )}>
                        {teacher.isCertified ? 'Sudah Sertifikasi' : 'Belum Sertifikasi'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Link to={`/teachers/${teacher.id}`} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link to={`/teachers/${teacher.id}/edit`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                          <Edit className="h-4 w-4" />
                        </Link>
                        <button className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
