import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, X, ArrowLeft, ArrowRight, Loader2,
  User, GraduationCap, Briefcase, Wallet, HeartPulse
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
  CreateStudentParentPayload,
} from '../types/student.types';

// ==========================================
// SKEMA ZOD (VALIDASI FORM + KOMPATIBEL TK/PAUD)
// ==========================================
const studentSchema = z.object({
  // Data Pribadi
  nis: z.string().optional(),
  nisn: z
    .string()
    .min(1, 'NISN wajib diisi')
    .refine(
      (val) => /^TK-[A-Z0-9]+$/i.test(val) || /^\d{10}$/.test(val),
      'NISN harus 10 digit angka atau kode sementara TK-XXXX'
    ),
  nik: z
    .string()
    .min(1, 'NIK wajib diisi')
    .refine(
      (val) => /^NONIK-[A-Z0-9]+$/i.test(val) || /^\d{16}$/.test(val),
      'NIK harus 16 digit angka atau kode sementara NONIK-XXXX'
    ),
  noKk: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '-' || /^\d{16}$/.test(val),
      'No. KK harus 16 digit angka atau tanda (-)'
    ),
  fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter'),
  nickname: z.string().optional(),
  gender: z.enum(['L', 'P']),
  birthDate: z.string().min(1, 'Tanggal lahir wajib diisi'),
  birthPlace: z.string().min(2, 'Tempat lahir wajib diisi'),
  religion: z.string().min(1, 'Agama wajib diisi'),

  // Alamat & Kontak Terpadu Dapodik
  address: z.string().min(1, 'Alamat wajib diisi'),
  dusun: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  city: z.string().min(1, 'Kota wajib diisi'),
  province: z.string().min(1, 'Provinsi wajib diisi'),
  postalCode: z.string().optional(),
  telepon: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),

  // Akademik
  classId: z.string().min(1, 'Kelas wajib dipilih'),
  entryDate: z.string().min(1, 'Tanggal masuk wajib diisi'),
  status: z.enum(['AKTIF', 'MUTASI_KELUAR', 'LULUS', 'DO', 'CUTI']),

  // Data Orang Tua
  fatherName: z.string().optional(),
  fatherBirthYear: z.string().optional(),
  fatherNik: z.string().optional(),
  fatherEducation: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  fatherOccupation: z.string().optional(),
  fatherIncome: z.string().optional(),

  motherName: z.string().optional(),
  motherBirthYear: z.string().optional(),
  motherNik: z.string().optional(),
  motherEducation: z.string().optional(),
  motherPhone: z.string().optional(),
  motherEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  motherOccupation: z.string().optional(),
  motherIncome: z.string().optional(),

  guardianName: z.string().optional(),
  guardianBirthYear: z.string().optional(),
  guardianNik: z.string().optional(),
  guardianEducation: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  guardianOccupation: z.string().optional(),
  guardianIncome: z.string().optional(),

  // Kesejahteraan
  hasKip: z.boolean().optional(),
  kipNumber: z.string().optional(),
  namaKip: z.string().optional(),
  layakPip: z.boolean().optional(),
  alasanLayakPip: z.string().optional(),
  desil: z.coerce.number().optional(),
  hasPkh: z.boolean().optional(),
  hasKks: z.boolean().optional(),
  kksNumber: z.string().optional(),
  isDtks: z.boolean().optional(),
  houseOwnership: z.string().optional(),
  dependentsCount: z.coerce.number().optional(),

  // Kolom Dapodik Lanjutan / Fisik
  skhun: z.string().optional(),
  noPesertaUn: z.string().optional(),
  noIjazah: z.string().optional(),
  noAktaLahir: z.string().optional(),
  anakKe: z.coerce.number().optional(),
  jmlSaudara: z.coerce.number().optional(),
  lintang: z.string().optional(),
  bujur: z.string().optional(),
  beratBadan: z.coerce.number().optional(),
  tinggiBadan: z.coerce.number().optional(),
  lingkarKepala: z.coerce.number().optional(),
  jarakSekolah: z.coerce.number().optional(),
  jenisTinggal: z.string().optional(),
  alatTransportasi: z.string().optional(),
  kebutuhanKhusus: z.string().optional(),
  sekolahAsal: z.string().optional(),
  bank: z.string().optional(),
  noRekening: z.string().optional(),
  namaRekening: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

