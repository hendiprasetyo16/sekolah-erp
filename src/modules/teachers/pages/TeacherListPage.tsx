import { useState, useRef, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2, Loader2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  X, AlertTriangle, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown,
  FileSpreadsheet, CheckCircle2, RefreshCw, Sparkles, Filter, ZoomIn,
  ShieldCheck, KeyRound, Globe, MonitorSmartphone, Clock, Users, History,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import {
  teacherService,
  normalizeTeacherSchoolId,
} from '../services/teacher.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
  TeacherDetail,
  TeacherBulkImportItem,
  TeacherDiffAction,
  TeacherSecurityAuditItem,
} from '../types/teacher.types';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import { TeacherSubjectAssignmentSection } from '../components/TeacherSubjectAssignmentSection';

// ==========================================
// TYPES & CONSTANTS
// ==========================================
type ExcelRow = Record<string, unknown>;
type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;
type DeleteModalState = { isOpen: boolean; type: 'single' | 'bulk' | 'all'; id?: string };
type DiffFilterTab = 'all' | 'new' | 'updated' | 'unchanged';
type DetectedExcelType = 'teacher' | 'student' | 'unknown';
type PhotoPreviewState = { id: string; fullName: string; photoUrl: string } | null;
type ActiveMainTab = 'directory' | 'subject_assignments' | 'security_audit';

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

const DIFF_FIELD_LABELS_ID: Record<keyof TeacherBulkImportItem, string> = {
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
  allowDesktopAttendance: 'Presensi PC',
  baseSalary: 'Gaji Pokok',
  subjects: 'Mapel',
  maxHoursPerWeek: 'Jam Mengajar',
};

const DIFF_FIELD_LABELS_EN: Record<keyof TeacherBulkImportItem, string> = {
  schoolId: 'School',
  fullName: 'Full Name',
  gender: 'Gender',
  nip: 'NIP',
  nuptk: 'NUPTK',
  nik: 'NIK',
  noKk: 'Family Card No.',
  birthPlace: 'Birth Place',
  birthDate: 'Birth Date',
  religion: 'Religion',
  address: 'Address',
  dusun: 'Hamlet',
  rt: 'RT',
  rw: 'RW',
  kelurahan: 'Village',
  kecamatan: 'District',
  city: 'City/Regency',
  province: 'Province',
  postalCode: 'Postal Code',
  telepon: 'Landline',
  phone: 'Mobile Phone',
  email: 'Email',
  status: 'Employment Status',
  position: 'Position',
  joinDate: 'Join Date',
  tugasTambahan: 'Additional Duty',
  skCpns: 'CPNS Decree',
  tanggalCpns: 'CPNS Date',
  skPengangkatan: 'Appointment Decree',
  tmtPengangkatan: 'Appointment TMT',
  lembagaPengangkatan: 'Appointing Body',
  pangkatGolongan: 'Rank/Grade',
  sumberGaji: 'Salary Source',
  tmtPns: 'PNS TMT',
  karpeg: 'Karpeg',
  namaIbuKandung: 'Mother Name',
  statusPerkawinan: 'Marital Status',
  namaSuamiIstri: 'Spouse Name',
  nipSuamiIstri: 'Spouse NIP',
  pekerjaanSuamiIstri: 'Spouse Occupation',
  karisKarsu: 'Karis/Karsu',
  kewarganegaraan: 'Nationality',
  npwp: 'Tax ID (NPWP)',
  namaWajibPajak: 'Taxpayer Name',
  bank: 'Bank',
  nomorRekeningBank: 'Account Number',
  rekeningAtasNama: 'Account Holder',
  lintang: 'Latitude',
  bujur: 'Longitude',
  nuks: 'NUKS',
  sudahLisensiKepalaSekolah: 'Principal License',
  pernahDiklatKepengawasan: 'Supervisory Training',
  keahlianBraille: 'Braille Skill',
  keahlianBahasaIsyarat: 'Sign Language Skill',
  id: 'ID',
  diffAction: 'Action',
  diffFields: 'Changes',
  photoUrl: 'Photo',
  education: 'Education',
  major: 'Major',
  university: 'University',
  isCertified: 'Certified',
  certificationNumber: 'Certification No.',
  isActive: 'Active',
  allowDesktopAttendance: 'Desktop Attendance',
  baseSalary: 'Base Salary',
  subjects: 'Subjects',
  maxHoursPerWeek: 'Max Weekly Hours',
};

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
    };

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

    if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
      const rawMsg = errObj.message;

      if (
        rawMsg.includes('Cannot read properties') ||
        rawMsg.includes('is not a function') ||
        rawMsg.includes('is not iterable')
      ) {
        return isId
          ? 'Terjadi kesalahan saat membaca struktur file Excel. Pastikan format kolom sesuai template Verval PTK.'
          : 'An error occurred while reading the Excel structure. Ensure columns match the Verval PTK template.';
      }

      if (
        rawMsg.toLowerCase().includes('network error') ||
        rawMsg.toLowerCase().includes('failed to fetch')
      ) {
        return isId
          ? 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.'
          : 'Connection to server failed. Check your internet connection and try again.';
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
// HELPERS FORMAT TANGGAL & DEVICE AUDIT
// ==========================================
const formatAuditDateTime = (
  iso?: string | null,
  locale = 'id'
): { date: string; time: string } | null => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-GB';
  const date = dt.toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
  const time = dt.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
  return { date, time: `${time} WIB` };
};

const summarizeUserAgent = (ua?: string | null, locale = 'id'): string => {
  if (!ua) return '-';
  const lower = ua.toLowerCase();
  let os = locale === 'id' ? 'Perangkat Lain' : 'Other Device';
  if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('linux')) os = 'Linux';

  let browser = '';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Chrome';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Safari';

  return browser ? `${os} • ${browser}` : os;
};

