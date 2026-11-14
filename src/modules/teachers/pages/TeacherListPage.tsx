import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2, Loader2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  X, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown,
  FileSpreadsheet, CheckCircle2, RefreshCw, Sparkles, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { teacherService } from '../services/teacher.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
  TeacherDetail,
  TeacherBulkImportItem,
  TeacherDiffAction,
} from '../types/teacher.types';

// ==========================================
// TYPES & CONSTANTS
// ==========================================
type ExcelRow = Record<string, unknown>;
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DeleteModalState = { isOpen: boolean; type: 'single' | 'bulk' | 'all'; id?: string };
type DiffFilterTab = 'all' | 'new' | 'updated' | 'unchanged';

const PAGE_SIZE = 10;
const FALLBACK_HEADER_ROW = 4;

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PNS: {
    label: 'PNS',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  CPNS: {
    label: 'CPNS',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  PPPK: {
    label: 'PPPK',
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  },
  HONORER: {
    label: 'Honorer',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  GTY: {
    label: 'GTY',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
  GTT: {
    label: 'GTT',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  },
};

const DIFF_FIELD_LABELS: Record<keyof TeacherBulkImportItem, string> = {
  schoolId: 'Sekolah',
  fullName: 'Nama Lengkap',
  gender: 'JK',
  nip: 'NIP',
  nuptk: 'NUPTK',
  nik: 'NIK',
  noKk: 'No KK',
  birthPlace: 'Tempat Lahir',
  birthDate: 'Tgl Lahir',
  religion: 'Agama',
  address: 'Alamat',
  dusun: 'Dusun',
  rt: 'RT',
  rw: 'RW',
  kelurahan: 'Kelurahan',
  kecamatan: 'Kecamatan',
  city: 'Kab/Kota',
  province: 'Provinsi',
  postalCode: 'Kode Pos',
  telepon: 'Telepon',
  phone: 'No HP',
  email: 'Email',
  status: 'Status',
  position: 'Jabatan',
  joinDate: 'Tgl Masuk',
  tugasTambahan: 'Tugas Tambahan',
  skCpns: 'SK CPNS',
  tanggalCpns: 'Tgl CPNS',
  skPengangkatan: 'SK Pengangkatan',
  tmtPengangkatan: 'TMT Pengangkatan',
  lembagaPengangkatan: 'Lembaga Pengangkatan',
  pangkatGolongan: 'Pangkat/Gol',
  sumberGaji: 'Sumber Gaji',
  tmtPns: 'TMT PNS',
  karpeg: 'Karpeg',
  namaIbuKandung: 'Ibu Kandung',
  statusPerkawinan: 'Perkawinan',
  namaSuamiIstri: 'Suami/Istri',
  nipSuamiIstri: 'NIP Suami/Istri',
  pekerjaanSuamiIstri: 'Pekerjaan Pasangan',
  karisKarsu: 'Karis/Karsu',
  kewarganegaraan: 'Kewarganegaraan',
  npwp: 'NPWP',
  namaWajibPajak: 'Nama Wajib Pajak',
  bank: 'Bank',
  nomorRekeningBank: 'No Rekening',
  rekeningAtasNama: 'Rekening a.n.',
  lintang: 'Lintang',
  bujur: 'Bujur',
  nuks: 'NUKS',
  sudahLisensiKepalaSekolah: 'Lisensi Kepsek',
  pernahDiklatKepengawasan: 'Diklat Pengawas',
  keahlianBraille: 'Braille',
  keahlianBahasaIsyarat: 'Bahasa Isyarat',
  id: 'ID',
  diffAction: 'Aksi',
  diffFields: 'Perubahan',
  photoUrl: 'Foto',
  education: 'Pendidikan',
  major: 'Jurusan',
  university: 'Universitas',
  isCertified: 'Sertifikasi',
  certificationNumber: 'No Sertifikasi',
  isActive: 'Aktif',
  baseSalary: 'Gaji Pokok',
  subjects: 'Mapel',
  maxHoursPerWeek: 'Jam Mengajar',
};

// ==========================================
// PURE EXCEL PARSING & SMARTDIFF HELPERS
// ==========================================
const normKey = (k: string): string => k.toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeRow = (row: ExcelRow): ExcelRow => {
  const out: ExcelRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[normKey(k)] = v;
  }
  return out;
};

const getVal = (row: ExcelRow, keys: string[]): string | null => {
  for (const key of keys) {
    const v = row[normKey(key)];
    if (v !== undefined && v !== null) {
      const cleaned = String(v).replace(/\s+/g, ' ').trim();
      if (cleaned !== '' && cleaned !== '(tidak diisi)' && cleaned.toLowerCase() !== 'null') {
        return cleaned;
      }
    }
  }
  return null;
};

const parseBoolDapodik = (val: string | null): boolean => {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === 'ya' || v === 'yes' || v === 'true' || v === '1' || v === 'sudah';
};

const normalizeReligionDapodik = (val: string | null): string | null => {
  if (!val) return null;
  const u = val.toUpperCase();
  if (u === 'KATHOLIK') return 'KATOLIK';
  if (u === 'BUDHA') return 'BUDDHA';
  return u;
};

const mapStatusKepegawaian = (status: string | null): string => {
  if (!status) return 'HONORER';
  const s = status.toUpperCase();
  if (s.includes('CPNS')) return 'CPNS';
  if (s.includes('PNS')) return 'PNS';
  if (s.includes('PPPK') || s.includes('P3K')) return 'PPPK';
  if (s.includes('GTY') || s.includes('YAYASAN')) return 'GTY';
  if (s.includes('GTT')) return 'GTT';
  return 'HONORER';
};

const serialToIso = (serial: number): string =>
  new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().split('T')[0];

const parseExcelDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return serialToIso(value);

  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{5}(\.\d+)?$/.test(str)) return serialToIso(Number(str));
  if (str.includes('T')) return str.split('T')[0];

  const parts = str.split(/[-/.]/);
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) return null;

  let y: string;
  let m: string;
  let d: string;

  if (parts[0].length === 4) {
    [y, m, d] = parts;
  } else if (parts[2].length === 4) {
    [d, m, y] = parts;
  } else if (parts[2].length === 2) {
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
  const payloads: TeacherBulkImportItem[] = [];
  let skipped = 0;

  for (const rawRow of jsonData) {
    const row = normalizeRow(rawRow);
    const fullName = getVal(row, ['Nama', 'Nama Lengkap']);

    if (!fullName) {
      skipped++;
      continue;
    }

    const rawTelepon = getVal(row, ['Telepon', 'Telp Rumah']);
    const telepon = rawTelepon === '0' ? null : rawTelepon;
    const rawCountry = getVal(row, ['Kewarganegaraan']);
    const kewarganegaraan =
      !rawCountry || rawCountry.toUpperCase() === 'ID' ? 'Indonesia' : rawCountry;
    const tmtPengangkatan = parseExcelDate(getVal(row, ['TMT Pengangkatan']));

    payloads.push({
      schoolId,
      fullName,
      gender: (getVal(row, ['JK', 'Jenis Kelamin', 'L/P']) || '')
        .toUpperCase()
        .startsWith('P')
        ? 'P'
        : 'L',
      nip: getVal(row, ['NIP']),
      nuptk: getVal(row, ['NUPTK']),
      nik: getVal(row, ['NIK', 'No NIK', 'Nomor Induk Kependudukan']),
      noKk: getVal(row, ['No KK', 'Nomor KK', 'KK']),
      birthPlace: getVal(row, ['Tempat Lahir']),
      birthDate: parseExcelDate(getVal(row, ['Tanggal Lahir'])),
      religion: normalizeReligionDapodik(getVal(row, ['Agama', 'Agama / Kepercayaan'])),
      address: getVal(row, ['Alamat Jalan', 'Alamat']),
      dusun: getVal(row, ['Nama Dusun', 'Dusun']),
      rt: getVal(row, ['RT']),
      rw: getVal(row, ['RW']),
      kelurahan: getVal(row, ['Desa/Kelurahan', 'Kelurahan', 'Desa']),
      kecamatan: getVal(row, ['Kecamatan']),
      city: getVal(row, ['Kabupaten/Kota', 'Kota', 'Kabupaten']),
      province: getVal(row, ['Provinsi']),
      postalCode: getVal(row, ['Kode Pos']),
      telepon,
      phone: getVal(row, ['HP', 'No HP', 'Nomor HP']),
      email: getVal(row, ['Email', 'E-mail']),
      status: mapStatusKepegawaian(getVal(row, ['Status Kepegawaian'])),
      position: getVal(row, ['Jenis PTK', 'Jabatan']) || 'Guru',
      joinDate: parseExcelDate(getVal(row, ['TMT Kerja', 'Tanggal Bergabung'])) || tmtPengangkatan,
      tugasTambahan: getVal(row, ['Tugas Tambahan']),
      skCpns: getVal(row, ['SK CPNS']),
      tanggalCpns: parseExcelDate(getVal(row, ['Tanggal CPNS'])),
      skPengangkatan: getVal(row, ['SK Pengangkatan']),
      tmtPengangkatan,
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
      kewarganegaraan,
      bank: getVal(row, ['Bank', 'Nama Bank']),
      nomorRekeningBank: getVal(row, ['Nomor Rekening Bank', 'No Rekening', 'Rekening Bank']),
      rekeningAtasNama: getVal(row, ['Rekening Atas Nama', 'Atas Nama']),
      karpeg: getVal(row, ['Karpeg']),
      karisKarsu: getVal(row, ['Karis/Karsu', 'Karis Karsu']),
      lintang: getVal(row, ['Lintang']),
      bujur: getVal(row, ['Bujur']),
      nuks: getVal(row, ['NUKS']),
      sudahLisensiKepalaSekolah: parseBoolDapodik(
        getVal(row, ['Sudah Lisensi Kepala Sekolah'])
      ),
      pernahDiklatKepengawasan: parseBoolDapodik(
        getVal(row, ['Pernah Diklat Kepengawasan'])
      ),
      keahlianBraille: parseBoolDapodik(getVal(row, ['Keahlian Braille'])),
      keahlianBahasaIsyarat: parseBoolDapodik(getVal(row, ['Keahlian Bahasa Isyarat'])),
    });
  }

  return { payloads, skipped };
};

