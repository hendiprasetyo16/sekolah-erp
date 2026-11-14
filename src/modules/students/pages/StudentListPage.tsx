import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2,
  Loader2, AlertCircle, CheckCircle2, XCircle, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Filter, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Sparkles, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { useTranslation } from '@/hooks/useTranslation';
import { studentService } from '../services/student.service';
import type { StudentBulkImportItem, CreateStudentParentPayload } from '../types/student.types';
import { supabase } from '@/services/supabase.client';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/modules/auth/store/auth.store';

// ==========================================
// TYPES
// ==========================================
type ExcelRow = Record<string, string>;
type ClassRow = { id: string; name: string; gradeLevel: number };
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

interface ExistingParentSnapshot {
  relation: 'AYAH' | 'IBU' | 'WALI';
  fullName: string;
  nik: string | null;
  birthYear: string | null;
  education: string | null;
  occupation: string | null;
  monthlyIncome: string | null;
}

interface ExistingEconomicSnapshot {
  hasKip?: boolean | null;
  kipNumber?: string | null;
  namaKip?: string | null;
  layakPip?: boolean | null;
  alasanLayakPip?: string | null;
  hasKks?: boolean | null;
  kksNumber?: string | null;
  hasPkh?: boolean | null;
  isDtks?: boolean | null;
  desil?: number | null;
  isOrphan?: boolean | null;
  orphanType?: 'YATIM' | 'PIATU' | 'YATIM_PIATU' | 'BUKAN' | null;
}

interface ExistingStudentSnapshot {
  id: string;
  nis: string | null;
  nisn: string;
  nik: string;
  noKk: string | null;
  fullName: string;
  gender: string;
  religion: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  rt: string | null;
  rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  postalCode: string | null;
  telepon: string | null;
  phone: string | null;
  email: string | null;
  jenisTinggal: string | null;
  alatTransportasi: string | null;
  kebutuhanKhusus: string | null;
  sekolahAsal: string | null;
  skhun: string | null;
  noPesertaUn: string | null;
  noIjazah: string | null;
  noAktaLahir: string | null;
  anakKe: number | null;
  jmlSaudara: number | null;
  beratBadan: number | null;
  tinggiBadan: number | null;
  lingkarKepala: number | null;
  jarakSekolah: number | null;
  bank: string | null;
  noRekening: string | null;
  namaRekening: string | null;
  classId: string | null;
  entryDate: string | null;
  student_parents?: ExistingParentSnapshot[];
  student_economics?: ExistingEconomicSnapshot | null;
}

interface SmartDiffStats {
  total: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingClass: number;
  emptyClass: number;
  missingMandatory: number;
  fileDuplicates: number;
}

// ==========================================
// CONSTANTS & PURE HELPERS
// ==========================================
const ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU', 'KEPALA_SEKOLAH'];
const PAGE_SIZE = 10;
const WELFARE_DIFF_LABELS = ['KIP', 'PIP', 'KKS/KPS', 'PKH', 'DTKS/Desil'] as const;

const isWelfareLabel = (label: string): boolean =>
  (WELFARE_DIFF_LABELS as readonly string[]).includes(label);

const getLocalTodayIso = (): string => {
  return new Date().toLocaleDateString('en-CA');
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
};

