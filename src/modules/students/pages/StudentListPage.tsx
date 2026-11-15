// src/modules/students/pages/StudentListPage.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Upload,
  Download,
  Search,
  Eye,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { useTranslation } from '@/hooks/useTranslation';
import {
  studentService,
  MANAGE_STUDENT_ROLES,
  calculatePipPriorityScore,
} from '../services/student.service';
import type {
  StudentBulkImportItem,
  CreateStudentParentPayload,
  StudentStatus,
} from '../types/student.types';
import type { EconomicCategory } from '@/types/common.types';
import { supabase } from '@/services/supabase.client';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/modules/auth/store/auth.store';

// ==========================================
// TYPES
// ==========================================
type ExcelRow = Record<string, string>;
type ClassRow = { id: string; name: string; gradeLevel: number };
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DetectedExcelType = 'student' | 'teacher' | 'unknown';

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
  houseOwnership?: string | null;
  houseCondition?: string | null;
  dependentsCount?: number | null;
  desil?: number | null;
  isOrphan?: boolean | null;
  orphanType?: 'YATIM' | 'PIATU' | 'YATIM_PIATU' | 'BUKAN' | null;
  pipScore?: number | null;
  economicCategory?: EconomicCategory | null;
  scoringDetails?: Record<string, unknown> | null;
  scoredAt?: string | null;
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
  status: StudentStatus;
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
// ERROR HANDLING HELPER
// ==========================================
/**
 * Mengubah berbagai bentuk error (API/Axios, Supabase, Validasi, Jaringan, atau Runtime JS)
 * menjadi pesan yang jelas dan ramah bagi pengguna.
 */
const extractFriendlyErrorMessage = (
  error: unknown,
  locale: string,
  fallbackId: string,
  fallbackEn: string
): string => {
  const isId = locale === 'id';
  const fallback = isId ? fallbackId : fallbackEn;

  if (!error) return fallback;

  if (typeof error === 'object' && error !== null) {
    const errObj = error as {
      response?: {
        data?: {
          message?: string | string[];
          error?: string;
        };
      };
      message?: string;
      details?: string;
      hint?: string;
    };

    // 1. Prioritaskan pesan error spesifik dari backend/API
    const apiMessage = errObj.response?.data?.message;
    if (Array.isArray(apiMessage) && apiMessage.length > 0) {
      return apiMessage.join(', ');
    }
    if (typeof apiMessage === 'string' && apiMessage.trim() !== '') {
      return apiMessage;
    }
    if (typeof errObj.response?.data?.error === 'string' && errObj.response.data.error.trim() !== '') {
      return errObj.response.data.error;
    }

    // 2. Tangani error JavaScript / Supabase / jaringan agar tidak menampilkan pesan teknis mentah
    if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
      const rawMsg = errObj.message;

      if (
        rawMsg.includes('Cannot read properties') ||
        rawMsg.includes('is not a function') ||
        rawMsg.includes('is not iterable')
      ) {
        return isId
          ? 'Terjadi kesalahan saat membaca struktur file Excel. Pastikan format kolom sesuai template Verval PD.'
          : 'An error occurred while reading the Excel structure. Ensure columns match the Verval PD template.';
      }

      if (
        rawMsg.toLowerCase().includes('network error') ||
        rawMsg.toLowerCase().includes('failed to fetch')
      ) {
        return isId
          ? 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.'
          : 'Connection to server failed. Check your internet connection and try again.';
      }

      if (typeof errObj.details === 'string' && errObj.details.trim() !== '') {
        return `${rawMsg} (${errObj.details})`;
      }

      return rawMsg;
    }
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }

  return fallback;
};

// ==========================================
// CONSTANTS & PURE HELPERS
// ==========================================
const DEFAULT_PAGE_SIZE = 10;
const WELFARE_DIFF_LABELS = ['KIP', 'PIP', 'KKS/KPS', 'PKH', 'DTKS/Desil'] as const;
const VALID_STUDENT_STATUSES = new Set<StudentStatus>([
  'AKTIF',
  'MUTASI_KELUAR',
  'LULUS',
  'DO',
  'CUTI',
]);

// Penanda khusus untuk membedakan Excel Siswa vs Excel Guru (PTK)
const STUDENT_COLUMN_MARKERS = new Set([
  'nisn',
  'nipd',
  'rombel saat ini',
  'rombel',
  'kelas',
  'data ayah',
  'nama ayah',
  'data ibu',
  'nama ibu',
  'data wali',
  'penerima kip',
  'nomor kip',
  'no. kip',
  'layak pip (usulan dari sekolah)',
  'layak pip',
  'penerima kps',
  'sekolah asal',
  'anak ke-berapa',
]);

const TEACHER_COLUMN_MARKERS = new Set([
  'nuptk',
  'nip',
  'status kepegawaian',
  'jenis ptk',
  'jenis ptk (jabatan)',
  'tugas tambahan',
  'sk cpns',
  'tanggal cpns',
  'sk pengangkatan',
  'tmt pengangkatan',
  'lembaga pengangkatan',
  'pangkat golongan',
  'pangkat/golongan',
  'sumber gaji',
  'tmt pns',
  'karpeg',
  'nuks',
  'sudah lisensi kepala sekolah',
]);