const toNullablePositive = (val?: number): number | null => {
  if (val === undefined || val === null || Number.isNaN(val) || val <= 0) return null;
  return val;
};

const toNullableNonNegative = (val?: number): number | null => {
  if (val === undefined || val === null || Number.isNaN(val) || val < 0) return null;
  return val;
};

// ==========================================
// KOMPONEN UTAMA
// ==========================================
export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();

  const [activeTab, setActiveTab] = useState('pribadi');
  const parentAliveMapRef = useRef<{ AYAH: boolean; IBU: boolean; WALI: boolean }>({
    AYAH: true,
    IBU: true,
    WALI: true,
  });

  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes-list', school?.id],
    queryFn: async () => {
      let query = supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .order('gradeLevel', { ascending: true });
      if (school?.id) query = query.eq('schoolId', school.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: studentResponse, isLoading: isFetching } = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.getById(id!),
    enabled: isEdit,
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
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
      entryDate: new Date().toISOString().split('T')[0],
      status: 'AKTIF',

      fatherName: '',
      fatherBirthYear: '',
      fatherNik: '',
      fatherEducation: '',
      fatherPhone: '',
      fatherEmail: '',
      fatherOccupation: '',
      fatherIncome: '',

      motherName: '',
      motherBirthYear: '',
      motherNik: '',
      motherEducation: '',
      motherPhone: '',
      motherEmail: '',
      motherOccupation: '',
      motherIncome: '',

      guardianName: '',
      guardianBirthYear: '',
      guardianNik: '',
      guardianEducation: '',
      guardianPhone: '',
      guardianEmail: '',
      guardianOccupation: '',
      guardianIncome: '',

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
      houseOwnership: '',
      dependentsCount: 0,

      skhun: '',
      noPesertaUn: '',
      noIjazah: '',
      noAktaLahir: '',
      anakKe: 0,
      jmlSaudara: 0,
      lintang: '',
      bujur: '',
      beratBadan: 0,
      tinggiBadan: 0,
      lingkarKepala: 0,
      jarakSekolah: 0,
      jenisTinggal: '',
      alatTransportasi: '',
      kebutuhanKhusus: '',
      sekolahAsal: '',
      bank: '',
      noRekening: '',
      namaRekening: '',
    },
  });

  useEffect(() => {
    const d = studentResponse?.data;
    if (!d) return;

    const parentsData = d.parents || [];
    const eco = d.economic;

    const ayah = parentsData.find((p) => p.relation === 'AYAH');
    const ibu = parentsData.find((p) => p.relation === 'IBU');
    const wali = parentsData.find((p) => p.relation === 'WALI');

    parentAliveMapRef.current = {
      AYAH: ayah?.isAlive ?? true,
      IBU: ibu?.isAlive ?? true,
      WALI: wali?.isAlive ?? true,
    };

    form.reset({
      nis: d.nis === '-' ? '' : d.nis || '',
      nisn: d.nisn || '',
      nik: d.nik || '',
      noKk: d.noKk || '',
      fullName: d.fullName || '',
      nickname: d.nickname || '',
      gender: d.gender || 'L',
      birthDate: d.birthDate?.split('T')[0] || '',
      birthPlace: d.birthPlace || '',
      religion: d.religion || 'ISLAM',
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
      entryDate: d.entryDate?.split('T')[0] || '',
      status: d.status || 'AKTIF',

      fatherName: ayah?.fullName || '',
      fatherBirthYear: ayah?.birthYear || '',
      fatherNik: ayah?.nik || '',
      fatherEducation: ayah?.education || '',
      fatherPhone: ayah?.phone || '',
      fatherEmail: ayah?.email || '',
      fatherOccupation: ayah?.occupation || '',
      fatherIncome: ayah?.monthlyIncome || '',

      motherName: ibu?.fullName || '',
      motherBirthYear: ibu?.birthYear || '',
      motherNik: ibu?.nik || '',
      motherEducation: ibu?.education || '',
      motherPhone: ibu?.phone || '',
      motherEmail: ibu?.email || '',
      motherOccupation: ibu?.occupation || '',
      motherIncome: ibu?.monthlyIncome || '',

      guardianName: wali?.fullName || '',
      guardianBirthYear: wali?.birthYear || '',
      guardianNik: wali?.nik || '',
      guardianEducation: wali?.education || '',
      guardianPhone: wali?.phone || '',
      guardianEmail: wali?.email || '',
      guardianOccupation: wali?.occupation || '',
      guardianIncome: wali?.monthlyIncome || '',

      hasKip: eco?.hasKip || false,
      kipNumber: eco?.kipNumber || '',
      namaKip: eco?.namaKip || '',
      layakPip: eco?.layakPip || false,
      alasanLayakPip: eco?.alasanLayakPip || '',
      desil: eco?.desil || 0,
      hasPkh: eco?.hasPkh || false,
      hasKks: eco?.hasKks || false,
      kksNumber: eco?.kksNumber || '',
      isDtks: eco?.isDtks || false,
      houseOwnership: eco?.houseOwnership || '',
      dependentsCount: eco?.dependentsCount || 0,

      skhun: d.skhun || '',
      noPesertaUn: d.noPesertaUn || '',
      noIjazah: d.noIjazah || '',
      noAktaLahir: d.noAktaLahir || '',
      anakKe: d.anakKe || 0,
      jmlSaudara: d.jmlSaudara || 0,
      lintang: d.lintang || '',
      bujur: d.bujur || '',
      beratBadan: d.beratBadan || 0,
      tinggiBadan: d.tinggiBadan || 0,
      lingkarKepala: d.lingkarKepala || 0,
      jarakSekolah: d.jarakSekolah || 0,
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
    mutationFn: (data: CreateStudentPayload) =>
      isEdit ? studentService.update(id!, data) : studentService.create(data),
    onSuccess: () => {
      toast.success(
        isEdit
          ? locale === 'id'
            ? 'Data berhasil diperbarui'
            : 'Data updated successfully'
          : locale === 'id'
            ? 'Siswa berhasil ditambahkan'
            : 'Student added successfully'
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      navigate('/students');
    },
    onError: (error: Error) => {
      const errorMessage = error?.message || (locale === 'id' ? 'Terjadi kesalahan' : 'An error occurred');
      toast.error(errorMessage);
      if (errorMessage.includes('NIK')) {
        setActiveTab('pribadi');
        form.setError('nik', { type: 'server', message: errorMessage });
      } else if (errorMessage.includes('NISN')) {
        setActiveTab('pribadi');
        form.setError('nisn', { type: 'server', message: errorMessage });
      } else if (errorMessage.includes('NIS')) {
        setActiveTab('pribadi');
        form.setError('nis', { type: 'server', message: errorMessage });
      }
    },
  });

  const onSubmit = (data: StudentFormValues) => {
    const schoolId = school?.id || studentResponse?.data?.schoolId || '';
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
        isAlive: parentAliveMapRef.current.AYAH,
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
        isAlive: parentAliveMapRef.current.IBU,
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
        isAlive: parentAliveMapRef.current.WALI,
      });
    }

    const {
      fatherName: _fn, fatherBirthYear: _fby, fatherNik: _fnik, fatherEducation: _fedu,
      fatherPhone: _fp, fatherEmail: _fe, fatherOccupation: _fo, fatherIncome: _fi,
      motherName: _mn, motherBirthYear: _mby, motherNik: _mnik, motherEducation: _medu,
      motherPhone: _mp, motherEmail: _me, motherOccupation: _mo, motherIncome: _mi,
      guardianName: _gn, guardianBirthYear: _gby, guardianNik: _gnik, guardianEducation: _gedu,
      guardianPhone: _gp, guardianEmail: _ge, guardianOccupation: _go, guardianIncome: _gi,
      hasKip, kipNumber, namaKip, layakPip, alasanLayakPip, desil,
      hasPkh, hasKks, kksNumber, isDtks, houseOwnership, dependentsCount,
      anakKe, jmlSaudara, beratBadan, tinggiBadan, lingkarKepala, jarakSekolah,
      nis, noKk,
      ...studentCoreData
    } = data;

    const payload: CreateStudentPayload = {
      ...studentCoreData,
      nis: nis?.trim() ? nis.trim() : null,
      noKk: noKk?.trim() ? noKk.trim() : null,
      anakKe: toNullablePositive(anakKe),
      jmlSaudara: toNullableNonNegative(jmlSaudara),
      beratBadan: toNullablePositive(beratBadan),
      tinggiBadan: toNullablePositive(tinggiBadan),
      lingkarKepala: toNullablePositive(lingkarKepala),
      jarakSekolah: toNullableNonNegative(jarakSekolah),
      schoolId,
      parents: parentsArray,
      economic: {
        hasKip: !!hasKip,
        kipNumber: hasKip ? kipNumber || null : null,
        namaKip: hasKip ? namaKip || null : null,
        layakPip: !!layakPip,
        alasanLayakPip: layakPip ? alasanLayakPip || null : null,
        desil: desil && desil >= 1 && desil <= 10 ? Number(desil) : null,
        hasPkh: !!hasPkh,
        hasKks: !!hasKks,
        kksNumber: hasKks ? kksNumber || null : null,
        isDtks: !!isDtks,
        houseOwnership: houseOwnership || null,
        dependentsCount: toNullableNonNegative(dependentsCount),
        isOrphan: false,
      },
    };

    mutation.mutate(payload);
  };

  const onInvalid = (errors: FieldErrors<StudentFormValues>) => {
    const errorKeys = Object.keys(errors);
    const tabFields: Record<string, string[]> = {
      pribadi: [
        'fullName', 'nickname', 'nis', 'nisn', 'nik', 'noKk', 'gender',
        'birthPlace', 'birthDate', 'religion', 'address', 'dusun', 'rt', 'rw',
        'kelurahan', 'kecamatan', 'city', 'province', 'postalCode', 'telepon', 'phone', 'email',
      ],
      akademik: ['classId', 'entryDate', 'status'],
      orangtua: [
        'fatherName', 'fatherBirthYear', 'fatherNik', 'fatherEducation', 'fatherPhone', 'fatherEmail', 'fatherOccupation', 'fatherIncome',
        'motherName', 'motherBirthYear', 'motherNik', 'motherEducation', 'motherPhone', 'motherEmail', 'motherOccupation', 'motherIncome',
        'guardianName', 'guardianBirthYear', 'guardianNik', 'guardianEducation', 'guardianPhone', 'guardianEmail', 'guardianOccupation', 'guardianIncome',
      ],
      ekonomi: ['hasKip', 'kipNumber', 'namaKip', 'layakPip', 'alasanLayakPip', 'desil', 'hasPkh', 'hasKks', 'kksNumber'],
      dapodik: [
        'skhun', 'noPesertaUn', 'noIjazah', 'noAktaLahir', 'anakKe', 'jmlSaudara',
        'lintang', 'bujur', 'beratBadan', 'tinggiBadan', 'lingkarKepala', 'jarakSekolah',
        'jenisTinggal', 'alatTransportasi', 'kebutuhanKhusus', 'sekolahAsal', 'bank', 'noRekening', 'namaRekening',
      ],
    };

    for (const [tab, fields] of Object.entries(tabFields)) {
      if (fields.some((field) => errorKeys.includes(field))) {
        setActiveTab(tab);
        break;
      }
    }
    toast.error(
      locale === 'id'
        ? 'Gagal menyimpan! Mohon lengkapi isian yang berwarna merah.'
        : 'Failed to save! Please complete the highlighted fields.'
    );
  };

  const handleNextTab = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === 'pribadi') {
      const isValid = await form.trigger([
        'fullName', 'nisn', 'nik', 'noKk', 'gender', 'birthPlace', 'birthDate', 'religion', 'address', 'city', 'province',
      ]);
      if (isValid) setActiveTab('akademik');
      else toast.warning(locale === 'id' ? 'Lengkapi Data Pribadi terlebih dahulu' : 'Complete Personal Data first');
    } else if (activeTab === 'akademik') {
      const isValid = await form.trigger(['classId', 'entryDate', 'status']);
      if (isValid) setActiveTab('orangtua');
      else toast.warning(locale === 'id' ? 'Lengkapi Data Akademik' : 'Complete Academic Data');
    } else if (activeTab === 'orangtua') setActiveTab('ekonomi');
    else if (activeTab === 'ekonomi') setActiveTab('dapodik');
  };

  const handlePrevTab = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === 'dapodik') setActiveTab('ekonomi');
    else if (activeTab === 'ekonomi') setActiveTab('orangtua');
    else if (activeTab === 'orangtua') setActiveTab('akademik');
    else if (activeTab === 'akademik') setActiveTab('pribadi');
  };

  const preventAutoSubmitOnEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault();
  };

  if (isEdit && isFetching) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/students')} type="button" className="shrink-0 mt-1 sm:mt-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit
              ? locale === 'id' ? 'Edit Data Siswa' : 'Edit Student'
              : locale === 'id' ? 'Tambah Siswa Baru' : 'Add New Student'}
          </h1>
          <p className="text-muted-foreground">
            {locale === 'id'
              ? 'Formulir Pendaftaran & Pendataan terintegrasi struktur Verval PD (Dapodik).'
              : 'Registration form integrated with Dapodik structure.'}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} onKeyDown={preventAutoSubmitOnEnter} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
            <Card className="shadow-sm border-border overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                {/* TAB MENU */}
                <div className="w-full overflow-x-auto pb-1 mb-6">
                  <TabsList className="h-auto gap-1 bg-muted/50 p-1 flex w-max min-w-full sm:min-w-0">
                    <TabsTrigger
                      value="pribadi"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <User className="w-4 h-4 mr-2 shrink-0" />
                      {locale === 'id' ? 'Pribadi' : 'Personal'}
                    </TabsTrigger>

                    <TabsTrigger
                      value="akademik"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <GraduationCap className="w-4 h-4 mr-2 shrink-0" />
                      {locale === 'id' ? 'Akademik' : 'Academic'}
                    </TabsTrigger>

                    <TabsTrigger
                      value="orangtua"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <Briefcase className="w-4 h-4 mr-2 shrink-0" />
                      {locale === 'id' ? 'Orang Tua/Wali' : 'Parents/Guardian'}
                    </TabsTrigger>

                    <TabsTrigger
                      value="ekonomi"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <Wallet className="w-4 h-4 mr-2 shrink-0" />
                      {locale === 'id' ? 'Kesejahteraan' : 'Welfare'}
                    </TabsTrigger>

                    <TabsTrigger
                      value="dapodik"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <HeartPulse className="w-4 h-4 mr-2 shrink-0" />
                      {locale === 'id' ? 'Dapodik / Fisik' : 'Dapodik'}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* --- TAB 1: PRIBADI --- */}
                <TabsContent value="pribadi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap' : 'Full Name'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Sesuai Ijazah/Akta' : 'As in certificate'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nickname" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Panggilan' : 'Nickname'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nis" render={({ field }) => (<FormItem><FormLabel>NIS / NIPD</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Nomor Induk Sekolah (opsional)' : 'School ID (optional)'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nisn" render={({ field }) => (<FormItem><FormLabel>NISN</FormLabel><FormControl><Input placeholder="10 Digit" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK (16 Digit)' : 'National ID Number'}</FormLabel><FormControl><Input placeholder="16 Digit NIK" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="noKk" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Kartu Keluarga' : 'Family Card Number'}</FormLabel><FormControl><Input placeholder="16 Digit No. KK" {...field} /></FormControl><FormMessage /></FormItem>)} />

                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{locale === 'id' ? 'Jenis Kelamin' : 'Gender'}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih' : 'Select'} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="L">{locale === 'id' ? 'Laki-laki' : 'Male'}</SelectItem>
                            <SelectItem value="P">{locale === 'id' ? 'Perempuan' : 'Female'}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="religion" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{locale === 'id' ? 'Agama' : 'Religion'}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih' : 'Select'} /></SelectTrigger></FormControl>
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
                    )} />

                    <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tempat Lahir' : 'Birth Place'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tanggal Lahir' : 'Birth Date'}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-medium">{locale === 'id' ? 'Alamat & Kontak' : 'Address & Contact'}</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Alamat Jalan' : 'Street Address'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Nama jalan, blok, nomor rumah' : 'Street name, block, house number'} {...field} /></FormControl><FormMessage /></FormItem>)} />

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField control={form.control} name="dusun" render={({ field }) => (<FormItem><FormLabel>Dusun</FormLabel><FormControl><Input placeholder="Cth: Sukamaju" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="rt" render={({ field }) => (<FormItem><FormLabel>RT</FormLabel><FormControl><Input placeholder="001" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="rw" render={({ field }) => (<FormItem><FormLabel>RW</FormLabel><FormControl><Input placeholder="002" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kelurahan/Desa' : 'Village'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                      <FormField control={form.control} name="kecamatan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kecamatan' : 'District'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kab/Kota' : 'City'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Provinsi' : 'Province'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="postalCode" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kode Pos' : 'Postal Code'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />

                      <FormField control={form.control} name="telepon" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Telepon Rumah' : 'Home Phone'}</FormLabel><FormControl><Input placeholder="Cth: 0274-xxxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. HP' : 'Mobile Phone'}</FormLabel><FormControl><Input placeholder="08xxx" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="email" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="siswa@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 2: AKADEMIK --- */}
                <TabsContent value="akademik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="classId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{locale === 'id' ? 'Kelas / Rombel' : 'Class'}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingClasses}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih Kelas' : 'Select Class'} /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classesData?.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id}>
                                {cls.gradeLevel > 0 ? `${locale === 'id' ? 'Tingkat' : 'Grade'} ${cls.gradeLevel} - ` : ''}{cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="entryDate" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tanggal Masuk' : 'Entry Date'}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />

                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{locale === 'id' ? 'Status Siswa' : 'Student Status'}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="AKTIF">{locale === 'id' ? 'Aktif' : 'Active'}</SelectItem>
                            <SelectItem value="MUTASI_KELUAR">{locale === 'id' ? 'Mutasi Keluar' : 'Transferred'}</SelectItem>
                            <SelectItem value="LULUS">{locale === 'id' ? 'Lulus' : 'Graduated'}</SelectItem>
                            <SelectItem value="DO">DO</SelectItem>
                            <SelectItem value="CUTI">{locale === 'id' ? 'Cuti' : 'On Leave'}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* --- TAB 3: ORANG TUA / WALI --- */}
                <TabsContent value="orangtua" className="m-0 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-primary border-b border-border pb-2">{locale === 'id' ? 'Data Ayah' : 'Father Data'}</h4>
                      <FormField control={form.control} name="fatherName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Ayah' : 'Father Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="fatherBirthYear" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1980" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="fatherEducation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input placeholder="Cth: S1, SMA" {...field} /></FormControl></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="fatherNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Ayah' : 'Father NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan' : 'Monthly Income'}</FormLabel><FormControl><Input placeholder="Cth: Rp 2.000.000 - Rp 4.999.999" {...field} /></FormControl></FormItem>)} />
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-primary border-b border-border pb-2">{locale === 'id' ? 'Data Ibu' : 'Mother Data'}</h4>
                      <FormField control={form.control} name="motherName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Ibu' : 'Mother Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="motherBirthYear" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1982" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="motherEducation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input placeholder="Cth: S1, SMA" {...field} /></FormControl></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="motherNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Ibu' : 'Mother NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan' : 'Monthly Income'}</FormLabel><FormControl><Input placeholder="Cth: Tidak Berpenghasilan" {...field} /></FormControl></FormItem>)} />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-semibold text-primary border-b border-border pb-2">
                      {locale === 'id' ? 'Data Wali (Opsional - Isi jika siswa tinggal bersama Wali)' : 'Guardian Data (Optional)'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="guardianName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Wali' : 'Guardian Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="guardianBirthYear" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tahun Lahir' : 'Birth Year'}</FormLabel><FormControl><Input placeholder="Cth: 1975" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="guardianEducation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pendidikan' : 'Education'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="guardianNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Wali' : 'Guardian NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan Wali' : 'Guardian Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone Wali' : 'Guardian Phone'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan Wali' : 'Guardian Monthly Income'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 4: EKONOMI --- */}
                <TabsContent value="ekonomi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 col-span-1 md:col-span-2 border border-border p-5 rounded-xl bg-muted/40">
                      <h4 className="font-bold text-primary">
                        {locale === 'id' ? 'Program Indonesia Pintar (PIP / KIP)' : 'Smart Indonesia Program (PIP / KIP)'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField control={form.control} name="hasKip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Penerima KIP?' : 'KIP Receiver?'}</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="true">{locale === 'id' ? 'Ya' : 'Yes'}</SelectItem>
                                <SelectItem value="false">{locale === 'id' ? 'Tidak' : 'No'}</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="kipNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Nomor KIP' : 'KIP Number'}</FormLabel>
                            <FormControl><Input placeholder={locale === 'id' ? '6 Digit nomor di kartu' : '6 Digits on card'} {...field} disabled={!form.watch('hasKip')} /></FormControl>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="namaKip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Nama Tertera di KIP' : 'Name on KIP Card'}</FormLabel>
                            <FormControl><Input placeholder={locale === 'id' ? 'Nama lengkap di kartu KIP' : 'Full name on card'} {...field} disabled={!form.watch('hasKip')} /></FormControl>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="layakPip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Layak PIP (Usulan Sekolah)?' : 'Eligible for PIP?'}</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="true">{locale === 'id' ? 'Ya' : 'Yes'}</SelectItem>
                                <SelectItem value="false">{locale === 'id' ? 'Tidak' : 'No'}</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="desil" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Desil DTKS / P3KE' : 'DTKS / P3KE Decile'}</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === '0' ? 0 : Number(val))} value={field.value ? String(field.value) : '0'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="0">{locale === 'id' ? 'Tidak Terdata / Non-Desil' : 'Not Recorded'}</SelectItem>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                  <SelectItem key={n} value={String(n)}>Desil {n}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="alasanLayakPip" render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>{locale === 'id' ? 'Alasan Layak PIP' : 'Reason for PIP Eligibility'}</FormLabel>
                            <FormControl><Input placeholder={locale === 'id' ? 'Contoh: Pemegang PKH / Yatim Piatu / Rentan Miskin' : 'Reason for proposal'} {...field} disabled={!form.watch('layakPip')} /></FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold text-primary pb-2">{locale === 'id' ? 'Bantuan Lainnya' : 'Other Aids'}</h4>
                      <FormField control={form.control} name="hasPkh" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5"><FormLabel>Penerima PKH</FormLabel></div>
                          <FormControl><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-emerald-600" checked={!!field.value} onChange={field.onChange} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="hasKks" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5"><FormLabel>Penerima KKS / KPS</FormLabel></div>
                          <FormControl><input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-emerald-600" checked={!!field.value} onChange={field.onChange} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="kksNumber" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{locale === 'id' ? 'Nomor KKS / KPS' : 'KKS Number'}</FormLabel>
                          <FormControl><Input placeholder="Masukkan Nomor" {...field} disabled={!form.watch('hasKks')} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 5: DAPODIK / FISIK --- */}
                <TabsContent value="dapodik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{locale === 'id' ? 'Kesehatan & Fisik' : 'Physical Health'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="beratBadan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Berat Badan (kg)' : 'Weight (kg)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="tinggiBadan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tinggi Badan (cm)' : 'Height (cm)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="lingkarKepala" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Lingkar Kepala (cm)' : 'Head Circumference'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="kebutuhanKhusus" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kebutuhan Khusus' : 'Special Needs'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Cth: Tidak ada, Tunanetra' : 'e.g. None'} {...field} /></FormControl></FormItem>)} />
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{locale === 'id' ? 'Keluarga & Tempat Tinggal' : 'Family & Residence'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="anakKe" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Anak Ke-berapa' : 'Birth Order'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="jmlSaudara" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jml. Saudara' : 'Siblings'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      </div>
                      <FormField control={form.control} name="jenisTinggal" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jenis Tinggal' : 'Residence Type'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Cth: Bersama Orang Tua' : 'e.g. With Parents'} {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="alatTransportasi" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Alat Transportasi' : 'Transportation'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Cth: Jalan Kaki, Motor' : 'e.g. Walk'} {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="jarakSekolah" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jarak ke Sekolah (km)' : 'Distance to School (km)'}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl></FormItem>)} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="lintang" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Lintang (Lat)' : 'Latitude'}</FormLabel><FormControl><Input placeholder="-7.xxxx" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="bujur" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Bujur (Long)' : 'Longitude'}</FormLabel><FormControl><Input placeholder="110.xxxx" {...field} /></FormControl></FormItem>)} />
                      </div>
                    </div>

                    <div className="space-y-4 border border-border p-5 rounded-xl bg-muted/10">
                      <h4 className="font-semibold border-b border-border text-primary pb-2">{locale === 'id' ? 'Registrasi, Dokumen & Bank' : 'Registration & Docs'}</h4>
                      <FormField control={form.control} name="sekolahAsal" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Sekolah Asal' : 'Previous School'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="noAktaLahir" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Akta Lahir' : 'Birth Cert No.'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="skhun" render={({ field }) => (<FormItem><FormLabel>SKHUN</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="noPesertaUn" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Peserta UN' : 'UN Participant No.'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="noIjazah" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Ijazah' : 'Certificate No.'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />

                      <div className="pt-2 border-t border-border mt-2 space-y-4">
                        <FormField control={form.control} name="bank" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Bank' : 'Bank Name'}</FormLabel><FormControl><Input placeholder="Cth: BRI, BNI" {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="noRekening" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nomor Rekening Bank' : 'Account Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="namaRekening" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Rekening Atas Nama' : 'Account Holder Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
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
                  {locale === 'id' ? 'Batal' : 'Cancel'}
                </Button>

                {activeTab !== 'pribadi' && (
                  <Button type="button" variant="outline" onClick={handlePrevTab}>
                    <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
                    {locale === 'id' ? 'Sebelumnya' : 'Previous'}
                  </Button>
                )}

                {activeTab !== 'dapodik' ? (
                  <Button
                    type="button"
                    onClick={handleNextTab}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {locale === 'id' ? 'Selanjutnya' : 'Next'}
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
                      ? locale === 'id'
                        ? 'Simpan Perubahan'
                        : 'Save Changes'
                      : locale === 'id'
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