// src/modules/students/pages/StudentFormPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  User,
  MapPin,
  FileText,
  Users,
  HeartHandshake,
  School,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  X,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import {
  studentService,
  MANAGE_STUDENT_ROLES,
  calculatePipPriorityScore,
} from '../services/student.service';
import type {
  CreateStudentPayload,
  CreateStudentParentPayload,
  OrphanType,
  StudentStatus,
} from '../types/student.types';

type TabKey = 'biodata' | 'alamat' | 'dapodik' | 'ortu' | 'ekonomi';

interface SchoolOption {
  id: string;
  name: string;
  npsn: string;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel: number;
  major: string | null;
  academicYearId: string;
}

interface ParentFormState {
  fullName: string;
  nik: string;
  birthYear: string;
  phone: string;
  email: string;
  education: string;
  occupation: string;
  monthlyIncome: string;
  isAlive: boolean;
  address: string;
}

interface StudentFormState {
  schoolId: string;
  nis: string;
  nisn: string;
  nik: string;
  noKk: string;
  fullName: string;
  nickname: string;
  gender: 'L' | 'P';
  birthDate: string;
  birthPlace: string;
  religion: string;
  phone: string;
  telepon: string;
  email: string;
  photoUrl: string;
  status: StudentStatus;
  entryDate: string;
  classId: string;
  // Alamat
  address: string;
  rt: string;
  rw: string;
  dusun: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  province: string;
  postalCode: string;
  lintang: string;
  bujur: string;
  // Data Periodik & Dokumen Dapodik
  skhun: string;
  noPesertaUn: string;
  noIjazah: string;
  noAktaLahir: string;
  anakKe: string;
  jmlSaudara: string;
  beratBadan: string;
  tinggiBadan: string;
  lingkarKepala: string;
  jarakSekolah: string;
  jenisTinggal: string;
  alatTransportasi: string;
  kebutuhanKhusus: string;
  sekolahAsal: string;
  bank: string;
  noRekening: string;
  namaRekening: string;
}

interface EconomicFormState {
  hasKip: boolean;
  kipNumber: string;
  namaKip: string;
  layakPip: boolean;
  alasanLayakPip: string;
  hasKks: boolean;
  kksNumber: string;
  hasPkh: boolean;
  isDtks: boolean;
  houseOwnership: string;
  houseCondition: string;
  dependentsCount: string;
  orphanType: OrphanType;
  desil: string;
}

const getLocalTodayIso = (): string => new Date().toLocaleDateString('en-CA');

/**
 * Menerjemahkan error teknis (API, Supabase, Constraint Database, atau Jaringan)
 * menjadi pesan bahasa Indonesia yang jelas bagi operator sekolah.
 */
const extractFriendlyErrorMessage = (error: unknown, fallback: string): string => {
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
      code?: string;
    };

    // 1. Prioritaskan pesan terstruktur dari backend/API
    const apiMessage = errObj.response?.data?.message;
    if (Array.isArray(apiMessage) && apiMessage.length > 0) {
      return apiMessage.join(', ');
    }
    if (typeof apiMessage === 'string' && apiMessage.trim() !== '') {
      return apiMessage;
    }
    if (
      typeof errObj.response?.data?.error === 'string' &&
      errObj.response.data.error.trim() !== ''
    ) {
      return errObj.response.data.error;
    }

    // 2. Terjemahkan error database Supabase / PostgreSQL / Jaringan
    if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
      const rawMsg = errObj.message;
      const lowerMsg = rawMsg.toLowerCase();

      if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
        return 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
      }

      if (
        lowerMsg.includes('duplicate key') ||
        lowerMsg.includes('unique constraint') ||
        errObj.code === '23505'
      ) {
        if (lowerMsg.includes('nisn')) {
          return 'NISN tersebut sudah terdaftar pada siswa lain di sekolah ini.';
        }
        if (lowerMsg.includes('nik')) {
          return 'NIK tersebut sudah terdaftar pada data siswa lain.';
        }
        if (lowerMsg.includes('nis')) {
          return 'NIS tersebut sudah digunakan oleh siswa lain di sekolah ini.';
        }
        return 'Data ganda terdeteksi (NISN, NIK, atau NIS sudah terdaftar pada siswa lain).';
      }

      if (lowerMsg.includes('invalid input syntax for type uuid') || errObj.code === '22P02') {
        return 'Format tautan atau ID data siswa tidak valid.';
      }

      if (
        lowerMsg.includes('invalid input syntax') ||
        lowerMsg.includes('date/time field value out of range')
      ) {
        return 'Format tanggal atau angka tidak valid. Periksa kembali isian formulir Anda.';
      }

      if (lowerMsg.includes('permission denied') || lowerMsg.includes('row-level security')) {
        return 'Anda tidak memiliki izin untuk menyimpan data siswa pada sekolah ini.';
      }

      if (
        lowerMsg.includes('json object requested, multiple (or no) rows returned') ||
        errObj.code === 'PGRST116'
      ) {
        return 'Data peserta didik tidak ditemukan atau sudah dihapus.';
      }

      return rawMsg;
    }
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }

  return fallback;
};

const emptyParent = (): ParentFormState => ({
  fullName: '',
  nik: '',
  birthYear: '',
  phone: '',
  email: '',
  education: '',
  occupation: '',
  monthlyIncome: '',
  isAlive: true,
  address: '',
});

