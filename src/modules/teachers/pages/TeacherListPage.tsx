import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2, Loader2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  X, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { teacherService } from '../services/teacher.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';

// ==========================================
// TYPES
// ==========================================
interface TeacherImportPayload {
  schoolId: string;
  fullName: string;
  gender: string;
  nip: string | null;
  nuptk: string | null;
  nik: string | null;
  noKk: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  position: string;
  joinDate: string | null;
  tugasTambahan: string | null;
  skCpns: string | null;
  tanggalCpns: string | null;
  skPengangkatan: string | null;
  tmtPengangkatan: string | null;
  lembagaPengangkatan: string | null;
  pangkatGolongan: string | null;
  sumberGaji: string | null;
  namaIbuKandung: string | null;
  statusPerkawinan: string | null;
  namaSuamiIstri: string | null;
  nipSuamiIstri: string | null;
  pekerjaanSuamiIstri: string | null;
  tmtPns: string | null;
  npwp: string | null;
  namaWajibPajak: string | null;
  kewarganegaraan: string;
  bank: string | null;
  nomorRekeningBank: string | null;
  rekeningAtasNama: string | null;
  karpeg: string | null;
  karisKarsu: string | null;
  lintang: string | null;
  bujur: string | null;
  nuks: string | null;
  isActive: boolean;
  isCertified: boolean;
  maxHoursPerWeek: number;
}

interface TeacherExport {
  id: string;
  fullName: string;
  gender: string;
  nip: string | null;
  nuptk: string | null;
  position: string | null;
  status: string | null;
  isCertified: boolean;
  email: string | null;
  phone: string | null;
}

type ExcelRow = Record<string, string | number | boolean>;
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DeleteModalState = { isOpen: boolean; type: 'single' | 'bulk' | 'all'; id?: string };

