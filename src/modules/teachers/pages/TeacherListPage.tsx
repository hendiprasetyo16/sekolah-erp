import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Upload, Download, Search, Filter,
  Eye, Edit, Trash2, Loader2, BookOpen,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  X, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { teacherService } from '../services/teacher.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';

const statusConfig: Record<string, { label: string; color: string }> = {
  PNS: { label: 'PNS', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  CPNS: { label: 'CPNS', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  HONORER: { label: 'Honorer', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  GTY: { label: 'GTY', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  GTT: { label: 'GTT', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

export function TeacherListPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'single' | 'bulk' | 'all'; id?: string }>({ isOpen: false, type: 'single' });

  const pageSize = 10;

  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  const dict = {
    title: locale === 'id' ? 'Data Guru & Pegawai' : 'Teachers & Staff Data',
    total: locale === 'id' ? 'Total' : 'Total',
    registered: locale === 'id' ? 'guru & pegawai terdaftar' : 'registered staff',
    addBtn: locale === 'id' ? 'Tambah Data' : 'Add New',
    search: locale === 'id' ? 'Cari nama atau NIP...' : 'Search by name or NIP...',
    importBtn: locale === 'id' ? 'Impor' : 'Import',
    exportBtn: locale === 'id' ? 'Ekspor' : 'Export',
    emptyBtn: locale === 'id' ? 'Kosongkan Data' : 'Clear All',
    colNo: locale === 'id' ? 'No' : 'No',
    colName: locale === 'id' ? 'Nama Lengkap' : 'Full Name',
    colNip: locale === 'id' ? 'NIP/NUPTK' : 'NIP/NUPTK',
    colPos: locale === 'id' ? 'Jabatan' : 'Position',
    colStat: locale === 'id' ? 'Status' : 'Status',
    colCert: locale === 'id' ? 'Sertifikasi' : 'Certification',
    colAct: locale === 'id' ? 'Aksi' : 'Action',
    certYes: locale === 'id' ? 'Sudah' : 'Certified',
    certNo: locale === 'id' ? 'Belum' : 'Uncertified',
    empty: locale === 'id' ? 'Tidak ada data guru.' : 'No teacher data found.',
    loading: locale === 'id' ? 'Memuat data...' : 'Loading data...',
    errLoad: locale === 'id' ? 'Gagal memuat data.' : 'Failed to load data.',
    delSuccess: locale === 'id' ? 'Data berhasil dihapus.' : 'Data successfully deleted.',

    showing: locale === 'id' ? 'Menampilkan' : 'Showing',
    of: locale === 'id' ? 'dari' : 'of',
    dataText: locale === 'id' ? 'data' : 'entries',
    jumpTo: locale === 'id' ? 'Lompat ke:' : 'Jump to:',
    male: locale === 'id' ? 'Laki-laki' : 'Male',
    female: locale === 'id' ? 'Perempuan' : 'Female',
    selected: locale === 'id' ? 'Terpilih' : 'Selected',
    deleteBtn: locale === 'id' ? 'Hapus' : 'Delete',

    modalBulkTitle: locale === 'id' ? 'Hapus Massal?' : 'Bulk Delete?',
    modalSingleTitle: locale === 'id' ? 'Hapus Data?' : 'Delete Data?',
    modalAllTitle: locale === 'id' ? 'Kosongkan Semua Data?' : 'Empty All Data?',
    modalBulkDesc: locale === 'id'
      ? `Sebanyak ${selectedRows.length} data guru akan dihapus dari sistem. Aksi ini bersifat permanen dan tidak dapat dibatalkan.`
      : `${selectedRows.length} teacher records will be removed from the system. This action is permanent and cannot be undone.`,
    modalSingleDesc: locale === 'id'
      ? 'Data guru ini akan dihapus dari sistem secara permanen. Anda tidak dapat mengurungkan aksi ini.'
      : 'This teacher record will be permanently deleted from the system. You cannot undo this action.',
    modalAllDesc: locale === 'id'
      ? 'PERHATIAN: Anda akan menghapus SELURUH data guru dari sistem. Aksi ini bersifat permanen dan tidak dapat dibatalkan.'
      : 'WARNING: You are about to delete ALL teacher records from the system. This action is permanent and cannot be undone.',
    cancel: locale === 'id' ? 'Batal' : 'Cancel',
    yesDelete: locale === 'id' ? 'Ya, Hapus' : 'Yes, Delete',
    processing: locale === 'id' ? 'Memproses' : 'Processing',
  };

  const { data: teachersResponse, isLoading, isError } = useQuery({
    queryKey: ['teachers', currentPage, pageSize, searchQuery],
    queryFn: () => teacherService.list({ page: currentPage, limit: pageSize, search: searchQuery }),
  });

  const teachers = teachersResponse?.data?.data || [];
  const meta = teachersResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;
  const totalData = meta?.total || 0;

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teacherService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success(dict.delSuccess);
      setDeleteModal({ isOpen: false, type: 'single' });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteBulkMutation = useMutation({
    mutationFn: (ids: string[]) => teacherService.deleteBulk(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSelectedRows([]);
      toast.success(dict.delSuccess);
      setDeleteModal({ isOpen: false, type: 'single' });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const handleDeleteAll = async () => {
    try {
      const res = await teacherService.exportAll();
      const allIds = res.data.map(t => t.id);
      if (allIds.length === 0) {
        toast.info(locale === 'id' ? 'Tidak ada data untuk dihapus.' : 'No data to delete.');
        setDeleteModal({ isOpen: false, type: 'single' });
        return;
      }
      deleteBulkMutation.mutate(allIds);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const confirmDelete = () => {
    if (deleteModal.type === 'single' && deleteModal.id) {
      deleteMutation.mutate(deleteModal.id);
    } else if (deleteModal.type === 'bulk') {
      deleteBulkMutation.mutate(selectedRows);
    } else if (deleteModal.type === 'all') {
      handleDeleteAll();
    }
  };

  const handlePageSubmit = () => {
    let p = parseInt(pageInputValue);
    if (isNaN(p) || p < 1) p = 1;
    if (p > totalPages && totalPages > 0) p = totalPages;
    setCurrentPage(p);
    setPageInputValue(p.toString());
  };

  const importMutation = useMutation({
    mutationFn: (payloads: any[]) => teacherService.importBulk(payloads),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
    onError: (error: Error) => toast.error(`Gagal: ${error.message}`)
  });

  const mapStatusKepegawaian = (status: string) => {
    if (!status) return 'HONORER';
    const s = status.toUpperCase();
    if (s.includes('CPNS')) return 'CPNS';
    if (s.includes('PNS')) return 'PNS';
    if (s.includes('GTY') || s.includes('YAYASAN')) return 'GTY';
    if (s.includes('GTT')) return 'GTT';
    return 'HONORER';
  };

  // DIPERBAIKI: Parser tanggal yang lebih kuat untuk format Excel dan string DD/MM/YYYY
  const parseExcelDate = (excelDate: any) => {
    if (!excelDate) return null;
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - (25567 + 2)) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    if (typeof excelDate === 'string') {
      if (excelDate.includes('T')) return excelDate.split('T')[0];
      const parts = excelDate.split(/[-/]/);
      if (parts.length === 3) {
        // Jika format YYYY-MM-DD
        if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        // Jika format DD-MM-YYYY
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return excelDate; // fallback
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !school?.id) return;
    setIsImporting(true);
    const toastId = toast.loading(locale === 'id' ? 'Memproses Excel Dapodik...' : 'Processing Excel file...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // Range diset 4 berasumsi header ada di baris 5. Sesuaikan jika header Excel ada di baris lain.
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 4, raw: false });

      if (jsonData.length === 0) throw new Error('File Excel kosong/format salah. Pastikan header berada di baris yang benar.');

      // DIPERBAIKI: Pemetaan Ekstensif agar semua kolom terbaca dan ter-insert ke database
      const payloads = jsonData.map((row: any) => {
        // Fungsi helper untuk mencari nama kolom yang variatif dari Dapodik
        const getVal = (keys: string[]) => {
          for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
              return String(row[key]).trim();
            }
          }
          return null;
        };

        return {
          schoolId: school.id,
          // Info Dasar
          fullName: getVal(['Nama', 'Nama Lengkap']) || 'Tanpa Nama',
          gender: getVal(['JK', 'Jenis Kelamin', 'L/P']) === 'P' ? 'P' : 'L',
          nip: getVal(['NIP']),
          nuptk: getVal(['NUPTK']),
          nik: getVal(['NIK', 'No NIK', 'Nomor Induk Kependudukan']),
          noKk: getVal(['No KK', 'Nomor KK', 'KK']),
          birthPlace: getVal(['Tempat Lahir']),
          birthDate: parseExcelDate(getVal(['Tanggal Lahir'])),
          address: getVal(['Alamat', 'Alamat Jalan']),
          phone: getVal(['No HP', 'HP', 'Telepon']),
          email: getVal(['Email', 'E-mail']),

          // Kepegawaian
          status: mapStatusKepegawaian(getVal(['Status Kepegawaian']) || ''),
          position: getVal(['Jenis PTK', 'Jabatan']) || 'Guru',
          joinDate: parseExcelDate(getVal(['TMT Pengangkatan', 'TMT Kerja'])),

          // Informasi Dapodik Ekstra (Sesuai schema Supabase)
          tugasTambahan: getVal(['Tugas Tambahan']),
          skCpns: getVal(['SK CPNS']),
          tanggalCpns: parseExcelDate(getVal(['Tanggal CPNS'])),
          skPengangkatan: getVal(['SK Pengangkatan']),
          tmtPengangkatan: parseExcelDate(getVal(['TMT Pengangkatan'])),
          lembagaPengangkatan: getVal(['Lembaga Pengangkatan']),
          pangkatGolongan: getVal(['Pangkat Golongan', 'Pangkat/Golongan', 'Golongan']),
          sumberGaji: getVal(['Sumber Gaji']),
          namaIbuKandung: getVal(['Nama Ibu Kandung']),
          statusPerkawinan: getVal(['Status Perkawinan']),
          namaSuamiIstri: getVal(['Nama Suami/Istri', 'Nama Suami / Istri', 'Nama Suami/ Istri']),
          nipSuamiIstri: getVal(['NIP Suami/Istri', 'NIP Suami / Istri']),
          pekerjaanSuamiIstri: getVal(['Pekerjaan Suami/Istri', 'Pekerjaan Suami / Istri']),
          tmtPns: parseExcelDate(getVal(['TMT PNS'])),

          // Pajak & Keuangan
          npwp: getVal(['NPWP']),
          namaWajibPajak: getVal(['Nama Wajib Pajak']),
          kewarganegaraan: getVal(['Kewarganegaraan']) || 'Indonesia',
          bank: getVal(['Bank', 'Nama Bank']),
          nomorRekeningBank: getVal(['Nomor Rekening Bank', 'No Rekening', 'Rekening Bank']),
          rekeningAtasNama: getVal(['Rekening Atas Nama', 'Atas Nama']),

          // Lain-lain
          karpeg: getVal(['Karpeg']),
          karisKarsu: getVal(['Karis/Karsu', 'Karis Karsu']),
          lintang: getVal(['Lintang']),
          bujur: getVal(['Bujur']),
          nuks: getVal(['NUKS']),

          // Defaults
          isActive: true,
          isCertified: false,
          maxHoursPerWeek: 24,
        };
      });

      await importMutation.mutateAsync(payloads);
      toast.success(locale === 'id' ? `Tersimpan ${payloads.length} data.` : `Saved ${payloads.length} entries.`, { id: toastId });
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    const toastId = toast.loading(locale === 'id' ? 'Menyiapkan file Excel...' : 'Preparing Excel file...');

    try {
      const response = await teacherService.exportAll();
      let teachersToExport = response.data;
      if (!teachersToExport || teachersToExport.length === 0) throw new Error(locale === 'id' ? 'Tidak ada data untuk diekspor' : 'No data to export');

      if (selectedRows.length > 0) {
        teachersToExport = teachersToExport.filter(t => selectedRows.includes(t.id));
      }

      const exportData = teachersToExport.map((t, index) => ({
        'No': index + 1,
        'Nama Lengkap': t.fullName,
        'JK': t.gender,
        'NIP': t.nip || '-',
        'NUPTK': t.nuptk || '-',
        'Jenis PTK (Jabatan)': t.position || '-',
        'Status Kepegawaian': t.status || '-',
        'Sertifikasi': t.isCertified ? 'Sudah' : 'Belum',
        'Email': t.email || '-',
        'Telepon': t.phone || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }];

      XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = selectedRows.length > 0 ? `Data_Guru_Terpilih_${dateStr}.xlsx` : `Data_Guru_Pegawai_${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
      toast.success(locale === 'id' ? 'Data berhasil diekspor!' : 'Data successfully exported!', { id: toastId });
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const generatePagination = (current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{dict.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {dict.total} {totalData} {dict.registered}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeleteModal({ isOpen: true, type: 'all' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">{dict.emptyBtn}</span>
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">{dict.exportBtn}</span>
          </button>

          <Link to="/teachers/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={16} />
            <span>{dict.addBtn}</span>
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">

          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={dict.search}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {selectedRows.length > 0 && (
              <div className="flex items-center gap-2 mr-1 sm:mr-2 animate-in fade-in zoom-in duration-200">
                <span className="hidden sm:inline-block text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 whitespace-nowrap">
                  {selectedRows.length} {dict.selected}
                </span>
                <span className="sm:hidden text-sm font-bold text-emerald-600">
                  ({selectedRows.length})
                </span>
                <button
                  onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                >
                  <Trash2 size={16} />
                  <span className="hidden sm:inline">{dict.deleteBtn}</span>
                </button>
                <button onClick={() => setSelectedRows([])} className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"><X size={16} /></button>
              </div>
            )}

            <input type="file" accept=".xlsx, .xls" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center px-4 py-2 text-sm font-medium border border-border bg-background rounded-lg hover:bg-muted text-foreground transition-colors shadow-sm disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isImporting ? '...' : dict.importBtn}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === teachers.length && teachers.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground w-12 text-center">{dict.colNo}</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground min-w-50">{dict.colName}</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">{dict.colNip}</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">{dict.colPos}</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">{dict.colStat}</th>
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">{dict.colCert}</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">{dict.colAct}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" />{dict.loading}</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-red-500">{dict.errLoad}</td></tr>
              ) : teachers.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{dict.empty}</td></tr>
              ) : (
                teachers.map((teacher, idx) => {
                  const actualNo = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <motion.tr
                      key={teacher.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn("hover:bg-muted/50 transition-colors group cursor-pointer", selectedRows.includes(teacher.id) ? "bg-emerald-500/5" : "")}
                      onClick={() => toggleRow(teacher.id)}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(teacher.id)}
                          onChange={() => { }}
                          className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">{actualNo}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-medium text-xs shrink-0">
                            {teacher.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground line-clamp-1">{teacher.fullName}</p>
                            <p className="text-xs text-muted-foreground">{teacher.gender === 'L' ? dict.male : dict.female}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{teacher.nip || '-'}</p>
                        <p className="text-xs text-muted-foreground">{teacher.nuptk || 'Tanpa NUPTK'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{teacher.position || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap", statusConfig[teacher.status || 'HONORER']?.color || "bg-secondary text-secondary-foreground")}>
                          {statusConfig[teacher.status || 'HONORER']?.label || teacher.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2 py-1 text-xs font-medium rounded-full", teacher.isCertified ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                          {teacher.isCertified ? dict.certYes : dict.certNo}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-2">
                          <Link to={`/teachers/${teacher.id}`} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md"><Eye className="h-4 w-4" /></Link>
                          <Link to={`/teachers/${teacher.id}/edit`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"><Edit className="h-4 w-4" /></Link>
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, type: 'single', id: teacher.id })}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          >
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

        {totalPages > 0 && (
          <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm bg-background rounded-b-xl">
            <div className="text-muted-foreground whitespace-nowrap text-center sm:text-left">
              {dict.showing} {teachers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, totalData)} {dict.of} {totalData} {dict.dataText}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0 overflow-x-auto max-w-full py-1">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground whitespace-nowrap">{dict.jumpTo}</span>
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

              <div className="w-px h-5 bg-border shrink-0 mx-0.5"></div>

              <div className="flex items-center gap-1 shrink-0">
                <button title="Pertama" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronsLeft size={16} /></button>
                <button title="Sebelumnya" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronLeft size={16} /></button>
                {generatePagination(currentPage, totalPages).map((p, i) => (
                  <button key={i} disabled={p === '...' || isLoading} onClick={() => typeof p === 'number' && setCurrentPage(p)} className={cn("min-w-9 h-9 px-2 flex items-center justify-center rounded-md font-medium text-sm transition-colors shadow-sm", p === '...' ? "cursor-default text-muted-foreground border-transparent shadow-none" : p === currentPage ? "bg-emerald-600 text-white border-transparent" : "border border-border hover:bg-muted text-foreground")}>{p}</button>
                ))}
                <button title="Selanjutnya" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronRight size={16} /></button>
                <button title="Terakhir" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronsRight size={16} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {deleteModal.isOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setDeleteModal({ isOpen: false, type: 'single' })} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative bg-background border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 overflow-hidden z-10">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 ring-4 ring-red-50"><AlertTriangle size={28} /></div>
                <h3 className="text-xl font-bold text-foreground">{deleteModal.type === 'bulk' ? dict.modalBulkTitle : deleteModal.type === 'all' ? dict.modalAllTitle : dict.modalSingleTitle}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{deleteModal.type === 'bulk' ? dict.modalBulkDesc : deleteModal.type === 'all' ? dict.modalAllDesc : dict.modalSingleDesc}</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setDeleteModal({ isOpen: false, type: 'single' })} disabled={deleteMutation.isPending || deleteBulkMutation.isPending} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">{dict.cancel}</button>
                <button onClick={confirmDelete} disabled={deleteMutation.isPending || deleteBulkMutation.isPending} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">{(deleteMutation.isPending || deleteBulkMutation.isPending) ? (<><Loader2 className="w-4 h-4 animate-spin" /> {dict.processing}</>) : (dict.yesDelete)}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}