const createInitialStudentState = (defaultSchoolId = ''): StudentFormState => ({
  schoolId: defaultSchoolId,
  nis: '',
  nisn: '',
  nik: '',
  noKk: '',
  fullName: '',
  nickname: '',
  gender: 'L',
  birthDate: '',
  birthPlace: '',
  religion: 'ISLAM',
  phone: '',
  telepon: '',
  email: '',
  photoUrl: '',
  status: 'AKTIF',
  entryDate: getLocalTodayIso(),
  classId: '',
  address: '',
  rt: '',
  rw: '',
  dusun: '',
  kelurahan: '',
  kecamatan: '',
  city: 'Kabupaten Sleman',
  province: 'DI Yogyakarta',
  postalCode: '',
  lintang: '',
  bujur: '',
  skhun: '',
  noPesertaUn: '',
  noIjazah: '',
  noAktaLahir: '',
  anakKe: '',
  jmlSaudara: '',
  beratBadan: '',
  tinggiBadan: '',
  lingkarKepala: '',
  jarakSekolah: '',
  jenisTinggal: 'Bersama Orang Tua',
  alatTransportasi: 'Sepeda Motor',
  kebutuhanKhusus: 'Tidak Ada',
  sekolahAsal: '',
  bank: '',
  noRekening: '',
  namaRekening: '',
});

const initialEconomicState: EconomicFormState = {
  hasKip: false,
  kipNumber: '',
  namaKip: '',
  layakPip: false,
  alasanLayakPip: '',
  hasKks: false,
  kksNumber: '',
  hasPkh: false,
  isDtks: false,
  houseOwnership: 'MILIK_SENDIRI',
  houseCondition: 'LAYAK',
  dependentsCount: '',
  orphanType: 'BUKAN',
  desil: '',
};

const INCOME_OPTIONS = [
  'Tidak Berpenghasilan',
  'Kurang dari Rp 500.000',
  'Rp 500.000 - Rp 999.999',
  'Rp 1.000.000 - Rp 1.999.999',
  'Rp 2.000.000 - Rp 4.999.999',
  'Rp 5.000.000 - Rp 20.000.000',
  'Lebih dari Rp 20.000.000',
];

const EDUCATION_OPTIONS = [
  'Tidak Sekolah',
  'Putus SD',
  'SD / Sederajat',
  'SMP / Sederajat',
  'SMA / Sederajat',
  'D1',
  'D2',
  'D3',
  'D4 / S1',
  'S2',
  'S3',
];