// ==========================================
// PURE EXCEL PARSING & SMARTDIFF HELPERS
// ==========================================
const normKey = (k: unknown): string =>
  String(k ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

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

const detectTeacherExcelSource = (
  sheetNames: string[],
  topRows: unknown[][],
  headerCells: string[]
): DetectedExcelType => {
  const normSheets = (sheetNames || []).map((s) => normKey(s));
  const topText = (topRows || [])
    .slice(0, 4)
    .flat()
    .map((c) => normKey(c))
    .join(' | ');

  const hasStudentBanner =
    normSheets.some(
      (s) => s === 'daftar peserta didik' || s === 'template_siswa' || s === 'data_siswa'
    ) || topText.includes('daftar peserta didik');

  const hasTeacherBanner =
    normSheets.some((s) => s === 'daftar guru' || s === 'template_guru_ptk' || s === 'data guru') ||
    topText.includes('daftar guru') ||
    topText.includes('daftar ptk');

  let teacherScore = 0;
  let studentScore = 0;

  for (const h of headerCells) {
    const norm = normKey(h);
    if (!norm) continue;
    if (TEACHER_COLUMN_MARKERS.has(norm)) teacherScore++;
    if (STUDENT_COLUMN_MARKERS.has(norm)) studentScore++;
  }

  if (hasStudentBanner && !hasTeacherBanner) return 'student';
  if (studentScore >= 2 && studentScore > teacherScore) return 'student';
  if (!hasTeacherBanner && teacherScore === 0) return 'unknown';

  return 'teacher';
};

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
      const cleaned = String(v)
        .replace(/^'+/, '')
        .replace(/\s+/g, ' ')
        .trim();
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
  if (u.includes('KEPERCAYAAN')) return 'KEPERCAYAAN';
  return u;
};

const normalizeMaritalStatusDapodik = (val: string | null): string | null => {
  if (!val) return null;
  const u = val.toUpperCase();
  if (u === 'KAWIN') return 'Kawin';
  if (u === 'BELUM KAWIN') return 'Belum Kawin';
  if (u === 'JANDA/DUDA' || u === 'JANDA' || u === 'DUDA') return 'Janda/Duda';
  return val;
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

const serialToIso = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
};

const parseExcelDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return serialToIso(value);

  const str = String(value).replace(/^'+/, '').trim();
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
      statusPerkawinan: normalizeMaritalStatusDapodik(getVal(row, ['Status Perkawinan'])),
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
  return String(val).replace(/^'+/, '').replace(/\s+/g, ' ').trim();
};

const DATE_COMPARE_KEYS = new Set<keyof TeacherBulkImportItem>([
  'birthDate',
  'joinDate',
  'tanggalCpns',
  'tmtPengangkatan',
  'tmtPns',
]);

const UPPER_COMPARE_KEYS = new Set<keyof TeacherBulkImportItem>([
  'gender',
  'religion',
  'status',
]);

const computeSmartDiff = (
  incoming: TeacherBulkImportItem[],
  existingList: TeacherDetail[],
  locale = 'id'
): { rows: TeacherBulkImportItem[]; duplicateCount: number } => {
  const byNip = new Map<string, TeacherDetail>();
  const byNuptk = new Map<string, TeacherDetail>();
  const byNik = new Map<string, TeacherDetail>();
  const byNameBirth = new Map<string, TeacherDetail>();

  const fieldLabels = locale === 'id' ? DIFF_FIELD_LABELS_ID : DIFF_FIELD_LABELS_EN;
  const safeExistingList = Array.isArray(existingList) ? existingList : [];

  for (const t of safeExistingList) {
    if (t.nip) byNip.set(normCompare(t.nip), t);
    if (t.nuptk) byNuptk.set(normCompare(t.nuptk), t);
    if (t.nik) byNik.set(normCompare(t.nik), t);
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
    'city',
    'province',
    'postalCode',
    'telepon',
    'phone',
    'email',
    'status',
    'position',
    'joinDate',
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

  const seenNip = new Set<string>();
  const seenNuptk = new Set<string>();
  const seenNik = new Set<string>();
  const seenNameBirth = new Set<string>();

  let duplicateCount = 0;
  const rows: TeacherBulkImportItem[] = [];

  for (const item of incoming) {
    const normNip = item.nip ? normCompare(item.nip) : '';
    const normNuptk = item.nuptk ? normCompare(item.nuptk) : '';
    const normNik = item.nik ? normCompare(item.nik) : '';
    const normNameBirth =
      item.fullName && item.birthDate
        ? `${item.fullName.trim().toLowerCase()}|${item.birthDate}`
        : '';

    const isInternalDuplicate =
      (normNip !== '' && seenNip.has(normNip)) ||
      (normNuptk !== '' && seenNuptk.has(normNuptk)) ||
      (normNik !== '' && seenNik.has(normNik)) ||
      (normNameBirth !== '' && seenNameBirth.has(normNameBirth));

    if (isInternalDuplicate) {
      duplicateCount++;
      continue;
    }

    if (normNip) seenNip.add(normNip);
    if (normNuptk) seenNuptk.add(normNuptk);
    if (normNik) seenNik.add(normNik);
    if (normNameBirth) seenNameBirth.add(normNameBirth);

    const matched =
      (normNip ? byNip.get(normNip) : undefined) ||
      (normNuptk ? byNuptk.get(normNuptk) : undefined) ||
      (normNik ? byNik.get(normNik) : undefined) ||
      (normNameBirth ? byNameBirth.get(normNameBirth) : undefined);

    if (!matched) {
      rows.push({
        ...item,
        diffAction: 'new' as TeacherDiffAction,
        diffFields: [],
      });
      continue;
    }

    const changedLabels: string[] = [];
    for (const key of comparedKeys) {
      const nextVal = item[key];
      const prevVal = matched[key as keyof TeacherDetail];

      if (key !== 'tugasTambahan' && (nextVal === null || nextVal === undefined || nextVal === '')) {
        continue;
      }

      let normNext = DATE_COMPARE_KEYS.has(key)
        ? normCompare(nextVal).split('T')[0]
        : normCompare(nextVal);
      let normPrev = DATE_COMPARE_KEYS.has(key)
        ? normCompare(prevVal).split('T')[0]
        : normCompare(prevVal);

      if (UPPER_COMPARE_KEYS.has(key)) {
        normNext = normNext.toUpperCase();
        normPrev = normPrev.toUpperCase();
      }

      if (normNext !== normPrev) {
        changedLabels.push(fieldLabels[key] || String(key));
      }
    }

    rows.push({
      ...item,
      id: matched.id,
      diffAction: (changedLabels.length > 0 ? 'updated' : 'unchanged') as TeacherDiffAction,
      diffFields: changedLabels,
    });
  }

  return { rows, duplicateCount };
};

const generatePagination = (current: number, total: number): (number | string)[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
};

// ==========================================
// SUB-COMPONENT: TEACHER AVATAR CELL
// ==========================================
interface TeacherAvatarCellProps {
  id: string;
  fullName: string;
  photoUrl?: string | null;
  previewTitle: string;
  onPreview?: (preview: { id: string; fullName: string; photoUrl: string }) => void;
}

function TeacherAvatarCell({
  id,
  fullName,
  photoUrl,
  previewTitle,
  onPreview,
}: TeacherAvatarCellProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [photoUrl]);

  const initial = (fullName || '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(photoUrl && !hasError);

  if (showImage) {
    return (
      <button
        type="button"
        title={previewTitle}
        aria-label={previewTitle}
        onClick={(e) => {
          e.stopPropagation();
          onPreview?.({ id, fullName, photoUrl: photoUrl! });
        }}
        className="group/avatar relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-emerald-500/25 bg-muted shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <img
          src={photoUrl!}
          alt={fullName}
          loading="lazy"
          onError={() => setHasError(true)}
          className="h-full w-full object-cover transition-transform duration-150 group-hover/avatar:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/avatar:opacity-100">
          <ZoomIn className="h-3.5 w-3.5 text-white" />
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-100 text-xs font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300">
      {initial}
    </div>
  );
}

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
  const ariaSort =
    direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTableCellElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSort(columnKey);
    }
  };

  return (
    <th
      scope="col"
      tabIndex={0}
      aria-sort={ariaSort}
      onKeyDown={handleKeyDown}
      className={cn(
        'px-4 py-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 focus:outline-none focus:bg-muted/50 transition-colors select-none',
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
  const { school, user: currentUser } = useAuthStore();
  const { hasPermission, hasRole } = usePermission();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isId = locale === 'id';
  const tr = (idText: string, enText: string) => (isId ? idText : enText);

  const schoolInfo = school as {
    id?: string;
    name?: string;
    city?: string;
    province?: string;
  } | null;

  const isSuperAdmin = hasRole('SUPER_ADMIN');
  const activeSchoolId = useMemo(
    () => normalizeTeacherSchoolId(schoolInfo?.id) ?? normalizeTeacherSchoolId(currentUser?.schoolId),
    [schoolInfo?.id, currentUser?.schoolId]
  );

  const teacherScope = useTeacherScope(activeSchoolId);
  const isRestrictedToSelf = !teacherScope.hasFullAcademicAccess;

  const canCreateTeacher = hasPermission('teachers', 'create');
  const canUpdateTeacher = hasPermission('teachers', 'update');
  const canDeleteTeacher = hasPermission('teachers', 'delete');
  const canImportTeacher = hasPermission('teachers', 'import');
  const canExportTeacher = hasPermission('teachers', 'export');
  const canClearAllTeachers = isSuperAdmin && canDeleteTeacher && Boolean(activeSchoolId);

  const canViewAssignmentsTab =
    Boolean(activeSchoolId) &&
    (isSuperAdmin ||
      teacherScope.hasFullAcademicAccess ||
      canUpdateTeacher ||
      canCreateTeacher ||
      Boolean(teacherScope.teacherId));
  const showMainTabSwitcher = isSuperAdmin || canViewAssignmentsTab;

  // Tab Utama (Direktori Guru vs Penugasan Mapel vs Audit Keamanan Login & Password Khusus Super Admin)
  const [activeMainTab, setActiveMainTab] = useState<ActiveMainTab>('directory');

  // Filter, Pagination, Selection & Sort State
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [certifiedFilter, setCertifiedFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'fullName', direction: 'asc' });

  // State Filter & Modal Log Keamanan (Khusus Super Admin)
  const [auditSearchInput, setAuditSearchInput] = useState('');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditFilterMode, setAuditFilterMode] = useState<
    'all' | 'logged_in' | 'never_logged_in' | 'password_changed'
  >('all');
  const [selectedAuditTeacher, setSelectedAuditTeacher] =
    useState<TeacherSecurityAuditItem | null>(null);

  // Photo Lightbox Preview State
  const [photoPreview, setPhotoPreview] = useState<PhotoPreviewState>(null);

  // Export & Delete Modal State
  const [isExporting, setIsExporting] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, type: 'single' });

  // SmartDiff Import Wizard & Error State
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreviewRows, setImportPreviewRows] = useState<TeacherBulkImportItem[]>([]);
  const [importSkippedCount, setImportSkippedCount] = useState(0);
  const [importDuplicateCount, setImportDuplicateCount] = useState(0);
  const [diffFilterTab, setDiffFilterTab] = useState<DiffFilterTab>('all');

  // Reset seluruh state kontekstual sekolah saat sekolah aktif berganti
  useEffect(() => {
    setSelectedRows([]);
    setCurrentPage(1);
    setPageInputValue('1');
    setImportError(null);
    setImportModalOpen(false);
    setImportPreviewRows([]);
    setImportFileName('');
    setImportSkippedCount(0);
    setImportDuplicateCount(0);
    setDeleteModal({ isOpen: false, type: 'single' });
    setSelectedAuditTeacher(null);
  }, [activeSchoolId]);

  useEffect(() => {
    if (!isSuperAdmin && activeMainTab === 'security_audit') {
      setActiveMainTab('directory');
    } else if (!canViewAssignmentsTab && activeMainTab === 'subject_assignments') {
      setActiveMainTab('directory');
    }
  }, [isSuperAdmin, canViewAssignmentsTab, activeMainTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuditSearchQuery(auditSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [auditSearchInput]);

  useEffect(() => {
    setPageInputValue(currentPage.toString());
  }, [currentPage]);

  useEffect(() => {
    if (!canDeleteTeacher && selectedRows.length > 0) {
      setSelectedRows([]);
    }
  }, [canDeleteTeacher, selectedRows.length]);

  const parsedCertifiedFilter =
    certifiedFilter === 'all' ? undefined : certifiedFilter === 'true';

  // --- QUERIES ---
  const {
    data: teachersResponse,
    isLoading: isTeachersQueryLoading,
    isError,
    error: teachersQueryError,
    refetch: refetchTeachers,
  } = useQuery({
    queryKey: [
      'teachers',
      activeSchoolId,
      isSuperAdmin,
      isRestrictedToSelf,
      teacherScope.teacherId,
      currentPage,
      PAGE_SIZE,
      searchQuery,
      statusFilter,
      certifiedFilter,
      sortConfig,
    ],
    queryFn: async () => {
      if (isRestrictedToSelf && !teacherScope.teacherId) {
        return {
          success: true,
          data: {
            data: [],
            meta: {
              total: 0,
              page: 1,
              limit: PAGE_SIZE,
              totalPages: 0,
              hasNext: false,
              hasPrev: false,
            },
          },
          message: 'Profil guru belum tertaut',
        };
      }

      return teacherService.list({
        schoolId: activeSchoolId ?? undefined,
        teacherId: isRestrictedToSelf ? (teacherScope.teacherId ?? undefined) : undefined,
        page: currentPage,
        limit: PAGE_SIZE,
        search: searchQuery,
        status: statusFilter,
        isCertified: parsedCertifiedFilter,
        sortBy: sortConfig?.key,
        sortOrder: sortConfig?.direction,
      });
    },
    enabled: !teacherScope.isLoading && (isSuperAdmin || Boolean(activeSchoolId)),
  });

  // Query Khusus SUPER_ADMIN: Audit Login & Ganti Password Guru
  const {
    data: securityAuditResponse,
    isLoading: isSecurityAuditLoading,
    refetch: refetchSecurityAudit,
  } = useQuery({
    queryKey: ['teacher-security-audit', activeSchoolId, auditSearchQuery],
    queryFn: () =>
      teacherService.getTeacherSecurityAuditList({
        schoolId: activeSchoolId ?? null,
        search: auditSearchQuery,
      }),
    enabled: isSuperAdmin && activeMainTab === 'security_audit',
  });

  // Query Khusus SUPER_ADMIN: Riwayat Detail Log Login & Password untuk Guru Terpilih
  const {
    data: selectedUserLogsResponse,
    isLoading: isSelectedUserLogsLoading,
  } = useQuery({
    queryKey: [
      'teacher-security-audit-logs',
      selectedAuditTeacher?.userId,
      selectedAuditTeacher?.schoolId,
    ],
    queryFn: () =>
      teacherService.getUserSecurityAuditLogs({
        targetUserId: selectedAuditTeacher?.userId ?? null,
        schoolId: selectedAuditTeacher?.schoolId ?? null,
        limit: 50,
      }),
    enabled: isSuperAdmin && Boolean(selectedAuditTeacher?.userId),
  });

  const securityAuditItems = securityAuditResponse?.data ?? [];
  const selectedUserLogs = selectedUserLogsResponse?.data ?? [];

  const securityAuditStats = useMemo(() => {
    const withAccount = securityAuditItems.filter((i) => Boolean(i.userId)).length;
    const loggedIn = securityAuditItems.filter((i) => Boolean(i.lastLogin)).length;
    const neverLoggedIn = securityAuditItems.filter(
      (i) => Boolean(i.userId) && !i.lastLogin
    ).length;
    const passwordChanged = securityAuditItems.filter(
      (i) => i.passwordChangeCount > 0 || Boolean(i.passwordChangedAt)
    ).length;
    return { withAccount, loggedIn, neverLoggedIn, passwordChanged };
  }, [securityAuditItems]);

  const filteredSecurityAuditItems = useMemo(() => {
    return securityAuditItems.filter((item) => {
      if (auditFilterMode === 'logged_in') return Boolean(item.lastLogin);
      if (auditFilterMode === 'never_logged_in')
        return Boolean(item.userId) && !item.lastLogin;
      if (auditFilterMode === 'password_changed')
        return item.passwordChangeCount > 0 || Boolean(item.passwordChangedAt);
      return true;
    });
  }, [securityAuditItems, auditFilterMode]);

  const isLoading = teacherScope.isLoading || isTeachersQueryLoading;

  const teachers = teachersResponse?.data?.data || [];
  const meta = teachersResponse?.data?.meta;
  const totalPages = meta?.totalPages || 1;
  const totalData = meta?.total || 0;

  const showClearAllButton = canClearAllTeachers && totalData > 0;
  const isExportDisabled =
    isExporting || isLoading || totalData === 0 || teachers.length === 0;

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const invalidateTeacherRelatedCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['teachers'] });
    queryClient.invalidateQueries({ queryKey: ['users-list'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-security-audit'] });
    queryClient.invalidateQueries({ queryKey: ['teacher-assignment-options'] });
  };

  // --- MUTATIONS ---
  const closeDeleteModal = () => setDeleteModal({ isOpen: false, type: 'single' });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => teacherService.delete(id, activeSchoolId ?? undefined),
    onSuccess: (_res, id) => {
      invalidateTeacherRelatedCaches();
      setSelectedRows((prev) => prev.filter((r) => r !== id));
      toast.success(tr('Data guru berhasil dihapus.', 'Teacher record deleted.'));
      closeDeleteModal();
    },
    onError: (err: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          err,
          locale,
          'Gagal menghapus data guru.',
          'Failed to delete teacher record.'
        )
      );
    },
  });

  const deleteManyMutation = useMutation({
    mutationFn: (ids: string[]) => teacherService.deleteMany(ids, activeSchoolId ?? undefined),
    onSuccess: () => {
      invalidateTeacherRelatedCaches();
      setSelectedRows([]);
      toast.success(tr('Data guru terpilih berhasil dihapus.', 'Selected teachers deleted.'));
      closeDeleteModal();
    },
    onError: (err: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          err,
          locale,
          'Gagal menghapus data guru terpilih.',
          'Failed to delete selected teachers.'
        )
      );
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => {
      if (!activeSchoolId) {
        throw new Error(
          tr('Pilih sekolah aktif terlebih dahulu.', 'Please select an active school first.')
        );
      }
      return teacherService.deleteAll(activeSchoolId);
    },
    onSuccess: () => {
      invalidateTeacherRelatedCaches();
      setSelectedRows([]);
      toast.success(tr('Seluruh data guru berhasil dikosongkan.', 'All teacher records cleared.'));
      closeDeleteModal();
    },
    onError: (err: unknown) => {
      toast.error(
        extractFriendlyErrorMessage(
          err,
          locale,
          'Gagal mengosongkan seluruh data guru.',
          'Failed to clear all teacher records.'
        )
      );
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: (payloads: TeacherBulkImportItem[]) =>
      teacherService.bulkImport(payloads),
    onSuccess: (res) => {
      invalidateTeacherRelatedCaches();
      toast.success(res.message);
      setImportError(null);
      setImportModalOpen(false);
      setImportPreviewRows([]);
    },
    onError: (err: unknown) => {
      const msg = extractFriendlyErrorMessage(
        err,
        locale,
        'Gagal menyinkronkan data guru ke database.',
        'Failed to sync teacher data to database.'
      );
      setImportError(msg);
      toast.error(msg, { duration: 6000 });
    },
  });

  const isDeleteBusy =
    deleteMutation.isPending || deleteManyMutation.isPending || deleteAllMutation.isPending;

  // Tutup modal aktif via tombol Escape saat tidak sedang memproses mutasi
  useEffect(() => {
    const hasOpenOverlay = Boolean(
      photoPreview || selectedAuditTeacher || importModalOpen || deleteModal.isOpen
    );
    if (!hasOpenOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (photoPreview) {
        setPhotoPreview(null);
        return;
      }
      if (selectedAuditTeacher) {
        setSelectedAuditTeacher(null);
        return;
      }
      if (importModalOpen && !bulkImportMutation.isPending) {
        setImportModalOpen(false);
        return;
      }
      if (deleteModal.isOpen && !isDeleteBusy) {
        closeDeleteModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    photoPreview,
    selectedAuditTeacher,
    importModalOpen,
    bulkImportMutation.isPending,
    deleteModal.isOpen,
    isDeleteBusy,
  ]);

  // --- HANDLERS ---
  const handleSort = (key: string) => {
    const direction: 'asc' | 'desc' =
      sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const toggleRow = (id: string) => {
    if (!canDeleteTeacher) return;
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (!canDeleteTeacher) return;
    setSelectedRows(
      selectedRows.length === teachers.length && teachers.length > 0
        ? []
        : teachers.map((t) => t.id)
    );
  };

  const handlePageSubmit = () => {
    let p = parseInt(pageInputValue, 10);
    if (Number.isNaN(p) || p < 1) p = 1;
    if (p > totalPages && totalPages > 0) p = totalPages;
    setCurrentPage(p);
    setPageInputValue(p.toString());
  };

  const confirmDelete = () => {
    if (deleteModal.type === 'all') {
      if (!showClearAllButton) {
        toast.error(
          tr(
            'Hanya Super Admin dengan sekolah aktif yang dapat mengosongkan data.',
            'Only Super Admin with an active school can clear all data.'
          )
        );
        closeDeleteModal();
        return;
      }
      deleteAllMutation.mutate();
      return;
    }

    if (!canDeleteTeacher) {
      toast.error(
        tr(
          'Anda tidak memiliki izin menghapus data guru.',
          'You do not have permission to delete teacher records.'
        )
      );
      closeDeleteModal();
      return;
    }

    if (deleteModal.type === 'single' && deleteModal.id) {
      deleteMutation.mutate(deleteModal.id);
    } else if (deleteModal.type === 'bulk') {
      deleteManyMutation.mutate(selectedRows);
    }
  };

  // --- DOWNLOAD TEMPLATE EXCEL PTK ---
  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        Nama: 'Ahmad Fauzi, S.Pd.',
        JK: 'L',
        NIP: '198808172015031002',
        NUPTK: '1234567890123456',
        NIK: '3404071708880001',
        'No KK': '3404070101150001',
        'Tempat Lahir': 'Sleman',
        'Tanggal Lahir': '1988-08-17',
        Agama: 'ISLAM',
        'Alamat Jalan': 'Jl. Kaliurang Km 10',
        RT: '001',
        RW: '002',
        'Nama Dusun': 'Sribit',
        'Desa/Kelurahan': 'Sendangtirto',
        Kecamatan: 'Berbah',
        'Kabupaten/Kota': schoolInfo?.city || 'Kabupaten Sleman',
        Provinsi: schoolInfo?.province || 'DI Yogyakarta',
        'Kode Pos': '55573',
        HP: '081234567890',
        Email: 'ahmad.fauzi@sekolah.sch.id',
        'Status Kepegawaian': 'GTY',
        'Jenis PTK': 'Guru Mapel',
        'Tugas Tambahan': 'Wali Kelas',
        'TMT Pengangkatan': '2018-07-01',
        'Lembaga Pengangkatan': 'Yayasan',
        'Pangkat/Golongan': 'III/a',
        'Sumber Gaji': 'Yayasan',
        'Nama Ibu Kandung': 'Siti Rahmah',
        'Status Perkawinan': 'Kawin',
        Bank: 'BPD DIY',
        'Nomor Rekening Bank': '001234567890',
        'Rekening Atas Nama': 'Ahmad Fauzi',
        Kewarganegaraan: 'Indonesia',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();

    const textColIndices = new Set([2, 3, 4, 5, 17, 18, 30]);
    for (const c of textColIndices) {
      const cellRef = XLSX.utils.encode_cell({ r: 1, c });
      const cell = ws[cellRef];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }

    ws['!cols'] = [
      { wch: 26 },
      { wch: 6 },
      { wch: 22 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 15 },
      { wch: 12 },
      { wch: 28 },
      { wch: 6 },
      { wch: 6 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 10 },
      { wch: 16 },
      { wch: 26 },
      { wch: 20 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 14 },
      { wch: 20 },
      { wch: 22 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Template_Guru_PTK');
    XLSX.writeFile(wb, 'Template_Import_Guru_PTK_Dapodik.xlsx');
    toast.success(tr('Template Excel berhasil diunduh', 'Excel template downloaded'));
  };

  // --- SMARTDIFF EXCEL PARSER & WIZARD ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);

    if (!canImportTeacher) {
      const msg = tr(
        'Anda tidak memiliki izin mengimpor data guru.',
        'You do not have permission to import teacher data.'
      );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    if (!activeSchoolId) {
      const msg = tr(
        'Pilih sekolah aktif terlebih dahulu sebelum mengimpor data PTK.',
        'Select an active school before importing PTK data.'
      );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    const lowerFileName = file.name.toLowerCase();
    if (!lowerFileName.endsWith('.xlsx') && !lowerFileName.endsWith('.xls')) {
      const msg = tr(
        'Format file tidak didukung. Harap unggah file Excel (.xlsx atau .xls).',
        'Unsupported file format. Please upload an Excel file (.xlsx or .xls).'
      );
      setImportError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    setIsParsingExcel(true);
    const toastId = toast.loading(
      tr('Menganalisis file Excel Dapodik PTK...', 'Analyzing Dapodik PTK Excel...')
    );

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { raw: false });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error(
          tr(
            'File Excel tidak memiliki lembar kerja (sheet) yang valid.',
            'The Excel file does not contain any valid worksheet.'
          )
        );
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) {
        throw new Error(
          tr(
            'Lembar kerja pertama di dalam file Excel tidak dapat dibaca.',
            'The first worksheet in the Excel file could not be read.'
          )
        );
      }

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: false,
        defval: '',
      });

      let headerRow = matrix.slice(0, 20).findIndex(
        (r) =>
          Array.isArray(r) &&
          r.some((c) => ['nama', 'nama lengkap'].includes(normKey(c)))
      );
      if (headerRow === -1) headerRow = FALLBACK_HEADER_ROW;

      const rawHeaderRow = Array.isArray(matrix[headerRow]) ? matrix[headerRow] : [];
      const headerCells = Array.from(rawHeaderRow, (c) => String(c ?? ''));

      const detectedType = detectTeacherExcelSource(
        workbook.SheetNames,
        matrix.slice(0, headerRow),
        headerCells
      );

      if (detectedType === 'student') {
        throw new Error(
          tr(
            'File ditolak! File yang Anda pilih adalah file Data Siswa / Peserta Didik (terdeteksi kolom NISN / NIPD / Rombel). Silakan impor file ini di menu Siswa, atau pilih file Daftar Guru (Verval PTK).',
            'File rejected! You uploaded a Student file (detected NISN / NIPD / Class). Please import this file in the Students menu, or select a Teacher (Verval PTK) file.'
          )
        );
      }

      if (detectedType === 'unknown') {
        throw new Error(
          tr(
            'Format file tidak dikenali sebagai data Guru / PTK. Pastikan file memiliki kolom khas PTK seperti NUPTK, NIP, Status Kepegawaian, atau Jenis PTK.',
            'Unrecognized file format for Teacher / PTK data. Ensure the file contains PTK columns such as NUPTK, NIP, Employment Status, or PTK Type.'
          )
        );
      }

      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
        range: headerRow,
        raw: false,
        defval: '',
      });

      if (jsonData.length === 0) {
        throw new Error(
          tr(
            'File Excel kosong atau tidak memiliki baris data di bawah header.',
            'Empty Excel file or no data rows found below the header.'
          )
        );
      }

      const { payloads, skipped } = parseTeacherExcel(jsonData, activeSchoolId);
      if (payloads.length === 0) {
        throw new Error(
          tr(
            'Tidak ada baris data guru yang valid (seluruh kolom Nama kosong).',
            'No valid teacher rows found (all Name columns are empty).'
          )
        );
      }

      const existingRes = await teacherService.exportAll(activeSchoolId);
      const { rows: diffedRows, duplicateCount } = computeSmartDiff(
        payloads,
        existingRes?.data || [],
        locale
      );

      setImportFileName(file.name);
      setImportPreviewRows(diffedRows);
      setImportSkippedCount(skipped);
      setImportDuplicateCount(duplicateCount);
      setDiffFilterTab('all');
      setImportModalOpen(true);

      toast.dismiss(toastId);
    } catch (error: unknown) {
      const msg = extractFriendlyErrorMessage(
        error,
        locale,
        'Gagal membaca file Excel Verval PTK. Periksa kembali format file Anda.',
        'Failed to read Verval PTK Excel file. Please check your file format.'
      );
      setImportError(msg);
      toast.error(msg, { id: toastId, duration: 6000 });
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
    if (!canImportTeacher) return;
    const rowsToSend =
      actionableImportRows.length > 0 ? actionableImportRows : importPreviewRows;
    bulkImportMutation.mutate(rowsToSend);
  };

  // --- EXPORT EXCEL ---
  const handleExport = async () => {
    if (!canExportTeacher || isExportDisabled) return;
    if (!isSuperAdmin && !activeSchoolId) return;
    setIsExporting(true);
    const toastId = toast.loading(tr('Menyiapkan file Excel...', 'Preparing Excel file...'));

    try {
      const response = await teacherService.exportAll(activeSchoolId ?? undefined);
      let dataToExport = response.data || [];

      if (isRestrictedToSelf) {
        dataToExport = teacherScope.teacherId
          ? dataToExport.filter((t) => String(t.id) === teacherScope.teacherId)
          : [];
      }

      if (dataToExport.length === 0) {
        throw new Error(tr('Tidak ada data untuk diekspor', 'No data to export'));
      }

      if (canDeleteTeacher && selectedRows.length > 0) {
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
        'Foto Profil': t.photoUrl ? 'Ada' : 'Belum',
        Alamat: t.address || '-',
        'Desa/Kelurahan': t.kelurahan || '-',
        Kecamatan: t.kecamatan || '-',
        'No HP': t.phone || '-',
        Email: t.email || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();

      // Paksa format teks (@) pada NIP (col 3), NUPTK (col 4), NIK (col 5), dan No HP (col 18)
      const textColIndices = [3, 4, 5, 18];
      for (let r = 1; r <= exportData.length; r++) {
        for (const c of textColIndices) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          if (cell) {
            cell.t = 's';
            cell.z = '@';
          }
        }
      }

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
        canDeleteTeacher && selectedRows.length > 0
          ? `Data_Guru_Terpilih_${dateStr}.xlsx`
          : `Data_Guru_Pegawai_${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
      toast.success(tr('Data berhasil diekspor!', 'Data successfully exported!'), { id: toastId });
    } catch (error: unknown) {
      const msg = extractFriendlyErrorMessage(
        error,
        locale,
        'Gagal mengekspor data guru.',
        'Failed to export teacher data.'
      );
      toast.error(msg, { id: toastId });
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
      {/* --- LIGHTBOX PRATINJAU FOTO PROFIL --- */}
      <AnimatePresence>
        {photoPreview && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={photoPreview.fullName}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
            onClick={() => setPhotoPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
                <span className="truncate text-sm font-semibold text-foreground">
                  {photoPreview.fullName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    to={`/teachers/${photoPreview.id}`}
                    onClick={() => setPhotoPreview(null)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{tr('Profil', 'Profile')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    aria-label={tr('Tutup pratinjau', 'Close preview')}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-center overflow-hidden rounded-xl bg-muted/40">
                <img
                  src={photoPreview.photoUrl}
                  alt={photoPreview.fullName}
                  className="max-h-[70vh] w-auto object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
          {activeMainTab === 'directory' && (
            <>
              {showClearAllButton && (
                <button
                  type="button"
                  onClick={() => setDeleteModal({ isOpen: true, type: 'all' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors shadow-sm"
                >
                  <Trash2 size={16} />
                  <span className="hidden sm:inline">{tr('Kosongkan Data', 'Clear All')}</span>
                </button>
              )}

              {canImportTeacher && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors shadow-sm"
                  >
                    <FileSpreadsheet size={16} className="text-emerald-600" />
                    <span className="hidden sm:inline">{tr('Template', 'Template')}</span>
                  </button>

                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeSchoolId || isParsingExcel || bulkImportMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isParsingExcel ? (
                      <Loader2 size={16} className="animate-spin text-emerald-600" />
                    ) : (
                      <Upload size={16} />
                    )}
                    <span className="hidden sm:inline">
                      {isParsingExcel
                        ? tr('Membaca...', 'Reading...')
                        : tr('Impor Verval PTK', 'Import Verval PTK')}
                    </span>
                  </button>
                </>
              )}

              {canExportTeacher && (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={isExportDisabled}
                  title={
                    totalData === 0 || teachers.length === 0
                      ? tr('Tidak ada data guru untuk diekspor', 'No teacher data to export')
                      : undefined
                  }
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:hover:bg-muted/50"
                >
                  {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  <span className="hidden sm:inline">
                    {canDeleteTeacher && selectedRows.length > 0
                      ? tr(`Ekspor (${selectedRows.length})`, `Export (${selectedRows.length})`)
                      : tr('Ekspor Data', 'Export Data')}
                  </span>
                </button>
              )}

              {canCreateTeacher && activeSchoolId && (
                <Link
                  to="/teachers/new"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Plus size={16} />
                  <span>{tr('Tambah Guru', 'Add Teacher')}</span>
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- TAB SWITCHER UTAMA (DIREKTORI / PENUGASAN MAPEL / AUDIT KEAMANAN) --- */}
      {showMainTabSwitcher && (
        <div
          role="tablist"
          aria-label={tr('Navigasi Modul Guru', 'Teacher Module Navigation')}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-1.5 w-fit max-w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeMainTab === 'directory'}
            onClick={() => setActiveMainTab('directory')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all',
              activeMainTab === 'directory'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>{tr('Daftar Guru & Pegawai', 'Teachers Directory')}</span>
          </button>

          {canViewAssignmentsTab && (
            <button
              type="button"
              role="tab"
              aria-selected={activeMainTab === 'subject_assignments'}
              onClick={() => setActiveMainTab('subject_assignments')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all',
                activeMainTab === 'subject_assignments'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>{tr('Penugasan Mapel & Kelas', 'Subject & Class Assignments')}</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeMainTab === 'security_audit'}
              onClick={() => setActiveMainTab('security_audit')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-all',
                activeMainTab === 'security_audit'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                {tr('Audit Login & Password Guru', 'Login & Password Audit')}
              </span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================
          TAMPILAN TAB PENUGASAN MATA PELAJARAN & BEBAN JAM MENGAJAR (JP)
      ======================================================================== */}
      {activeMainTab === 'subject_assignments' && activeSchoolId ? (
        <TeacherSubjectAssignmentSection schoolId={activeSchoolId} />
      ) : isSuperAdmin && activeMainTab === 'security_audit' ? (
        /* ========================================================================
            TAMPILAN KHUSUS SUPER_ADMIN: AUDIT LOGIN TERAKHIR, IP & GANTI PASSWORD
        ======================================================================== */
        <div className="space-y-4">
          {/* Ringkasan Statistik Keamanan Akun Guru */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-xs font-medium text-muted-foreground">
                {tr('Guru Tertaut Akun Login', 'Linked Login Accounts')}
              </div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {securityAuditStats.withAccount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {securityAuditItems.length} PTK
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 shadow-xs">
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {tr('Sudah Pernah Login', 'Has Logged In')}
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {securityAuditStats.loggedIn}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-xs">
              <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {tr('Belum Pernah Login', 'Never Logged In')}
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                {securityAuditStats.neverLoggedIn}
              </div>
            </div>

            <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 shadow-xs">
              <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                {tr('Sudah Mengganti Password', 'Password Changed')}
              </div>
              <div className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {securityAuditStats.passwordChanged}
              </div>
            </div>
          </div>

          {/* Toolbar Pencarian & Filter Audit */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-muted/20">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder={tr(
                    'Cari nama guru, NIP, email, atau alamat IP...',
                    'Search teacher name, NIP, email, or IP address...'
                  )}
                  value={auditSearchInput}
                  onChange={(e) => setAuditSearchInput(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-amber-500"
                />
                {auditSearchInput && (
                  <button
                    type="button"
                    aria-label={tr('Hapus pencarian audit', 'Clear audit search')}
                    onClick={() => setAuditSearchInput('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={tr('Filter status login', 'Filter login status')}
                  value={auditFilterMode}
                  onChange={(e) =>
                    setAuditFilterMode(
                      e.target.value as
                      | 'all'
                      | 'logged_in'
                      | 'never_logged_in'
                      | 'password_changed'
                    )
                  }
                  className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value="all">
                    {tr('Semua Guru', 'All Teachers')} ({securityAuditItems.length})
                  </option>
                  <option value="logged_in">
                    {tr('Sudah Pernah Login', 'Has Logged In')} ({securityAuditStats.loggedIn})
                  </option>
                  <option value="never_logged_in">
                    {tr('Belum Pernah Login', 'Never Logged In')} ({securityAuditStats.neverLoggedIn})
                  </option>
                  <option value="password_changed">
                    {tr('Sudah Ganti Password', 'Password Changed')} ({securityAuditStats.passwordChanged})
                  </option>
                </select>

                <button
                  type="button"
                  onClick={() => refetchSecurityAudit()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
                >
                  <RefreshCw
                    size={15}
                    className={isSecurityAuditLoading ? 'animate-spin' : ''}
                  />
                  <span>{tr('Segarkan', 'Refresh')}</span>
                </button>
              </div>
            </div>

            {/* Tabel Audit Keamanan */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {tr('Guru & Sekolah', 'Teacher & School')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {tr('Akun Login', 'Login Account')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {tr('Login Terakhir (Tgl & Jam)', 'Last Login (Date & Time)')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {tr('Alamat IP & Perangkat', 'IP Address & Device')}
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {tr('Riwayat Ganti Password', 'Password Change History')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      {tr('Log', 'Logs')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card text-sm">
                  {isSecurityAuditLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        <Loader2 className="h-7 w-7 animate-spin text-amber-600 mx-auto mb-2" />
                        {tr('Memuat audit keamanan guru...', 'Loading teacher security audit...')}
                      </td>
                    </tr>
                  ) : filteredSecurityAuditItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        {tr(
                          'Tidak ada data audit guru yang sesuai dengan filter.',
                          'No teacher audit records match your filter.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredSecurityAuditItems.map((item) => {
                      const lastLoginFmt = formatAuditDateTime(item.lastLogin, locale);
                      const pwdChangedFmt = formatAuditDateTime(item.passwordChangedAt, locale);
                      const hasChangedPassword =
                        item.passwordChangeCount > 0 || Boolean(item.passwordChangedAt);

                      return (
                        <tr key={item.teacherId} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <TeacherAvatarCell
                                id={item.teacherId}
                                fullName={item.fullName}
                                photoUrl={item.photoUrl}
                                previewTitle={item.fullName}
                                onPreview={setPhotoPreview}
                              />
                              <div className="min-w-0">
                                <Link
                                  to={`/teachers/${item.teacherId}`}
                                  className="font-semibold text-foreground hover:text-emerald-600 transition-colors line-clamp-1"
                                >
                                  {item.fullName}
                                </Link>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.schoolName}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {item.userId ? (
                              <div className="space-y-0.5">
                                <div className="text-xs font-medium text-foreground">
                                  {item.email || '-'}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-muted text-[10px] font-semibold">
                                    {item.role || 'GURU'}
                                  </span>
                                  {!item.isAccountActive && (
                                    <span className="inline-flex px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[10px] font-semibold">
                                      {tr('Nonaktif', 'Inactive')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">
                                {tr('Belum Punya Akun', 'No Account')}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {lastLoginFmt ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                  <span>{lastLoginFmt.date}</span>
                                </div>
                                <div className="text-xs font-mono text-foreground pl-5">
                                  {lastLoginFmt.time}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                {tr('Belum pernah login', 'Never logged in')}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {item.lastLoginIp ? (
                              <div className="space-y-1">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-border font-mono text-xs font-semibold text-foreground">
                                  <Globe className="h-3 w-3 text-blue-600 shrink-0" />
                                  <span>{item.lastLoginIp}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <MonitorSmartphone className="h-3 w-3 shrink-0" />
                                  <span>{summarizeUserAgent(item.lastLoginUserAgent, locale)}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {!item.userId ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : hasChangedPassword ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                                  <KeyRound className="h-3 w-3" />
                                  <span>
                                    {tr(
                                      `Sudah Ganti (${Math.max(1, item.passwordChangeCount)}x)`,
                                      `Changed (${Math.max(1, item.passwordChangeCount)}x)`
                                    )}
                                  </span>
                                </span>
                                {pwdChangedFmt && (
                                  <div className="text-[11px] text-muted-foreground">
                                    {pwdChangedFmt.date}, {pwdChangedFmt.time}
                                    {item.passwordChangedIp
                                      ? ` • IP: ${item.passwordChangedIp}`
                                      : ''}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                                {tr('Belum Ganti Password', 'Never Changed')}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {item.userId && (
                              <button
                                type="button"
                                onClick={() => setSelectedAuditTeacher(item)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold transition-colors"
                              >
                                <History className="h-3.5 w-3.5 text-amber-600" />
                                <span>{tr('Riwayat', 'History')}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* --- BANNER ERROR IMPOR EXCEL (PERSISTEN) --- */}
          {importError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-xs sm:text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 shadow-sm"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold">
                    {tr('Gagal Memproses Impor Data Guru', 'Failed to Process Teacher Import')}
                  </p>
                  <p className="mt-0.5 leading-relaxed">{importError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportError(null)}
                title={tr('Tutup pesan error', 'Dismiss error')}
                aria-label={tr('Tutup pesan error', 'Dismiss error')}
                className="p-1 rounded-lg text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {isSuperAdmin && !activeSchoolId && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {tr('Mode Super Admin Lintas Sekolah', 'Cross-School Super Admin Mode')}
                </p>
                <p className="mt-0.5">
                  {tr(
                    'Pilih sekolah aktif terlebih dahulu pada switcher sekolah untuk menambah guru baru, mengatur penugasan mapel, atau mengimpor Excel Verval PTK.',
                    'Select an active school from the school switcher before adding new teachers, managing subject assignments, or importing Verval PTK Excel.'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* --- TOOLBAR + TABLE --- */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-muted/20">
              {/* Kiri: Pencarian */}
              <div className="relative w-full lg:flex-1 lg:min-w-50 transition-all duration-200">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder={tr('Cari nama, NIP, NUPTK, NIK...', 'Search name, NIP, NUPTK, NIK...')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={cn(
                    'w-full pl-9 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all',
                    searchInput ? 'pr-8' : 'pr-4'
                  )}
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    title={tr('Hapus pencarian', 'Clear search')}
                    aria-label={tr('Hapus pencarian', 'Clear search')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Kanan: Filter + Aksi Terpilih */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5 shrink-0">
                <div className="flex flex-1 sm:flex-initial items-center gap-2 transition-all duration-200">
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
                      aria-label={tr('Filter Status Kepegawaian', 'Filter Employment Status')}
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
                    aria-label={tr('Filter Status Sertifikasi', 'Filter Certification Status')}
                    className="flex-1 sm:flex-initial px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">{tr('Semua Sertifikasi', 'All Certification')}</option>
                    <option value="true">{tr('Sudah Sertifikasi', 'Certified')}</option>
                    <option value="false">{tr('Belum Sertifikasi', 'Uncertified')}</option>
                  </select>
                </div>

                {canDeleteTeacher && selectedRows.length > 0 && (
                  <div className="flex items-center gap-2 pl-2 border-l border-border shrink-0 animate-in fade-in zoom-in-95 duration-200">
                    <span className="hidden sm:inline-block text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap">
                      {selectedRows.length} {tr('Terpilih', 'Selected')}
                    </span>
                    <span className="sm:hidden text-sm font-bold text-emerald-600">
                      ({selectedRows.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteModal({ isOpen: true, type: 'bulk' })}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">{tr('Hapus', 'Delete')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRows([])}
                      title={tr('Batal Pilih', 'Clear Selection')}
                      aria-label={tr('Batal Pilih', 'Clear Selection')}
                      className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* --- DATA TABLE --- */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    {canDeleteTeacher && (
                      <th scope="col" className="p-4 w-12 text-center">
                        <input
                          type="checkbox"
                          aria-label={tr('Pilih semua guru di halaman ini', 'Select all teachers on this page')}
                          checked={selectedRows.length === teachers.length && teachers.length > 0}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th scope="col" className="px-4 py-3 text-sm font-semibold text-muted-foreground w-12 text-center">
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
                    <th scope="col" className="px-4 py-3 text-sm font-semibold text-muted-foreground">
                      {tr('Sertifikasi', 'Certification')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">
                      {tr('Aksi', 'Action')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={canDeleteTeacher ? 8 : 7}
                        className="px-6 py-12 text-center text-muted-foreground"
                      >
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" />
                        {tr('Memuat data...', 'Loading data...')}
                      </td>
                    </tr>
                  ) : isError ? (
                    <tr>
                      <td
                        colSpan={canDeleteTeacher ? 8 : 7}
                        className="px-6 py-12 text-center"
                      >
                        <div className="flex flex-col items-center justify-center gap-2 text-red-600 dark:text-red-400">
                          <AlertCircle className="h-8 w-8" />
                          <p className="font-semibold">
                            {tr('Gagal memuat data guru.', 'Failed to load teacher data.')}
                          </p>
                          <p className="text-xs text-muted-foreground max-w-md">
                            {extractFriendlyErrorMessage(
                              teachersQueryError,
                              locale,
                              'Terjadi gangguan saat mengambil daftar guru dari server.',
                              'An issue occurred while fetching the teacher list from the server.'
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => refetchTeachers()}
                            className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium hover:bg-muted transition-colors shadow-sm"
                          >
                            <RefreshCw size={14} />
                            <span>{tr('Muat Ulang', 'Retry')}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : teachers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canDeleteTeacher ? 8 : 7}
                        className="px-6 py-12 text-center text-muted-foreground"
                      >
                        {tr('Tidak ada data guru.', 'No teacher data found.')}
                      </td>
                    </tr>
                  ) : (
                    teachers.map((teacher, idx) => {
                      const statusConf = STATUS_CONFIG[(teacher.status || 'HONORER').toUpperCase()];
                      return (
                        <motion.tr
                          key={teacher.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={cn(
                            'hover:bg-muted/50 transition-colors group',
                            canDeleteTeacher && 'cursor-pointer',
                            selectedRows.includes(teacher.id) && 'bg-emerald-500/5'
                          )}
                          onClick={() => canDeleteTeacher && toggleRow(teacher.id)}
                        >
                          {canDeleteTeacher && (
                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={tr(`Pilih ${teacher.fullName}`, `Select ${teacher.fullName}`)}
                                checked={selectedRows.includes(teacher.id)}
                                onChange={() => toggleRow(teacher.id)}
                                className="w-4 h-4 rounded border-border bg-muted accent-emerald-600 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm text-muted-foreground text-center">
                            {(currentPage - 1) * PAGE_SIZE + idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <TeacherAvatarCell
                                id={teacher.id}
                                fullName={teacher.fullName}
                                photoUrl={teacher.photoUrl}
                                previewTitle={tr(
                                  'Klik untuk memperbesar foto profil',
                                  'Click to enlarge profile photo'
                                )}
                                onPreview={setPhotoPreview}
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-foreground line-clamp-1">
                                  {teacher.fullName}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>
                                    {teacher.gender === 'L'
                                      ? tr('Laki-laki', 'Male')
                                      : tr('Perempuan', 'Female')}
                                  </span>
                                  {teacher.isActive === false && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 font-medium">
                                      {tr('Nonaktif', 'Inactive')}
                                    </span>
                                  )}
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
                              {teacher.nuptk || tr('Non-NUPTK', 'No NUPTK')}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm">{teacher.position || 'Guru'}</td>
                          <td className="px-4 py-3">
                            {statusConf ? (
                              <span
                                className={cn(
                                  'px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
                                  statusConf.color
                                )}
                              >
                                {statusConf.label}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {teacher.status || '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {teacher.isCertified ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                {tr('Sudah', 'Certified')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                {tr('Belum', 'Uncertified')}
                              </span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={`/teachers/${teacher.id}`}
                                className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition-colors"
                                title={tr('Lihat Detail', 'View Detail')}
                                aria-label={tr(`Lihat detail ${teacher.fullName}`, `View details for ${teacher.fullName}`)}
                              >
                                <Eye size={16} />
                              </Link>
                              {canUpdateTeacher && (
                                <Link
                                  to={`/teachers/${teacher.id}/edit`}
                                  className="p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                  title={tr('Edit Data', 'Edit Data')}
                                  aria-label={tr(`Edit data ${teacher.fullName}`, `Edit ${teacher.fullName}`)}
                                >
                                  <Edit size={16} />
                                </Link>
                              )}
                              {canDeleteTeacher && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteModal({
                                      isOpen: true,
                                      type: 'single',
                                      id: teacher.id,
                                    })
                                  }
                                  className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title={tr('Hapus Data', 'Delete Data')}
                                  aria-label={tr(`Hapus data ${teacher.fullName}`, `Delete ${teacher.fullName}`)}
                                >
                                  <Trash2 size={16} />
                                </button>
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
            {totalPages > 0 && (
              <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20">
                <div className="text-sm text-muted-foreground">
                  {tr('Menampilkan', 'Showing')}{' '}
                  <span className="font-medium text-foreground">
                    {totalData === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                  </span>{' '}
                  {tr('sampai', 'to')}{' '}
                  <span className="font-medium text-foreground">
                    {Math.min(currentPage * PAGE_SIZE, totalData)}
                  </span>{' '}
                  {tr('dari', 'of')}{' '}
                  <span className="font-medium text-foreground">{totalData}</span>{' '}
                  {tr('data', 'entries')}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                        title={tr('Halaman Pertama', 'First Page')}
                        aria-label={tr('Halaman Pertama', 'First Page')}
                      >
                        <ChevronsLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                        title={tr('Sebelumnya', 'Previous')}
                        aria-label={tr('Halaman Sebelumnya', 'Previous Page')}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {generatePagination(currentPage, totalPages).map((item, idx) =>
                        typeof item === 'number' ? (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setCurrentPage(item)}
                            aria-current={currentPage === item ? 'page' : undefined}
                            className={cn(
                              'w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors',
                              currentPage === item
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'border border-border hover:bg-muted text-foreground'
                            )}
                          >
                            {item}
                          </button>
                        ) : (
                          <span key={idx} className="px-1 text-muted-foreground select-none">
                            {item}
                          </span>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                        title={tr('Selanjutnya', 'Next')}
                        aria-label={tr('Halaman Selanjutnya', 'Next Page')}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
                        title={tr('Halaman Terakhir', 'Last Page')}
                        aria-label={tr('Halaman Terakhir', 'Last Page')}
                      >
                        <ChevronsRight size={16} />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground pl-2 sm:border-l border-border">
                      <span>{tr('Hal:', 'Go:')}</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        aria-label={tr('Nomor halaman', 'Page number')}
                        value={pageInputValue}
                        onChange={(e) => setPageInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePageSubmit()}
                        onBlur={handlePageSubmit}
                        className="w-14 px-2 py-1 text-center bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs">/ {totalPages}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================
          MODAL DETAIL RIWAYAT LOG LOGIN & PASSWORD PER GURU (KHUSUS SUPER_ADMIN)
      ======================================================================== */}
      <AnimatePresence>
        {isSuperAdmin && selectedAuditTeacher && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-audit-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedAuditTeacher(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-5 border-b border-border flex items-start justify-between gap-3 bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3
                      id="security-audit-modal-title"
                      className="text-base font-bold text-foreground"
                    >
                      {tr(
                        'Riwayat Login & Perubahan Password',
                        'Login & Password Change History'
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedAuditTeacher.fullName} ({selectedAuditTeacher.email}) •{' '}
                      {selectedAuditTeacher.schoolName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={tr('Tutup dialog riwayat', 'Close history dialog')}
                  onClick={() => setSelectedAuditTeacher(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                {isSelectedUserLogsLoading ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin text-amber-600 mx-auto mb-2" />
                    {tr(
                      'Memuat kronologi aktivitas keamanan...',
                      'Loading security activity timeline...'
                    )}
                  </div>
                ) : selectedUserLogs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {tr(
                      'Belum ada log aktivitas login atau perubahan password yang tercatat pada tabel audit.',
                      'No login or password change events recorded in the audit table yet.'
                    )}
                  </div>
                ) : (
                  selectedUserLogs.map((log) => {
                    const fmt = formatAuditDateTime(log.createdAt, locale);
                    const isPwdEvent =
                      log.action === 'CHANGE_PASSWORD' || log.action === 'RESET_PASSWORD';
                    return (
                      <div
                        key={log.id}
                        className={cn(
                          'p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5',
                          isPwdEvent
                            ? 'bg-blue-500/5 border-blue-500/25'
                            : 'bg-muted/30 border-border'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] font-bold',
                                log.action === 'RESET_PASSWORD'
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                  : log.action === 'CHANGE_PASSWORD'
                                    ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                                    : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              )}
                            >
                              {log.action === 'RESET_PASSWORD'
                                ? tr('Reset Password oleh Admin', 'Password Reset by Admin')
                                : log.action === 'CHANGE_PASSWORD'
                                  ? tr('Ganti Password Mandiri', 'Self Password Change')
                                  : tr('Login Berhasil', 'Successful Login')}
                            </span>
                            {fmt && (
                              <span className="text-xs font-semibold text-foreground">
                                {fmt.date} • {fmt.time}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tr('Pelaku:', 'Actor:')}{' '}
                            <strong className="text-foreground">{log.actorName}</strong> (
                            {log.actorEmail})
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {tr('Perangkat:', 'Device:')}{' '}
                            {summarizeUserAgent(log.userAgent, locale)}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border font-mono text-xs font-semibold">
                            <Globe className="h-3.5 w-3.5 text-blue-600" />
                            <span>{log.ipAddress || tr('Tidak terdeteksi', 'Not detected')}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-border bg-muted/20 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedAuditTeacher(null)}
                  className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium transition-colors"
                >
                  {tr('Tutup', 'Close')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- SMARTDIFF IMPORT PREVIEW MODAL --- */}
      <AnimatePresence>
        {importModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="smartdiff-import-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={() => {
              if (!bulkImportMutation.isPending) setImportModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
            >
              <div className="p-5 border-b border-border flex items-start justify-between gap-4 bg-muted/20">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3
                      id="smartdiff-import-modal-title"
                      className="text-lg font-bold text-foreground"
                    >
                      {tr('Pratinjau SmartDiff Impor PTK', 'SmartDiff PTK Import Preview')}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      File: <span className="font-medium text-foreground">{importFileName}</span>
                      {importSkippedCount > 0 &&
                        ` • ${importSkippedCount} ${tr('baris kosong dilewati', 'empty rows skipped')}`}
                      {importDuplicateCount > 0 &&
                        ` • ${importDuplicateCount} ${tr('baris ganda digabung', 'duplicate rows merged')}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={bulkImportMutation.isPending}
                  aria-label={tr('Tutup pratinjau impor', 'Close import preview')}
                  onClick={() => setImportModalOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-3 border-b border-border bg-background flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('all')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    diffFilterTab === 'all'
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {tr('Semua', 'All')} ({importPreviewRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('new')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    diffFilterTab === 'new'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                  )}
                >
                  + {tr('Data Baru', 'New')} ({diffStats.newCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('updated')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    diffFilterTab === 'updated'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
                  )}
                >
                  <RefreshCw size={12} className="inline mr-1" />
                  {tr('Diperbarui', 'Updated')} ({diffStats.updatedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiffFilterTab('unchanged')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    diffFilterTab === 'unchanged'
                      ? 'bg-slate-600 text-white border-slate-600'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  <CheckCircle2 size={12} className="inline mr-1" />
                  {tr('Sama / Tidak Berubah', 'Unchanged')} ({diffStats.unchangedCount})
                </button>
              </div>

              <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10 border-b border-border">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground w-12">
                        No
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {tr('Status Diff', 'Diff Status')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {tr('Nama Lengkap', 'Full Name')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        NIP / NUPTK
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {tr('Status / Jabatan', 'Status / Position')}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                        {tr('Rincian Perubahan', 'Changed Fields')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPreviewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {row.diffAction === 'new' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                              {tr('Baru', 'New')}
                            </span>
                          )}
                          {row.diffAction === 'updated' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 border border-amber-500/30">
                              {tr('Update', 'Update')}
                            </span>
                          )}
                          {row.diffAction === 'unchanged' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                              {tr('Sama', 'Same')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{row.fullName}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          <div>{row.nip || '-'}</div>
                          <div>{row.nuptk || '-'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="font-medium">{row.status}</span> • {row.position}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-65">
                          {row.diffAction === 'new'
                            ? tr('Akan ditambahkan sebagai PTK baru', 'Will be inserted as new PTK')
                            : row.diffAction === 'updated'
                              ? row.diffFields?.join(', ')
                              : tr('Tidak ada perubahan data', 'No field changes')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {actionableImportRows.length > 0
                    ? tr(
                      `${actionableImportRows.length} data akan disinkronkan (${diffStats.newCount} baru, ${diffStats.updatedCount} diperbarui).`,
                      `${actionableImportRows.length} records will be synced (${diffStats.newCount} new, ${diffStats.updatedCount} updated).`
                    )
                    : tr(
                      'Seluruh data di file Excel sudah sama persis dengan database.',
                      'All rows in the Excel file already match the database.'
                    )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={bulkImportMutation.isPending}
                    onClick={() => setImportModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {tr('Batal', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={bulkImportMutation.isPending}
                    onClick={handleConfirmSmartImport}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                  >
                    {bulkImportMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                    <span>
                      {actionableImportRows.length > 0
                        ? tr(
                          `Sinkronkan ${actionableImportRows.length} Data`,
                          `Sync ${actionableImportRows.length} Records`
                        )
                        : tr('Tetap Sinkronkan Semua', 'Sync All Anyway')}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- DELETE CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {deleteModal.isOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-teacher-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={() => {
              if (!isDeleteBusy) closeDeleteModal();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                <AlertTriangle size={24} />
              </div>

              <h3
                id="delete-teacher-modal-title"
                className="text-lg font-bold text-foreground mb-2"
              >
                {modalTitle}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{modalDesc}</p>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={isDeleteBusy}
                  className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium text-foreground transition-colors disabled:opacity-50"
                >
                  {tr('Batal', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleteBusy}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                >
                  {isDeleteBusy && <Loader2 size={16} className="animate-spin" />}
                  {tr('Ya, Hapus', 'Yes, Delete')}
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