// ==========================================
// CONSTANTS & PURE HELPERS
// ==========================================
const PAGE_SIZE = 10;
const FALLBACK_HEADER_ROW = 4; // dipakai kalau baris header tidak ditemukan otomatis

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PNS: { label: 'PNS', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  CPNS: { label: 'CPNS', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  HONORER: { label: 'Honorer', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  GTY: { label: 'GTY', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  GTT: { label: 'GTT', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
};

// Header Excel dibandingkan tanpa peduli huruf besar/kecil dan spasi ganda/baris baru
const normKey = (k: string) => k.toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeRow = (row: ExcelRow): ExcelRow => {
  const out: ExcelRow = {};
  for (const [k, v] of Object.entries(row)) out[normKey(k)] = v;
  return out;
};

const getVal = (row: ExcelRow, keys: string[]): string | null => {
  for (const key of keys) {
    const v = row[normKey(key)];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
};

const mapStatusKepegawaian = (status: string | null): string => {
  if (!status) return 'HONORER';
  const s = status.toUpperCase();
  if (s.includes('CPNS')) return 'CPNS';
  if (s.includes('PNS')) return 'PNS';
  if (s.includes('GTY') || s.includes('YAYASAN')) return 'GTY';
  if (s.includes('GTT')) return 'GTT';
  return 'HONORER';
};

const serialToIso = (serial: number): string =>
  new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().split('T')[0];

// Mengembalikan YYYY-MM-DD, atau null kalau formatnya tidak bisa dikenali
// (lebih aman daripada mengirim teks acak yang membuat seluruh import gagal di database).
const parseExcelDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return serialToIso(value);

  const str = String(value).trim();
  if (!str) return null;

  // Nomor seri tanggal Excel yang terbaca sebagai teks, misal "33000"
  if (/^\d{5}(\.\d+)?$/.test(str)) return serialToIso(Number(str));

  if (str.includes('T')) return str.split('T')[0];

  const parts = str.split(/[-/.]/);
  if (parts.length !== 3 || !parts.every(p => /^\d+$/.test(p))) return null;

  let y: string, m: string, d: string;
  if (parts[0].length === 4) {
    [y, m, d] = parts;
  } else if (parts[2].length === 4) {
    [d, m, y] = parts;
  } else if (parts[2].length === 2) {
    // Tahun 2 digit: 00-(tahun ini) dianggap 20xx, sisanya 19xx
    const yy = parseInt(parts[2], 10);
    const currentYY = new Date().getFullYear() % 100;
    y = String(yy <= currentYY ? 2000 + yy : 1900 + yy);
    [d, m] = parts;
  } else {
    return null;
  }

  const mi = parseInt(m, 10);
  const di = parseInt(d, 10);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `${y}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`;
};

const parseTeacherExcel = (jsonData: ExcelRow[], schoolId: string) => {
  const payloads: TeacherImportPayload[] = [];
  let skipped = 0;

  for (const rawRow of jsonData) {
    const row = normalizeRow(rawRow);
    const fullName = getVal(row, ['Nama', 'Nama Lengkap']);

    // Baris tanpa nama (catatan kaki, baris sisa, dsb.) dilewati, bukan dibuat jadi "Tanpa Nama"
    if (!fullName) { skipped++; continue; }

    payloads.push({
      schoolId,
      fullName,
      gender: (getVal(row, ['JK', 'Jenis Kelamin', 'L/P']) || '').toUpperCase().startsWith('P') ? 'P' : 'L',
      nip: getVal(row, ['NIP']),
      nuptk: getVal(row, ['NUPTK']),
      nik: getVal(row, ['NIK', 'No NIK', 'Nomor Induk Kependudukan']),
      noKk: getVal(row, ['No KK', 'Nomor KK', 'KK']),
      birthPlace: getVal(row, ['Tempat Lahir']),
      birthDate: parseExcelDate(getVal(row, ['Tanggal Lahir'])),
      address: getVal(row, ['Alamat', 'Alamat Jalan']),
      phone: getVal(row, ['No HP', 'HP', 'Telepon']),
      email: getVal(row, ['Email', 'E-mail']),
      status: mapStatusKepegawaian(getVal(row, ['Status Kepegawaian'])),
      position: getVal(row, ['Jenis PTK', 'Jabatan']) || 'Guru',
      joinDate: parseExcelDate(getVal(row, ['TMT Pengangkatan', 'TMT Kerja'])),
      tugasTambahan: getVal(row, ['Tugas Tambahan']),
      skCpns: getVal(row, ['SK CPNS']),
      tanggalCpns: parseExcelDate(getVal(row, ['Tanggal CPNS'])),
      skPengangkatan: getVal(row, ['SK Pengangkatan']),
      tmtPengangkatan: parseExcelDate(getVal(row, ['TMT Pengangkatan'])),
      lembagaPengangkatan: getVal(row, ['Lembaga Pengangkatan']),
      pangkatGolongan: getVal(row, ['Pangkat Golongan', 'Pangkat/Golongan', 'Golongan']),
      sumberGaji: getVal(row, ['Sumber Gaji']),
      namaIbuKandung: getVal(row, ['Nama Ibu Kandung']),
      statusPerkawinan: getVal(row, ['Status Perkawinan']),
      namaSuamiIstri: getVal(row, ['Nama Suami/Istri', 'Nama Suami / Istri', 'Nama Suami/ Istri']),
      nipSuamiIstri: getVal(row, ['NIP Suami/Istri', 'NIP Suami / Istri']),
      pekerjaanSuamiIstri: getVal(row, ['Pekerjaan Suami/Istri', 'Pekerjaan Suami / Istri']),
      tmtPns: parseExcelDate(getVal(row, ['TMT PNS'])),
      npwp: getVal(row, ['NPWP']),
      namaWajibPajak: getVal(row, ['Nama Wajib Pajak']),
      kewarganegaraan: getVal(row, ['Kewarganegaraan']) || 'Indonesia',
      bank: getVal(row, ['Bank', 'Nama Bank']),
      nomorRekeningBank: getVal(row, ['Nomor Rekening Bank', 'No Rekening', 'Rekening Bank']),
      rekeningAtasNama: getVal(row, ['Rekening Atas Nama', 'Atas Nama']),
      karpeg: getVal(row, ['Karpeg']),
      karisKarsu: getVal(row, ['Karis/Karsu', 'Karis Karsu']),
      lintang: getVal(row, ['Lintang']),
      bujur: getVal(row, ['Bujur']),
      nuks: getVal(row, ['NUKS']),
      isActive: true,
      isCertified: false,
      maxHoursPerWeek: 24,
    });
  }

  return { payloads, skipped };
};

const generatePagination = (current: number, total: number): (number | string)[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
};

// ==========================================
// SUB-COMPONENT
// ==========================================
interface SortableHeaderProps {
  columnKey: string;
  label: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
  className?: string;
}

function SortableHeader({ columnKey, label, sortConfig, onSort, className }: SortableHeaderProps) {
  const direction = sortConfig?.key === columnKey ? sortConfig.direction : null;
  return (
    <th
      className={cn('px-4 py-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors select-none', className)}
      onClick={() => onSort(columnKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {direction === 'asc' ? <ArrowUp size={14} className="text-emerald-600" />
          : direction === 'desc' ? <ArrowDown size={14} className="text-emerald-600" />
            : <ArrowUpDown size={14} className="opacity-40" />}
      </div>
    </th>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export function TeacherListPage() {
  const { locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tr = (id: string, en: string) => (locale === 'id' ? id : en);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreparingDeleteAll, setIsPreparingDeleteAll] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });

  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  // --- QUERIES ---
  const { data: teachersResponse, isLoading, isError } = useQuery({
    queryKey: ['teachers', currentPage, PAGE_SIZE, searchQuery, sortConfig],
    queryFn: () => teacherService.list({
      page: currentPage,
      limit: PAGE_SIZE,
      search: searchQuery,
      sortBy: sortConfig?.key,
      sortOrder: sortConfig?.direction
    }),
  });

  const teachers = teachersResponse?.data?.data || [];
  const meta = teachersResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;
  const totalData = meta?.total || 0;

  // Kalau halaman aktif sudah tidak ada (misal setelah hapus), mundur ke halaman terakhir
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // --- MUTATIONS ---
  const closeDeleteModal = () => setDeleteModal({ isOpen: false, type: 'single' });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teacherService.delete(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSelectedRows(prev => prev.filter(r => r !== id));
      toast.success(tr('Data berhasil dihapus.', 'Data successfully deleted.'));
      closeDeleteModal();
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const deleteBulkMutation = useMutation({
    mutationFn: (ids: string[]) => teacherService.deleteBulk(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSelectedRows([]);
      toast.success(tr('Data berhasil dihapus.', 'Data successfully deleted.'));
      closeDeleteModal();
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // Error import ditangani di handleFileUpload supaya tidak muncul dua toast sekaligus
  const importMutation = useMutation({
    mutationFn: (payloads: TeacherImportPayload[]) => teacherService.importBulk(payloads),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  const isDeleteBusy = deleteMutation.isPending || deleteBulkMutation.isPending || isPreparingDeleteAll;

  // --- HANDLERS ---
  const handleSort = (key: string) => {
    const direction: 'asc' | 'desc' = sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const toggleRow = (id: string) =>
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedRows(selectedRows.length === teachers.length && teachers.length > 0 ? [] : teachers.map(t => t.id));

  const handlePageSubmit = () => {
    let p = parseInt(pageInputValue, 10);
    if (isNaN(p) || p < 1) p = 1;
    if (p > totalPages && totalPages > 0) p = totalPages;
    setCurrentPage(p);
    setPageInputValue(p.toString());
  };

  const handleDeleteAll = async () => {
    setIsPreparingDeleteAll(true);
    try {
      const res = await teacherService.exportAll();
      const allIds = (res.data as TeacherExport[]).map(t => t.id);
      if (allIds.length === 0) {
        toast.info(tr('Tidak ada data untuk dihapus.', 'No data to delete.'));
        closeDeleteModal();
        return;
      }
      deleteBulkMutation.mutate(allIds);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsPreparingDeleteAll(false);
    }
  };

  const confirmDelete = () => {
    if (deleteModal.type === 'single' && deleteModal.id) deleteMutation.mutate(deleteModal.id);
    else if (deleteModal.type === 'bulk') deleteBulkMutation.mutate(selectedRows);
    else if (deleteModal.type === 'all') handleDeleteAll();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!school?.id) {
      toast.error(tr('Data sekolah belum termuat.', 'School data is not loaded yet.'));
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    const toastId = toast.loading(tr('Memproses Excel Dapodik...', 'Processing Excel file...'));

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // Cari baris header otomatis (baris yang memuat kolom "Nama"), baru baca datanya
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false });
      let headerRow = matrix.slice(0, 20).findIndex(r =>
        Array.isArray(r) && r.some(c => ['nama', 'nama lengkap'].includes(normKey(String(c ?? ''))))
      );
      if (headerRow === -1) headerRow = FALLBACK_HEADER_ROW;

      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { range: headerRow, raw: false });

      if (jsonData.length === 0) {
        throw new Error(tr(
          'File Excel kosong/format salah. Pastikan header berada di baris yang benar.',
          'Empty/Invalid file. Ensure headers are on the correct row.'
        ));
      }

      const { payloads, skipped } = parseTeacherExcel(jsonData, school.id);

      if (payloads.length === 0) {
        throw new Error(tr(
          'Tidak ada baris dengan kolom Nama yang terisi. Periksa format file.',
          'No rows with a filled Name column. Please check the file format.'
        ));
      }

      await importMutation.mutateAsync(payloads);

      toast.success(tr(`Tersimpan ${payloads.length} data.`, `Saved ${payloads.length} entries.`), {
        id: toastId,
        description: skipped > 0
          ? tr(`${skipped} baris tanpa nama dilewati.`, `${skipped} rows without a name were skipped.`)
          : undefined,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Upload Failed';
      toast.error(tr(`Gagal: ${msg}`, `Failed: ${msg}`), { id: toastId });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    const toastId = toast.loading(tr('Menyiapkan file Excel...', 'Preparing Excel file...'));

    try {
      const response = await teacherService.exportAll();
      let dataToExport = response.data as TeacherExport[];
      if (!dataToExport || dataToExport.length === 0) {
        throw new Error(tr('Tidak ada data untuk diekspor', 'No data to export'));
      }

      if (selectedRows.length > 0) {
        dataToExport = dataToExport.filter(t => selectedRows.includes(t.id));
      }

      const exportData = dataToExport.map((t, index) => ({
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
      toast.success(tr('Data berhasil diekspor!', 'Data successfully exported!'), { id: toastId });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Export failed', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // --- TEKS MODAL ---
  const modalTitle =
    deleteModal.type === 'bulk' ? tr('Hapus Massal?', 'Bulk Delete?')
      : deleteModal.type === 'all' ? tr('Kosongkan Semua Data?', 'Empty All Data?')
        : tr('Hapus Data?', 'Delete Data?');

  const modalDesc =
    deleteModal.type === 'bulk'
      ? tr(
        `Sebanyak ${selectedRows.length} data guru akan dihapus dari sistem. Aksi ini bersifat permanen dan tidak dapat dibatalkan.`,
        `${selectedRows.length} teacher records will be removed from the system. This action is permanent and cannot be undone.`
      )
      : deleteModal.type === 'all'
        ? tr(
          'PERHATIAN: Anda akan menghapus SELURUH data guru dari sistem. Aksi ini bersifat permanen dan tidak dapat dibatalkan.',
          'WARNING: You are about to delete ALL teacher records from the system. This action is permanent and cannot be undone.'
        )
        : tr(
          'Data guru ini akan dihapus dari sistem secara permanen. Anda tidak dapat mengurungkan aksi ini.',
          'This teacher record will be permanently deleted from the system. You cannot undo this action.'
        );

  return (
    <div className="space-y-6 relative">
      {/* --- HEADER --- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tr('Data Guru & Pegawai', 'Teachers & Staff Data')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total {totalData} {tr('guru & pegawai terdaftar', 'registered staff')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeleteModal({ isOpen: true, type: 'all' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">{tr('Kosongkan Data', 'Clear All')}</span>
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">{tr('Ekspor', 'Export')}</span>
          </button>

          <Link to="/teachers/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus size={16} />
            <span>{tr('Tambah Data', 'Add New')}</span>
          </Link>
        </div>
      </div>

      {/* --- TOOLBAR + TABLE --- */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tr('Cari nama atau NIP...', 'Search by name or NIP...')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {selectedRows.length > 0 && (
              <div className="flex items-center gap-2 mr-1 sm:mr-2 animate-in fade-in zoom-in duration-200">
                <span className="hidden sm:inline-block text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 whitespace-nowrap">
                  {selectedRows.length} {tr('Terpilih', 'Selected')}
                </span>
                <span className="sm:hidden text-sm font-bold text-emerald-600">({selectedRows.length})</span>
                <button
                  onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                >
                  <Trash2 size={16} />
                  <span className="hidden sm:inline">{tr('Hapus', 'Delete')}</span>
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
              {isImporting ? '...' : tr('Impor', 'Import')}
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
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground w-12 text-center">No</th>

                <SortableHeader columnKey="fullName" label={tr('Nama Lengkap', 'Full Name')} sortConfig={sortConfig} onSort={handleSort} className="min-w-50" />
                <SortableHeader columnKey="nip" label="NIP/NUPTK" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader columnKey="position" label={tr('Jabatan', 'Position')} sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />

                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">{tr('Sertifikasi', 'Certification')}</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">{tr('Aksi', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" />{tr('Memuat data...', 'Loading data...')}</td></tr>
              ) : isError ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-red-500">{tr('Gagal memuat data.', 'Failed to load data.')}</td></tr>
              ) : teachers.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{tr('Tidak ada data guru.', 'No teacher data found.')}</td></tr>
              ) : (
                teachers.map((teacher, idx) => {
                  const statusConf = STATUS_CONFIG[teacher.status || 'HONORER'];
                  return (
                    <motion.tr
                      key={teacher.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn('hover:bg-muted/50 transition-colors group cursor-pointer', selectedRows.includes(teacher.id) && 'bg-emerald-500/5')}
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
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-medium text-xs shrink-0">
                            {teacher.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground line-clamp-1">{teacher.fullName}</p>
                            <p className="text-xs text-muted-foreground">{teacher.gender === 'L' ? tr('Laki-laki', 'Male') : tr('Perempuan', 'Female')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{teacher.nip || '-'}</p>
                        <p className="text-xs text-muted-foreground">{teacher.nuptk || tr('Tanpa NUPTK', 'No NUPTK')}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{teacher.position || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap', statusConf?.color || 'bg-secondary text-secondary-foreground')}>
                          {statusConf?.label || teacher.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full', teacher.isCertified ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                          {teacher.isCertified ? tr('Sudah', 'Certified') : tr('Belum', 'Uncertified')}
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

        {/* --- PAGINATION --- */}
        {totalPages > 0 && (
          <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm bg-background rounded-b-xl">
            <div className="text-muted-foreground whitespace-nowrap text-center sm:text-left">
              {tr('Menampilkan', 'Showing')} {teachers.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0} - {Math.min(currentPage * PAGE_SIZE, totalData)} {tr('dari', 'of')} {totalData} {tr('data', 'entries')}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0 overflow-x-auto max-w-full py-1">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground whitespace-nowrap">{tr('Lompat ke:', 'Jump to:')}</span>
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
                <button title={tr('Pertama', 'First')} onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronsLeft size={16} /></button>
                <button title={tr('Sebelumnya', 'Previous')} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronLeft size={16} /></button>

                {generatePagination(currentPage, totalPages).map((p, i) => (
                  <button
                    key={i}
                    disabled={p === '...' || isLoading}
                    onClick={() => typeof p === 'number' && setCurrentPage(p)}
                    className={cn(
                      'min-w-9 h-9 px-2 flex items-center justify-center rounded-md font-medium text-sm transition-colors shadow-sm',
                      p === '...' ? 'cursor-default text-muted-foreground border-transparent shadow-none'
                        : p === currentPage ? 'bg-emerald-600 text-white border-transparent'
                          : 'border border-border hover:bg-muted text-foreground'
                    )}
                  >
                    {p}
                  </button>
                ))}

                <button title={tr('Selanjutnya', 'Next')} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronRight size={16} /></button>
                <button title={tr('Terakhir', 'Last')} onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || isLoading} className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"><ChevronsRight size={16} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => !isDeleteBusy && closeDeleteModal()} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative bg-background border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 overflow-hidden z-10">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 ring-4 ring-red-50"><AlertTriangle size={28} /></div>
                <h3 className="text-xl font-bold text-foreground">{modalTitle}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{modalDesc}</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={closeDeleteModal} disabled={isDeleteBusy} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50">
                  {tr('Batal', 'Cancel')}
                </button>
                <button onClick={confirmDelete} disabled={isDeleteBusy} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {isDeleteBusy ? (<><Loader2 className="w-4 h-4 animate-spin" /> {tr('Memproses', 'Processing')}</>) : tr('Ya, Hapus', 'Yes, Delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