const normCompare = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val).replace(/\s+/g, ' ').trim();
};

const computeSmartDiff = (
  incoming: TeacherBulkImportItem[],
  existingList: TeacherDetail[]
): TeacherBulkImportItem[] => {
  const byNip = new Map<string, TeacherDetail>();
  const byNuptk = new Map<string, TeacherDetail>();
  const byNik = new Map<string, TeacherDetail>();
  const byNameBirth = new Map<string, TeacherDetail>();

  for (const t of existingList) {
    if (t.nip) byNip.set(t.nip.trim(), t);
    if (t.nuptk) byNuptk.set(t.nuptk.trim(), t);
    if (t.nik) byNik.set(t.nik.trim(), t);
    if (t.fullName && t.birthDate) {
      byNameBirth.set(
        `${t.fullName.trim().toLowerCase()}|${String(t.birthDate).split('T')[0]}`,
        t
      );
    }
  }

  const comparedKeys: (keyof TeacherBulkImportItem)[] = [
    'fullName',
    'gender',
    'nip',
    'nuptk',
    'nik',
    'noKk',
    'birthPlace',
    'birthDate',
    'religion',
    'address',
    'dusun',
    'rt',
    'rw',
    'kelurahan',
    'kecamatan',
    'postalCode',
    'telepon',
    'phone',
    'email',
    'status',
    'position',
    'tugasTambahan',
    'skCpns',
    'tanggalCpns',
    'skPengangkatan',
    'tmtPengangkatan',
    'lembagaPengangkatan',
    'pangkatGolongan',
    'sumberGaji',
    'tmtPns',
    'karpeg',
    'namaIbuKandung',
    'statusPerkawinan',
    'namaSuamiIstri',
    'nipSuamiIstri',
    'pekerjaanSuamiIstri',
    'karisKarsu',
    'kewarganegaraan',
    'npwp',
    'namaWajibPajak',
    'bank',
    'nomorRekeningBank',
    'rekeningAtasNama',
    'lintang',
    'bujur',
    'nuks',
    'sudahLisensiKepalaSekolah',
    'pernahDiklatKepengawasan',
    'keahlianBraille',
    'keahlianBahasaIsyarat',
  ];

  return incoming.map((item) => {
    const matched =
      (item.nip ? byNip.get(item.nip) : undefined) ||
      (item.nuptk ? byNuptk.get(item.nuptk) : undefined) ||
      (item.nik ? byNik.get(item.nik) : undefined) ||
      (item.fullName && item.birthDate
        ? byNameBirth.get(`${item.fullName.toLowerCase()}|${item.birthDate}`)
        : undefined);

    if (!matched) {
      return {
        ...item,
        diffAction: 'new' as TeacherDiffAction,
        diffFields: [],
      };
    }

    const changedLabels: string[] = [];
    for (const key of comparedKeys) {
      const nextVal = item[key];
      const prevVal = matched[key as keyof TeacherDetail];

      // RPC menggunakan COALESCE untuk sebagian besar kolom opsional: jika Excel kosong, nilai lama dipertahankan
      if (key !== 'tugasTambahan' && (nextVal === null || nextVal === undefined || nextVal === '')) {
        continue;
      }

      const normNext =
        key === 'birthDate' || key === 'tanggalCpns' || key === 'tmtPengangkatan' || key === 'tmtPns'
          ? normCompare(nextVal).split('T')[0]
          : normCompare(nextVal);
      const normPrev =
        key === 'birthDate' || key === 'tanggalCpns' || key === 'tmtPengangkatan' || key === 'tmtPns'
          ? normCompare(prevVal).split('T')[0]
          : normCompare(prevVal);

      if (normNext !== normPrev) {
        changedLabels.push(DIFF_FIELD_LABELS[key] || String(key));
      }
    }

    return {
      ...item,
      id: matched.id,
      diffAction: (changedLabels.length > 0 ? 'updated' : 'unchanged') as TeacherDiffAction,
      diffFields: changedLabels,
    };
  });
};