export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabKey>('biodata');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [canManage, setCanManage] = useState<boolean>(false);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [student, setStudent] = useState<StudentFormState>(() =>
    createInitialStudentState(school?.id || '')
  );
  const [ayah, setAyah] = useState<ParentFormState>(emptyParent());
  const [ibu, setIbu] = useState<ParentFormState>(emptyParent());
  const [wali, setWali] = useState<ParentFormState>(emptyParent());
  const [economic, setEconomic] = useState<EconomicFormState>(initialEconomicState);

  const pipPreview = useMemo(
    () => calculatePipPriorityScore(economic, ayah, ibu),
    [economic, ayah, ibu]
  );

  // 1. Cek Otorisasi & Muat Data Siswa (jika mode Edit)
  const initForm = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setErrorMsg(null);

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user) {
        throw new Error('Sesi login Anda telah berakhir. Silakan masuk kembali.');
      }

      const [{ data: profile }, { data: allRoles }] = await Promise.all([
        supabase.from('users').select('schoolId, role, isActive').eq('id', user.id).maybeSingle(),
        supabase.rpc('get_user_all_roles'),
      ]);

      const effectiveRoles: string[] = Array.from(
        new Set([
          ...(Array.isArray(allRoles) ? (allRoles as string[]) : []),
          ...(profile?.role ? [profile.role] : []),
        ])
      );

      const allowed = effectiveRoles.some((r) =>
        (MANAGE_STUDENT_ROLES as readonly string[]).includes(r)
      );
      const superAdm = effectiveRoles.includes('SUPER_ADMIN');

      setCanManage(allowed);
      setIsSuperAdmin(superAdm);

      if (!allowed) {
        setLoadError('Role Anda tidak memiliki izin untuk menambah atau mengubah data siswa.');
        setLoading(false);
        return;
      }

      let resolvedSchoolId = school?.id || profile?.schoolId || '';

      if (superAdm) {
        const { data: schoolList } = await supabase
          .from('schools')
          .select('id, name, npsn')
          .order('name');
        if (schoolList) {
          setSchools(schoolList as SchoolOption[]);
          if (!resolvedSchoolId && schoolList.length > 0) {
            resolvedSchoolId = schoolList[0].id;
          }
        }
      }

      if (isEdit && id) {
        const res = await studentService.getById(
          id,
          superAdm ? undefined : resolvedSchoolId || undefined
        );
        const stData = res.data;

        setStudent({
          schoolId: stData.schoolId || '',
          nis: stData.nis || '',
          nisn: stData.nisn || '',
          nik: stData.nik || '',
          noKk: stData.noKk || '',
          fullName: stData.fullName || '',
          nickname: stData.nickname || '',
          gender: stData.gender === 'P' ? 'P' : 'L',
          birthDate: stData.birthDate ? String(stData.birthDate).slice(0, 10) : '',
          birthPlace: stData.birthPlace || '',
          religion: stData.religion || 'ISLAM',
          phone: stData.phone || '',
          telepon: stData.telepon || '',
          email: stData.email || '',
          photoUrl: stData.photoUrl || '',
          status: stData.status || 'AKTIF',
          entryDate: stData.entryDate ? String(stData.entryDate).slice(0, 10) : '',
          classId: stData.classId || '',
          address: stData.address || '',
          rt: stData.rt || '',
          rw: stData.rw || '',
          dusun: stData.dusun || '',
          kelurahan: stData.kelurahan || '',
          kecamatan: stData.kecamatan || '',
          city: stData.city || '',
          province: stData.province || '',
          postalCode: stData.postalCode || '',
          lintang: stData.lintang || '',
          bujur: stData.bujur || '',
          skhun: stData.skhun || '',
          noPesertaUn: stData.noPesertaUn || '',
          noIjazah: stData.noIjazah || '',
          noAktaLahir: stData.noAktaLahir || '',
          anakKe: stData.anakKe != null ? String(stData.anakKe) : '',
          jmlSaudara: stData.jmlSaudara != null ? String(stData.jmlSaudara) : '',
          beratBadan: stData.beratBadan != null ? String(stData.beratBadan) : '',
          tinggiBadan: stData.tinggiBadan != null ? String(stData.tinggiBadan) : '',
          lingkarKepala: stData.lingkarKepala != null ? String(stData.lingkarKepala) : '',
          jarakSekolah: stData.jarakSekolah != null ? String(stData.jarakSekolah) : '',
          jenisTinggal: stData.jenisTinggal || '',
          alatTransportasi: stData.alatTransportasi || '',
          kebutuhanKhusus: stData.kebutuhanKhusus || '',
          sekolahAsal: stData.sekolahAsal || '',
          bank: stData.bank || '',
          noRekening: stData.noRekening || '',
          namaRekening: stData.namaRekening || '',
        });

        if (Array.isArray(stData.parents)) {
          for (const p of stData.parents) {
            const mapped: ParentFormState = {
              fullName: p.fullName || '',
              nik: p.nik || '',
              birthYear: p.birthYear || '',
              phone: p.phone || '',
              email: p.email || '',
              education: p.education || '',
              occupation: p.occupation || '',
              monthlyIncome: p.monthlyIncome || '',
              isAlive: p.isAlive ?? true,
              address: p.address || '',
            };
            if (p.relation === 'AYAH') setAyah(mapped);
            else if (p.relation === 'IBU') setIbu(mapped);
            else if (p.relation === 'WALI') setWali(mapped);
          }
        }

        if (stData.economic) {
          const ecoRow = stData.economic;
          setEconomic({
            hasKip: Boolean(ecoRow.hasKip),
            kipNumber: ecoRow.kipNumber || '',
            namaKip: ecoRow.namaKip || '',
            layakPip: Boolean(ecoRow.layakPip),
            alasanLayakPip: ecoRow.alasanLayakPip || '',
            hasKks: Boolean(ecoRow.hasKks),
            kksNumber: ecoRow.kksNumber || '',
            hasPkh: Boolean(ecoRow.hasPkh),
            isDtks: Boolean(ecoRow.isDtks),
            houseOwnership: ecoRow.houseOwnership || 'MILIK_SENDIRI',
            houseCondition: ecoRow.houseCondition || 'LAYAK',
            dependentsCount:
              ecoRow.dependentsCount != null ? String(ecoRow.dependentsCount) : '',
            orphanType:
              ecoRow.orphanType === 'YATIM' ||
                ecoRow.orphanType === 'PIATU' ||
                ecoRow.orphanType === 'YATIM_PIATU'
                ? ecoRow.orphanType
                : 'BUKAN',
            desil: ecoRow.desil != null ? String(ecoRow.desil) : '',
          });
        }
      } else if (resolvedSchoolId) {
        setStudent((prev) => ({
          ...prev,
          schoolId: resolvedSchoolId,
          city: school?.city || prev.city,
          province: school?.province || prev.province,
        }));
      }
    } catch (err: unknown) {
      setLoadError(
        extractFriendlyErrorMessage(
          err,
          'Gagal memuat formulir peserta didik. Silakan periksa koneksi Anda lalu coba lagi.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, school?.city, school?.id, school?.province]);

  useEffect(() => {
    initForm();
  }, [initForm]);

  // 2. Muat Daftar Kelas setiap kali schoolId berubah
  useEffect(() => {
    let mounted = true;
    async function loadSchoolAcademicData() {
      if (!student.schoolId) return;

      const [{ data: activeYear }, { data: classList }] = await Promise.all([
        supabase
          .from('academic_years')
          .select('id')
          .eq('schoolId', student.schoolId)
          .eq('isActive', true)
          .maybeSingle(),
        supabase
          .from('classes')
          .select('id, name, gradeLevel, major, academicYearId')
          .eq('schoolId', student.schoolId)
          .order('gradeLevel', { ascending: true })
          .order('name', { ascending: true }),
      ]);

      if (!mounted) return;
      const yearId = activeYear?.id || null;
      const allClasses = (classList as ClassOption[]) || [];

      const activeClasses = yearId
        ? allClasses.filter((c) => c.academicYearId === yearId)
        : allClasses;

      const baseClasses = activeClasses.length > 0 ? activeClasses : allClasses;

      // Pastikan kelas siswa saat ini tetap tampil di dropdown jika berasal dari TA sebelumnya
      if (student.classId && !baseClasses.some((c) => c.id === student.classId)) {
        const currentAssigned = allClasses.find((c) => c.id === student.classId);
        setClasses(currentAssigned ? [currentAssigned, ...baseClasses] : baseClasses);
      } else {
        setClasses(baseClasses);
      }
    }

    loadSchoolAcademicData();
    return () => {
      mounted = false;
    };
  }, [student.classId, student.schoolId]);

  const updateStudentField = <K extends keyof StudentFormState>(
    key: K,
    value: StudentFormState[K]
  ) => {
    setStudent((prev) => ({ ...prev, [key]: value }));
  };

  const toNullableText = (val: string): string | null => {
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  };

  const toNullableInt = (val: string): number | null => {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toNullableFloat = (val: string): number | null => {
    const trimmed = val.trim().replace(',', '.');
    if (trimmed === '') return null;
    const parsed = parseFloat(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!student.schoolId) {
      const msg = 'Sekolah aktif wajib dipilih terlebih dahulu.';
      setErrorMsg(msg);
      setActiveTab('biodata');
      toast.error(msg);
      return;
    }
    if (!student.fullName.trim()) {
      const msg = 'Nama lengkap siswa wajib diisi.';
      setErrorMsg(msg);
      setActiveTab('biodata');
      toast.error(msg);
      return;
    }
    if (!student.nisn.trim()) {
      const msg = 'NISN siswa wajib diisi.';
      setErrorMsg(msg);
      setActiveTab('biodata');
      toast.error(msg);
      return;
    }
    if (!student.nik.trim()) {
      const msg = 'NIK siswa wajib diisi.';
      setErrorMsg(msg);
      setActiveTab('biodata');
      toast.error(msg);
      return;
    }
    if (!student.birthPlace.trim() || !student.birthDate) {
      const msg = 'Tempat dan tanggal lahir siswa wajib diisi.';
      setErrorMsg(msg);
      setActiveTab('biodata');
      toast.error(msg);
      return;
    }
    if (!student.address.trim() || !student.city.trim() || !student.province.trim()) {
      const msg = 'Alamat jalan, Kabupaten/Kota, dan Provinsi wajib diisi.';
      setErrorMsg(msg);
      setActiveTab('alamat');
      toast.error(msg);
      return;
    }

    const anakKeNum = toNullableInt(student.anakKe);
    if (anakKeNum !== null && anakKeNum <= 0) {
      const msg = 'Anak ke- harus bernilai minimal 1 (atau kosongkan).';
      setErrorMsg(msg);
      setActiveTab('dapodik');
      toast.error(msg);
      return;
    }

    const jmlSaudaraNum = toNullableInt(student.jmlSaudara);
    if (jmlSaudaraNum !== null && jmlSaudaraNum < 0) {
      const msg = 'Jumlah saudara tidak boleh negatif.';
      setErrorMsg(msg);
      setActiveTab('dapodik');
      toast.error(msg);
      return;
    }

    const desilNum = toNullableInt(economic.desil);
    if (desilNum !== null && (desilNum < 1 || desilNum > 10)) {
      const msg = 'Desil kesejahteraan harus berada di antara 1 sampai 10.';
      setErrorMsg(msg);
      setActiveTab('ekonomi');
      toast.error(msg);
      return;
    }

    const dependentsNum = toNullableInt(economic.dependentsCount);
    if (dependentsNum !== null && dependentsNum < 0) {
      const msg = 'Jumlah tanggungan keluarga tidak boleh negatif.';
      setErrorMsg(msg);
      setActiveTab('ekonomi');
      toast.error(msg);
      return;
    }

    try {
      setSaving(true);

      const parentPayloads: CreateStudentParentPayload[] = (
        [
          { relation: 'AYAH', data: ayah },
          { relation: 'IBU', data: ibu },
          { relation: 'WALI', data: wali },
        ] as const
      )
        .filter((item) => Boolean(item.data.fullName.trim()))
        .map((item) => ({
          relation: item.relation,
          fullName: item.data.fullName.trim(),
          nik: toNullableText(item.data.nik),
          birthYear: toNullableText(item.data.birthYear),
          phone: toNullableText(item.data.phone),
          email: toNullableText(item.data.email),
          education: toNullableText(item.data.education),
          occupation: toNullableText(item.data.occupation),
          monthlyIncome: toNullableText(item.data.monthlyIncome),
          isAlive: item.data.isAlive,
          address: toNullableText(item.data.address),
        }));

      const isOrphan =
        economic.orphanType === 'YATIM' ||
        economic.orphanType === 'PIATU' ||
        economic.orphanType === 'YATIM_PIATU';

      const payload: CreateStudentPayload = {
        schoolId: student.schoolId,
        nis: toNullableText(student.nis),
        nisn: student.nisn.trim(),
        nik: student.nik.trim(),
        noKk: toNullableText(student.noKk),
        fullName: student.fullName.trim(),
        nickname: toNullableText(student.nickname),
        gender: student.gender,
        birthDate: student.birthDate.slice(0, 10),
        birthPlace: student.birthPlace.trim(),
        religion: toNullableText(student.religion),
        address: student.address.trim(),
        rt: toNullableText(student.rt),
        rw: toNullableText(student.rw),
        dusun: toNullableText(student.dusun),
        kelurahan: toNullableText(student.kelurahan),
        kecamatan: toNullableText(student.kecamatan),
        city: student.city.trim(),
        province: student.province.trim(),
        postalCode: toNullableText(student.postalCode),
        telepon: toNullableText(student.telepon),
        phone: toNullableText(student.phone),
        email: toNullableText(student.email),
        photoUrl: toNullableText(student.photoUrl),
        status: student.status,
        entryDate: student.entryDate ? student.entryDate.slice(0, 10) : null,
        classId: student.classId || null,
        skhun: toNullableText(student.skhun),
        noPesertaUn: toNullableText(student.noPesertaUn),
        noIjazah: toNullableText(student.noIjazah),
        noAktaLahir: toNullableText(student.noAktaLahir),
        anakKe: anakKeNum,
        jmlSaudara: jmlSaudaraNum,
        lintang: toNullableText(student.lintang),
        bujur: toNullableText(student.bujur),
        beratBadan: toNullableFloat(student.beratBadan),
        tinggiBadan: toNullableFloat(student.tinggiBadan),
        lingkarKepala: toNullableFloat(student.lingkarKepala),
        jarakSekolah: toNullableFloat(student.jarakSekolah),
        jenisTinggal: toNullableText(student.jenisTinggal),
        alatTransportasi: toNullableText(student.alatTransportasi),
        kebutuhanKhusus: toNullableText(student.kebutuhanKhusus),
        sekolahAsal: toNullableText(student.sekolahAsal),
        bank: toNullableText(student.bank),
        noRekening: toNullableText(student.noRekening),
        namaRekening: toNullableText(student.namaRekening),
        parents: parentPayloads,
        economic: {
          hasKip: economic.hasKip,
          kipNumber: economic.hasKip ? toNullableText(economic.kipNumber) : null,
          namaKip: economic.hasKip ? toNullableText(economic.namaKip) : null,
          layakPip: economic.layakPip,
          alasanLayakPip: economic.layakPip ? toNullableText(economic.alasanLayakPip) : null,
          hasKks: economic.hasKks,
          kksNumber: economic.hasKks ? toNullableText(economic.kksNumber) : null,
          hasPkh: economic.hasPkh,
          isDtks: economic.isDtks,
          houseOwnership: toNullableText(economic.houseOwnership),
          houseCondition: toNullableText(economic.houseCondition),
          dependentsCount: dependentsNum,
          isOrphan,
          orphanType: economic.orphanType,
          pipScore: pipPreview.pipScore,
          economicCategory: pipPreview.economicCategory,
          scoringDetails: pipPreview.scoringDetails,
          desil: desilNum,
          scoredAt: new Date().toISOString(),
        },
      };

      const savedRes =
        isEdit && id
          ? await studentService.update(id, payload, student.schoolId)
          : await studentService.create(payload);

      const savedStudentId = savedRes.data.id;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['student', savedStudentId] }),
        queryClient.invalidateQueries({ queryKey: ['users-list'] }),
      ]);

      const msg = isEdit
        ? 'Data siswa berhasil diperbarui.'
        : 'Data siswa baru berhasil disimpan.';
      setSuccessMsg(msg);
      toast.success(msg);
      navigate(`/students/${savedStudentId}`);
    } catch (err: unknown) {
      const msg = extractFriendlyErrorMessage(
        err,
        'Terjadi kesalahan saat menyimpan data siswa. Periksa kembali isian Anda.'
      );
      setErrorMsg(msg);
      toast.error(msg, { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="text-sm font-medium">Memuat formulir peserta didik...</span>
        </div>
      </div>
    );
  }

  if (!canManage || loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>
              {!canManage ? 'Akses Dibatasi' : 'Gagal Memuat Formulir Siswa'}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            {loadError || 'Anda tidak memiliki izin untuk mengakses halaman ini.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {canManage && (
              <button
                type="button"
                onClick={initForm}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
              >
                <RefreshCw className="h-4 w-4" />
                Muat Ulang
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/students')}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Daftar Siswa
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'biodata', label: '1. Biodata & Akademik', icon: <User className="h-4 w-4" /> },
    { key: 'alamat', label: '2. Alamat & Koordinat', icon: <MapPin className="h-4 w-4" /> },
    { key: 'dapodik', label: '3. Periodik & Dokumen', icon: <FileText className="h-4 w-4" /> },
    { key: 'ortu', label: '4. Orang Tua / Wali', icon: <Users className="h-4 w-4" /> },
    { key: 'ekonomi', label: '5. Kesejahteraan & PIP', icon: <HeartHandshake className="h-4 w-4" /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(isEdit && id ? `/students/${id}` : '/students')}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isEdit ? 'Edit Data Peserta Didik' : 'Tambah Peserta Didik Baru'}
            </h1>
            <p className="text-sm text-slate-500">
              Terintegrasi data Dapodik PD, Riwayat Rombel, Orang Tua & Skoring PIP
            </p>
          </div>
        </div>

        <button
          type="submit"
          form="student-form"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Simpan Data Siswa'}
        </button>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Gagal Menyimpan Data Siswa</p>
              <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            title="Tutup pesan error"
            className="rounded-lg p-1 text-rose-600 transition hover:bg-rose-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>{successMsg}</div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Form Body */}
      <form id="student-form" onSubmit={handleSubmit} className="space-y-6">
        {/* TAB 1: BIODATA & AKADEMIK */}
        {activeTab === 'biodata' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Identitas Utama & Penempatan Rombel
            </h2>

            {isSuperAdmin && schools.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                  <School className="h-4 w-4" />
                  Pilih Sekolah Tujuan (Mode Super Admin)
                </label>
                <select
                  value={student.schoolId}
                  disabled={isEdit}
                  onChange={(e) => {
                    updateStudentField('schoolId', e.target.value);
                    updateStudentField('classId', '');
                  }}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none disabled:opacity-70"
                >
                  <option value="">-- Pilih Sekolah --</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (NPSN: {s.npsn})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Lengkap (Sesuai Akta/Ijazah) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.fullName}
                  onChange={(e) => updateStudentField('fullName', e.target.value)}
                  placeholder="Contoh: Ahmad Fauzan Pratama"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Panggilan
                </label>
                <input
                  type="text"
                  value={student.nickname}
                  onChange={(e) => updateStudentField('nickname', e.target.value)}
                  placeholder="Contoh: Fauzan"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  NISN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.nisn}
                  onChange={(e) => updateStudentField('nisn', e.target.value)}
                  placeholder="10 digit NISN"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  NIS (Nomor Induk Sekolah)
                </label>
                <input
                  type="text"
                  value={student.nis}
                  onChange={(e) => updateStudentField('nis', e.target.value)}
                  placeholder="Opsional"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  NIK Siswa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.nik}
                  onChange={(e) => updateStudentField('nik', e.target.value)}
                  placeholder="16 digit NIK"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nomor Kartu Keluarga (No. KK)
                </label>
                <input
                  type="text"
                  value={student.noKk}
                  onChange={(e) => updateStudentField('noKk', e.target.value)}
                  placeholder="16 digit No. KK"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Jenis Kelamin <span className="text-rose-500">*</span>
                </label>
                <select
                  value={student.gender}
                  onChange={(e) => updateStudentField('gender', e.target.value as 'L' | 'P')}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="L">Laki-laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Agama</label>
                <select
                  value={student.religion}
                  onChange={(e) => updateStudentField('religion', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ISLAM">Islam</option>
                  <option value="KRISTEN">Kristen</option>
                  <option value="KATOLIK">Katolik</option>
                  <option value="HINDU">Hindu</option>
                  <option value="BUDDHA">Buddha</option>
                  <option value="KONGHUCU">Konghucu</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Tempat Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.birthPlace}
                  onChange={(e) => updateStudentField('birthPlace', e.target.value)}
                  placeholder="Contoh: Sleman"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Tanggal Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={student.birthDate}
                  onChange={(e) => updateStudentField('birthDate', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Tanggal Masuk Sekolah
                </label>
                <input
                  type="date"
                  value={student.entryDate}
                  onChange={(e) => updateStudentField('entryDate', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Kelas / Rombongan Belajar
                </label>
                <select
                  value={student.classId}
                  onChange={(e) => updateStudentField('classId', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Belum Ditempatkan --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} {cls.major ? `(${cls.major})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Status Peserta Didik
                </label>
                <select
                  value={student.status}
                  onChange={(e) =>
                    updateStudentField('status', e.target.value as StudentStatus)
                  }
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="MUTASI_KELUAR">MUTASI KELUAR</option>
                  <option value="LULUS">LULUS</option>
                  <option value="DO">DROP OUT (DO)</option>
                  <option value="CUTI">CUTI</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  No. HP / WhatsApp Siswa
                </label>
                <input
                  type="text"
                  value={student.phone}
                  onChange={(e) => updateStudentField('phone', e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Telepon Rumah
                </label>
                <input
                  type="text"
                  value={student.telepon}
                  onChange={(e) => updateStudentField('telepon', e.target.value)}
                  placeholder="0274-xxxxxx"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Email Siswa
                </label>
                <input
                  type="email"
                  value={student.email}
                  onChange={(e) => updateStudentField('email', e.target.value)}
                  placeholder="siswa@domain.sch.id"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  URL Foto Profil
                </label>
                <input
                  type="url"
                  value={student.photoUrl}
                  onChange={(e) => updateStudentField('photoUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALAMAT & KOORDINAT */}
        {activeTab === 'alamat' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Alamat Domisili & Titik Koordinat Zonasi
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Alamat Jalan / Dusun Utama <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.address}
                  onChange={(e) => updateStudentField('address', e.target.value)}
                  placeholder="Contoh: Jl. Solo Km. 11,5 Sribit"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">RT</label>
                <input
                  type="text"
                  value={student.rt}
                  onChange={(e) => updateStudentField('rt', e.target.value)}
                  placeholder="001"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">RW</label>
                <input
                  type="text"
                  value={student.rw}
                  onChange={(e) => updateStudentField('rw', e.target.value)}
                  placeholder="002"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Dusun / Padukuhan
                </label>
                <input
                  type="text"
                  value={student.dusun}
                  onChange={(e) => updateStudentField('dusun', e.target.value)}
                  placeholder="Contoh: Sribit"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Desa / Kelurahan
                </label>
                <input
                  type="text"
                  value={student.kelurahan}
                  onChange={(e) => updateStudentField('kelurahan', e.target.value)}
                  placeholder="Contoh: Sendangtirto"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Kecamatan / Kapanewon
                </label>
                <input
                  type="text"
                  value={student.kecamatan}
                  onChange={(e) => updateStudentField('kecamatan', e.target.value)}
                  placeholder="Contoh: Berbah"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Kabupaten / Kota <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.city}
                  onChange={(e) => updateStudentField('city', e.target.value)}
                  placeholder="Contoh: Kabupaten Sleman"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Provinsi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={student.province}
                  onChange={(e) => updateStudentField('province', e.target.value)}
                  placeholder="Contoh: DI Yogyakarta"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Kode Pos</label>
                <input
                  type="text"
                  value={student.postalCode}
                  onChange={(e) => updateStudentField('postalCode', e.target.value)}
                  placeholder="55573"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Lintang (Latitude)
                </label>
                <input
                  type="text"
                  value={student.lintang}
                  onChange={(e) => updateStudentField('lintang', e.target.value)}
                  placeholder="-7.775123"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Bujur (Longitude)
                </label>
                <input
                  type="text"
                  value={student.bujur}
                  onChange={(e) => updateStudentField('bujur', e.target.value)}
                  placeholder="110.456789"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DATA PERIODIK, DOKUMEN DAPODIK & REKENING */}
        {activeTab === 'dapodik' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Data Periodik Fisik, Keluarga & Transportasi
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Anak Ke-
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={student.anakKe}
                    onChange={(e) => updateStudentField('anakKe', e.target.value)}
                    placeholder="1"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Jumlah Saudara Kandung
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={student.jmlSaudara}
                    onChange={(e) => updateStudentField('jmlSaudara', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Tinggi Badan (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={student.tinggiBadan}
                    onChange={(e) => updateStudentField('tinggiBadan', e.target.value)}
                    placeholder="165"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Berat Badan (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={student.beratBadan}
                    onChange={(e) => updateStudentField('beratBadan', e.target.value)}
                    placeholder="55"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Lingkar Kepala (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={student.lingkarKepala}
                    onChange={(e) => updateStudentField('lingkarKepala', e.target.value)}
                    placeholder="54"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Jarak ke Sekolah (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={student.jarakSekolah}
                    onChange={(e) => updateStudentField('jarakSekolah', e.target.value)}
                    placeholder="2.5"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Jenis Tinggal
                  </label>
                  <select
                    value={student.jenisTinggal}
                    onChange={(e) => updateStudentField('jenisTinggal', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Bersama Orang Tua">Bersama Orang Tua</option>
                    <option value="Wali">Wali</option>
                    <option value="Kos">Kos</option>
                    <option value="Asrama">Asrama</option>
                    <option value="Panti Asuhan">Panti Asuhan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Alat Transportasi
                  </label>
                  <select
                    value={student.alatTransportasi}
                    onChange={(e) => updateStudentField('alatTransportasi', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Jalan Kaki">Jalan Kaki</option>
                    <option value="Sepeda">Sepeda</option>
                    <option value="Sepeda Motor">Sepeda Motor</option>
                    <option value="Angkutan Umum / Bus">Angkutan Umum / Bus</option>
                    <option value="Antar Jemput Sekolah">Antar Jemput Sekolah</option>
                    <option value="Kendaraan Pribadi">Kendaraan Pribadi</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Sekolah Asal (SMP/MTs/SD)
                  </label>
                  <input
                    type="text"
                    value={student.sekolahAsal}
                    onChange={(e) => updateStudentField('sekolahAsal', e.target.value)}
                    placeholder="Contoh: SMP Muhammadiyah 1 Berbah"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Kebutuhan Khusus
                  </label>
                  <input
                    type="text"
                    value={student.kebutuhanKhusus}
                    onChange={(e) => updateStudentField('kebutuhanKhusus', e.target.value)}
                    placeholder="Tidak Ada"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Nomor Registrasi Dokumen & Rekening Bank (PIP/Beasiswa)
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    No. Registrasi Akta Lahir
                  </label>
                  <input
                    type="text"
                    value={student.noAktaLahir}
                    onChange={(e) => updateStudentField('noAktaLahir', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    No. Peserta Ujian Nasional (UN)
                  </label>
                  <input
                    type="text"
                    value={student.noPesertaUn}
                    onChange={(e) => updateStudentField('noPesertaUn', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    No. Seri Ijazah Sebelumnya
                  </label>
                  <input
                    type="text"
                    value={student.noIjazah}
                    onChange={(e) => updateStudentField('noIjazah', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    No. Seri SKHUN
                  </label>
                  <input
                    type="text"
                    value={student.skhun}
                    onChange={(e) => updateStudentField('skhun', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Nama Bank</label>
                  <input
                    type="text"
                    value={student.bank}
                    onChange={(e) => updateStudentField('bank', e.target.value)}
                    placeholder="Contoh: BRI / BNI / BPD DIY"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    value={student.noRekening}
                    onChange={(e) => updateStudentField('noRekening', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Rekening Atas Nama
                  </label>
                  <input
                    type="text"
                    value={student.namaRekening}
                    onChange={(e) => updateStudentField('namaRekening', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ORANG TUA / WALI */}
        {activeTab === 'ortu' && (
          <div className="space-y-6">
            {[
              { title: 'Data Ayah Kandung', state: ayah, setter: setAyah },
              { title: 'Data Ibu Kandung', state: ibu, setter: setIbu },
              { title: 'Data Wali (Opsional)', state: wali, setter: setWali },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">{group.title}</h2>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={group.state.isAlive}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, isAlive: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Masih Hidup
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      value={group.state.fullName}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      placeholder="Kosongkan jika tidak ada data"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">NIK</label>
                    <input
                      type="text"
                      value={group.state.nik}
                      onChange={(e) => group.setter((prev) => ({ ...prev, nik: e.target.value }))}
                      placeholder="16 digit NIK"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Tahun Lahir
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={group.state.birthYear}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, birthYear: e.target.value }))
                      }
                      placeholder="1980"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Pendidikan Terakhir
                    </label>
                    <select
                      value={group.state.education}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, education: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Pilih Pendidikan --</option>
                      {EDUCATION_OPTIONS.map((ed) => (
                        <option key={ed} value={ed}>
                          {ed}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Pekerjaan
                    </label>
                    <input
                      type="text"
                      value={group.state.occupation}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, occupation: e.target.value }))
                      }
                      placeholder="Contoh: Wiraswasta / Petani / Guru"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Penghasilan Bulanan
                    </label>
                    <select
                      value={group.state.monthlyIncome}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, monthlyIncome: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Pilih Rentang Penghasilan --</option>
                      {INCOME_OPTIONS.map((inc) => (
                        <option key={inc} value={inc}>
                          {inc}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      No. HP / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={group.state.phone}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="08xxxxxxxxxx"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Email</label>
                    <input
                      type="email"
                      value={group.state.email}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="ortu@email.com"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Alamat (Jika berbeda dengan siswa)
                    </label>
                    <input
                      type="text"
                      value={group.state.address}
                      onChange={(e) =>
                        group.setter((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 5: KESEJAHTERAAN & SKORING PIP */}
        {activeTab === 'ekonomi' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="text-base font-semibold text-slate-900">
                Program Bantuan Sosial, DTKS & Kondisi Keluarga
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <input
                    type="checkbox"
                    checked={economic.hasKip}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, hasKip: e.target.checked }))
                    }
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Penerima KIP</div>
                    <div className="text-xs text-slate-500">Kartu Indonesia Pintar</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <input
                    type="checkbox"
                    checked={economic.hasKks}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, hasKks: e.target.checked }))
                    }
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Penerima KKS</div>
                    <div className="text-xs text-slate-500">Kartu Keluarga Sejahtera</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <input
                    type="checkbox"
                    checked={economic.hasPkh}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, hasPkh: e.target.checked }))
                    }
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Keluarga PKH</div>
                    <div className="text-xs text-slate-500">Program Keluarga Harapan</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <input
                    type="checkbox"
                    checked={economic.isDtks}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, isDtks: e.target.checked }))
                    }
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Terdaftar DTKS</div>
                    <div className="text-xs text-slate-500">Data Terpadu Kesejahteraan Sosial</div>
                  </div>
                </label>
              </div>

              {economic.hasKip && (
                <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Nomor KIP
                    </label>
                    <input
                      type="text"
                      value={economic.kipNumber}
                      onChange={(e) =>
                        setEconomic((prev) => ({ ...prev, kipNumber: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Nama Tertera di KIP
                    </label>
                    <input
                      type="text"
                      value={economic.namaKip}
                      onChange={(e) =>
                        setEconomic((prev) => ({ ...prev, namaKip: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {economic.hasKks && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Nomor KKS
                  </label>
                  <input
                    type="text"
                    value={economic.kksNumber}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, kksNumber: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={economic.layakPip}
                      onChange={(e) =>
                        setEconomic((prev) => ({ ...prev, layakPip: e.target.checked }))
                      }
                      className="h-4 w-4 rounded text-emerald-600"
                    />
                    Diusulkan Layak PIP (Dapodik)
                  </label>
                </div>

                {economic.layakPip && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Alasan Layak PIP
                    </label>
                    <input
                      type="text"
                      value={economic.alasanLayakPip}
                      onChange={(e) =>
                        setEconomic((prev) => ({ ...prev, alasanLayakPip: e.target.value }))
                      }
                      placeholder="Contoh: Pemegang PKH/KPS/KKS / Yatim Piatu / Siswa Miskin"
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Status Yatim / Piatu
                  </label>
                  <select
                    value={economic.orphanType}
                    onChange={(e) =>
                      setEconomic((prev) => ({
                        ...prev,
                        orphanType: e.target.value as OrphanType,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  >
                    <option value="BUKAN">Lengkap (Bukan Yatim/Piatu)</option>
                    <option value="YATIM">Yatim</option>
                    <option value="PIATU">Piatu</option>
                    <option value="YATIM_PIATU">Yatim Piatu</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Desil Kesejahteraan (1–10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={economic.desil}
                    onChange={(e) => setEconomic((prev) => ({ ...prev, desil: e.target.value }))}
                    placeholder="1 = Sangat Miskin, 10 = Sangat Mampu"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Kepemilikan Rumah
                  </label>
                  <select
                    value={economic.houseOwnership}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, houseOwnership: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  >
                    <option value="MILIK_SENDIRI">Milik Sendiri</option>
                    <option value="SEWA_KONTRAK">Sewa / Kontrak</option>
                    <option value="MENUMPANG">Menumpang Keluarga</option>
                    <option value="RUMAH_DINAS">Rumah Dinas</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Kondisi Bangunan Rumah
                  </label>
                  <select
                    value={economic.houseCondition}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, houseCondition: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  >
                    <option value="LAYAK">Layak Huni</option>
                    <option value="SEDERHANA">Sederhana</option>
                    <option value="TIDAK_LAYAK">Kurang / Tidak Layak Huni</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Jumlah Tanggungan Keluarga
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={economic.dependentsCount}
                    onChange={(e) =>
                      setEconomic((prev) => ({ ...prev, dependentsCount: e.target.value }))
                    }
                    placeholder="Contoh: 4"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Panel Live Preview Skor Prioritas PIP */}
            <div className="h-fit rounded-2xl border border-emerald-200 bg-linear-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800">
                <Calculator className="h-5 w-5" />
                <h3 className="font-bold">Simulasi Skor Prioritas PIP</h3>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                Dihitung otomatis dari indikator KIP, PKH, KKS, DTKS, Desil, status yatim, dan
                penghasilan orang tua.
              </p>

              <div className="mt-5 rounded-xl bg-white p-4 text-center shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Skor Kelayakan
                </div>
                <div className="mt-1 text-4xl font-extrabold text-emerald-600">
                  {pipPreview.pipScore}
                  <span className="text-base font-normal text-slate-400"> / 100</span>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  {pipPreview.economicCategory.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-700">
                <div className="font-semibold text-slate-800">Rincian Poin Indikator:</div>
                {Object.keys(pipPreview.scoringDetails).length === 0 ? (
                  <p className="text-slate-500">Belum ada indikator kerentanan ekonomi aktif.</p>
                ) : (
                  Object.entries(pipPreview.scoringDetails).map(([key, pts]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-1.5"
                    >
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="font-semibold text-emerald-700">+{pts} poin</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </motion.div>
  );
}

export default StudentFormPage;