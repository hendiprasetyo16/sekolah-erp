import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, X, ArrowLeft, ArrowRight, Loader2,
  User, GraduationCap, Briefcase, Wallet, HeartPulse, Sparkles, ShieldAlert
} from 'lucide-react';
import { studentService } from '../services/student.service';
import { supabase } from '@/services/supabase.client';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type {
  CreateStudentPayload,
  UpdateStudentPayload,
  CreateStudentParentPayload,
} from '../types/student.types';

// ==========================================
// KONSTANTA & HELPER MURNI
// ==========================================
const ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU', 'KEPALA_SEKOLAH'];

type TabKey = 'pribadi' | 'akademik' | 'orangtua' | 'ekonomi' | 'dapodik';

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

const normalizeReligion = (val?: string | null): string => {
  const upper = (val || '').trim().toUpperCase();
  if (!upper) return 'ISLAM';
  if (upper === 'KATHOLIK') return 'KATOLIK';
  if (upper === 'BUDHA') return 'BUDDHA';
  if (['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'].includes(upper)) {
    return upper;
  }
  return 'ISLAM';
};

const sanitizeParentYear = (val?: string | null): string => {
  const trimmed = (val || '').trim();
  const year = Number(trimmed);
  return /^\d{4}$/.test(trimmed) && year >= 1900 && year <= 2099 ? trimmed : '';
};

const generateTempCode = (prefix: 'TK' | 'NONIK'): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      randomPart += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      randomPart += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `${prefix}-${randomPart}`;
};

// ==========================================
// SKEMA ZOD (VALIDASI FORM + KOMPATIBEL TK/PAUD/KESETARAAN)
// ==========================================
const optionalParentYearSchema = z
  .string()
  .trim()
  .optional()
  .refine((val) => {
    if (!val) return true;
    if (!/^\d{4}$/.test(val)) return false;
    const year = Number(val);
    return year >= 1900 && year <= 2099;
  }, 'Tahun lahir harus 4 digit angka (1900–2099)');

const optionalParentNikSchema = z
  .string()
  .trim()
  .optional()
  .refine((val) => !val || /^\d{16}$/.test(val), 'NIK harus 16 digit angka');

const optionalNonNegativeNumberSchema = z
  .number({ invalid_type_error: 'Harus berupa angka' })
  .min(0, 'Nilai tidak boleh negatif')
  .optional();

const optionalPositiveIntSchema = z
  .number({ invalid_type_error: 'Harus berupa angka' })
  .int('Harus berupa bilangan bulat')
  .min(1, 'Minimal bernilai 1')
  .optional();

const optionalNonNegativeIntSchema = z
  .number({ invalid_type_error: 'Harus berupa angka' })
  .int('Harus berupa bilangan bulat')
  .min(0, 'Minimal bernilai 0')
  .optional();
const studentSchema = z.object({
  // Data Pribadi
  nis: z.string().trim().optional(),
  nisn: z
    .string()
    .trim()
    .min(1, 'NISN wajib diisi')
    .refine(
      (val) => /^TK-[A-Z0-9]+$/i.test(val) || /^\d{10}$/.test(val),
      'NISN harus 10 digit angka atau kode sementara TK-XXXX'
    ),
  nik: z
    .string()
    .trim()
    .min(1, 'NIK wajib diisi')
    .refine(
      (val) => /^NONIK-[A-Z0-9]+$/i.test(val) || /^\d{16}$/.test(val),
      'NIK harus 16 digit angka atau kode sementara NONIK-XXXX'
    ),
  noKk: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || val === '-' || /^\d{16}$/.test(val),
      'No. KK harus 16 digit angka atau tanda (-)'
    ),
  fullName: z.string().trim().min(3, 'Nama lengkap minimal 3 karakter'),
  nickname: z.string().trim().optional(),
  gender: z.enum(['L', 'P']),
  birthDate: z.string().min(1, 'Tanggal lahir wajib diisi'),
  birthPlace: z.string().trim().min(2, 'Tempat lahir wajib diisi'),
  religion: z.string().min(1, 'Agama wajib diisi'),

  // Alamat & Kontak Terpadu Dapodik
  address: z.string().trim().min(1, 'Alamat wajib diisi'),
  dusun: z.string().trim().optional(),
  rt: z.string().trim().optional(),
  rw: z.string().trim().optional(),
  kelurahan: z.string().trim().optional(),
  kecamatan: z.string().trim().optional(),
  city: z.string().trim().min(1, 'Kota wajib diisi'),
  province: z.string().trim().min(1, 'Provinsi wajib diisi'),
  postalCode: z.string().trim().optional(),
  telepon: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),

  // Akademik (`entryDate` di database bertipe NOT NULL DEFAULT CURRENT_DATE)
  classId: z.string().min(1, 'Kelas wajib dipilih'),
  entryDate: z.string().trim().optional(),
  status: z.enum(['AKTIF', 'MUTASI_KELUAR', 'LULUS', 'DO', 'CUTI']),

  // Data Orang Tua
  fatherName: z.string().trim().optional(),
  fatherBirthYear: optionalParentYearSchema,
  fatherNik: optionalParentNikSchema,
  fatherEducation: z.string().trim().optional(),
  fatherPhone: z.string().trim().optional(),
  fatherEmail: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  fatherOccupation: z.string().trim().optional(),
  fatherIncome: z.string().trim().optional(),
  fatherIsAlive: z.boolean().optional(),

  motherName: z.string().trim().optional(),
  motherBirthYear: optionalParentYearSchema,
  motherNik: optionalParentNikSchema,
  motherEducation: z.string().trim().optional(),
  motherPhone: z.string().trim().optional(),
  motherEmail: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  motherOccupation: z.string().trim().optional(),
  motherIncome: z.string().trim().optional(),
  motherIsAlive: z.boolean().optional(),

  guardianName: z.string().trim().optional(),
  guardianBirthYear: optionalParentYearSchema,
  guardianNik: optionalParentNikSchema,
  guardianEducation: z.string().trim().optional(),
  guardianPhone: z.string().trim().optional(),
  guardianEmail: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
  guardianOccupation: z.string().trim().optional(),
  guardianIncome: z.string().trim().optional(),
  guardianIsAlive: z.boolean().optional(),

  // Kesejahteraan
  hasKip: z.boolean().optional(),
  kipNumber: z.string().trim().optional(),
  namaKip: z.string().trim().optional(),
  layakPip: z.boolean().optional(),
  alasanLayakPip: z.string().trim().optional(),
  desil: z.number().int().min(0).max(10).optional(),
  hasPkh: z.boolean().optional(),
  hasKks: z.boolean().optional(),
  kksNumber: z.string().trim().optional(),
  isDtks: z.boolean().optional(),
  orphanType: z.enum(['BUKAN', 'YATIM', 'PIATU', 'YATIM_PIATU']).optional(),
  houseOwnership: z.string().trim().optional(),
  dependentsCount: optionalNonNegativeIntSchema,

  // Kolom Dapodik Lanjutan / Fisik
  skhun: z.string().trim().optional(),
  noPesertaUn: z.string().trim().optional(),
  noIjazah: z.string().trim().optional(),
  noAktaLahir: z.string().trim().optional(),
  anakKe: optionalPositiveIntSchema,
  jmlSaudara: optionalNonNegativeIntSchema,
  lintang: z.string().trim().optional(),
  bujur: z.string().trim().optional(),
  beratBadan: optionalNonNegativeNumberSchema,
  tinggiBadan: optionalNonNegativeNumberSchema,
  lingkarKepala: optionalNonNegativeNumberSchema,
  jarakSekolah: optionalNonNegativeNumberSchema,
  jenisTinggal: z.string().trim().optional(),
  alatTransportasi: z.string().trim().optional(),
  kebutuhanKhusus: z.string().trim().optional(),
  sekolahAsal: z.string().trim().optional(),
  bank: z.string().trim().optional(),
  noRekening: z.string().trim().optional(),
  namaRekening: z.string().trim().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