const normText = (val: unknown): string =>
  String(val ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const detectStudentExcelSource = (
  sheetNames: string[],
  topRows: unknown[][],
  cleanHeaders: string[]
): DetectedExcelType => {
  const normSheets = (sheetNames || []).map((s) => normText(s));
  const topText = (topRows || [])
    .slice(0, 4)
    .flat()
    .map((c) => normText(c))
    .join(' | ');

  const hasTeacherBanner =
    normSheets.some((s) => s === 'daftar guru' || s === 'template_guru_ptk' || s === 'data guru') ||
    topText.includes('daftar guru') ||
    topText.includes('daftar ptk');

  const hasStudentBanner =
    normSheets.some(
      (s) => s === 'daftar peserta didik' || s === 'template_siswa' || s === 'data_siswa'
    ) || topText.includes('daftar peserta didik');

  let studentScore = 0;
  let teacherScore = 0;

  for (const h of cleanHeaders || []) {
    const norm = normText(h);
    if (!norm) continue;
    if (STUDENT_COLUMN_MARKERS.has(norm)) studentScore++;
    if (TEACHER_COLUMN_MARKERS.has(norm)) teacherScore++;
  }

  if (hasTeacherBanner && !hasStudentBanner) return 'teacher';
  if (teacherScore >= 2 && teacherScore > studentScore) return 'teacher';
  if (!hasStudentBanner && studentScore === 0) return 'unknown';

  return 'student';
};

const isWelfareLabel = (label: string): boolean =>
  (WELFARE_DIFF_LABELS as readonly string[]).includes(label);

const getLocalTodayIso = (): string => {
  return new Date().toLocaleDateString('en-CA');
};

const sanitizeExcelCell = (val: unknown): string | number => {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') return val;
  const str = String(val);
  if (/^[=+@-]/.test(str) && str !== '-' && !/^-\d+(\.\d+)?$/.test(str)) {
    return `'${str}`;
  }
  return str;
};

const getStatusConfig = (status: string, locale: string) => {
  const isId = locale === 'id';
  const config: Record<string, { label: string; color: string }> = {
    AKTIF: {
      label: isId ? 'Aktif' : 'Active',
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    MUTASI_KELUAR: {
      label: isId ? 'Mutasi' : 'Transferred',
      color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    LULUS: {
      label: isId ? 'Lulus' : 'Graduated',
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    },
    DO: {
      label: isId ? 'DO' : 'Dropped Out',
      color: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
    CUTI: {
      label: isId ? 'Cuti' : 'On Leave',
      color: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    },
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
    .replace(/^'+/, '')
    .replace(/â€“/g, '-')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '(tidak diisi)' || cleaned.toLowerCase() === 'null') {
    return '';
  }
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

const cleanNamaKip = (val: unknown): string | null => {
  const cleaned = cleanDapodikText(val);
  if (!cleaned) return null;
  if (['0', '1', '-', 'ya', 'tidak'].includes(cleaned.toLowerCase())) return null;
  return cleaned;
};

const getValidNumber = (val: unknown, min = 0): number | null => {
  if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '-') {
    return null;
  }
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

const parseStudentStatus = (raw: string, fallback: StudentStatus = 'AKTIF'): StudentStatus => {
  const upper = cleanDapodikText(raw).toUpperCase().replace(/\s+/g, '_');
  if (!upper) return fallback;
  if (VALID_STUDENT_STATUSES.has(upper as StudentStatus)) {
    return upper as StudentStatus;
  }
  if (upper === 'AKTIF' || upper === 'ACTIVE') return 'AKTIF';
  if (upper.startsWith('MUTASI') || upper === 'TRANSFERRED') return 'MUTASI_KELUAR';
  if (upper === 'LULUS' || upper === 'GRADUATED') return 'LULUS';
  if (upper === 'DO' || upper === 'DROPPED_OUT') return 'DO';
  if (upper === 'CUTI' || upper === 'ON_LEAVE') return 'CUTI';
  return fallback;
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
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
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
  if (!str || str === '-') return fallback;

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
  if (!raw || raw === '-') return null;
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
  const fullName = cleanDapodikText(
    pick(
      row,
      `data ${who} nama`,
      `nama ${who}`,
      who === 'ayah' ? 'father name' : who === 'ibu' ? 'mother name' : 'guardian name'
    )
  );
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
        bank, noRekening, namaRekening, classId, entryDate, status,
        student_parents(relation, fullName, nik, birthYear, education, occupation, monthlyIncome),
        student_economics(*)
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
  if (incoming.status && existing.status !== incoming.status) {
    diffs.add('Status');
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

  const exEco = existing.student_economics;
  const incEco = incoming.economic;
  if (incEco) {
    const kipChanged =
      Boolean(exEco?.hasKip) !== Boolean(incEco.hasKip) ||
      (Boolean(incEco.hasKip) && incEco.kipNumber && norm(exEco?.kipNumber) !== norm(incEco.kipNumber)) ||
      (Boolean(incEco.hasKip) && incEco.namaKip && norm(exEco?.namaKip) !== norm(incEco.namaKip));

    const pipChanged =
      Boolean(exEco?.layakPip) !== Boolean(incEco.layakPip) ||
      (Boolean(incEco.layakPip) &&
        incEco.alasanLayakPip &&
        norm(exEco?.alasanLayakPip) !== norm(incEco.alasanLayakPip));

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

  const schoolInfo = school as {
    id?: string;
    name?: string;
    city?: string;
    province?: string;
  } | null;

  const initialRoles = useMemo(
    () =>
      Array.from(
        new Set([
          ...((user as { roles?: string[] } | null)?.roles || []),
          ...(user?.role ? [user.role] : []),
        ])
      ),
    [user]
  );

  const [resolvedSchoolId, setResolvedSchoolId] = useState<string>(schoolInfo?.id || '');
  const [canManageData, setCanManageData] = useState<boolean>(() =>
    initialRoles.some((r) => (MANAGE_STUDENT_ROLES as readonly string[]).includes(r))
  );
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() =>
    initialRoles.includes('SUPER_ADMIN')
  );

  // Sinkronisasi Role Multi-Role & SchoolId aktif (v14)
  useEffect(() => {
    let mounted = true;
    async function resolvePermissions() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return;

        const [{ data: profile }, { data: allRoles }] = await Promise.all([
          supabase.from('users').select('schoolId, role').eq('id', authUser.id).maybeSingle(),
          supabase.rpc('get_user_all_roles'),
        ]);

        const effectiveRoles: string[] = Array.from(
          new Set([
            ...(Array.isArray(allRoles) ? (allRoles as string[]) : []),
            ...(profile?.role ? [profile.role] : []),
            ...initialRoles,
          ])
        );

        if (!mounted) return;
        setCanManageData(
          effectiveRoles.some((r) => (MANAGE_STUDENT_ROLES as readonly string[]).includes(r))
        );
        setIsSuperAdmin(effectiveRoles.includes('SUPER_ADMIN'));
        setResolvedSchoolId(schoolInfo?.id || profile?.schoolId || '');
      } catch {
        if (mounted) {
          setResolvedSchoolId(schoolInfo?.id || '');
        }
      }
    }
    resolvePermissions();
    return () => {
      mounted = false;
    };
  }, [schoolInfo?.id, initialRoles]);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [jumpPage, setJumpPage] = useState<string>('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [wizardState, setWizardState] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [parsedImportData, setParsedImportData] = useState<StudentBulkImportItem[]>([]);
  const [existingWelfareMap, setExistingWelfareMap] = useState<
    Record<string, ExistingEconomicSnapshot>
  >({});
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
  }, [debouncedSearch, selectedClass, selectedStatus, currentPage, pageSize]);

  // --- QUERIES ---
  const { data: classesData } = useQuery({
    queryKey: ['classes-list', resolvedSchoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .eq('schoolId', resolvedSchoolId)
        .order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data as ClassRow[];
    },
    enabled: Boolean(resolvedSchoolId),
  });

  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year', resolvedSchoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('academic_years')
        .select('id')
        .eq('schoolId', resolvedSchoolId)
        .eq('isActive', true)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(resolvedSchoolId),
  });

  const {
    data: studentsResponse,
    isLoading,
    isError,
    error: studentsQueryError,
    refetch: refetchStudents,
  } = useQuery({
    queryKey: [
      'students',
      resolvedSchoolId,
      currentPage,
      pageSize,
      debouncedSearch,
      selectedClass,
      selectedStatus,
      sortConfig,
    ],
    queryFn: () =>
      studentService.list({
        schoolId: resolvedSchoolId || undefined,
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch,
        classId: selectedClass === 'all' ? undefined : selectedClass,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        sortBy: sortConfig?.key,
        sortOrder: sortConfig?.direction,
      }),
    enabled: isSuperAdmin || Boolean(resolvedSchoolId),
  });

  const students = studentsResponse?.data?.data || [];
  const meta = studentsResponse?.data?.meta;
  const total = meta?.total || 0;
  const totalPages = meta?.totalPages || Math.ceil(total / pageSize) || 1;
  const isExportDisabled =
    isExporting || isLoading || total === 0 || students.length === 0;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // --- MUTATIONS ---
  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentService.delete(id, resolvedSchoolId || undefined),
    onSuccess: (_res, deletedId) => {
      toast.success(tr('Siswa berhasil dihapus', 'Student deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows((prev) => prev.filter((r) => r !== deletedId));
      setStudentToDelete(null);
    },
    onError: (error: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          error,
          locale,
          'Gagal menghapus data siswa.',
          'Failed to delete student record.'
        )
      );
      setStudentToDelete(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => studentService.deleteMany(ids, resolvedSchoolId || undefined),
    onSuccess: (res) => {
      toast.success(
        res.message ||
        tr(
          `${res.data.deleted} data berhasil dihapus`,
          `${res.data.deleted} data deleted successfully`
        )
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      setIsBulkDeleting(false);
    },
    onError: (error: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          error,
          locale,
          'Gagal menghapus data siswa terpilih.',
          'Failed to delete selected students.'
        )
      );
      setIsBulkDeleting(false);
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      if (!isSuperAdmin) {
        throw new Error(
          tr(
            'Hanya Super Admin yang dapat mengosongkan data.',
            'Only Super Admin can wipe all data.'
          )
        );
      }
      if (!resolvedSchoolId) {
        throw new Error(tr('Data sekolah belum termuat.', 'School data is not loaded yet.'));
      }
      const svc = studentService as typeof studentService & {
        deleteAll?: (schoolId: string) => Promise<{ message?: string }>;
      };
      if (svc.deleteAll) {
        return svc.deleteAll(resolvedSchoolId);
      }
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('schoolId', resolvedSchoolId);
      if (error) throw error;
      return {
        message: tr(
          'Seluruh data siswa berhasil dikosongkan.',
          'All student data wiped successfully.'
        ),
      };
    },
    onSuccess: (res) => {
      toast.success(
        res?.message || tr('Seluruh data berhasil dihapus', 'All data deleted successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setSelectedRows([]);
      setCurrentPage(1);
      setIsDeletingAll(false);
    },
    onError: (error: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          error,
          locale,
          'Gagal mengosongkan seluruh data siswa.',
          'Failed to wipe all student records.'
        )
      );
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
      setImportError(null);
      closeImportWizard();
    },
    onError: (error: unknown) => {
      const msg = extractFriendlyErrorMessage(
        error,
        locale,
        'Gagal menyinkronkan data siswa ke database.',
        'Failed to sync student data to database.'
      );
      setImportError(msg);
      toast.error(msg, { duration: 6000 });
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

  const sortedClasses = useMemo(
    () => [...(classesData || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [classesData]
  );

  // --- DOWNLOAD TEMPLATE EXCEL (v14) ---
  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        Nama: 'Budi Santoso',
        NIPD: '2026001',
        JK: 'L',
        NISN: '0091234567',
        'Tempat Lahir': 'Sleman',
        'Tanggal Lahir': '2011-05-14',
        NIK: '3404071405110001',
        Agama: 'ISLAM',
        Alamat: 'Jl. Berbah No. 10',
        RT: '001',
        RW: '002',
        Dusun: 'Sribit',
        Kelurahan: 'Sendangtirto',
        Kecamatan: 'Berbah',
        'Kabupaten/Kota': schoolInfo?.city || 'Kabupaten Sleman',
        Provinsi: schoolInfo?.province || 'DI Yogyakarta',
        HP: '081234567890',
        'Rombel Saat Ini': sortedClasses[0]?.name || 'VII A',
        'Nama Ayah': 'Slamet Riyadi',
        'Pekerjaan Ayah': 'Wiraswasta',
        'Penghasilan Ayah': 'Rp 1.000.000 - Rp 1.999.999',
        'Nama Ibu': 'Siti Aminah',
        'Pekerjaan Ibu': 'Ibu Rumah Tangga',
        'Penghasilan Ibu': 'Tidak Berpenghasilan',
        'Penerima KIP': 'Tidak',
        'Nomor KIP': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Siswa');
    XLSX.writeFile(wb, 'Template_Import_Siswa_Dapodik_v14.xlsx');
    toast.success(tr('Template Excel berhasil diunduh', 'Excel template downloaded'));
  };

  // --- SMARTDIFF IMPORT PARSER + SKOR PIP v14 ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset pesan error lama setiap kali pengguna memilih file baru
    setImportError(null);

    if (!canManageData) {
      const msg = tr(
        'Anda tidak memiliki izin mengimpor data siswa.',
        'You do not have permission to import student data.'
      );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    if (!resolvedSchoolId) {
      const msg = isSuperAdmin
        ? tr(
          'Super Admin wajib memilih sekolah aktif terlebih dahulu sebelum melakukan import.',
          'Super Admin must select an active school before importing.'
        )
        : tr(
          'Pilih sekolah aktif terlebih dahulu sebelum mengimpor data PD.',
          'Select an active school before importing student data.'
        );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    // Validasi ekstensi file sebelum diproses
    const lowerFileName = file.name.toLowerCase();
    if (
      !lowerFileName.endsWith('.xlsx') &&
      !lowerFileName.endsWith('.xls') &&
      !lowerFileName.endsWith('.csv')
    ) {
      const msg = tr(
        'Format file tidak didukung. Harap unggah file Excel (.xlsx, .xls) atau CSV.',
        'Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file.'
      );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    setWizardState('parsing');
    const toastId = toast.loading(
      tr('Menganalisis file Excel Dapodik PD...', 'Analyzing Dapodik Student Excel...')
    );

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target?.result, { type: 'array' });
        if (!workbook.SheetNames || !workbook.SheetNames.length) {
          throw new Error(
            tr(
              'File Excel tidak memiliki lembar kerja (sheet) yang valid.',
              'The Excel file does not contain any valid worksheet.'
            )
          );
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
            const currentRow = Array.isArray(sheetRows[i]) ? sheetRows[i] : [];
            const rowText = currentRow.map((cell) =>
              String(cell ?? '').toLowerCase().replace(/\s+/g, '')
            );
            const hasNameCol = rowText.some(
              (c) =>
                c === 'nama' ||
                c === 'namalengkap' ||
                c === 'namapesertadidik' ||
                c === 'fullname'
            );
            const hasIdCol = rowText.some((c) =>
              ['nipd', 'nis', 'nisn', 'nuptk', 'nip', 'jk', 'jeniskelamin', 'l/p', 'gender'].includes(
                c
              )
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
              'Format kolom tidak dikenali (Kolom Nama / NISN / JK tidak ditemukan).',
              'Invalid column format (Missing Name / NISN / Gender).'
            )
          );
        }

        // Array.from memastikan tidak ada slot kosong (sparse array) saat di-loop
        const rawMain = Array.isArray(rawData[headerRowIndex]) ? rawData[headerRowIndex] : [];
        const rawSub = Array.isArray(rawData[headerRowIndex + 1]) ? rawData[headerRowIndex + 1] : [];
        const rowMain = Array.from(rawMain, (c) => String(c ?? ''));
        const rowSub = Array.from(rawSub, (c) => String(c ?? ''));

        const hasGroupedSubHeader = rowMain.some((cell) => {
          const lower = String(cell ?? '').toLowerCase();
          return (
            lower.includes('data ayah') ||
            lower.includes('data ibu') ||
            lower.includes('data wali')
          );
        });

        let currentGroup = '';
        const cleanHeaders: string[] = [];

        if (hasGroupedSubHeader) {
          for (let c = 0; c < Math.max(rowMain.length, rowSub.length); c++) {
            const vMain = String(rowMain[c] ?? '')
              .trim()
              .replace(/[\r\n]+/g, ' ');
            const vSub = String(rowSub[c] ?? '')
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
        } else {
          for (let c = 0; c < rowMain.length; c++) {
            const vMain = String(rowMain[c] ?? '')
              .trim()
              .replace(/[\r\n]+/g, ' ');
            cleanHeaders.push(vMain.toLowerCase().trim());
          }
        }

        // Validasi silang: Pastikan file yang diunggah benar-benar file Siswa, bukan file Guru (PTK)
        const detectedType = detectStudentExcelSource(
          workbook.SheetNames,
          rawData.slice(0, headerRowIndex),
          cleanHeaders
        );

        if (detectedType === 'teacher') {
          throw new Error(
            tr(
              'File ditolak! File yang Anda pilih adalah file Data Guru / PTK (terdeteksi kolom NUPTK / Status Kepegawaian / Jenis PTK). Silakan impor file ini di menu Guru & Pegawai, atau pilih file Daftar Peserta Didik (Verval PD).',
              'File rejected! You uploaded a Teacher / PTK file (detected NUPTK / Employment Status). Please import this file in the Teachers & Staff menu, or select a Student (Verval PD) file.'
            )
          );
        }

        if (detectedType === 'unknown') {
          throw new Error(
            tr(
              'Format file tidak dikenali sebagai data Siswa (Verval PD). Pastikan file memiliki kolom khas siswa seperti NISN, NIPD, atau Rombel/Kelas.',
              'Unrecognized file format for Student data (Verval PD). Ensure the file contains student columns such as NISN, NIPD, or Class.'
            )
          );
        }

        const dataStartIndex = hasGroupedSubHeader ? headerRowIndex + 2 : headerRowIndex + 1;
        const data: ExcelRow[] = rawData.slice(dataStartIndex).map((rowArray) => {
          const rowObject: ExcelRow = {};
          cleanHeaders.forEach((header, index) => {
            if (header && Array.isArray(rowArray)) {
              const cellValue = rowArray[index];
              rowObject[header] =
                cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
            }
          });
          return rowObject;
        });

        if (data.length === 0) {
          throw new Error(
            tr(
              'File Excel kosong atau tidak memiliki baris data di bawah header.',
              'Empty Excel file or no data rows found below the header.'
            )
          );
        }

        const existingStudents = await fetchExistingStudentsSnapshot(resolvedSchoolId);
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
          const nameVal = cleanDapodikText(
            pick(row, 'nama', 'nama lengkap', 'nama peserta didik', 'full name')
          );
          const nipdVal = pick(row, 'nipd', 'nis');
          const nisnVal = pick(row, 'nisn');

          if (!nameVal && !nipdVal && !nisnVal) continue;

          if (!nameVal) {
            missingMandatoryCount++;
            continue;
          }
          validNamedRows++;

          const fullName = nameVal;
          const birthDate = parseExcelDate(pick(row, 'tanggal lahir', 'birth date'), todayLocal);
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
            const byNameDob = existingByNameDob.get(`${fullName.toLowerCase()}|${birthDate}`);
            if (byNameDob && (!rawNisn || byNameDob.nisn.startsWith('TK-'))) {
              matchedExisting = byNameDob;
            }
          }

          const resolvedNisn =
            rawNisn ||
            matchedExisting?.nisn ||
            buildDeterministicFallbackId(
              'TK',
              `${resolvedSchoolId}|${fullName.toLowerCase()}|${birthDate}`
            );

          if (seenNisnInFile.has(resolvedNisn)) {
            fileDuplicateCount++;
            continue;
          }
          seenNisnInFile.add(resolvedNisn);

          let parsedNis: string | null = cleanNumericId(nipdVal) || null;
          if (parsedNis) {
            const nisOwnerId = existingNisOwner.get(parsedNis);
            if (
              seenNisInFile.has(parsedNis) ||
              (nisOwnerId && nisOwnerId !== matchedExisting?.id)
            ) {
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
            buildDeterministicFallbackId('NONIK', `${resolvedSchoolId}|${resolvedNisn}`);

          const nikOwnerId = existingNikOwner.get(resolvedNik);
          if (
            seenNikInFile.has(resolvedNik) ||
            (nikOwnerId && nikOwnerId !== matchedExisting?.id)
          ) {
            resolvedNik =
              matchedExisting?.nik && !seenNikInFile.has(matchedExisting.nik)
                ? matchedExisting.nik
                : buildDeterministicFallbackId('NONIK', `${resolvedSchoolId}|${resolvedNisn}`);
          }
          seenNikInFile.add(resolvedNik);

          const alamatRaw = cleanDapodikText(pick(row, 'alamat', 'address'));
          const dusunRaw = cleanDapodikText(row['dusun']);
          let finalAddress = alamatRaw;
          if (dusunRaw && !finalAddress.toLowerCase().includes(dusunRaw.toLowerCase())) {
            finalAddress = finalAddress
              ? `${finalAddress}, Dusun ${dusunRaw}`
              : `Dusun ${dusunRaw}`;
          }

          const rombelKey = Object.keys(row).find(
            (k) => k.includes('rombel') || k.includes('kelas') || k === 'class'
          );
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

          const rawEntryDate = pick(row, 'tanggal masuk', 'tanggal masuk sekolah', 'entry date');
          const resolvedEntryDate = rawEntryDate
            ? parseExcelDate(rawEntryDate, '') || null
            : matchedExisting?.entryDate
              ? matchedExisting.entryDate.split('T')[0]
              : null;

          const rawReligion = cleanDapodikText(pick(row, 'agama', 'religion')).toUpperCase();
          const resolvedReligion =
            rawReligion === 'KATHOLIK'
              ? 'KATOLIK'
              : rawReligion === 'BUDHA'
                ? 'BUDDHA'
                : rawReligion || null;

          const rawGender = cleanDapodikText(
            pick(row, 'jk', 'jenis kelamin', 'l/p', 'gender')
          ).toUpperCase();
          const resolvedGender: 'L' | 'P' =
            rawGender.startsWith('L') || rawGender === 'MALE'
              ? 'L'
              : rawGender.startsWith('P') || rawGender === 'FEMALE'
                ? 'P'
                : (matchedExisting?.gender as 'L' | 'P') || 'L';

          const rawStatus = pick(row, 'status');
          const resolvedStatus = parseStudentStatus(
            rawStatus,
            matchedExisting?.status || 'AKTIF'
          );

          // Normalisasi data bansos + Kalkulasi Skor PIP v14
          const rawKipNumber =
            cleanNumericId(pick(row, 'nomor kip', 'no. kip', 'no kip', 'kip number')) || null;
          const hasKip = toBool(pick(row, 'penerima kip', 'has kip')) || Boolean(rawKipNumber);
          const kipNumber = hasKip ? rawKipNumber : null;
          const namaKip = hasKip ? cleanNamaKip(row['nama di kip']) : null;

          const layakPip = toBool(
            pick(row, 'layak pip (usulan dari sekolah)', 'layak pip', 'eligible pip')
          );
          const alasanLayakPip = layakPip
            ? cleanDapodikText(row['alasan layak pip']) || null
            : null;

          const rawKksNumber =
            cleanNumericId(
              pick(row, 'no. kps', 'nomor kks', 'no kks', 'nomor kks/kps', 'kks/kps number')
            ) || null;
          const hasKks =
            toBool(pick(row, 'penerima kps', 'penerima kks', 'penerima kks/kps', 'has kks/kps')) ||
            Boolean(rawKksNumber);
          const kksNumber = hasKks ? rawKksNumber : null;
          const hasPkh = toBool(pick(row, 'penerima pkh', 'has pkh'));
          const isDtks = toBool(pick(row, 'dtks', 'terdaftar dtks', 'in dtks'));
          const desil = parseDesil(row);

          const existingEco = matchedExisting?.student_economics;
          const ayahParent = parents.find((p) => p.relation === 'AYAH');
          const ibuParent = parents.find((p) => p.relation === 'IBU');

          const pipCalc = calculatePipPriorityScore(
            {
              hasKip,
              layakPip,
              hasPkh,
              hasKks,
              isDtks,
              desil,
              houseOwnership: existingEco?.houseOwnership ?? null,
              houseCondition: existingEco?.houseCondition ?? null,
              orphanType: existingEco?.orphanType ?? null,
            },
            {
              fullName: ayahParent?.fullName || '',
              monthlyIncome: ayahParent?.monthlyIncome || null,
            },
            {
              fullName: ibuParent?.fullName || '',
              monthlyIncome: ibuParent?.monthlyIncome || null,
            }
          );

          const candidate: StudentBulkImportItem = {
            id: matchedExisting?.id,
            schoolId: resolvedSchoolId,
            nis: parsedNis,
            nisn: resolvedNisn,
            nik: resolvedNik,
            noKk: rawNoKk || matchedExisting?.noKk || null,
            fullName,
            gender: resolvedGender,
            birthPlace: cleanDapodikText(pick(row, 'tempat lahir', 'birth place')) || '-',
            birthDate,
            religion: resolvedReligion,
            address: finalAddress || '-',
            dusun: dusunRaw,
            rt: cleanDapodikText(row['rt']),
            rw: cleanDapodikText(row['rw']),
            kelurahan: cleanDapodikText(pick(row, 'kelurahan', 'desa/kelurahan', 'village')),
            kecamatan: cleanDapodikText(pick(row, 'kecamatan', 'district')),
            city:
              cleanDapodikText(pick(row, 'kabupaten/kota', 'kab/kota', 'kota', 'city')) ||
              schoolInfo?.city ||
              '-',
            province:
              cleanDapodikText(pick(row, 'provinsi', 'province')) || schoolInfo?.province || '-',
            postalCode: cleanNumericId(row['kode pos']),
            telepon: cleanNumericId(row['telepon']),
            phone: cleanNumericId(
              pick(row, 'hp', 'no. hp', 'no hp', 'handphone', 'no. hp/telepon', 'phone number')
            ),
            email: cleanDapodikText(pick(row, 'e-mail', 'email')),
            anakKe: getValidNumber(row['anak ke-berapa'], 1),
            jmlSaudara: getValidNumber(row['jml. saudara kandung'], 0),
            lintang: cleanDapodikText(row['lintang']),
            bujur: cleanDapodikText(row['bujur']),
            beratBadan: getValidNumber(
              pick(row, 'berat badan', 'berat badan (kg)', 'weight (kg)'),
              0
            ),
            tinggiBadan: getValidNumber(
              pick(row, 'tinggi badan', 'tinggi badan (cm)', 'height (cm)'),
              0
            ),
            lingkarKepala: getValidNumber(row['lingkar kepala'], 0),
            jarakSekolah: getValidNumber(
              pick(row, 'jarak rumah ke sekolah (km)', 'jarak rumah ke sekolah', 'jarak sekolah'),
              0
            ),
            jenisTinggal: cleanDapodikText(row['jenis tinggal']),
            alatTransportasi: cleanDapodikText(row['alat transportasi']),
            sekolahAsal: cleanDapodikText(pick(row, 'sekolah asal', 'previous school')),
            kebutuhanKhusus: cleanDapodikText(row['kebutuhan khusus']),
            classId: matchedClass?.id || matchedExisting?.classId || null,
            rawClassName: rawExcelRombel || 'Belum Ada Kelas',
            entryDate: resolvedEntryDate,
            status: resolvedStatus,
            skhun: cleanDapodikText(row['skhun']),
            noPesertaUn: cleanDapodikText(row['no peserta ujian nasional']),
            noIjazah: cleanDapodikText(row['no seri ijazah']),
            noAktaLahir: cleanDapodikText(
              pick(row, 'no registrasi akta lahir', 'no. akta lahir', 'birth cert no.')
            ),
            bank: cleanDapodikText(row['bank']),
            noRekening: cleanNumericId(
              pick(row, 'nomor rekening bank', 'no. rekening', 'account no.')
            ),
            namaRekening: cleanDapodikText(row['rekening atas nama']),
            parents: parents.length > 0 ? parents : undefined,
            economic: {
              hasKip,
              kipNumber,
              namaKip,
              layakPip,
              alasanLayakPip,
              hasPkh,
              hasKks,
              kksNumber,
              isDtks,
              desil,
              houseOwnership: existingEco?.houseOwnership ?? null,
              houseCondition: existingEco?.houseCondition ?? null,
              dependentsCount: existingEco?.dependentsCount ?? null,
              isOrphan: existingEco?.isOrphan ?? false,
              orphanType: existingEco?.orphanType ?? null,
              pipScore: pipCalc.pipScore,
              economicCategory: pipCalc.economicCategory,
              scoringDetails: pipCalc.scoringDetails,
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

        if (validNamedRows === 0) {
          throw new Error(
            tr(
              'Tidak ada baris data siswa yang valid (seluruh kolom Nama kosong).',
              'No valid student rows found (all Name columns are empty).'
            )
          );
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
        toast.dismiss(toastId);
      } catch (error: unknown) {
        const msg = extractFriendlyErrorMessage(
          error,
          locale,
          'Gagal membaca file Excel Verval PD. Periksa kembali format file Anda.',
          'Failed to parse Verval PD Excel file. Please check your file format.'
        );
        setImportError(msg);
        toast.error(msg, { id: toastId, duration: 6000 });
        setWizardState('idle');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      const msg = tr(
        'Gagal membaca file dari perangkat Anda. Pastikan file tidak sedang dibuka di aplikasi lain.',
        'Failed to read file from your device. Ensure the file is not open in another program.'
      );
      setImportError(msg);
      toast.error(msg, { id: toastId, duration: 6000 });
      setWizardState('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // --- EXECUTE SMARTDIFF IMPORT ---
  const executeImport = async () => {
    if (!resolvedSchoolId) {
      const msg = isSuperAdmin
        ? tr(
          'Super Admin wajib memilih sekolah aktif terlebih dahulu.',
          'Super Admin must select an active school first.'
        )
        : tr('Data sekolah belum termuat.', 'School data is not loaded yet.');
      setImportError(msg);
      toast.error(msg);
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
      toast.error(
        tr(
          'Tidak ada data baru atau perubahan yang dipilih.',
          'No new or updated data selected.'
        )
      );
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
      const msg = tr(
        'Tahun Ajaran Aktif tidak ditemukan! Silakan aktifkan Tahun Ajaran terlebih dahulu agar kelas dapat dibuat otomatis.',
        'Active Academic Year not found! Please activate an academic year first.'
      );
      setImportError(msg);
      toast.error(msg, { duration: 6000 });
      return;
    }

    setWizardState('importing');

    try {
      const createdClassByNorm = new Map<string, string>();
      let currentClasses: ClassRow[] = classesData || [];

      if (neededUnmatchedClasses.length > 0 && activeYear?.id) {
        const classesToCreate = neededUnmatchedClasses.map((className) => ({
          schoolId: resolvedSchoolId,
          academicYearId: activeYear.id,
          name: className,
          gradeLevel: guessGradeLevel(className),
          capacity: 32,
        }));

        const { data: newClasses, error: classError } = await supabase
          .from('classes')
          .upsert(classesToCreate, { onConflict: 'schoolId,academicYearId,name' })
          .select('id, name, gradeLevel');

        if (classError) {
          throw new Error(
            tr(
              `Gagal membuat kelas otomatis: ${classError.message}`,
              `Failed to auto-create classes: ${classError.message}`
            )
          );
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
        queryClient.setQueryData(['classes-list', resolvedSchoolId], currentClasses);
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
                houseOwnership: existingEco.houseOwnership ?? null,
                houseCondition: existingEco.houseCondition ?? null,
                dependentsCount: existingEco.dependentsCount ?? null,
                desil: existingEco.desil ?? null,
                isOrphan: Boolean(existingEco.isOrphan),
                orphanType: existingEco.orphanType ?? null,
                pipScore: existingEco.pipScore ?? null,
                economicCategory: existingEco.economicCategory ?? null,
                scoringDetails: existingEco.scoringDetails ?? null,
                scoredAt: existingEco.scoredAt ?? null,
              }
              : undefined
            : payload.economic;

        return { ...payload, classId: updatedClassId || null, economic: savedEco };
      });

      importMutation.mutate(finalPayload);
    } catch (error: unknown) {
      const msg = extractFriendlyErrorMessage(
        error,
        locale,
        'Gagal memproses data import siswa.',
        'Failed to process student import data.'
      );
      setImportError(msg);
      toast.error(msg, { duration: 6000 });
      setWizardState('preview');
    }
  };

  // --- EXPORT ---
  const handleExport = async () => {
    if (isExportDisabled) return;

    setIsExporting(true);
    const toastId = toast.loading(tr('Menyiapkan file Excel...', 'Preparing Excel file...'));
    try {
      const response = await studentService.exportAll(resolvedSchoolId || undefined);
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
          NISN: sanitizeExcelCell(s.nisn),
          NIS: s.nis && s.nis !== '-' ? sanitizeExcelCell(s.nis) : '-',
          NIK: sanitizeExcelCell(s.nik || '-'),
          'No. KK': sanitizeExcelCell(s.noKk || '-'),
          [tr('Nama Lengkap', 'Full Name')]: sanitizeExcelCell(s.fullName),
          [tr('L/P', 'Gender')]:
            s.gender === 'L' ? tr('Laki-laki', 'Male') : tr('Perempuan', 'Female'),
          [tr('Kelas', 'Class')]: sanitizeExcelCell(s.className || '-'),
          [tr('Tempat Lahir', 'Birth Place')]: sanitizeExcelCell(s.birthPlace || '-'),
          [tr('Tanggal Lahir', 'Birth Date')]: s.birthDate ? formatDate(s.birthDate) : '-',
          [tr('Agama', 'Religion')]: sanitizeExcelCell(s.religion || '-'),
          [tr('Alamat', 'Address')]: sanitizeExcelCell(s.address || '-'),
          [tr('Desa/Kelurahan', 'Village')]: sanitizeExcelCell(s.kelurahan || '-'),
          [tr('Kecamatan', 'District')]: sanitizeExcelCell(s.kecamatan || '-'),
          [tr('Kab/Kota', 'City')]: sanitizeExcelCell(s.city || '-'),
          [tr('No. HP/Telepon', 'Phone Number')]: sanitizeExcelCell(s.phone || s.telepon || '-'),
          [tr('No. Akta Lahir', 'Birth Cert No.')]: sanitizeExcelCell(s.noAktaLahir || '-'),
          [tr('Sekolah Asal', 'Previous School')]: sanitizeExcelCell(s.sekolahAsal || '-'),
          [tr('Berat Badan (kg)', 'Weight (kg)')]: s.beratBadan ?? '-',
          [tr('Tinggi Badan (cm)', 'Height (cm)')]: s.tinggiBadan ?? '-',
          [tr('Nama Ayah', 'Father Name')]: sanitizeExcelCell(ayah?.fullName || '-'),
          [tr('Nama Ibu', 'Mother Name')]: sanitizeExcelCell(ibu?.fullName || '-'),
          [tr('Nama Wali', 'Guardian Name')]: sanitizeExcelCell(wali?.fullName || '-'),
          [tr('Penerima KIP', 'Has KIP')]: s.economic?.hasKip ? 'Ya' : 'Tidak',
          [tr('Nomor KIP', 'KIP Number')]: sanitizeExcelCell(s.economic?.kipNumber || '-'),
          [tr('Layak PIP', 'Eligible PIP')]: s.economic?.layakPip ? 'Ya' : 'Tidak',
          [tr('Penerima PKH', 'Has PKH')]: s.economic?.hasPkh ? 'Ya' : 'Tidak',
          [tr('Penerima KKS/KPS', 'Has KKS/KPS')]: s.economic?.hasKks ? 'Ya' : 'Tidak',
          [tr('Nomor KKS/KPS', 'KKS/KPS Number')]: sanitizeExcelCell(s.economic?.kksNumber || '-'),
          [tr('Terdaftar DTKS', 'In DTKS')]: s.economic?.isDtks ? 'Ya' : 'Tidak',
          'Desil DTKS': s.economic?.desil ?? '-',
          'Skor PIP': s.economic?.pipScore ?? 0,
          [tr('Kategori Ekonomi', 'Economic Category')]: sanitizeExcelCell(
            s.economic?.economicCategory || 'REGULER'
          ),
          Bank: sanitizeExcelCell(s.bank || '-'),
          [tr('No. Rekening', 'Account No.')]: sanitizeExcelCell(s.noRekening || '-'),
          Status: s.status,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();

      const textColumnIndices = new Set([1, 2, 3, 4, 15, 16, 24, 28, 34]);
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
        { wch: 10 },
        { wch: 18 },
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
      const msg = extractFriendlyErrorMessage(
        error,
        locale,
        'Gagal mengekspor data siswa.',
        'Failed to export student data.'
      );
      toast.error(msg, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

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
                        'Deteksi otomatis data baru, perubahan atribut, skor PIP, dan pemetaan rombel',
                        'Automatic detection of new records, field diffs, PIP score, and class mapping'
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
                      {tr(
                        'Membandingkan Excel dengan Database (SmartDiff)...',
                        'Comparing Excel against Database (SmartDiff)...'
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tr(
                        'Memeriksa NISN, NIK, orang tua, bansos, skor PIP, dan kelas.',
                        'Checking NISN, NIK, parents, welfare, PIP score, and classes.'
                      )}
                    </p>
                  </div>
                )}

                {wizardState === 'importing' && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                    <p className="font-medium text-foreground">
                      {tr(
                        'Menyimpan hasil sinkronisasi ke Database...',
                        'Saving synchronization results to Database...'
                      )}
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
                        <span className="text-2xl font-black text-emerald-600">
                          {importStats.newCount}
                        </span>
                        <span className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mt-1">
                          {tr('Data Baru', 'New')}
                        </span>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-center">
                        <span className="text-2xl font-black text-amber-600">
                          {importStats.updatedCount}
                        </span>
                        <span className="block text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mt-1">
                          {tr('Perubahan', 'Updated')}
                        </span>
                      </div>
                      <div className="bg-muted/40 border border-border p-3.5 rounded-xl text-center">
                        <span className="text-2xl font-black text-muted-foreground">
                          {importStats.unchangedCount}
                        </span>
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
                                  <p className="font-semibold text-foreground truncate">
                                    {item.fullName}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {item.nisn} • {item.rawClassName} • PIP:{' '}
                                    {item.economic?.pipScore ?? 0}
                                    {isProtectedItem ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                        {' '}
                                        ({tr('Dipertahankan', 'Preserved')}:{' '}
                                        {(item.diffFields || []).join(', ')})
                                      </span>
                                    ) : (
                                      visibleDiffs.length > 0 && (
                                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                                          {' '}
                                          ({tr('Ubah', 'Diff')}: {visibleDiffs.join(', ')})
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
        {isDeletingAll && isSuperAdmin && Boolean(resolvedSchoolId) && (
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
                  {tr(
                    `Hapus Terpilih (${selectedRows.length})`,
                    `Delete Selected (${selectedRows.length})`
                  )}
                </span>
              </motion.button>
            ) : isSuperAdmin && Boolean(resolvedSchoolId) && total > 0 ? (
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
            <>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" />
                <span className="hidden sm:inline">{tr('Template', 'Template')}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!resolvedSchoolId || wizardState !== 'idle'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50"
              >
                {wizardState === 'parsing' ? (
                  <Loader2 size={16} className="animate-spin text-emerald-600" />
                ) : (
                  <Upload size={16} />
                )}
                <span className="hidden sm:inline">
                  {wizardState === 'parsing'
                    ? tr('Membaca...', 'Reading...')
                    : tr('Impor Verval PD', 'Import Verval PD')}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={isExportDisabled}
            title={
              total === 0 || students.length === 0
                ? tr('Tidak ada data siswa untuk diekspor', 'No student data to export')
                : undefined
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:hover:bg-muted/50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">
              {selectedRows.length > 0
                ? tr(`Ekspor (${selectedRows.length})`, `Export (${selectedRows.length})`)
                : tr('Ekspor Data', 'Export Data')}
            </span>
          </button>

          {canManageData && resolvedSchoolId && (
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

      {/* --- BANNER ERROR IMPOR EXCEL (PERSISTEN) --- */}
      {importError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-xs sm:text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold">
                {tr('Gagal Memproses Impor Data Siswa', 'Failed to Process Student Import')}
              </p>
              <p className="mt-0.5 leading-relaxed">{importError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImportError(null)}
            title={tr('Tutup pesan error', 'Dismiss error')}
            className="p-1 rounded-lg text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isSuperAdmin && !resolvedSchoolId && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {tr('Mode Super Admin Lintas Sekolah', 'Cross-School Super Admin Mode')}
            </p>
            <p className="mt-0.5">
              {tr(
                'Pilih sekolah aktif terlebih dahulu pada switcher sekolah untuk menambah siswa baru atau mengimpor Excel Verval PD.',
                'Select an active school from the school switcher before adding new students or importing Verval PD Excel.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* --- FILTERS --- */}
      <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder={t('students.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={cn(
                'w-full pl-9 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all',
                searchInput ? 'pr-8' : 'pr-4'
              )}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                title={tr('Hapus pencarian', 'Clear search')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative min-w-44">
            <Filter
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
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
                <SortableHeader
                  columnKey="nisn"
                  label="NISN / NIPD"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <SortableHeader
                  columnKey="fullName"
                  label={tr('Siswa', 'Student')}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <SortableHeader
                  columnKey="className"
                  label={tr('Kelas', 'Class')}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
                <SortableHeader
                  columnKey="status"
                  label="Status"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
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
              ) : isError ? (
                <tr>
                  <td colSpan={canManageData ? 7 : 6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="h-8 w-8" />
                      <p className="font-semibold">
                        {tr('Gagal memuat data siswa.', 'Failed to load student data.')}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-md">
                        {extractFriendlyErrorMessage(
                          studentsQueryError,
                          locale,
                          'Terjadi gangguan saat mengambil daftar siswa dari server.',
                          'An issue occurred while fetching the student list from the server.'
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => refetchStudents()}
                        className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:bg-muted transition-colors shadow-sm"
                      >
                        <RefreshCw size={14} />
                        <span>{tr('Muat Ulang', 'Retry')}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManageData ? 7 : 6}
                    className="px-6 py-12 text-center text-muted-foreground"
                  >
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
                        {(currentPage - 1) * pageSize + idx + 1}
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
                              {student.gender === 'L'
                                ? tr('Laki-laki', 'Male')
                                : tr('Perempuan', 'Female')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{student.className || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-xs font-medium px-2.5 py-1 rounded-md border',
                            statusConf.color
                          )}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/students/${student.id}`}
                            className="p-2 text-emerald-600 hover:bg-emerald-500/10 rounded-md transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canManageData && (
                            <>
                              <Link
                                to={`/students/${student.id}/edit`}
                                className="p-2 text-blue-600 hover:bg-blue-500/10 rounded-md transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() =>
                                  setStudentToDelete({ id: student.id, name: student.fullName })
                                }
                                className="p-2 text-red-600 hover:bg-red-500/10 rounded-md transition-colors"
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
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {tr(
                  `Menampilkan ${(currentPage - 1) * pageSize + 1} - ${Math.min(
                    currentPage * pageSize,
                    total
                  )} dari ${total} siswa`,
                  `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(
                    currentPage * pageSize,
                    total
                  )} of ${total} students`
                )}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-emerald-500"
              >
                <option value={10}>10 / hal</option>
                <option value={15}>15 / hal</option>
                <option value={25}>25 / hal</option>
                <option value={50}>50 / hal</option>
              </select>
            </div>

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

export default StudentListPage;