const getStatusConfig = (status: string, locale: string) => {
  const isId = locale === 'id';
  const config: Record<string, { label: string; color: string }> = {
    AKTIF: { label: isId ? 'Aktif' : 'Active', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    MUTASI_KELUAR: { label: isId ? 'Mutasi' : 'Transferred', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    LULUS: { label: isId ? 'Lulus' : 'Graduated', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    DO: { label: isId ? 'DO' : 'Dropped Out', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
    CUTI: { label: isId ? 'Cuti' : 'On Leave', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  };
  return config[status] || { label: status, color: 'bg-muted text-muted-foreground border-border' };
};

const normalizeClassName = (name: string): string => {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/kelas/g, '')
    .replace(/rombel/g, '')
    .replace(/saat ini/g, '')
    .replace(/tingkat/g, '')
    .replace(/-/g, '')
    .replace(/\s+/g, '')
    .trim();
};

const cleanDapodikText = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  const cleaned = String(val)
    .replace(/â€“/g, '-')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '(tidak diisi)' || cleaned.toLowerCase() === 'null') return '';
  return cleaned;
};

const cleanNumericId = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  const cleaned = String(val).replace(/^'+/, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'null' || cleaned === '-') return '';
  if (/^\d+([.,]\d+)?e\+\d+$/i.test(cleaned)) return '';
  return cleaned;
};

const cleanBirthYear = (val: unknown): string | null => {
  const cleaned = cleanNumericId(val);
  if (!/^\d{4}$/.test(cleaned)) return null;
  const yearNum = Number(cleaned);
  return yearNum >= 1900 && yearNum <= 2099 ? cleaned : null;
};

// Disamakan dengan sanitizeNamaKip di student.service.ts agar tidak memicu diff palsu
const cleanNamaKip = (val: unknown): string | null => {
  const cleaned = cleanDapodikText(val);
  if (!cleaned) return null;
  if (['0', '1', '-', 'ya', 'tidak'].includes(cleaned.toLowerCase())) return null;
  return cleaned;
};

const getValidNumber = (val: unknown, min = 0): number | null => {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  const num = Number(String(val).replace(',', '.'));
  return !Number.isNaN(num) && num >= min ? num : null;
};

const toBool = (val: unknown): boolean => {
  const s = String(val ?? '').toLowerCase().trim();
  return s === 'ya' || s === 'yes' || s === '1' || s === 'true';
};

const normalizeReligionDiff = (val: string | null | undefined): string => {
  const s = (val || '').trim().toLowerCase();
  if (s === 'katholik') return 'katolik';
  if (s === 'budha') return 'buddha';
  return s;
};

const buildDeterministicFallbackId = (prefix: string, seed: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${prefix}-${hex}`;
};

const guessGradeLevel = (className: string): number => {
  const upper = className.toUpperCase();
  if (/\bTK\s*B\b/.test(upper) || upper.includes('TKB') || upper.includes('BESAR')) return 2;
  if (/\bTK\s*A\b/.test(upper) || upper.includes('TKA') || upper.includes('KECIL')) return 1;

  const digit = upper.match(/\d{1,2}/);
  if (digit) {
    const n = parseInt(digit[0], 10);
    if (n >= 1 && n <= 12) return n;
  }

  const romanMap: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
  };
  const roman = upper.match(/(?<![A-Z])(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![IVX])/);
  if (roman) return romanMap[roman[1]] ?? 0;

  if (upper.includes('PAKET C')) return 12;
  if (upper.includes('PAKET B')) return 9;
  if (upper.includes('PAKET A')) return 6;

  return 0;
};

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
};

const parseExcelDate = (raw: unknown, fallback: string): string => {
  const str = String(raw ?? '').trim();
  if (!str) return fallback;

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    if (serial > 1000 && serial < 100000) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(utcMs).toISOString().split('T')[0];
    }
  }

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const idMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (idMatch) {
    const d = Number(idMatch[1]);
    const m = Number(idMatch[2]);
    const y = Number(idMatch[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return fallback;
};

const parseDesil = (row: ExcelRow): number | null => {
  const raw = row['desil'] || row['desil p3ke'] || row['desil dtks'] || row['desil (p3ke/dtks)'];
  if (!raw) return null;
  const num = parseInt(String(raw).replace(/\D/g, ''), 10);
  return num >= 1 && num <= 10 ? num : null;
};

const pick = (row: ExcelRow, ...keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const buildParent = (
  row: ExcelRow,
  who: 'ayah' | 'ibu' | 'wali',
  relation: 'AYAH' | 'IBU' | 'WALI'
): CreateStudentParentPayload | null => {
  const fullName = cleanDapodikText(pick(row, `data ${who} nama`, `nama ${who}`));
  if (!fullName) return null;
  return {
    relation,
    fullName,
    birthYear: cleanBirthYear(pick(row, `data ${who} tahun lahir`, `tahun lahir ${who}`)),
    nik: cleanNumericId(pick(row, `data ${who} nik`, `nik ${who}`)) || null,
    occupation: cleanDapodikText(pick(row, `data ${who} pekerjaan`, `pekerjaan ${who}`)) || null,
    monthlyIncome: cleanDapodikText(pick(row, `data ${who} penghasilan`, `penghasilan ${who}`)) || null,
    education: cleanDapodikText(pick(row, `data ${who} jenjang pendidikan`, `pendidikan ${who}`)) || null,
    isAlive: true,
  };
};

const fetchExistingStudentsSnapshot = async (
  schoolId: string
): Promise<ExistingStudentSnapshot[]> => {
  const allRows: ExistingStudentSnapshot[] = [];
  const size = 1000;

  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('students')
      .select(`
        id, nis, nisn, nik, noKk, fullName, gender, religion, birthPlace, birthDate,
        address, rt, rw, kelurahan, kecamatan, postalCode, telepon, phone, email,
        jenisTinggal, alatTransportasi, kebutuhanKhusus, sekolahAsal,
        skhun, noPesertaUn, noIjazah, noAktaLahir,
        anakKe, jmlSaudara, beratBadan, tinggiBadan, lingkarKepala, jarakSekolah,
        bank, noRekening, namaRekening, classId, entryDate,
        student_parents(relation, fullName, nik, birthYear, education, occupation, monthlyIncome),
        student_economics(hasKip, kipNumber, namaKip, layakPip, alasanLayakPip, hasKks, kksNumber, hasPkh, isDtks, desil, isOrphan, orphanType)
      `)
      .eq('schoolId', schoolId)
      .range(from, from + size - 1);

    if (error) throw error;
    if (data && data.length > 0) {
      const rows = data as unknown as Record<string, unknown>[];
      const normalized: ExistingStudentSnapshot[] = rows.map((row) => {
        const ecoRaw = Array.isArray(row.student_economics)
          ? row.student_economics[0]
          : row.student_economics;
        return {
          ...(row as unknown as ExistingStudentSnapshot),
          student_parents: Array.isArray(row.student_parents)
            ? (row.student_parents as ExistingParentSnapshot[])
            : [],
          student_economics: (ecoRaw as ExistingEconomicSnapshot) || null,
        };
      });
      allRows.push(...normalized);
    }
    if (!data || data.length < size) break;
  }

  return allRows;
};

const computeStudentDiff = (
  existing: ExistingStudentSnapshot,
  incoming: StudentBulkImportItem,
  isId: boolean
): string[] => {
  const diffs = new Set<string>();
  const norm = (v: string | null | undefined) => (v || '').trim().toLowerCase();
  const numDiff = (a: number | null | undefined, b: number | null | undefined) =>
    b !== null && b !== undefined && Number(a ?? NaN) !== Number(b);

  if (norm(existing.nisn) !== norm(incoming.nisn)) {
    diffs.add('NISN');
  }
  if (norm(existing.fullName) !== norm(incoming.fullName)) {
    diffs.add(isId ? 'Nama' : 'Name');
  }
  if (incoming.nis && norm(existing.nis) !== norm(incoming.nis)) {
    diffs.add('NIPD / NIS');
  }
  if ((existing.classId || null) !== (incoming.classId || null) && incoming.classId !== null) {
    diffs.add(isId ? 'Kelas' : 'Class');
  }
  if (existing.gender !== incoming.gender) {
    diffs.add(isId ? 'Jenis Kelamin' : 'Gender');
  }
  if (
    incoming.religion &&
    normalizeReligionDiff(existing.religion) !== normalizeReligionDiff(incoming.religion)
  ) {
    diffs.add(isId ? 'Agama' : 'Religion');
  }
  if (norm(existing.birthPlace) !== norm(incoming.birthPlace) && incoming.birthPlace !== '-') {
    diffs.add(isId ? 'Tempat Lahir' : 'Birth Place');
  }
  const existingDob = (existing.birthDate || '').split('T')[0];
  if (existingDob && incoming.birthDate && existingDob !== incoming.birthDate) {
    diffs.add(isId ? 'Tanggal Lahir' : 'Birth Date');
  }
  if (!incoming.nik.startsWith('NONIK-') && norm(existing.nik) !== norm(incoming.nik)) {
    diffs.add('NIK');
  }
  if (incoming.noKk && incoming.noKk !== '-' && norm(existing.noKk) !== norm(incoming.noKk)) {
    diffs.add('No. KK');
  }

  if (
    (norm(existing.address) !== norm(incoming.address) && incoming.address !== '-') ||
    (incoming.rt && norm(existing.rt) !== norm(incoming.rt)) ||
    (incoming.rw && norm(existing.rw) !== norm(incoming.rw)) ||
    (incoming.kelurahan && norm(existing.kelurahan) !== norm(incoming.kelurahan)) ||
    (incoming.kecamatan && norm(existing.kecamatan) !== norm(incoming.kecamatan)) ||
    (incoming.postalCode && norm(existing.postalCode) !== norm(incoming.postalCode))
  ) {
    diffs.add(isId ? 'Alamat' : 'Address');
  }
  if (
    (incoming.phone && norm(existing.phone) !== norm(incoming.phone)) ||
    (incoming.telepon && norm(existing.telepon) !== norm(incoming.telepon)) ||
    (incoming.email && norm(existing.email) !== norm(incoming.email))
  ) {
    diffs.add(isId ? 'Kontak' : 'Contact');
  }

  if (
    (incoming.noAktaLahir && norm(existing.noAktaLahir) !== norm(incoming.noAktaLahir)) ||
    (incoming.skhun && norm(existing.skhun) !== norm(incoming.skhun)) ||
    (incoming.noPesertaUn && norm(existing.noPesertaUn) !== norm(incoming.noPesertaUn)) ||
    (incoming.noIjazah && norm(existing.noIjazah) !== norm(incoming.noIjazah)) ||
    (incoming.sekolahAsal && norm(existing.sekolahAsal) !== norm(incoming.sekolahAsal))
  ) {
    diffs.add(isId ? 'Dokumen/Asal Sekolah' : 'Documents');
  }
  if (
    (incoming.bank && norm(existing.bank) !== norm(incoming.bank)) ||
    (incoming.noRekening && norm(existing.noRekening) !== norm(incoming.noRekening)) ||
    (incoming.namaRekening && norm(existing.namaRekening) !== norm(incoming.namaRekening))
  ) {
    diffs.add(isId ? 'Rekening Bank' : 'Bank Account');
  }
  if (
    numDiff(existing.anakKe, incoming.anakKe) ||
    numDiff(existing.jmlSaudara, incoming.jmlSaudara) ||
    numDiff(existing.beratBadan, incoming.beratBadan) ||
    numDiff(existing.tinggiBadan, incoming.tinggiBadan) ||
    numDiff(existing.lingkarKepala, incoming.lingkarKepala) ||
    numDiff(existing.jarakSekolah, incoming.jarakSekolah) ||
    (incoming.jenisTinggal && norm(existing.jenisTinggal) !== norm(incoming.jenisTinggal)) ||
    (incoming.alatTransportasi && norm(existing.alatTransportasi) !== norm(incoming.alatTransportasi)) ||
    (incoming.kebutuhanKhusus && norm(existing.kebutuhanKhusus) !== norm(incoming.kebutuhanKhusus))
  ) {
    diffs.add(isId ? 'Data Periodik' : 'Periodic Info');
  }

  const existingParents = existing.student_parents || [];
  const incomingParents = incoming.parents || [];
  for (const incP of incomingParents) {
    const exP = existingParents.find((p) => p.relation === incP.relation);
    if (!exP) {
      diffs.add(isId ? 'Orang Tua/Wali' : 'Parents');
      break;
    }
    if (
      norm(exP.fullName) !== norm(incP.fullName) ||
      (incP.nik && norm(exP.nik) !== norm(incP.nik)) ||
      (incP.birthYear && norm(exP.birthYear) !== norm(incP.birthYear)) ||
      (incP.education && norm(exP.education) !== norm(incP.education)) ||
      (incP.occupation && norm(exP.occupation) !== norm(incP.occupation)) ||
      (incP.monthlyIncome && norm(exP.monthlyIncome) !== norm(incP.monthlyIncome))
    ) {
      diffs.add(isId ? 'Orang Tua/Wali' : 'Parents');
      break;
    }
  }

  // Deteksi perbedaan per jenis bantuan sosial secara spesifik
  const exEco = existing.student_economics;
  const incEco = incoming.economic;
  if (incEco) {
    const kipChanged =
      Boolean(exEco?.hasKip) !== Boolean(incEco.hasKip) ||
      (Boolean(incEco.hasKip) && incEco.kipNumber && norm(exEco?.kipNumber) !== norm(incEco.kipNumber)) ||
      (Boolean(incEco.hasKip) && incEco.namaKip && norm(exEco?.namaKip) !== norm(incEco.namaKip));

    const pipChanged =
      Boolean(exEco?.layakPip) !== Boolean(incEco.layakPip) ||
      (Boolean(incEco.layakPip) && incEco.alasanLayakPip && norm(exEco?.alasanLayakPip) !== norm(incEco.alasanLayakPip));

    const kksChanged =
      Boolean(exEco?.hasKks) !== Boolean(incEco.hasKks) ||
      (Boolean(incEco.hasKks) && incEco.kksNumber && norm(exEco?.kksNumber) !== norm(incEco.kksNumber));

    const pkhChanged = Boolean(exEco?.hasPkh) !== Boolean(incEco.hasPkh);

    const dtksChanged =
      Boolean(exEco?.isDtks) !== Boolean(incEco.isDtks) ||
      (incEco.desil !== null && exEco?.desil !== incEco.desil);

    if (kipChanged) diffs.add('KIP');
    if (pipChanged) diffs.add('PIP');
    if (kksChanged) diffs.add('KKS/KPS');
    if (pkhChanged) diffs.add('PKH');
    if (dtksChanged) diffs.add('DTKS/Desil');
  }

  return Array.from(diffs);
};

// ==========================================
// SUB-COMPONENT
// ==========================================
interface SortableHeaderProps {
  columnKey: string;
  label: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
}

function SortableHeader({ columnKey, label, sortConfig, onSort }: SortableHeaderProps) {
  const direction = sortConfig?.key === columnKey ? sortConfig.direction : null;
  return (
    <th
      className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 transition-colors select-none"
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
export function StudentListPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school, user } = useAuthStore();

  const isId = locale === 'id';
  const tr = (idText: string, enText: string) => (isId ? idText : enText);

  const canManageData = user?.role ? ALLOWED_ROLES.includes(user.role) : false;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState<string>('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wizardState, setWizardState] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [parsedImportData, setParsedImportData] = useState<StudentBulkImportItem[]>([]);
  const [existingWelfareMap, setExistingWelfareMap] = useState<Record<string, ExistingEconomicSnapshot>>({});
  const [applySmartUpdates, setApplySmartUpdates] = useState(true);
  const [preserveManualWelfare, setPreserveManualWelfare] = useState(false);
  const [importStats, setImportStats] = useState<SmartDiffStats>({
    total: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    missingClass: 0,
    emptyClass: 0,
    missingMandatory: 0,
    fileDuplicates: 0,
  });
  const [unmatchedClasses, setUnmatchedClasses] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setJumpPage(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    setSelectedRows([]);
  }, [debouncedSearch, selectedClass, selectedStatus, currentPage]);

  // --- QUERIES ---
  const { data: classesData } = useQuery({
    queryKey: ['classes-list', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .eq('schoolId', school!.id)
        .order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data as ClassRow[];
    },
    enabled: Boolean(school?.id),
  });

  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year', school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('academic_years')
        .select('id')
        .eq('schoolId', school!.id)
        .eq('isActive', true)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(school?.id),
  });

  const { data: studentsResponse, isLoading } = useQuery({
    queryKey: [
      'students',
      school?.id,
      currentPage,
      PAGE_SIZE,
      debouncedSearch,
      selectedClass,
      selectedStatus,
      sortConfig,
    ],
    queryFn: () =>
      studentService.list({
        schoolId: school!.id,
        page: currentPage,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        classId: selectedClass === 'all' ? undefined : selectedClass,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        sortBy: sortConfig?.key,
        sortOrder: sortConfig?.direction,
      }),
    enabled: Boolean(school?.id),
  });

  const students = studentsResponse?.data?.data || [];
  const meta = studentsResponse?.data?.meta;
  const totalPages = Math.ceil((meta?.total || 0) / PAGE_SIZE) || 1;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // --- MUTATIONS ---
  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentService.delete(id, school?.id),
    onSuccess: (_res, deletedId) => {
      toast.success(tr('Siswa berhasil dihapus', 'Student deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows((prev) => prev.filter((r) => r !== deletedId));
      setStudentToDelete(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, tr('Gagal menghapus siswa', 'Failed to delete student')));
      setStudentToDelete(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => studentService.deleteMany(ids, school?.id),
    onSuccess: (res) => {
      toast.success(
        res.message ||
        tr(`${res.data.deleted} data berhasil dihapus`, `${res.data.deleted} data deleted successfully`)
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      setIsBulkDeleting(false);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, tr('Gagal menghapus data massal', 'Failed to bulk delete data')));
      setIsBulkDeleting(false);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => {
      if (!isSuperAdmin) {
        throw new Error(
          tr('Hanya Super Admin yang dapat mengosongkan data.', 'Only Super Admin can wipe all data.')
        );
      }
      if (!school?.id) {
        throw new Error(tr('Data sekolah belum termuat.', 'School data is not loaded yet.'));
      }
      return studentService.deleteAll(school.id);
    },
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      setIsDeletingAll(false);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, tr('Gagal mengosongkan data', 'Failed to wipe data')));
      setIsDeletingAll(false);
    },
  });

  const importMutation = useMutation({
    mutationFn: (payload: StudentBulkImportItem[]) => studentService.bulkImport(payload),
    onSuccess: (res) => {
      toast.success(res.message || tr('Import berhasil', 'Import successful'));
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      queryClient.invalidateQueries({ queryKey: ['classes-list'] });
      closeImportWizard();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, tr('Gagal melakukan import', 'Import failed')));
      setWizardState('preview');
    },
  });

  // --- HANDLERS ---
  const handleSort = (key: string) => {
    const direction: 'asc' | 'desc' =
      sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const toggleRow = (id: string) =>
    setSelectedRows((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const toggleAll = () =>
    setSelectedRows(
      selectedRows.length === students.length && students.length > 0
        ? []
        : students.map((s) => s.id)
    );

  const closeImportWizard = () => {
    setWizardState('idle');
    setParsedImportData([]);
    setExistingWelfareMap({});
    setUnmatchedClasses([]);
    setApplySmartUpdates(true);
    setPreserveManualWelfare(false);
  };

  // --- SMARTDIFF IMPORT PARSER ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!school?.id) {
      toast.error(
        isSuperAdmin
          ? tr(
            'Super Admin wajib memilih sekolah aktif terlebih dahulu sebelum melakukan import.',
            'Super Admin must select an active school before importing.'
          )
          : tr('Data sekolah belum termuat.', 'School data is not loaded yet.')
      );
      e.target.value = '';
      return;
    }

    setWizardState('parsing');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target?.result, { type: 'array' });
        if (!workbook.SheetNames.length) {
          throw new Error(tr('File kosong', 'Empty file'));
        }

        let rawData: unknown[][] = [];
        let headerRowIndex = -1;

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;
          const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            raw: false,
            defval: '',
          });

          for (let i = 0; i < Math.min(25, sheetRows.length); i++) {
            const rowText =
              (sheetRows[i] as unknown[])?.map((cell) =>
                String(cell).toLowerCase().replace(/\s+/g, '')
              ) || [];
            const hasNameCol = rowText.some(
              (c) => c === 'nama' || c === 'namalengkap' || c === 'namapesertadidik'
            );
            const hasIdCol = rowText.some((c) =>
              ['nipd', 'nis', 'nisn', 'jk', 'jeniskelamin'].includes(c)
            );
            if (hasNameCol && hasIdCol) {
              rawData = sheetRows;
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex !== -1) break;
        }

        if (headerRowIndex === -1) {
          throw new Error(
            tr(
              'Format kolom tidak dikenali (Kolom Nama / NISN / JK tidak ditemukan)',
              'Invalid column format (Missing Name / NISN / Gender)'
            )
          );
        }

        const rowMain = (rawData[headerRowIndex] as string[]) || [];
        const rowSub = (rawData[headerRowIndex + 1] as string[]) || [];

        let currentGroup = '';
        const cleanHeaders: string[] = [];

        for (let c = 0; c < Math.max(rowMain.length, rowSub.length); c++) {
          const vMain = String(rowMain[c] || '')
            .trim()
            .replace(/[\r\n]+/g, ' ');
          const vSub = String(rowSub[c] || '')
            .trim()
            .replace(/[\r\n]+/g, ' ');

          if (vMain) {
            const vMainLower = vMain.toLowerCase();
            if (
              vMainLower.includes('data ayah') ||
              vMainLower.includes('data ibu') ||
              vMainLower.includes('data wali')
            ) {
              currentGroup = vMain;
            } else {
              currentGroup = '';
            }
          }

          if (currentGroup && vSub) {
            cleanHeaders.push(`${currentGroup} ${vSub}`.toLowerCase().trim());
          } else {
            cleanHeaders.push((vMain || vSub).toLowerCase().trim());
          }
        }

        const data: ExcelRow[] = rawData.slice(headerRowIndex + 2).map((rowArray) => {
          const rowObject: ExcelRow = {};
          cleanHeaders.forEach((header, index) => {
            if (header && Array.isArray(rowArray)) {
              const cellValue = rowArray[index];
              rowObject[header] = cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
            }
          });
          return rowObject;
        });

        const existingStudents = await fetchExistingStudentsSnapshot(school.id);
        const existingByNisn = new Map<string, ExistingStudentSnapshot>();
        const existingByNik = new Map<string, ExistingStudentSnapshot>();
        const existingByNameDob = new Map<string, ExistingStudentSnapshot>();
        const existingNisOwner = new Map<string, string>();
        const existingNikOwner = new Map<string, string>();
        const welfareSnapshot: Record<string, ExistingEconomicSnapshot> = {};

        existingStudents.forEach((s) => {
          if (s.student_economics) {
            welfareSnapshot[s.id] = s.student_economics;
          }
          if (s.nisn) existingByNisn.set(s.nisn.trim(), s);
          if (s.nik && !s.nik.startsWith('NONIK-')) {
            existingByNik.set(s.nik.trim(), s);
          }
          const dob = (s.birthDate || '').split('T')[0];
          if (s.fullName && dob) {
            existingByNameDob.set(`${s.fullName.toLowerCase().trim()}|${dob}`, s);
          }
          if (s.nis) existingNisOwner.set(s.nis.trim(), s.id);
          if (s.nik) existingNikOwner.set(s.nik.trim(), s.id);
        });

        const parsedPayloads: StudentBulkImportItem[] = [];
        let validNamedRows = 0;
        let newCount = 0;
        let updatedCount = 0;
        let unchangedCount = 0;
        let missingClassCount = 0;
        let emptyClassCount = 0;
        let missingMandatoryCount = 0;
        let fileDuplicateCount = 0;

        const unfoundClassByNorm = new Map<string, string>();
        const seenNisInFile = new Set<string>();
        const seenNisnInFile = new Set<string>();
        const seenNikInFile = new Set<string>();
        const todayLocal = getLocalTodayIso();

        for (const row of data) {
          const nameVal = cleanDapodikText(pick(row, 'nama', 'nama lengkap', 'nama peserta didik'));
          const nipdVal = pick(row, 'nipd', 'nis');
          const nisnVal = pick(row, 'nisn');

          if (!nameVal && !nipdVal && !nisnVal) continue;

          if (!nameVal) {
            missingMandatoryCount++;
            continue;
          }
          validNamedRows++;

          const fullName = nameVal;
          const birthDate = parseExcelDate(row['tanggal lahir'], todayLocal);
          const rawNisn = cleanNumericId(nisnVal);
          const rawNik = cleanNumericId(row['nik']);
          const rawNoKk = cleanNumericId(pick(row, 'no kk', 'nokk', 'no. kk', 'nomor kk'));

          let matchedExisting: ExistingStudentSnapshot | undefined;
          if (rawNisn) {
            matchedExisting = existingByNisn.get(rawNisn);
          }
          if (!matchedExisting && rawNik && !rawNik.startsWith('NONIK-')) {
            matchedExisting = existingByNik.get(rawNik);
          }
          if (!matchedExisting) {
            const byNameDob = existingByNameDob.get(
              `${fullName.toLowerCase()}|${birthDate}`
            );
            if (byNameDob && (!rawNisn || byNameDob.nisn.startsWith('TK-'))) {
              matchedExisting = byNameDob;
            }
          }

          const resolvedNisn =
            rawNisn ||
            matchedExisting?.nisn ||
            buildDeterministicFallbackId('TK', `${school.id}|${fullName.toLowerCase()}|${birthDate}`);

          if (seenNisnInFile.has(resolvedNisn)) {
            fileDuplicateCount++;
            continue;
          }
          seenNisnInFile.add(resolvedNisn);

          let parsedNis: string | null = cleanNumericId(nipdVal) || null;
          if (parsedNis) {
            const nisOwnerId = existingNisOwner.get(parsedNis);
            if (seenNisInFile.has(parsedNis) || (nisOwnerId && nisOwnerId !== matchedExisting?.id)) {
              parsedNis =
                matchedExisting?.nis && !seenNisInFile.has(matchedExisting.nis)
                  ? matchedExisting.nis
                  : null;
            }
            if (parsedNis) {
              seenNisInFile.add(parsedNis);
            }
          }

          let resolvedNik =
            rawNik ||
            matchedExisting?.nik ||
            buildDeterministicFallbackId('NONIK', `${school.id}|${resolvedNisn}`);

          const nikOwnerId = existingNikOwner.get(resolvedNik);
          if (seenNikInFile.has(resolvedNik) || (nikOwnerId && nikOwnerId !== matchedExisting?.id)) {
            resolvedNik =
              matchedExisting?.nik && !seenNikInFile.has(matchedExisting.nik)
                ? matchedExisting.nik
                : buildDeterministicFallbackId('NONIK', `${school.id}|${resolvedNisn}`);
          }
          seenNikInFile.add(resolvedNik);

          const alamatRaw = cleanDapodikText(row['alamat']);
          const dusunRaw = cleanDapodikText(row['dusun']);
          let finalAddress = alamatRaw;
          if (dusunRaw && dusunRaw !== '-' && !finalAddress.toLowerCase().includes(dusunRaw.toLowerCase())) {
            finalAddress = finalAddress ? `${finalAddress}, Dusun ${dusunRaw}` : `Dusun ${dusunRaw}`;
          }

          const rombelKey = Object.keys(row).find((k) => k.includes('rombel') || k.includes('kelas'));
          const rawExcelRombel = rombelKey ? cleanDapodikText(row[rombelKey]) : '';
          const normalizedExcelRombel = normalizeClassName(rawExcelRombel);

          const matchedClass = normalizedExcelRombel
            ? (classesData || []).find(
              (c) =>
                normalizeClassName(c.name) === normalizedExcelRombel ||
                String(c.gradeLevel) === normalizedExcelRombel
            )
            : undefined;

          if (!matchedClass) {
            if (rawExcelRombel) {
              missingClassCount++;
              const normKey = normalizedExcelRombel || rawExcelRombel.toLowerCase();
              if (!unfoundClassByNorm.has(normKey)) {
                unfoundClassByNorm.set(normKey, rawExcelRombel);
              }
            } else {
              emptyClassCount++;
            }
          }

          const parents = [
            buildParent(row, 'ayah', 'AYAH'),
            buildParent(row, 'ibu', 'IBU'),
            buildParent(row, 'wali', 'WALI'),
          ].filter((p): p is CreateStudentParentPayload => p !== null);

          const rawEntryDate = pick(row, 'tanggal masuk', 'tanggal masuk sekolah');
          const resolvedEntryDate = rawEntryDate
            ? parseExcelDate(rawEntryDate, '') || null
            : matchedExisting?.entryDate
              ? matchedExisting.entryDate.split('T')[0]
              : null;

          const rawReligion = cleanDapodikText(row['agama']).toUpperCase();
          const resolvedReligion = rawReligion === 'KATHOLIK' ? 'KATOLIK' : rawReligion || null;

          const rawGender = cleanDapodikText(row['jk'] || row['jenis kelamin']).toUpperCase();
          const resolvedGender: 'L' | 'P' = rawGender.startsWith('L')
            ? 'L'
            : rawGender.startsWith('P')
              ? 'P'
              : (matchedExisting?.gender as 'L' | 'P') || 'L';

          // Normalisasi data bansos disamakan persis dengan normalizeEconomicPayload di student.service.ts
          const rawKipNumber = cleanNumericId(pick(row, 'nomor kip', 'no. kip', 'no kip')) || null;
          const hasKip = toBool(pick(row, 'penerima kip')) || Boolean(rawKipNumber);
          const kipNumber = hasKip ? rawKipNumber : null;
          const namaKip = hasKip ? cleanNamaKip(row['nama di kip']) : null;

          const layakPip = toBool(row['layak pip (usulan dari sekolah)'] || row['layak pip']);
          const alasanLayakPip = layakPip ? cleanDapodikText(row['alasan layak pip']) || null : null;

          const rawKksNumber = cleanNumericId(pick(row, 'no. kps', 'nomor kks', 'no kks')) || null;
          const hasKks = toBool(pick(row, 'penerima kps', 'penerima kks')) || Boolean(rawKksNumber);
          const kksNumber = hasKks ? rawKksNumber : null;

          const existingEco = matchedExisting?.student_economics;

          const candidate: StudentBulkImportItem = {
            id: matchedExisting?.id,
            schoolId: school.id,
            nis: parsedNis,
            nisn: resolvedNisn,
            nik: resolvedNik,
            noKk: rawNoKk || matchedExisting?.noKk || null,
            fullName,
            gender: resolvedGender,
            birthPlace: cleanDapodikText(row['tempat lahir']) || '-',
            birthDate,
            religion: resolvedReligion,
            address: finalAddress || '-',
            dusun: dusunRaw,
            rt: String(row['rt'] || '').trim(),
            rw: String(row['rw'] || '').trim(),
            kelurahan: cleanDapodikText(row['kelurahan']),
            kecamatan: cleanDapodikText(row['kecamatan']),
            city: cleanDapodikText(row['kabupaten/kota'] || row['kota']) || school.city || '-',
            province: cleanDapodikText(row['provinsi']) || school.province || '-',
            postalCode: cleanNumericId(row['kode pos']),
            telepon: cleanNumericId(row['telepon']),
            phone: cleanNumericId(pick(row, 'hp', 'no. hp', 'no hp', 'handphone')),
            email: String(row['e-mail'] || row['email'] || '').trim(),
            anakKe: getValidNumber(row['anak ke-berapa'], 1),
            jmlSaudara: getValidNumber(row['jml. saudara kandung'], 0),
            lintang: String(row['lintang'] || '').trim(),
            bujur: String(row['bujur'] || '').trim(),
            beratBadan: getValidNumber(row['berat badan'], 0),
            tinggiBadan: getValidNumber(row['tinggi badan'], 0),
            lingkarKepala: getValidNumber(row['lingkar kepala'], 0),
            jarakSekolah: getValidNumber(
              pick(row, 'jarak rumah ke sekolah (km)', 'jarak rumah ke sekolah', 'jarak sekolah'),
              0
            ),
            jenisTinggal: cleanDapodikText(row['jenis tinggal']),
            alatTransportasi: cleanDapodikText(row['alat transportasi']),
            sekolahAsal: cleanDapodikText(row['sekolah asal']),
            kebutuhanKhusus: cleanDapodikText(row['kebutuhan khusus']),
            classId: matchedClass?.id || matchedExisting?.classId || null,
            rawClassName: rawExcelRombel || 'Belum Ada Kelas',
            entryDate: resolvedEntryDate,
            status: 'AKTIF',
            skhun: cleanDapodikText(row['skhun']),
            noPesertaUn: cleanDapodikText(row['no peserta ujian nasional']),
            noIjazah: cleanDapodikText(row['no seri ijazah']),
            noAktaLahir: cleanDapodikText(row['no registrasi akta lahir']),
            bank: cleanDapodikText(row['bank']),
            noRekening: cleanNumericId(row['nomor rekening bank']),
            namaRekening: cleanDapodikText(row['rekening atas nama']),
            parents: parents.length > 0 ? parents : undefined,
            economic: {
              hasKip,
              kipNumber,
              namaKip,
              layakPip,
              alasanLayakPip,
              hasPkh: toBool(row['penerima pkh']),
              hasKks,
              kksNumber,
              isDtks: toBool(row['dtks'] || row['terdaftar dtks']),
              desil: parseDesil(row),
              isOrphan: existingEco?.isOrphan ?? false,
              orphanType: existingEco?.orphanType ?? null,
            },
          };

          if (matchedExisting) {
            const diffFields = computeStudentDiff(matchedExisting, candidate, isId);
            if (!matchedClass && rawExcelRombel) {
              const clsLabel = isId ? 'Kelas' : 'Class';
              if (!diffFields.includes(clsLabel)) diffFields.push(clsLabel);
            }

            if (diffFields.length === 0) {
              unchangedCount++;
              continue;
            }

            updatedCount++;
            candidate.diffAction = 'updated';
            candidate.diffFields = diffFields;
            parsedPayloads.push(candidate);
          } else {
            newCount++;
            candidate.diffAction = 'new';
            parsedPayloads.push(candidate);
          }
        }

        setParsedImportData(parsedPayloads);
        setExistingWelfareMap(welfareSnapshot);
        setUnmatchedClasses(Array.from(unfoundClassByNorm.values()));
        setImportStats({
          total: validNamedRows,
          newCount,
          updatedCount,
          unchangedCount,
          missingClass: missingClassCount,
          emptyClass: emptyClassCount,
          missingMandatory: missingMandatoryCount,
          fileDuplicates: fileDuplicateCount,
        });
        setWizardState('preview');
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, tr('Gagal membaca file Excel', 'Failed to parse Excel file')));
        setWizardState('idle');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast.error(tr('Gagal membaca file', 'Failed to read file'));
      setWizardState('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // --- EXECUTE SMARTDIFF IMPORT ---
  const executeImport = async () => {
    if (!school?.id) {
      toast.error(
        isSuperAdmin
          ? tr(
            'Super Admin wajib memilih sekolah aktif terlebih dahulu.',
            'Super Admin must select an active school first.'
          )
          : tr('Data sekolah belum termuat.', 'School data is not loaded yet.')
      );
      return;
    }

    const payloadsToProcess = parsedImportData.filter((p) => {
      if (p.diffAction === 'new') return true;
      if (!applySmartUpdates) return false;
      const isOnlyWelfareDiff =
        (p.diffFields?.length ?? 0) > 0 && p.diffFields!.every(isWelfareLabel);
      if (preserveManualWelfare && isOnlyWelfareDiff) {
        return false;
      }
      return true;
    });

    if (payloadsToProcess.length === 0) {
      toast.error(tr('Tidak ada data baru atau perubahan yang dipilih.', 'No new or updated data selected.'));
      return;
    }

    const uniqueNewClassesMap = new Map<string, string>();
    for (const p of payloadsToProcess) {
      if (!p.classId && p.rawClassName && p.rawClassName !== 'Belum Ada Kelas') {
        const normKey = normalizeClassName(p.rawClassName) || p.rawClassName.toLowerCase().trim();
        if (!uniqueNewClassesMap.has(normKey)) {
          uniqueNewClassesMap.set(normKey, p.rawClassName);
        }
      }
    }

    const neededUnmatchedClasses = Array.from(uniqueNewClassesMap.values());

    if (neededUnmatchedClasses.length > 0 && !activeYear?.id) {
      toast.error(
        tr(
          'Tahun Ajaran Aktif tidak ditemukan! Silakan aktifkan Tahun Ajaran terlebih dahulu agar kelas dapat dibuat otomatis.',
          'Active Academic Year not found! Please activate an academic year first.'
        )
      );
      return;
    }

    setWizardState('importing');

    try {
      const createdClassByNorm = new Map<string, string>();
      let currentClasses: ClassRow[] = classesData || [];

      if (neededUnmatchedClasses.length > 0 && activeYear?.id) {
        const classesToCreate = neededUnmatchedClasses.map((className) => ({
          schoolId: school.id,
          academicYearId: activeYear.id,
          name: className,
          gradeLevel: guessGradeLevel(className),
          capacity: 32,
        }));

        const { data: newClasses, error: classError } = await supabase
          .from('classes')
          .upsert(classesToCreate, { onConflict: 'schoolId, academicYearId, name' })
          .select('id, name, gradeLevel');

        if (classError) {
          throw new Error(tr('Gagal membuat kelas otomatis di database.', 'Failed to auto-create classes.'));
        }

        (newClasses || []).forEach((c) => {
          const normKey = normalizeClassName(c.name) || c.name.toLowerCase().trim();
          createdClassByNorm.set(normKey, c.id);
        });

        const knownIds = new Set(currentClasses.map((c) => c.id));
        currentClasses = [
          ...currentClasses,
          ...(newClasses || []).filter((c) => !knownIds.has(c.id)),
        ];
        queryClient.setQueryData(['classes-list', school.id], currentClasses);
      }

      const finalPayload: StudentBulkImportItem[] = payloadsToProcess.map((payload) => {
        let updatedClassId = payload.classId;

        if (!updatedClassId && payload.rawClassName && payload.rawClassName !== 'Belum Ada Kelas') {
          const normKey =
            normalizeClassName(payload.rawClassName) || payload.rawClassName.toLowerCase().trim();
          updatedClassId =
            createdClassByNorm.get(normKey) ||
            currentClasses.find(
              (c) => (normalizeClassName(c.name) || c.name.toLowerCase().trim()) === normKey
            )?.id ||
            null;
        }

        // Pada StudentListPage.tsx di dalam fungsi executeImport():
        // Pertahankan data bansos lama jika opsi proteksi aktif.
        // Kembalikan `undefined` bila siswa belum memiliki catatan di `student_economics`
        // agar fungsi RPC tidak membuat baris kosong baru.
        const existingEco = payload.id ? existingWelfareMap[payload.id] : undefined;
        const savedEco =
          preserveManualWelfare && payload.diffAction === 'updated'
            ? existingEco
              ? {
                hasKip: Boolean(existingEco.hasKip),
                kipNumber: existingEco.kipNumber ?? null,
                namaKip: existingEco.namaKip ?? null,
                layakPip: Boolean(existingEco.layakPip),
                alasanLayakPip: existingEco.alasanLayakPip ?? null,
                hasPkh: Boolean(existingEco.hasPkh),
                hasKks: Boolean(existingEco.hasKks),
                kksNumber: existingEco.kksNumber ?? null,
                isDtks: Boolean(existingEco.isDtks),
                desil: existingEco.desil ?? null,
                isOrphan: Boolean(existingEco.isOrphan),
                orphanType: existingEco.orphanType ?? null,
              }
              : undefined
            : payload.economic;

        return { ...payload, classId: updatedClassId || null, economic: savedEco };
      });

      importMutation.mutate(finalPayload);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, tr('Gagal memproses data import.', 'Failed to process import data.')));
      setWizardState('preview');
    }
  };

  // --- EXPORT ---
  const handleExport = async () => {
    setIsExporting(true);
    const toastId = toast.loading(tr('Menyiapkan file Excel...', 'Preparing Excel file...'));
    try {
      const response = await studentService.exportAll(school?.id);
      let dataToExport = response.data || [];

      if (selectedRows.length > 0) {
        dataToExport = dataToExport.filter((s) => selectedRows.includes(s.id));
      }

      if (dataToExport.length === 0) {
        throw new Error(tr('Tidak ada data untuk diexport', 'No data to export'));
      }

      const excelData = dataToExport.map((s, index) => {
        const ayah = s.parents?.find((p) => p.relation === 'AYAH');
        const ibu = s.parents?.find((p) => p.relation === 'IBU');
        const wali = s.parents?.find((p) => p.relation === 'WALI');
        return {
          No: index + 1,
          NISN: s.nisn,
          NIS: s.nis && s.nis !== '-' ? s.nis : '-',
          NIK: s.nik || '-',
          'No. KK': s.noKk || '-',
          [tr('Nama Lengkap', 'Full Name')]: s.fullName,
          [tr('L/P', 'Gender')]: s.gender === 'L' ? tr('Laki-laki', 'Male') : tr('Perempuan', 'Female'),
          [tr('Kelas', 'Class')]: s.className || '-',
          [tr('Tempat Lahir', 'Birth Place')]: s.birthPlace || '-',
          [tr('Tanggal Lahir', 'Birth Date')]: s.birthDate ? formatDate(s.birthDate) : '-',
          [tr('Agama', 'Religion')]: s.religion || '-',
          [tr('Alamat', 'Address')]: s.address || '-',
          [tr('Desa/Kelurahan', 'Village')]: s.kelurahan || '-',
          [tr('Kecamatan', 'District')]: s.kecamatan || '-',
          [tr('Kab/Kota', 'City')]: s.city || '-',
          [tr('No. HP/Telepon', 'Phone Number')]: s.phone || s.telepon || '-',
          [tr('No. Akta Lahir', 'Birth Cert No.')]: s.noAktaLahir || '-',
          [tr('Sekolah Asal', 'Previous School')]: s.sekolahAsal || '-',
          [tr('Berat Badan (kg)', 'Weight (kg)')]: s.beratBadan ?? '-',
          [tr('Tinggi Badan (cm)', 'Height (cm)')]: s.tinggiBadan ?? '-',
          [tr('Nama Ayah', 'Father Name')]: ayah?.fullName || '-',
          [tr('Nama Ibu', 'Mother Name')]: ibu?.fullName || '-',
          [tr('Nama Wali', 'Guardian Name')]: wali?.fullName || '-',
          [tr('Penerima KIP', 'Has KIP')]: s.economic?.hasKip ? 'Ya' : 'Tidak',
          [tr('Nomor KIP', 'KIP Number')]: s.economic?.kipNumber || '-',
          [tr('Layak PIP', 'Eligible PIP')]: s.economic?.layakPip ? 'Ya' : 'Tidak',
          [tr('Penerima PKH', 'Has PKH')]: s.economic?.hasPkh ? 'Ya' : 'Tidak',
          [tr('Penerima KKS/KPS', 'Has KKS/KPS')]: s.economic?.hasKks ? 'Ya' : 'Tidak',
          [tr('Nomor KKS/KPS', 'KKS/KPS Number')]: s.economic?.kksNumber || '-',
          [tr('Terdaftar DTKS', 'In DTKS')]: s.economic?.isDtks ? 'Ya' : 'Tidak',
          'Desil DTKS': s.economic?.desil ?? '-',
          Bank: s.bank || '-',
          [tr('No. Rekening', 'Account No.')]: s.noRekening || '-',
          Status: s.status,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();

      const textColumnIndices = new Set([1, 2, 3, 4, 15, 16, 24, 28, 32]);
      for (let r = 1; r <= excelData.length; r++) {
        for (const c of textColumnIndices) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = worksheet[cellRef];
          if (cell) {
            cell.t = 's';
            cell.z = '@';
          }
        }
      }

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 35 },
        { wch: 14 },
        { wch: 18 },
        { wch: 20 },
        { wch: 15 },
        { wch: 12 },
        { wch: 40 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 16 },
        { wch: 24 },
        { wch: 28 },
        { wch: 14 },
        { wch: 14 },
        { wch: 28 },
        { wch: 28 },
        { wch: 28 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
        { wch: 22 },
        { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data_Siswa');

      const dateStr = getLocalTodayIso();
      const fileName =
        selectedRows.length > 0
          ? `Data_Siswa_Terpilih_${dateStr}.xlsx`
          : `Data_Siswa_Keseluruhan_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      toast.success(tr('Export berhasil!', 'Export successful!'), { id: toastId });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, tr('Gagal melakukan export data', 'Export failed')), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const sortedClasses = useMemo(
    () => [...(classesData || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [classesData]
  );

  const hasWelfareDiffs = useMemo(
    () =>
      parsedImportData.some(
        (p) => p.diffAction === 'updated' && (p.diffFields || []).some(isWelfareLabel)
      ),
    [parsedImportData]
  );

  const actionableItems = useMemo(() => {
    return parsedImportData.filter((p) => {
      if (p.diffAction === 'new') return true;
      if (!applySmartUpdates) return false;
      const isOnlyWelfareDiff =
        (p.diffFields?.length ?? 0) > 0 && p.diffFields!.every(isWelfareLabel);
      if (preserveManualWelfare && isOnlyWelfareDiff) {
        return false;
      }
      return true;
    });
  }, [parsedImportData, applySmartUpdates, preserveManualWelfare]);

  const protectedWelfareItems = useMemo(() => {
    if (!applySmartUpdates || !preserveManualWelfare) return [];
    return parsedImportData.filter(
      (p) =>
        p.diffAction === 'updated' &&
        (p.diffFields?.length ?? 0) > 0 &&
        p.diffFields!.every(isWelfareLabel)
    );
  }, [parsedImportData, applySmartUpdates, preserveManualWelfare]);

  const actionableCount = actionableItems.length;
  const previewItems = useMemo(() => {
    if (actionableItems.length > 0) return actionableItems.slice(0, 8);
    return protectedWelfareItems.slice(0, 8);
  }, [actionableItems, protectedWelfareItems]);
  const total = meta?.total || 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* --- SMARTDIFF IMPORT WIZARD MODAL --- */}
      <AnimatePresence>
        {wizardState !== 'idle' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground">SmartDiff Import Dapodik</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                        <Sparkles size={11} /> Verval PD
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'Deteksi otomatis data baru, perubahan atribut, dan pemetaan rombel',
                        'Automatic detection of new records, field diffs, and class mapping'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 bg-card overflow-y-auto">
                {wizardState === 'parsing' && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                    <p className="font-medium text-foreground">
                      {tr('Membandingkan Excel dengan Database (SmartDiff)...', 'Comparing Excel against Database (SmartDiff)...')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tr('Memeriksa NISN, NIK, orang tua, bansos, dan kelas.', 'Checking NISN, NIK, parents, welfare, and classes.')}
                    </p>
                  </div>
                )}

                {wizardState === 'importing' && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                    <p className="font-medium text-foreground">
                      {tr('Menyimpan hasil sinkronisasi ke Database...', 'Saving synchronization results to Database...')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tr('Mohon jangan tutup jendela ini.', 'Please do not close this window.')}
                    </p>
                  </div>
                )}

                {wizardState === 'preview' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                      <span>
                        {tr(
                          `Total ${importStats.total} baris siswa terbaca dari file Excel`,
                          `Total ${importStats.total} student rows parsed from Excel`
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl text-center">
                        <span className="text-2xl font-black text-emerald-600">{importStats.newCount}</span>
                        <span className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mt-1">
                          {tr('Data Baru', 'New')}
                        </span>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-center">
                        <span className="text-2xl font-black text-amber-600">{importStats.updatedCount}</span>
                        <span className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mt-1">
                          {tr('Perubahan', 'Updated')}
                        </span>
                      </div>
                      <div className="bg-muted/40 border border-border p-3.5 rounded-xl text-center">
                        <span className="text-2xl font-black text-muted-foreground">{importStats.unchangedCount}</span>
                        <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                          {tr('Sama / Lewat', 'Unchanged')}
                        </span>
                      </div>
                    </div>

                    {importStats.updatedCount > 0 && (
                      <div className="space-y-2.5">
                        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={applySmartUpdates}
                            onChange={(e) => setApplySmartUpdates(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-emerald-600"
                          />
                          <div className="text-xs">
                            <p className="font-semibold text-foreground flex items-center gap-1.5">
                              <RefreshCw size={13} className="text-amber-600" />
                              {tr(
                                `Terapkan pembaruan pada ${importStats.updatedCount} siswa yang datanya berubah`,
                                `Apply updates to ${importStats.updatedCount} modified students`
                              )}
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              {tr(
                                'Jika tidak dicentang, sistem hanya menambahkan siswa baru dan melewati siswa lama.',
                                'If unchecked, only brand-new students will be inserted.'
                              )}
                            </p>
                          </div>
                        </label>

                        {applySmartUpdates && hasWelfareDiffs && (
                          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={preserveManualWelfare}
                              onChange={(e) => setPreserveManualWelfare(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-border accent-emerald-600"
                            />
                            <div className="text-xs">
                              <p className="font-semibold text-foreground flex items-center gap-1.5">
                                <ShieldCheck size={13} className="text-emerald-600" />
                                {tr(
                                  'Pertahankan data bansos (PKH / KIP / KKS / DTKS) yang sudah diedit manual',
                                  'Preserve manually edited welfare data (PKH / KIP / KKS / DTKS)'
                                )}
                              </p>
                              <p className="text-muted-foreground mt-0.5">
                                {tr(
                                  'Centang jika file Excel ini adalah file lama agar status PKH/KIP yang sudah Anda ubah manual tidak tertimpa.',
                                  'Check this if using an older Excel file so manual PKH/KIP edits are not overwritten.'
                                )}
                              </p>
                            </div>
                          </label>
                        )}
                      </div>
                    )}

                    {previewItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {actionableItems.length > 0
                            ? tr(
                              `Pratinjau Antrean (${previewItems.length} dari ${actionableItems.length})`,
                              `Queue Preview (${previewItems.length} of ${actionableItems.length})`
                            )
                            : tr(
                              `Data Bansos Dilindungi (${previewItems.length} dari ${protectedWelfareItems.length})`,
                              `Protected Welfare Records (${previewItems.length} of ${protectedWelfareItems.length})`
                            )}
                        </h4>
                        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden text-xs">
                          {previewItems.map((item, idx) => {
                            const isProtectedItem =
                              preserveManualWelfare &&
                              item.diffAction === 'updated' &&
                              (item.diffFields?.length ?? 0) > 0 &&
                              item.diffFields!.every(isWelfareLabel);

                            const visibleDiffs = preserveManualWelfare
                              ? (item.diffFields || []).filter((f) => !isWelfareLabel(f))
                              : item.diffFields || [];

                            return (
                              <div
                                key={`${item.nisn}-${idx}`}
                                className="flex items-center justify-between gap-2 px-3 py-2 bg-background"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate">{item.fullName}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {item.nisn} • {item.rawClassName}
                                    {isProtectedItem ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                        {' '}({tr('Dipertahankan', 'Preserved')}: {(item.diffFields || []).join(', ')})
                                      </span>
                                    ) : (
                                      visibleDiffs.length > 0 && (
                                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                                          {' '}({tr('Ubah', 'Diff')}: {visibleDiffs.join(', ')})
                                        </span>
                                      )
                                    )}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                    isProtectedItem
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                      : item.diffAction === 'updated'
                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  )}
                                >
                                  {isProtectedItem
                                    ? tr('Bansos Dilindungi', 'Protected')
                                    : item.diffAction === 'updated'
                                      ? tr('Perubahan', 'Updated')
                                      : tr('Baru', 'New')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {importStats.fileDuplicates > 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>
                            {tr(
                              `${importStats.fileDuplicates} baris ganda di dalam file Excel otomatis dilewati.`,
                              `${importStats.fileDuplicates} duplicate rows inside the Excel file were skipped.`
                            )}
                          </p>
                        </div>
                      )}

                      {importStats.missingMandatory > 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>
                            {tr(
                              `${importStats.missingMandatory} baris tanpa Nama dilewati.`,
                              `${importStats.missingMandatory} rows without a Name were skipped.`
                            )}
                          </p>
                        </div>
                      )}

                      {importStats.emptyClass > 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>
                            {tr(
                              `${importStats.emptyClass} siswa belum memiliki kolom Kelas/Rombel di Excel (akan disimpan tanpa kelas).`,
                              `${importStats.emptyClass} students have no Class column in Excel (will be imported unassigned).`
                            )}
                          </p>
                        </div>
                      )}

                      {importStats.missingClass > 0 && unmatchedClasses.length > 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="w-full">
                            <p className="font-semibold">
                              {tr(
                                `Kelas Baru Terdeteksi (${importStats.missingClass} Siswa):`,
                                `New Classes Detected (${importStats.missingClass} Students):`
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1">
                              {unmatchedClasses.map((className, idx) => (
                                <span
                                  key={idx}
                                  className="bg-indigo-500/20 px-2 py-0.5 rounded font-bold font-mono"
                                >
                                  {className}
                                </span>
                              ))}
                            </div>
                            <p className="italic opacity-90">
                              {tr(
                                '*Kelas di atas akan dibuat otomatis sebelum data siswa disimpan.',
                                '*These classes will be created automatically before importing students.'
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      {actionableCount === 0 && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>
                            {protectedWelfareItems.length > 0
                              ? tr(
                                'Semua perubahan yang terdeteksi hanya pada data bansos dan telah dilindungi agar tidak tertimpa. Data Anda sudah aman — silakan klik Tutup.',
                                'All detected changes are welfare fields and are being preserved. Your data is safe — you can click Close.'
                              )
                              : tr(
                                'Tidak ada antrean data baru/perubahan yang dipilih untuk diproses.',
                                'No new or modified records selected for processing.'
                              )}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {wizardState === 'preview' && (
                <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={closeImportWizard}
                    disabled={importMutation.isPending}
                  >
                    {tr('Tutup', 'Close')}
                  </Button>
                  <Button
                    onClick={executeImport}
                    disabled={importMutation.isPending || actionableCount === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {tr(
                      `Proses ${actionableCount} Data`,
                      `Process ${actionableCount} Records`
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- DELETE CONFIRMATION --- */}
      <AnimatePresence>
        {(studentToDelete || isBulkDeleting) && (
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
                  {tr('Hapus Data Siswa?', 'Delete Student Data?')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {isBulkDeleting
                    ? tr(
                      `Apakah Anda yakin ingin menghapus ${selectedRows.length} siswa yang dipilih?`,
                      `Are you sure you want to delete ${selectedRows.length} selected students?`
                    )
                    : tr(
                      `Apakah Anda yakin ingin menghapus siswa bernama "${studentToDelete?.name}"?`,
                      `Are you sure you want to delete "${studentToDelete?.name}"?`
                    )}
                </p>
              </div>
              <div className="bg-muted/50 p-4 flex justify-end gap-3 border-t border-border/50">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStudentToDelete(null);
                    setIsBulkDeleting(false);
                  }}
                  disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
                >
                  {tr('Batal', 'Cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    isBulkDeleting
                      ? bulkDeleteMutation.mutate(selectedRows)
                      : studentToDelete && deleteMutation.mutate(studentToDelete.id)
                  }
                  disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}
                >
                  {deleteMutation.isPending || bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  {tr('Ya, Hapus', 'Yes, Delete')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- WIPE ALL CONFIRMATION --- */}
      <AnimatePresence>
        {isDeletingAll && isSuperAdmin && Boolean(school?.id) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
                  {tr('KOSONGKAN SEMUA DATA?', 'WIPE ALL DATA?')}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {tr(
                    `Tindakan ini sangat berbahaya! Anda akan menghapus KESELURUHAN DATA SISWA (${total} Siswa) beserta data Orang Tua dan Kesejahteraannya dari sekolah ini. Tindakan ini tidak dapat dibatalkan.`,
                    `Dangerous action! This will wipe ALL STUDENT DATA (${total} Students) for this school. It cannot be undone.`
                  )}
                </p>
              </div>
              <div className="bg-muted/50 p-4 flex justify-end gap-3 border-t border-border/50">
                <Button
                  variant="outline"
                  onClick={() => setIsDeletingAll(false)}
                  disabled={deleteAllMutation.isPending}
                >
                  {tr('Batal', 'Cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteAllMutation.mutate()}
                  disabled={deleteAllMutation.isPending}
                >
                  {deleteAllMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  {tr('Ya, Hapus Semuanya!', 'Yes, Wipe Everything!')}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- PAGE HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('students.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr(`Total ${total} siswa terdaftar`, `${total} students registered`)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageData &&
            (selectedRows.length > 0 ? (
              <motion.button
                key="delete-selected"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setIsBulkDeleting(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition-colors shadow-sm"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">
                  {tr(`Hapus Terpilih (${selectedRows.length})`, `Delete Selected (${selectedRows.length})`)}
                </span>
              </motion.button>
            ) : isSuperAdmin && Boolean(school?.id) && total > 0 ? (
              <motion.button
                key="delete-all"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setIsDeletingAll(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors shadow-sm"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">{tr('Kosongkan Data', 'Wipe Data')}</span>
              </motion.button>
            ) : null)}

          {canManageData && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={wizardState !== 'idle'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Import Verval PD</span>
            </button>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">
              {selectedRows.length > 0
                ? tr(`Ekspor (${selectedRows.length})`, `Export (${selectedRows.length})`)
                : tr('Ekspor Data', 'Export Data')}
            </span>
          </button>

          {canManageData && (
            <Link
              to="/students/new"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all shadow-md"
            >
              <Plus size={16} />
              <span>{tr('Tambah Siswa', 'Add Student')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* --- FILTERS --- */}
      <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('students.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div className="relative min-w-44">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
            >
              <option value="all">{tr('Semua Kelas', 'All Classes')}</option>
              {sortedClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <ChevronDown size={16} />
            </div>
          </div>

          <div className="relative min-w-40">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-3.5 pr-8 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
            >
              <option value="all">{tr('Semua Status', 'All Status')}</option>
              <option value="AKTIF">{tr('Aktif', 'Active')}</option>
              <option value="MUTASI_KELUAR">{tr('Mutasi Keluar', 'Transferred')}</option>
              <option value="LULUS">{tr('Lulus', 'Graduated')}</option>
              <option value="DO">DO</option>
              <option value="CUTI">{tr('Cuti', 'On Leave')}</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {canManageData && (
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      checked={selectedRows.length === students.length && students.length > 0}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-border accent-emerald-600"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">
                  No
                </th>
                <SortableHeader columnKey="nisn" label="NISN / NIPD" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader columnKey="fullName" label={tr('Siswa', 'Student')} sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader columnKey="className" label={tr('Kelas', 'Class')} sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                  {tr('Aksi', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={canManageData ? 7 : 6} className="px-6 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
                    <p className="text-muted-foreground">{tr('Memuat...', 'Loading...')}</p>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={canManageData ? 7 : 6} className="px-6 py-12 text-center text-muted-foreground">
                    {tr('Tidak ada data.', 'No data available.')}
                  </td>
                </tr>
              ) : (
                students.map((student, idx) => {
                  const statusConf = getStatusConfig(student.status, locale);
                  return (
                    <motion.tr
                      key={student.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        selectedRows.includes(student.id) && 'bg-emerald-500/5'
                      )}
                    >
                      {canManageData && (
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(student.id)}
                            onChange={() => toggleRow(student.id)}
                            className="w-4 h-4 rounded border-border accent-emerald-600"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-muted-foreground">
                        {(currentPage - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">{student.nisn}</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {student.nis && student.nis !== '-' ? student.nis : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {student.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{student.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {student.gender === 'L' ? tr('Laki-laki', 'Male') : tr('Perempuan', 'Female')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{student.className || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-md border', statusConf.color)}>
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/students/${student.id}`}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canManageData && (
                            <>
                              <Link
                                to={`/students/${student.id}/edit`}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </Link>
                              <button
                                onClick={() => setStudentToDelete({ id: student.id, name: student.fullName })}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
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
        {total > 0 && (
          <div className="p-4 border-t border-border/50 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              {tr(
                `Menampilkan ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, total)} dari ${total} siswa`,
                `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, total)} of ${total} students`
              )}
            </span>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2 border-r border-border pr-4">
                <span>{tr('Lompat ke:', 'Jump to:')}</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = Math.trunc(Number(jumpPage));
                      if (p >= 1 && p <= totalPages) setCurrentPage(p);
                      else setJumpPage(String(currentPage));
                    }
                  }}
                  onBlur={() => {
                    const p = Math.trunc(Number(jumpPage));
                    if (p >= 1 && p <= totalPages) setCurrentPage(p);
                    else setJumpPage(String(currentPage));
                  }}
                  className="w-14 h-8 text-center bg-background border border-border rounded-md focus:outline-none focus:border-emerald-500"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <ChevronsLeft size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <ChevronLeft size={16} />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          'w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors border',
                          currentPage === page
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-background border-border/50 hover:bg-muted text-muted-foreground'
                        )}
                      >
                        {page}
                      </button>
                    );
                  }
                  if (Math.abs(currentPage - page) === 2) {
                    return (
                      <span key={`ellipsis-${page}`} className="text-muted-foreground px-1">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              >
                <ChevronRight size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <ChevronsRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}