const TAB_FIELDS: Record<TabKey, (keyof StudentFormValues)[]> = {
  pribadi: [
    'fullName', 'nickname', 'nis', 'nisn', 'nik', 'noKk', 'gender',
    'birthPlace', 'birthDate', 'religion', 'address', 'dusun', 'rt', 'rw',
    'kelurahan', 'kecamatan', 'city', 'province', 'postalCode', 'telepon', 'phone', 'email',
  ],
  akademik: ['classId', 'entryDate', 'status'],
  orangtua: [
    'fatherName', 'fatherBirthYear', 'fatherNik', 'fatherEducation', 'fatherPhone', 'fatherEmail', 'fatherOccupation', 'fatherIncome', 'fatherIsAlive',
    'motherName', 'motherBirthYear', 'motherNik', 'motherEducation', 'motherPhone', 'motherEmail', 'motherOccupation', 'motherIncome', 'motherIsAlive',
    'guardianName', 'guardianBirthYear', 'guardianNik', 'guardianEducation', 'guardianPhone', 'guardianEmail', 'guardianOccupation', 'guardianIncome', 'guardianIsAlive',
  ],
  ekonomi: [
    'hasKip', 'kipNumber', 'namaKip', 'layakPip', 'alasanLayakPip',
    'desil', 'hasPkh', 'hasKks', 'kksNumber', 'isDtks', 'orphanType', 'houseOwnership', 'dependentsCount',
  ],
  dapodik: [
    'skhun', 'noPesertaUn', 'noIjazah', 'noAktaLahir', 'anakKe', 'jmlSaudara',
    'lintang', 'bujur', 'beratBadan', 'tinggiBadan', 'lingkarKepala', 'jarakSekolah',
    'jenisTinggal', 'alatTransportasi', 'kebutuhanKhusus', 'sekolahAsal', 'bank', 'noRekening', 'namaRekening',
  ],
};