const generatePagination = (current: number, total: number): (number | string)[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
};

// ==========================================
// SUB-COMPONENT: SORTABLE TABLE HEADER
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
      className={cn(
        'px-4 py-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors select-none',
        className
      )}
      onClick={() => onSort(columnKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {direction === 'asc' ? (
          <ArrowUp size={14} className="text-emerald-600" />
        ) : direction === 'desc' ? (
          <ArrowDown size={14} className="text-emerald-600" />
        ) : (
          <ArrowUpDown size={14} className="opacity-40" />
        )}
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
  const { school, user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tr = (id: string, en: string) => (locale === 'id' ? id : en);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Filter, Pagination, Selection & Sort State
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [certifiedFilter, setCertifiedFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  // Export & Delete Modal State
  const [isExporting, setIsExporting] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });

  // SmartDiff Import Wizard State
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreviewRows, setImportPreviewRows] = useState<TeacherBulkImportItem[]>([]);
  const [importSkippedCount, setImportSkippedCount] = useState(0);
  const [diffFilterTab, setDiffFilterTab] = useState<DiffFilterTab>('all');

  // Debounce pencarian agar tidak spam request database
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  const parsedCertifiedFilter =
    certifiedFilter === 'all' ? undefined : certifiedFilter === 'true';

  // --- QUERIES ---
  const { data: teachersResponse, isLoading, isError } = useQuery({
    queryKey: [
      'teachers',
      school?.id,
      currentPage,
      PAGE_SIZE,
      searchQuery,
      statusFilter,
      certifiedFilter,
      sortConfig,
    ],
    queryFn: () =>
      teacherService.list({
        schoolId: school?.id,
        page: currentPage,
        limit: PAGE_SIZE,
        search: searchQuery,
        status: statusFilter,
        isCertified: parsedCertifiedFilter,
        sortBy: sortConfig?.key,
        sortOrder: sortConfig?.direction,
      }),
    enabled: Boolean(school?.id),
  });

  const teachers = teachersResponse?.data?.data || [];
  const meta = teachersResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;
  const totalData = meta?.total || 0;

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // --- MUTATIONS ---
  const closeDeleteModal = () => setDeleteModal({ isOpen: false, type: 'single' });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teacherService.delete(id, school?.id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows((prev) => prev.filter((r) => r !== id));
      toast.success(tr('Data guru berhasil dihapus.', 'Teacher record deleted.'));
      closeDeleteModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteManyMutation = useMutation({
    mutationFn: (ids: string[]) => teacherService.deleteMany(ids, school?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      toast.success(tr('Data guru terpilih berhasil dihapus.', 'Selected teachers deleted.'));
      closeDeleteModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => {
      if (!school?.id) throw new Error('School ID tidak ditemukan.');
      return teacherService.deleteAll(school.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      toast.success(tr('Seluruh data guru berhasil dikosongkan.', 'All teacher records cleared.'));
      closeDeleteModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (payloads: TeacherBulkImportItem[]) => teacherService.bulkImport(payloads),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success(res.message);
      setImportModalOpen(false);
      setImportPreviewRows([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isDeleteBusy =
    deleteMutation.isPending || deleteManyMutation.isPending || deleteAllMutation.isPending;

  // --- HANDLERS ---
  const handleSort = (key: string) => {
    const direction: 'asc' | 'desc' =
      sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const toggleRow = (id: string) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );

  const toggleAll = () =>
    setSelectedRows(
      selectedRows.length === teachers.length && teachers.length > 0
        ? []
        : teachers.map((t) => t.id)
    );

  const handlePageSubmit = () => {
    let p = parseInt(pageInputValue, 10);
    if (Number.isNaN(p) || p < 1) p = 1;
    if (p > totalPages && totalPages > 0) p = totalPages;
    setCurrentPage(p);
    setPageInputValue(p.toString());
  };

  const confirmDelete = () => {
    if (deleteModal.type === 'single' && deleteModal.id) {
      deleteMutation.mutate(deleteModal.id);
    } else if (deleteModal.type === 'bulk') {
      deleteManyMutation.mutate(selectedRows);
    } else if (deleteModal.type === 'all') {
      if (!isSuperAdmin) {
        toast.error(tr('Hanya Super Admin yang dapat mengosongkan data.', 'Only Super Admin can clear all data.'));
        closeDeleteModal();
        return;
      }
      deleteAllMutation.mutate();
    }
  };

  // --- SMARTDIFF EXCEL PARSER & WIZARD ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!school?.id) {
      toast.error(tr('Data sekolah belum termuat.', 'School data is not loaded yet.'));
      e.target.value = '';
      return;
    }

    setIsParsingExcel(true);
    const toastId = toast.loading(tr('Menganalisis file Excel Dapodik PTK...', 'Analyzing Dapodik PTK Excel...'));

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { raw: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false });
      let headerRow = matrix.slice(0, 20).findIndex(
        (r) =>
          Array.isArray(r) &&
          r.some((c) => ['nama', 'nama lengkap'].includes(normKey(String(c ?? ''))))
      );
      if (headerRow === -1) headerRow = FALLBACK_HEADER_ROW;

      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
        range: headerRow,
        raw: false,
        defval: '',
      });

      if (jsonData.length === 0) {
        throw new Error(
          tr(
            'File Excel kosong atau format header tidak dikenali.',
            'Empty Excel file or unrecognized header format.'
          )
        );
      }

      const { payloads, skipped } = parseTeacherExcel(jsonData, school.id);
      if (payloads.length === 0) {
        throw new Error(
          tr(
            'Tidak ada baris data guru yang valid (kolom Nama kosong).',
            'No valid teacher rows found (Name column is empty).'
          )
        );
      }

      const existingRes = await teacherService.exportAll(school.id);
      const diffedRows = computeSmartDiff(payloads, existingRes.data || []);

      setImportFileName(file.name);
      setImportPreviewRows(diffedRows);
      setImportSkippedCount(skipped);
      setDiffFilterTab('all');
      setImportModalOpen(true);

      toast.dismiss(toastId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Gagal membaca file Excel';
      toast.error(msg, { id: toastId });
    } finally {
      setIsParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const diffStats = useMemo(() => {
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    for (const r of importPreviewRows) {
      if (r.diffAction === 'new') newCount++;
      else if (r.diffAction === 'updated') updatedCount++;
      else unchangedCount++;
    }
    return { newCount, updatedCount, unchangedCount };
  }, [importPreviewRows]);

  const filteredPreviewRows = useMemo(() => {
    if (diffFilterTab === 'all') return importPreviewRows;
    return importPreviewRows.filter((r) => r.diffAction === diffFilterTab);
  }, [importPreviewRows, diffFilterTab]);

  const actionableImportRows = useMemo(
    () => importPreviewRows.filter((r) => r.diffAction !== 'unchanged'),
    [importPreviewRows]
  );

  const handleConfirmSmartImport = () => {
    const rowsToSend =
      actionableImportRows.length > 0 ? actionableImportRows : importPreviewRows;
    bulkImportMutation.mutate(rowsToSend);
  };

  // --- EXPORT EXCEL ---
  const handleExport = async () => {
    if (!school?.id) return;
    setIsExporting(true);
    const toastId = toast.loading(tr('Menyiapkan file Excel...', 'Preparing Excel file...'));

    try {
      const response = await teacherService.exportAll(school.id);
      let dataToExport = response.data || [];
      if (dataToExport.length === 0) {
        throw new Error(tr('Tidak ada data untuk diekspor', 'No data to export'));
      }

      if (selectedRows.length > 0) {
        dataToExport = dataToExport.filter((t) => selectedRows.includes(t.id));
      }

      const exportData = dataToExport.map((t, index) => ({
        No: index + 1,
        'Nama Lengkap': t.fullName,
        JK: t.gender,
        NIP: t.nip || '-',
        NUPTK: t.nuptk || '-',
        NIK: t.nik || '-',
        'Tempat Lahir': t.birthPlace || '-',
        'Tanggal Lahir': t.birthDate ? String(t.birthDate).split('T')[0] : '-',
        Agama: t.religion || '-',
        'Status Kepegawaian': t.status || '-',
        'Jenis PTK (Jabatan)': t.position || '-',
        'Tugas Tambahan': t.tugasTambahan || '-',
        'Pangkat/Golongan': t.pangkatGolongan || '-',
        Sertifikasi: t.isCertified ? 'Sudah' : 'Belum',
        Alamat: t.address || '-',
        'Desa/Kelurahan': t.kelurahan || '-',
        Kecamatan: t.kecamatan || '-',
        'No HP': t.phone || '-',
        Email: t.email || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      ws['!cols'] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 5 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
        { wch: 14 },
        { wch: 12 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 26 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName =
        selectedRows.length > 0
          ? `Data_Guru_Terpilih_${dateStr}.xlsx`
          : `Data_Guru_Pegawai_${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
      toast.success(tr('Data berhasil diekspor!', 'Data successfully exported!'), { id: toastId });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Export failed', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // --- TEKS MODAL KONFIRMASI HAPUS ---
  const modalTitle =
    deleteModal.type === 'bulk'
      ? tr('Hapus Massal?', 'Bulk Delete?')
      : deleteModal.type === 'all'
        ? tr('Kosongkan Semua Data?', 'Empty All Data?')
        : tr('Hapus Data?', 'Delete Data?');

  const modalDesc =
    deleteModal.type === 'bulk'
      ? tr(
        `Sebanyak ${selectedRows.length} data guru akan dihapus dari sistem. Aksi ini bersifat permanen dan tidak dapat dibatalkan.`,
        `${selectedRows.length} teacher records will be removed from the system. This action is permanent and cannot be undone.`
      )
      : deleteModal.type === 'all'
        ? tr(
          'PERHATIAN: Anda akan menghapus SELURUH data guru dari sekolah ini. Aksi ini bersifat permanen dan tidak dapat dibatalkan.',
          'WARNING: You are about to delete ALL teacher records from this school. This action is permanent and cannot be undone.'
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
          <h1 className="text-2xl font-bold text-foreground">
            {tr('Data Guru & Pegawai', 'Teachers & Staff Data')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total {totalData} {tr('guru & pegawai terdaftar', 'registered staff')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setDeleteModal({ isOpen: true, type: 'all' })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors shadow-sm"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">{tr('Kosongkan Data', 'Clear All')}</span>
            </button>
          )}

          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsingExcel || bulkImportMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
          >
            {isParsingExcel ? (
              <Loader2 size={16} className="animate-spin text-emerald-600" />
            ) : (
              <Upload size={16} />
            )}
            <span className="hidden sm:inline">
              {isParsingExcel ? tr('Membaca...', 'Reading...') : tr('Impor Dapodik', 'Import Dapodik')}
            </span>
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting || totalData === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">{tr('Ekspor', 'Export')}</span>
          </button>

          <Link
            to="/teachers/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            <span>{tr('Tambah Data', 'Add New')}</span>
          </Link>
        </div>
      </div>

      {/* --- TOOLBAR + TABLE --- */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-muted/20">
          {/* Kiri: Pencarian + Filter Status & Sertifikasi */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder={tr('Cari nama, NIP, NUPTK, NIK...', 'Search name, NIP, NUPTK, NIK...')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Filter
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Filter Status Kepegawaian"
                  className="w-full sm:w-auto pl-8 pr-7 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">{tr('Semua Status', 'All Status')}</option>
                  <option value="PNS">PNS</option>
                  <option value="CPNS">CPNS</option>
                  <option value="PPPK">PPPK</option>
                  <option value="HONORER">Honorer</option>
                  <option value="GTY">GTY</option>
                  <option value="GTT">GTT</option>
                </select>
              </div>

              <select
                value={certifiedFilter}
                onChange={(e) => {
                  setCertifiedFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter Status Sertifikasi"
                className="flex-1 sm:flex-initial px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{tr('Semua Sertifikasi', 'All Certification')}</option>
                <option value="true">{tr('Sudah Sertifikasi', 'Certified')}</option>
                <option value="false">{tr('Belum Sertifikasi', 'Uncertified')}</option>
              </select>
            </div>
          </div>

          {/* Kanan: Aksi Terpilih */}
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-2 justify-end animate-in fade-in zoom-in duration-200">
              <span className="hidden sm:inline-block text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 whitespace-nowrap">
                {selectedRows.length} {tr('Terpilih', 'Selected')}
              </span>
              <span className="sm:hidden text-sm font-bold text-emerald-600">
                ({selectedRows.length})
              </span>
              <button
                onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">{tr('Hapus', 'Delete')}</span>
              </button>
              <button
                onClick={() => setSelectedRows([])}
                className="p-1.5 text-muted-foreground hover:bg-muted rounded-md"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* --- DATA TABLE --- */}
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
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground w-12 text-center">
                  No
                </th>
                <SortableHeader
                  columnKey="fullName"
                  label={tr('Nama Lengkap', 'Full Name')}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="min-w-50"
                />
                <SortableHeader
                  columnKey="nip"
                  label="NIP / NUPTK"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <SortableHeader
                  columnKey="position"
                  label={tr('Jabatan', 'Position')}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <SortableHeader
                  columnKey="status"
                  label="Status"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-sm font-semibold text-muted-foreground">
                  {tr('Sertifikasi', 'Certification')}
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">
                  {tr('Aksi', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" />
                    {tr('Memuat data...', 'Loading data...')}
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-red-500">
                    {tr('Gagal memuat data guru.', 'Failed to load teacher data.')}
                  </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                    {tr('Tidak ada data guru.', 'No teacher data found.')}
                  </td>
                </tr>
              ) : (
                teachers.map((teacher, idx) => {
                  const statusConf = STATUS_CONFIG[teacher.status || 'HONORER'];
                  return (
                    <motion.tr
                      key={teacher.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'hover:bg-muted/50 transition-colors group cursor-pointer',
                        selectedRows.includes(teacher.id) && 'bg-emerald-500/5'
                      )}
                      onClick={() => toggleRow(teacher.id)}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(teacher.id)}
                          onChange={() => toggleRow(teacher.id)}
                          className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                        {(currentPage - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-xs shrink-0">
                            {teacher.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground line-clamp-1">
                              {teacher.fullName}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                {teacher.gender === 'L'
                                  ? tr('Laki-laki', 'Male')
                                  : tr('Perempuan', 'Female')}
                              </span>
                              {teacher.tugasTambahan && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium truncate max-w-44">
                                  {teacher.tugasTambahan}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{teacher.nip || '-'}</p>
                        <p className="text-xs text-muted-foreground">
                          {teacher.nuptk || tr('Tanpa NUPTK', 'No NUPTK')}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm">{teacher.position || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap',
                            statusConf?.color || 'bg-secondary text-secondary-foreground'
                          )}
                        >
                          {statusConf?.label || teacher.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-1 text-xs font-medium rounded-full',
                            teacher.isCertified
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground'
                          )}
                        >
                          {teacher.isCertified ? tr('Sudah', 'Certified') : tr('Belum', 'Uncertified')}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/teachers/${teacher.id}`}
                            title={tr('Lihat Detail', 'View Detail')}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/teachers/${teacher.id}/edit`}
                            title={tr('Edit Data', 'Edit Data')}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() =>
                              setDeleteModal({ isOpen: true, type: 'single', id: teacher.id })
                            }
                            title={tr('Hapus Data', 'Delete Data')}
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
              {tr('Menampilkan', 'Showing')}{' '}
              {teachers.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0} -{' '}
              {Math.min(currentPage * PAGE_SIZE, totalData)} {tr('dari', 'of')} {totalData}{' '}
              {tr('data', 'entries')}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0 overflow-x-auto max-w-full py-1">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground whitespace-nowrap">
                  {tr('Lompat ke:', 'Jump to:')}
                </span>
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

              <div className="w-px h-5 bg-border shrink-0 mx-0.5" />

              <div className="flex items-center gap-1 shrink-0">
                <button
                  title={tr('Pertama', 'First')}
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1 || isLoading}
                  className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  title={tr('Sebelumnya', 'Previous')}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronLeft size={16} />
                </button>

                {generatePagination(currentPage, totalPages).map((p, i) => (
                  <button
                    key={i}
                    disabled={p === '...' || isLoading}
                    onClick={() => typeof p === 'number' && setCurrentPage(p)}
                    className={cn(
                      'min-w-9 h-9 px-2 flex items-center justify-center rounded-md font-medium text-sm transition-colors shadow-sm',
                      p === '...'
                        ? 'cursor-default text-muted-foreground border-transparent shadow-none'
                        : p === currentPage
                          ? 'bg-emerald-600 text-white border-transparent'
                          : 'border border-border hover:bg-muted text-foreground'
                    )}
                  >
                    {p}
                  </button>
                ))}

                <button
                  title={tr('Selanjutnya', 'Next')}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || isLoading}
                  className="w-9 h-9 flex items-center justify-center border border-border rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-all shadow-sm"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  title={tr('Terakhir', 'Last')}
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

      {/* --- SMARTDIFF IMPORT WIZARD MODAL --- */}
      <AnimatePresence>
        {importModalOpen && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => !bulkImportMutation.isPending && setImportModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <span>SmartDiff Impor Dapodik PTK</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600">
                        <Sparkles size={12} /> 51 Kolom Dapodik
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{importFileName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setImportModalOpen(false)}
                  disabled={bulkImportMutation.isPending}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Ringkasan Statistik Diff */}
              <div className="p-5 border-b border-border bg-card space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => setDiffFilterTab('all')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      diffFilterTab === 'all'
                        ? 'border-foreground bg-muted/50 ring-1 ring-foreground/20'
                        : 'border-border hover:bg-muted/30'
                    )}
                  >
                    <div className="text-xs text-muted-foreground">Total Baris Valid</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">
                      {importPreviewRows.length}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiffFilterTab('new')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      diffFilterTab === 'new'
                        ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                        : 'border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10'
                    )}
                  >
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      Data Baru
                    </div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {diffStats.newCount}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiffFilterTab('updated')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      diffFilterTab === 'updated'
                        ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                        : 'border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10'
                    )}
                  >
                    <div className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                      Diperbarui (SmartDiff)
                    </div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                      {diffStats.updatedCount}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDiffFilterTab('unchanged')}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      diffFilterTab === 'unchanged'
                        ? 'border-border bg-muted ring-1 ring-border'
                        : 'border-border bg-muted/20 hover:bg-muted/40'
                    )}
                  >
                    <div className="text-xs text-muted-foreground">Data Sama</div>
                    <div className="text-xl font-bold text-muted-foreground mt-0.5">
                      {diffStats.unchangedCount}
                    </div>
                  </button>
                </div>

                {importSkippedCount > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    * {importSkippedCount} baris kosong/catatan kaki tanpa kolom Nama dilewati otomatis.
                  </p>
                )}
              </div>

              {/* Tabel Pratinjau SmartDiff */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-muted border-b border-border z-10">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground w-12">No</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground">Aksi</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground">Nama PTK</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground">NIP / NUPTK</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-muted-foreground">
                        Perubahan Terdeteksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPreviewRows.map((row, i) => (
                      <tr key={`${row.nik || row.nuptk || row.fullName}-${i}`} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {row.diffAction === 'new' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
                              <CheckCircle2 size={12} /> Baru
                            </span>
                          )}
                          {row.diffAction === 'updated' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
                              <RefreshCw size={12} /> Update
                            </span>
                          )}
                          {row.diffAction === 'unchanged' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                              Sama
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          <div>{row.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.gender === 'L' ? 'L' : 'P'} • {row.religion || '-'} • {row.kelurahan || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div className="font-medium text-foreground">{row.nip || '-'}</div>
                          <div className="text-muted-foreground">{row.nuptk || 'Tanpa NUPTK'}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 text-xs font-medium rounded border border-border bg-background">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.diffAction === 'new'
                            ? 'Akan ditambahkan sebagai PTK baru'
                            : row.diffFields && row.diffFields.length > 0
                              ? row.diffFields.join(', ')
                              : 'Tidak ada perubahan atribut'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {actionableImportRows.length > 0
                    ? `${actionableImportRows.length} data (Baru + Update) siap disinkronkan ke database.`
                    : 'Seluruh data sudah identik dengan database (tetap dapat disinkronkan ulang).'}
                </p>
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(false)}
                    disabled={bulkImportMutation.isPending}
                    className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {tr('Batal', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSmartImport}
                    disabled={bulkImportMutation.isPending || importPreviewRows.length === 0}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {bulkImportMutation.isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{tr('Menyimpan...', 'Importing...')}</span>
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        <span>
                          {tr(
                            `Sinkronkan (${actionableImportRows.length || importPreviewRows.length})`,
                            `Sync (${actionableImportRows.length || importPreviewRows.length})`
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- DELETE CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {deleteModal.isOpen && (deleteModal.type !== 'all' || isSuperAdmin) && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => !isDeleteBusy && closeDeleteModal()}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-background border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 overflow-hidden z-10"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 ring-4 ring-red-50">
                  <AlertTriangle size={28} />
                </div>
                <h3 className="text-xl font-bold text-foreground">{modalTitle}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{modalDesc}</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={closeDeleteModal}
                  disabled={isDeleteBusy}
                  className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleteBusy}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleteBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> {tr('Memproses', 'Processing')}
                    </>
                  ) : (
                    tr('Ya, Hapus', 'Yes, Delete')
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TeacherListPage;