// ==========================================
// KOMPONEN UTAMA
// ==========================================
export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const isId = locale === 'id';
  const queryClient = useQueryClient();
  const { school, user } = useAuthStore();

  const canManageData = user?.role ? ALLOWED_ROLES.includes(user.role) : false;

  const [activeTab, setActiveTab] = useState<TabKey>('pribadi');
  const hydratedStudentIdRef = useRef<string | null>(null);

  useEffect(() => {
    hydratedStudentIdRef.current = null;
  }, [id]);

  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes-list', school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .eq('schoolId', school!.id)
        .order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: Boolean(school?.id) && canManageData,
  });

  const {
    data: studentResponse,
    isLoading: isFetching,
    isError: isFetchError,
  } = useQuery({
    queryKey: ['student', id, school?.id],
    queryFn: () => studentService.getById(id!, school?.id),
    enabled: isEdit && Boolean(school?.id) && canManageData,
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    mode: 'onBlur',
    defaultValues: {
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
      address: '',
      dusun: '',
      rt: '',
      rw: '',
      kelurahan: '',
      kecamatan: '',
      city: school?.city || '',
      province: school?.province || '',
      postalCode: '',
      telepon: '',
      phone: '',
      email: '',
      classId: '',
      entryDate: isEdit ? '' : getLocalTodayIso(),
      status: 'AKTIF',

      fatherName: '',
      fatherBirthYear: '',
      fatherNik: '',
      fatherEducation: '',
      fatherPhone: '',
      fatherEmail: '',
      fatherOccupation: '',
      fatherIncome: '',
      fatherIsAlive: true,

      motherName: '',
      motherBirthYear: '',
      motherNik: '',
      motherEducation: '',
      motherPhone: '',
      motherEmail: '',
      motherOccupation: '',
      motherIncome: '',
      motherIsAlive: true,

      guardianName: '',
      guardianBirthYear: '',
      guardianNik: '',
      guardianEducation: '',
      guardianPhone: '',
      guardianEmail: '',
      guardianOccupation: '',
      guardianIncome: '',
      guardianIsAlive: true,

      hasKip: false,
      kipNumber: '',
      namaKip: '',
      layakPip: false,
      alasanLayakPip: '',
      desil: 0,
      hasPkh: false,
      hasKks: false,
      kksNumber: '',
      isDtks: false,
      orphanType: 'BUKAN',
      houseOwnership: '',
      dependentsCount: undefined,

      skhun: '',
      noPesertaUn: '',
      noIjazah: '',
      noAktaLahir: '',
      anakKe: undefined,
      jmlSaudara: undefined,
      lintang: '',
      bujur: '',
      beratBadan: undefined,
      tinggiBadan: undefined,
      lingkarKepala: undefined,
      jarakSekolah: undefined,
      jenisTinggal: '',
      alatTransportasi: '',
      kebutuhanKhusus: '',
      sekolahAsal: '',
      bank: '',
      noRekening: '',
      namaRekening: '',
    },
  });

  // Watch field boolean untuk conditional disabled (menghindari form.watch() inline di JSX)
  const watchedHasKip = useWatch({ control: form.control, name: 'hasKip' });
  const watchedLayakPip = useWatch({ control: form.control, name: 'layakPip' });
  const watchedHasKks = useWatch({ control: form.control, name: 'hasKks' });

  // Sinkronkan kota/provinsi default saat `school` baru selesai dimuat di mode tambah
  useEffect(() => {
    if (isEdit || !school) return;
    if (!form.getValues('city') && school.city && school.city !== '-') {
      form.setValue('city', school.city);
    }
    if (!form.getValues('province') && school.province && school.province !== '-') {
      form.setValue('province', school.province);
    }
  }, [isEdit, school, form]);

  // Hidrasi data siswa sekali per ID (tidak menimpa ketikan saat window refetch)
  useEffect(() => {
    const d = studentResponse?.data;
    if (!d || hydratedStudentIdRef.current === d.id) return;

    hydratedStudentIdRef.current = d.id;

    const parentsData = d.parents || [];
    const eco = d.economic;

    const ayah = parentsData.find((p) => p.relation === 'AYAH');
    const ibu = parentsData.find((p) => p.relation === 'IBU');
    const wali = parentsData.find((p) => p.relation === 'WALI');

    const resolvedOrphanType =
      eco?.orphanType && ['BUKAN', 'YATIM', 'PIATU', 'YATIM_PIATU'].includes(eco.orphanType)
        ? eco.orphanType
        : eco?.isOrphan
          ? 'YATIM'
          : 'BUKAN';

    form.reset({
      nis: d.nis === '-' ? '' : d.nis || '',
      nisn: d.nisn || '',
      nik: d.nik || '',
      noKk: d.noKk === '-' ? '' : d.noKk || '',
      fullName: d.fullName || '',
      nickname: d.nickname || '',
      gender: d.gender === 'P' ? 'P' : 'L',
      birthDate: d.birthDate?.split('T')[0] || '',
      birthPlace: d.birthPlace || '',
      religion: normalizeReligion(d.religion),
      address: d.address || '',
      dusun: d.dusun || '',
      rt: d.rt || '',
      rw: d.rw || '',
      kelurahan: d.kelurahan || '',
      kecamatan: d.kecamatan || '',
      city: d.city || '',
      province: d.province || '',
      postalCode: d.postalCode || '',
      telepon: d.telepon || '',
      phone: d.phone || '',
      email: d.email || '',
      classId: d.classId || '',
      entryDate: d.entryDate ? d.entryDate.split('T')[0] : '',
      status: d.status || 'AKTIF',

      fatherName: ayah?.fullName || '',
      fatherBirthYear: sanitizeParentYear(ayah?.birthYear),
      fatherNik: ayah?.nik || '',
      fatherEducation: ayah?.education || '',
      fatherPhone: ayah?.phone || '',
      fatherEmail: ayah?.email || '',
      fatherOccupation: ayah?.occupation || '',
      fatherIncome: ayah?.monthlyIncome || '',
      fatherIsAlive: ayah?.isAlive ?? true,

      motherName: ibu?.fullName || '',
      motherBirthYear: sanitizeParentYear(ibu?.birthYear),
      motherNik: ibu?.nik || '',
      motherEducation: ibu?.education || '',
      motherPhone: ibu?.phone || '',
      motherEmail: ibu?.email || '',
      motherOccupation: ibu?.occupation || '',
      motherIncome: ibu?.monthlyIncome || '',
      motherIsAlive: ibu?.isAlive ?? true,

      guardianName: wali?.fullName || '',
      guardianBirthYear: sanitizeParentYear(wali?.birthYear),
      guardianNik: wali?.nik || '',
      guardianEducation: wali?.education || '',
      guardianPhone: wali?.phone || '',
      guardianEmail: wali?.email || '',
      guardianOccupation: wali?.occupation || '',
      guardianIncome: wali?.monthlyIncome || '',
      guardianIsAlive: wali?.isAlive ?? true,

      hasKip: eco?.hasKip || false,
      kipNumber: eco?.kipNumber || '',
      namaKip: eco?.namaKip || '',
      layakPip: eco?.layakPip || false,
      alasanLayakPip: eco?.alasanLayakPip || '',
      desil: eco?.desil ?? 0,
      hasPkh: eco?.hasPkh || false,
      hasKks: eco?.hasKks || false,
      kksNumber: eco?.kksNumber || '',
      isDtks: eco?.isDtks || false,
      orphanType: resolvedOrphanType,
      houseOwnership: eco?.houseOwnership || '',
      dependentsCount: eco?.dependentsCount ?? undefined,

      skhun: d.skhun || '',
      noPesertaUn: d.noPesertaUn || '',
      noIjazah: d.noIjazah || '',
      noAktaLahir: d.noAktaLahir || '',
      anakKe: d.anakKe ?? undefined,
      jmlSaudara: d.jmlSaudara ?? undefined,
      lintang: d.lintang || '',
      bujur: d.bujur || '',
      beratBadan: d.beratBadan ?? undefined,
      tinggiBadan: d.tinggiBadan ?? undefined,
      lingkarKepala: d.lingkarKepala ?? undefined,
      jarakSekolah: d.jarakSekolah ?? undefined,
      jenisTinggal: d.jenisTinggal || '',
      alatTransportasi: d.alatTransportasi || '',
      kebutuhanKhusus: d.kebutuhanKhusus || '',
      sekolahAsal: d.sekolahAsal || '',
      bank: d.bank || '',
      noRekening: d.noRekening || '',
      namaRekening: d.namaRekening || '',
    });
  }, [studentResponse, form]);

  const mutation = useMutation({
    mutationFn: (payload: UpdateStudentPayload) => {
      if (isEdit) {
        return studentService.update(id!, payload);
      }
      const schoolId = school?.id || '';
      if (!schoolId) {
        throw new Error(
          isId
            ? 'Data sekolah tidak ditemukan. Silakan muat ulang halaman.'
            : 'School data not found. Please reload the page.'
        );
      }
      const createPayload: CreateStudentPayload = {
        ...(payload as Omit<CreateStudentPayload, 'schoolId'>),
        schoolId,
      };
      return studentService.create(createPayload);
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? isId
            ? 'Data berhasil diperbarui'
            : 'Data updated successfully'
          : isId
            ? 'Siswa berhasil ditambahkan'
            : 'Student added successfully'
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['student', id] });
      }
      navigate('/students');
    },
    onError: (error: unknown) => {
      const errorMessage = getErrorMessage(
        error,
        isId ? 'Terjadi kesalahan saat menyimpan data' : 'An error occurred while saving'
      );
      toast.error(errorMessage);
      const upperMsg = errorMessage.toUpperCase();
      if (upperMsg.includes('NIK')) {
        setActiveTab('pribadi');
        form.setError('nik', { type: 'server', message: errorMessage });
      } else if (upperMsg.includes('NISN')) {
        setActiveTab('pribadi');
        form.setError('nisn', { type: 'server', message: errorMessage });
      } else if (upperMsg.includes('NIS')) {
        setActiveTab('pribadi');
        form.setError('nis', { type: 'server', message: errorMessage });
      } else if (upperMsg.includes('KELAS') || upperMsg.includes('CLASS')) {
        setActiveTab('akademik');
        form.setError('classId', { type: 'server', message: errorMessage });
      }
    },
  });

  const onSubmit = (data: StudentFormValues) => {
    const parentsArray: CreateStudentParentPayload[] = [];

    if (data.fatherName?.trim()) {
      parentsArray.push({
        relation: 'AYAH',
        fullName: data.fatherName.trim(),
        birthYear: data.fatherBirthYear || null,
        nik: data.fatherNik || null,
        education: data.fatherEducation || null,
        phone: data.fatherPhone || null,
        email: data.fatherEmail || null,
        occupation: data.fatherOccupation || null,
        monthlyIncome: data.fatherIncome || null,
        isAlive: data.fatherIsAlive ?? true,
      });
    }
    if (data.motherName?.trim()) {
      parentsArray.push({
        relation: 'IBU',
        fullName: data.motherName.trim(),
        birthYear: data.motherBirthYear || null,
        nik: data.motherNik || null,
        education: data.motherEducation || null,
        phone: data.motherPhone || null,
        email: data.motherEmail || null,
        occupation: data.motherOccupation || null,
        monthlyIncome: data.motherIncome || null,
        isAlive: data.motherIsAlive ?? true,
      });
    }
    if (data.guardianName?.trim()) {
      parentsArray.push({
        relation: 'WALI',
        fullName: data.guardianName.trim(),
        birthYear: data.guardianBirthYear || null,
        nik: data.guardianNik || null,
        education: data.guardianEducation || null,
        phone: data.guardianPhone || null,
        email: data.guardianEmail || null,
        occupation: data.guardianOccupation || null,
        monthlyIncome: data.guardianIncome || null,
        isAlive: data.guardianIsAlive ?? true,
      });
    }

    // Pisahkan field orang tua, ekonomi, dan field khusus dari data core siswa
    const {
      // Field orang tua (sudah diproses ke parentsArray di atas)
      fatherName: _parentField01,
      fatherBirthYear: _parentField02,
      fatherNik: _parentField03,
      fatherEducation: _parentField04,
      fatherPhone: _parentField05,
      fatherEmail: _parentField06,
      fatherOccupation: _parentField07,
      fatherIncome: _parentField08,
      fatherIsAlive: _parentField09,
      motherName: _parentField10,
      motherBirthYear: _parentField11,
      motherNik: _parentField12,
      motherEducation: _parentField13,
      motherPhone: _parentField14,
      motherEmail: _parentField15,
      motherOccupation: _parentField16,
      motherIncome: _parentField17,
      motherIsAlive: _parentField18,
      guardianName: _parentField19,
      guardianBirthYear: _parentField20,
      guardianNik: _parentField21,
      guardianEducation: _parentField22,
      guardianPhone: _parentField23,
      guardianEmail: _parentField24,
      guardianOccupation: _parentField25,
      guardianIncome: _parentField26,
      guardianIsAlive: _parentField27,
      // Field ekonomi & field khusus yang ditangani terpisah
      hasKip, kipNumber, namaKip, layakPip, alasanLayakPip, desil,
      hasPkh, hasKks, kksNumber, isDtks, orphanType, houseOwnership, dependentsCount,
      anakKe, jmlSaudara, beratBadan, tinggiBadan, lingkarKepala, jarakSekolah,
      nis, noKk, entryDate,
      ...studentCoreData
    } = data;
    // Variabel _parentField* sengaja di-destructure untuk membuangnya dari studentCoreData
    void [
      _parentField01, _parentField02, _parentField03, _parentField04, _parentField05,
      _parentField06, _parentField07, _parentField08, _parentField09,
      _parentField10, _parentField11, _parentField12, _parentField13, _parentField14,
      _parentField15, _parentField16, _parentField17, _parentField18,
      _parentField19, _parentField20, _parentField21, _parentField22, _parentField23,
      _parentField24, _parentField25, _parentField26, _parentField27,
    ];

    const resolvedOrphanType = orphanType || 'BUKAN';
    const isOrphan = resolvedOrphanType !== 'BUKAN';

    // Kolom `entryDate` bertipe DATE NOT NULL DEFAULT CURRENT_DATE, sehingga tidak boleh null
    const existingEntryDate = studentResponse?.data?.entryDate?.split('T')[0];
    const resolvedEntryDate =
      entryDate?.trim() || existingEntryDate || getLocalTodayIso();

    const payload: UpdateStudentPayload = {
      ...studentCoreData,
      nis: nis?.trim() ? nis.trim() : null,
      noKk: noKk?.trim() && noKk.trim() !== '-' ? noKk.trim() : null,
      entryDate: resolvedEntryDate,
      anakKe: anakKe ?? null,
      jmlSaudara: jmlSaudara ?? null,
      beratBadan: beratBadan ?? null,
      tinggiBadan: tinggiBadan ?? null,
      lingkarKepala: lingkarKepala ?? null,
      jarakSekolah: jarakSekolah ?? null,
      parents: parentsArray,
      economic: {
        hasKip: Boolean(hasKip),
        kipNumber: hasKip ? kipNumber || null : null,
        namaKip: hasKip ? namaKip || null : null,
        layakPip: Boolean(layakPip),
        alasanLayakPip: layakPip ? alasanLayakPip || null : null,
        desil: desil && desil >= 1 && desil <= 10 ? Number(desil) : null,
        hasPkh: Boolean(hasPkh),
        hasKks: Boolean(hasKks),
        kksNumber: hasKks ? kksNumber || null : null,
        isDtks: Boolean(isDtks),
        houseOwnership: houseOwnership || null,
        dependentsCount: dependentsCount ?? null,
        isOrphan,
        orphanType: resolvedOrphanType,
      },
    };

    mutation.mutate(payload);
  };

  const onInvalid = (errors: FieldErrors<StudentFormValues>) => {
    const errorKeys = Object.keys(errors) as (keyof StudentFormValues)[];

    for (const [tab, fields] of Object.entries(TAB_FIELDS) as [TabKey, (keyof StudentFormValues)[]][]) {
      if (fields.some((field) => errorKeys.includes(field))) {
        setActiveTab(tab);
        break;
      }
    }
    toast.error(
      isId
        ? 'Gagal menyimpan! Mohon lengkapi isian yang berwarna merah.'
        : 'Failed to save! Please complete the highlighted fields.'
    );
  };

  const handleNextTab = async (e: React.MouseEvent) => {
    e.preventDefault();
    const tabOrder: TabKey[] = ['pribadi', 'akademik', 'orangtua', 'ekonomi', 'dapodik'];
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex === -1 || currentIndex >= tabOrder.length - 1) return;

    const isValid = await form.trigger(TAB_FIELDS[activeTab]);
    if (!isValid) {
      toast.warning(
        isId
          ? 'Mohon perbaiki isian yang berwarna merah pada tab ini terlebih dahulu'
          : 'Please fix the highlighted fields in this tab first'
      );
      return;
    }

    setActiveTab(tabOrder[currentIndex + 1]);
  };

  const handlePrevTab = (e: React.MouseEvent) => {
    e.preventDefault();
    const tabOrder: TabKey[] = ['pribadi', 'akademik', 'orangtua', 'ekonomi', 'dapodik'];
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabOrder[currentIndex - 1]);
    }
  };

  const preventAutoSubmitOnEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  const hasTabError = (tab: TabKey): boolean => {
    const errorKeys = Object.keys(form.formState.errors) as (keyof StudentFormValues)[];
    return TAB_FIELDS[tab].some((field) => errorKeys.includes(field));
  };

  if (!canManageData) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-destructive font-medium">
          {isId
            ? 'Anda tidak memiliki hak akses untuk menambah atau mengubah data siswa.'
            : 'You do not have permission to create or edit student records.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/students')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isId ? 'Kembali ke Daftar Siswa' : 'Back to Student List'}
        </Button>
      </div>
    );
  }

  if (isEdit && isFetching) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (isEdit && (isFetchError || !studentResponse?.data)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-destructive font-medium">
          {isId ? 'Data siswa tidak ditemukan atau gagal dimuat.' : 'Student data not found or failed to load.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/students')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isId ? 'Kembali ke Daftar Siswa' : 'Back to Student List'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/students')}
          type="button"
          className="shrink-0 mt-1 sm:mt-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit
              ? isId ? 'Edit Data Siswa' : 'Edit Student'
              : isId ? 'Tambah Siswa Baru' : 'Add New Student'}
          </h1>
          <p className="text-muted-foreground">
            {isId
              ? 'Formulir Pendaftaran & Pendataan terintegrasi struktur Verval PD (Dapodik).'
              : 'Registration form integrated with Dapodik structure.'}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          onKeyDown={preventAutoSubmitOnEnter}
          className="space-y-6"
        >
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as TabKey)}
            className="w-full min-w-0"
          >
            <Card className="shadow-sm border-border overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                {/* TAB MENU */}
                <div className="w-full overflow-x-auto pb-1 mb-6">
                  <TabsList className="h-auto gap-1 bg-muted/50 p-1 flex w-max min-w-full sm:min-w-0">
                    {(
                      [
                        { key: 'pribadi', icon: User, label: isId ? 'Pribadi' : 'Personal' },
                        { key: 'akademik', icon: GraduationCap, label: isId ? 'Akademik' : 'Academic' },
                        { key: 'orangtua', icon: Briefcase, label: isId ? 'Orang Tua/Wali' : 'Parents/Guardian' },
                        { key: 'ekonomi', icon: Wallet, label: isId ? 'Kesejahteraan' : 'Welfare' },
                        { key: 'dapodik', icon: HeartPulse, label: isId ? 'Dapodik / Fisik' : 'Dapodik' },
                      ] as const
                    ).map(({ key, icon: Icon, label }) => (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className="relative flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                      >
                        <Icon className="w-4 h-4 mr-2 shrink-0" />
                        {label}
                        {hasTabError(key) && (
                          <span
                            aria-hidden="true"
                            className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                          />
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* --- TAB 1: PRIBADI --- */}
                <TabsContent value="pribadi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Nama Lengkap' : 'Full Name'} *</FormLabel>
                          <FormControl>
                            <Input placeholder={isId ? 'Sesuai Ijazah/Akta' : 'As in certificate'} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nickname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Nama Panggilan' : 'Nickname'}</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nis"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>NIS / NIPD</FormLabel>
                          <FormControl>
                            <Input placeholder={isId ? 'Nomor Induk Sekolah (opsional)' : 'School ID (optional)'} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nisn"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>NISN *</FormLabel>
                            <button
                              type="button"
                              onClick={() => form.setValue('nisn', generateTempCode('TK'), { shouldValidate: true })}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                            >
                              <Sparkles className="h-3 w-3" />
                              {isId ? 'Kode Sementara TK/PAUD' : 'Temp TK ID'}
                            </button>
                          </div>
                          <FormControl><Input placeholder="10 Digit" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nik"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>{isId ? 'NIK (16 Digit)' : 'National ID Number'} *</FormLabel>
                            <button
                              type="button"
                              onClick={() => form.setValue('nik', generateTempCode('NONIK'), { shouldValidate: true })}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700"
                            >
                              <Sparkles className="h-3 w-3" />
                              {isId ? 'Belum Punya NIK' : 'Temp No-NIK'}
                            </button>
                          </div>
                          <FormControl><Input placeholder="16 Digit NIK" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="noKk"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'No. Kartu Keluarga' : 'Family Card Number'}</FormLabel>
                          <FormControl><Input placeholder="16 Digit No. KK" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Jenis Kelamin' : 'Gender'} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder={isId ? 'Pilih' : 'Select'} /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="L">{isId ? 'Laki-laki' : 'Male'}</SelectItem>
                              <SelectItem value="P">{isId ? 'Perempuan' : 'Female'}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="religion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Agama' : 'Religion'} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder={isId ? 'Pilih' : 'Select'} /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ISLAM">Islam</SelectItem>
                              <SelectItem value="KRISTEN">Kristen</SelectItem>
                              <SelectItem value="KATOLIK">Katolik</SelectItem>
                              <SelectItem value="HINDU">Hindu</SelectItem>
                              <SelectItem value="BUDDHA">Buddha</SelectItem>
                              <SelectItem value="KONGHUCU">Konghucu</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="birthPlace"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Tempat Lahir' : 'Birth Place'} *</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Tanggal Lahir' : 'Birth Date'} *</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-medium">{isId ? 'Alamat & Kontak' : 'Address & Contact'}</h4>
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Alamat Jalan' : 'Street Address'} *</FormLabel>
                          <FormControl>
                            <Input placeholder={isId ? 'Nama jalan, blok, nomor rumah' : 'Street name, block, house number'} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField control={form.control} name="dusun" render={({ field }) => (<FormItem><FormLabel>Dusun</FormLabel><FormControl><Input placeholder="Cth: Sukamaju" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="rt" render={({ field }) => (<FormItem><FormLabel>RT</FormLabel><FormControl><Input placeholder="001" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="rw" render={({ field }) => (<FormItem><FormLabel>RW</FormLabel><FormControl><Input placeholder="002" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Kelurahan/Desa' : 'Village'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                      <FormField control={form.control} name="kecamatan" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Kecamatan' : 'District'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Kab/Kota' : 'City'} *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Provinsi' : 'Province'} *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="postalCode" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Kode Pos' : 'Postal Code'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                      <FormField control={form.control} name="telepon" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Telepon Rumah' : 'Home Phone'}</FormLabel><FormControl><Input placeholder="Cth: 0274-xxxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. HP' : 'Mobile Phone'}</FormLabel><FormControl><Input placeholder="08xxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="email" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="siswa@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 2: AKADEMIK --- */}
                <TabsContent value="akademik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="classId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Kelas / Rombel' : 'Class'} *</FormLabel>
                          <Select
                            key={`class-${field.value}-${classesData?.length ?? 0}`}
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={isLoadingClasses}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={isId ? 'Pilih Kelas' : 'Select Class'} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {classesData?.map((cls) => (
                                <SelectItem key={cls.id} value={cls.id}>
                                  {cls.gradeLevel > 0 ? `${isId ? 'Tingkat' : 'Grade'} ${cls.gradeLevel} - ` : ''}{cls.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="entryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Tanggal Masuk' : 'Entry Date'}</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{isId ? 'Status Siswa' : 'Student Status'} *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="AKTIF">{isId ? 'Aktif' : 'Active'}</SelectItem>
                              <SelectItem value="MUTASI_KELUAR">{isId ? 'Mutasi Keluar' : 'Transferred'}</SelectItem>
                              <SelectItem value="LULUS">{isId ? 'Lulus' : 'Graduated'}</SelectItem>
                              <SelectItem value="DO">DO</SelectItem>
                              <SelectItem value="CUTI">{isId ? 'Cuti' : 'On Leave'}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* --- TAB 3: ORANG TUA / WALI --- */}
                <TabsContent value="orangtua" className="m-0 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <h4 className="text-sm font-semibold text-primary">{isId ? 'Data Ayah' : 'Father Data'}</h4>
                        <FormField
                          control={form.control}
                          name="fatherIsAlive"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                                checked={field.value ?? true}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                              {isId ? 'Masih Hidup' : 'Alive'}
                            </label>
                          )}
                        />
                      </div>
                      <FormField control={form.control} name="fatherName" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Nama Lengkap Ayah' : 'Father Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="fatherBirthYear" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1980" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="fatherEducation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input placeholder="Cth: S1, SMA" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="fatherNik" render={({ field }) => (<FormItem><FormLabel>{isId ? 'NIK Ayah' : 'Father NIK'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="fatherOccupation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="fatherPhone" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="fatherEmail" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Email Ayah' : 'Father Email'}</FormLabel><FormControl><Input type="email" placeholder="ayah@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="fatherIncome" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Penghasilan Bulanan' : 'Monthly Income'}</FormLabel><FormControl><Input placeholder="Cth: Rp 2.000.000 - Rp 4.999.999" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <h4 className="text-sm font-semibold text-primary">{isId ? 'Data Ibu' : 'Mother Data'}</h4>
                        <FormField
                          control={form.control}
                          name="motherIsAlive"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                                checked={field.value ?? true}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                              {isId ? 'Masih Hidup' : 'Alive'}
                            </label>
                          )}
                        />
                      </div>
                      <FormField control={form.control} name="motherName" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Nama Lengkap Ibu' : 'Mother Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="motherBirthYear" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1982" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="motherEducation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input placeholder="Cth: S1, SMA" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="motherNik" render={({ field }) => (<FormItem><FormLabel>{isId ? 'NIK Ibu' : 'Mother NIK'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="motherOccupation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="motherPhone" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="motherEmail" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Email Ibu' : 'Mother Email'}</FormLabel><FormControl><Input type="email" placeholder="ibu@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="motherIncome" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Penghasilan Bulanan' : 'Monthly Income'}</FormLabel><FormControl><Input placeholder="Cth: Tidak Berpenghasilan" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h4 className="text-sm font-semibold text-primary">
                        {isId ? 'Data Wali (Opsional - Isi jika siswa tinggal bersama Wali)' : 'Guardian Data (Optional)'}
                      </h4>
                      <FormField
                        control={form.control}
                        name="guardianIsAlive"
                        render={({ field }) => (
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-border accent-emerald-600"
                              checked={field.value ?? true}
                              onChange={(e) => field.onChange(e.target.checked)}
                            />
                            {isId ? 'Masih Hidup' : 'Alive'}
                          </label>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="guardianName" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Nama Lengkap Wali' : 'Guardian Name'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="guardianBirthYear" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1975" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="guardianEducation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="guardianNik" render={({ field }) => (<FormItem><FormLabel>{isId ? 'NIK Wali' : 'Guardian NIK'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="guardianOccupation" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Pekerjaan Wali' : 'Guardian Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="guardianPhone" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Handphone Wali' : 'Guardian Phone'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="guardianEmail" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Email Wali' : 'Guardian Email'}</FormLabel><FormControl><Input type="email" placeholder="wali@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="guardianIncome" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Penghasilan Bulanan Wali' : 'Guardian Monthly Income'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 4: EKONOMI --- */}
                <TabsContent value="ekonomi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 col-span-1 md:col-span-2 border border-border p-5 rounded-xl bg-muted/40">
                      <h4 className="font-bold text-primary">
                        {isId ? 'Program Indonesia Pintar (PIP / KIP)' : 'Smart Indonesia Program (PIP / KIP)'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField
                          control={form.control}
                          name="hasKip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Penerima KIP?' : 'KIP Receiver?'}</FormLabel>
                              <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="true">{isId ? 'Ya' : 'Yes'}</SelectItem>
                                  <SelectItem value="false">{isId ? 'Tidak' : 'No'}</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="kipNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Nomor KIP' : 'KIP Number'}</FormLabel>
                              <FormControl>
                                <Input placeholder={isId ? '6 Digit nomor di kartu' : '6 Digits on card'} {...field} disabled={!watchedHasKip} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="namaKip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Nama Tertera di KIP' : 'Name on KIP Card'}</FormLabel>
                              <FormControl>
                                <Input placeholder={isId ? 'Nama lengkap di kartu KIP' : 'Full name on card'} {...field} disabled={!watchedHasKip} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="layakPip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Layak PIP (Usulan Sekolah)?' : 'Eligible for PIP?'}</FormLabel>
                              <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="true">{isId ? 'Ya' : 'Yes'}</SelectItem>
                                  <SelectItem value="false">{isId ? 'Tidak' : 'No'}</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="desil"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Desil DTKS / P3KE' : 'DTKS / P3KE Decile'}</FormLabel>
                              <Select
                                onValueChange={(val) => field.onChange(val === '0' ? 0 : Number(val))}
                                value={field.value ? String(field.value) : '0'}
                              >
                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                <SelectContent>
                                  <SelectItem value="0">{isId ? 'Tidak Terdata / Non-Desil' : 'Not Recorded'}</SelectItem>
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                    <SelectItem key={n} value={String(n)}>Desil {n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="alasanLayakPip"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>{isId ? 'Alasan Layak PIP' : 'Reason for PIP Eligibility'}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={isId ? 'Contoh: Pemegang PKH / Yatim Piatu / Rentan Miskin' : 'Reason for proposal'}
                                  {...field}
                                  disabled={!watchedLayakPip}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold text-primary pb-2">{isId ? 'Bantuan Sosial Lainnya' : 'Other Aids'}</h4>
                      <FormField
                        control={form.control}
                        name="hasPkh"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5"><FormLabel>Penerima PKH</FormLabel></div>
                            <FormControl>
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                                checked={Boolean(field.value)}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hasKks"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5"><FormLabel>Penerima KKS / KPS</FormLabel></div>
                            <FormControl>
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                                checked={Boolean(field.value)}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isDtks"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5"><FormLabel>{isId ? 'Terdaftar DTKS' : 'Registered in DTKS'}</FormLabel></div>
                            <FormControl>
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                                checked={Boolean(field.value)}
                                onChange={(e) => field.onChange(e.target.checked)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="kksNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Nomor KKS / KPS' : 'KKS Number'}</FormLabel>
                            <FormControl><Input placeholder="Masukkan Nomor" {...field} disabled={!watchedHasKks} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold text-primary pb-2">{isId ? 'Kondisi Rumah & Keluarga' : 'House & Family Condition'}</h4>
                      <FormField
                        control={form.control}
                        name="orphanType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Status Yatim / Piatu' : 'Orphan Status'}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'BUKAN'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="BUKAN">{isId ? 'Bukan Yatim/Piatu (Lengkap)' : 'Not Orphan'}</SelectItem>
                                <SelectItem value="YATIM">Yatim</SelectItem>
                                <SelectItem value="PIATU">Piatu</SelectItem>
                                <SelectItem value="YATIM_PIATU">Yatim Piatu</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="houseOwnership"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Kepemilikan Rumah' : 'House Ownership'}</FormLabel>
                            <FormControl><Input placeholder={isId ? 'Cth: Milik Sendiri, Kontrak, Menumpang' : 'e.g. Owned, Rented'} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="dependentsCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Jumlah Tanggungan Keluarga' : 'Family Dependents'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                placeholder="0"
                                value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 5: DAPODIK / FISIK --- */}
                <TabsContent value="dapodik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{isId ? 'Kesehatan & Fisik' : 'Physical Health'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="beratBadan"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Berat Badan (kg)' : 'Weight (kg)'}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  placeholder="0"
                                  value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tinggiBadan"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Tinggi Badan (cm)' : 'Height (cm)'}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  placeholder="0"
                                  value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="lingkarKepala"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Lingkar Kepala (cm)' : 'Head Circumference'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="0.1"
                                placeholder="0"
                                value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="kebutuhanKhusus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Kebutuhan Khusus' : 'Special Needs'}</FormLabel>
                            <FormControl><Input placeholder={isId ? 'Cth: Tidak ada, Tunanetra' : 'e.g. None'} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{isId ? 'Keluarga & Tempat Tinggal' : 'Family & Residence'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="anakKe"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Anak Ke-berapa' : 'Birth Order'}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="1"
                                  value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="jmlSaudara"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isId ? 'Jml. Saudara' : 'Siblings'}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField control={form.control} name="jenisTinggal" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Jenis Tinggal' : 'Residence Type'}</FormLabel><FormControl><Input placeholder={isId ? 'Cth: Bersama Orang Tua' : 'e.g. With Parents'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="alatTransportasi" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Alat Transportasi' : 'Transportation'}</FormLabel><FormControl><Input placeholder={isId ? 'Cth: Jalan Kaki, Motor' : 'e.g. Walk'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField
                        control={form.control}
                        name="jarakSekolah"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{isId ? 'Jarak ke Sekolah (km)' : 'Distance to School (km)'}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="0.1"
                                placeholder="0"
                                value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                                onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="lintang" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Lintang (Lat)' : 'Latitude'}</FormLabel><FormControl><Input placeholder="-7.xxxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="bujur" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Bujur (Long)' : 'Longitude'}</FormLabel><FormControl><Input placeholder="110.xxxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{isId ? 'Registrasi, Dokumen & Bank' : 'Registration & Docs'}</h4>
                      <FormField control={form.control} name="sekolahAsal" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Sekolah Asal' : 'Previous School'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="noAktaLahir" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Akta Lahir' : 'Birth Cert No.'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="skhun" render={({ field }) => (<FormItem><FormLabel>SKHUN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="noPesertaUn" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Peserta UN' : 'UN Participant No.'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="noIjazah" render={({ field }) => (<FormItem><FormLabel>{isId ? 'No. Ijazah' : 'Certificate No.'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                      <div className="pt-2 border-t border-border mt-2 space-y-4">
                        <FormField control={form.control} name="bank" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Bank' : 'Bank Name'}</FormLabel><FormControl><Input placeholder="Cth: BRI, BNI" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="noRekening" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Nomor Rekening Bank' : 'Account Number'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="namaRekening" render={({ field }) => (<FormItem><FormLabel>{isId ? 'Rekening Atas Nama' : 'Account Holder Name'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </CardContent>

              {/* ================= ACTION BUTTONS ================= */}
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-card p-4 sm:p-6 rounded-b-xl">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/students')}
                  disabled={mutation.isPending}
                >
                  <X className="mr-2 h-4 w-4 shrink-0" />
                  {isId ? 'Batal' : 'Cancel'}
                </Button>

                {activeTab !== 'pribadi' && (
                  <Button type="button" variant="outline" onClick={handlePrevTab}>
                    <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
                    {isId ? 'Sebelumnya' : 'Previous'}
                  </Button>
                )}

                {activeTab !== 'dapodik' ? (
                  <Button
                    type="button"
                    onClick={handleNextTab}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isId ? 'Selanjutnya' : 'Next'}
                    <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4 shrink-0" />
                    )}
                    {isEdit
                      ? isId
                        ? 'Simpan Perubahan'
                        : 'Save Changes'
                      : isId
                        ? 'Simpan Seluruh Data'
                        : 'Save All Data'}
                  </Button>
                )}
              </div>
            </Card>
          </Tabs>
        </form>
      </Form>
    </div>
  );
}