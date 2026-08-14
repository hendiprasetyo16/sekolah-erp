import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, X, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { studentService } from '../services/student.service';
import { supabase } from '@/services/supabase.client';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { StudentParent, CreateStudentPayload, StudentEconomic } from '../types/student.types';

const studentSchema = z.object({
  nis: z.string().min(1, 'NIS wajib diisi'),
  nisn: z.string().min(10, 'NISN minimal 10 karakter').max(10),
  nik: z.string().min(16, 'NIK minimal 16 karakter').max(16),
  noKk: z.string().min(16, 'No KK minimal 16 karakter').max(16),
  fullName: z.string().min(3, 'Nama lengkap wajib diisi'),
  nickname: z.string().optional(),
  gender: z.enum(['L', 'P']),
  birthDate: z.string().min(1, 'Tanggal lahir wajib diisi'),
  birthPlace: z.string().min(3, 'Tempat lahir wajib diisi'),
  religion: z.string().min(1, 'Agama wajib diisi'),
  address: z.string().min(5, 'Alamat wajib diisi'),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  city: z.string().min(3, 'Kota wajib diisi'),
  province: z.string().min(3, 'Provinsi wajib diisi'),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  classId: z.string().min(1, 'Kelas wajib dipilih'),
  entryDate: z.string().min(1, 'Tanggal masuk wajib diisi'),

  fatherName: z.string().optional(),
  fatherNik: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  fatherOccupation: z.string().optional(),
  fatherIncome: z.coerce.number().optional(),

  motherName: z.string().optional(),
  motherNik: z.string().optional(),
  motherPhone: z.string().optional(),
  motherEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  motherOccupation: z.string().optional(),
  motherIncome: z.coerce.number().optional(),

  guardianName: z.string().optional(),
  guardianNik: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email('Email tidak valid').optional().or(z.literal('')),
  guardianOccupation: z.string().optional(),
  guardianIncome: z.coerce.number().optional(),

  hasKip: z.boolean().optional(),
  kipNumber: z.string().optional(),
  namaKip: z.string().optional(),
  layakPip: z.boolean().optional(),
  alasanLayakPip: z.string().optional(),
  hasPkh: z.boolean().optional(),
  hasKks: z.boolean().optional(),
  kksNumber: z.string().optional(),
  isDtks: z.boolean().optional(),
  houseOwnership: z.string().optional(),
  dependentsCount: z.coerce.number().optional(),

  noAktaLahir: z.string().optional(),
  anakKe: z.coerce.number().optional(),
  jmlSaudara: z.coerce.number().optional(),
  beratBadan: z.coerce.number().optional(),
  tinggiBadan: z.coerce.number().optional(),
  lingkarKepala: z.coerce.number().optional(),
  jarakSekolah: z.coerce.number().optional(),
  jenisTinggal: z.string().optional(),
  alatTransportasi: z.string().optional(),
  sekolahAsal: z.string().optional(),
  bank: z.string().optional(),
  noRekening: z.string().optional(),
  namaRekening: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;
type CombinedStudentPayload = CreateStudentPayload & { schoolId: string; economic?: any;[key: string]: any };

export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();

  const [activeTab, setActiveTab] = useState('pribadi');

  const { data: classesData, isLoading: isLoadingClasses } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name, gradeLevel').order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const { data: student, isLoading: isFetching } = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.getById(id!),
    enabled: isEdit,
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      nis: '', nisn: '', nik: '', noKk: '', fullName: '', nickname: '', gender: 'L',
      birthDate: '', birthPlace: '', religion: '', address: '', rt: '', rw: '',
      kelurahan: '', kecamatan: '', city: '', province: '', postalCode: '', phone: '', email: '',
      classId: '', entryDate: new Date().toISOString().split('T')[0],
      fatherName: '', fatherNik: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', fatherIncome: 0,
      motherName: '', motherNik: '', motherPhone: '', motherEmail: '', motherOccupation: '', motherIncome: 0,
      guardianName: '', guardianNik: '', guardianPhone: '', guardianEmail: '', guardianOccupation: '', guardianIncome: 0,
      hasKip: false, kipNumber: '', namaKip: '', layakPip: false, alasanLayakPip: '', hasPkh: false, hasKks: false, kksNumber: '', isDtks: false, houseOwnership: '', dependentsCount: 0,
      noAktaLahir: '', anakKe: 0, jmlSaudara: 0, beratBadan: 0, tinggiBadan: 0, lingkarKepala: 0, jarakSekolah: 0, jenisTinggal: '', alatTransportasi: '', sekolahAsal: '', bank: '', noRekening: '', namaRekening: ''
    },
  });

  useEffect(() => {
    if (student?.data) {
      const d = student.data as any;
      const ayah = d.parents?.find((p: StudentParent) => p.relation === 'AYAH');
      const ibu = d.parents?.find((p: StudentParent) => p.relation === 'IBU');
      const wali = d.parents?.find((p: StudentParent) => p.relation === 'WALI');
      const eco = d.economic;

      form.reset({
        nis: d.nis || '', nisn: d.nisn, nik: d.nik, noKk: d.noKk || '', fullName: d.fullName,
        nickname: d.nickname || '', gender: d.gender, birthDate: d.birthDate?.split('T')[0] || '',
        birthPlace: d.birthPlace, religion: d.religion || '', address: d.address,
        rt: d.rt || '', rw: d.rw || '', kelurahan: d.kelurahan || '',
        kecamatan: d.kecamatan || '', city: d.city, province: d.province,
        postalCode: d.postalCode || '', phone: d.phone || '', email: d.email || '',
        classId: d.classId, entryDate: d.entryDate?.split('T')[0] || '',

        fatherName: ayah?.fullName || '', fatherNik: ayah?.nik || '', fatherPhone: ayah?.phone || '', fatherEmail: ayah?.email || '', fatherOccupation: ayah?.occupation || '', fatherIncome: ayah?.monthlyIncome || 0,
        motherName: ibu?.fullName || '', motherNik: ibu?.nik || '', motherPhone: ibu?.phone || '', motherEmail: ibu?.email || '', motherOccupation: ibu?.occupation || '', motherIncome: ibu?.monthlyIncome || 0,
        guardianName: wali?.fullName || '', guardianNik: wali?.nik || '', guardianPhone: wali?.phone || '', guardianEmail: wali?.email || '', guardianOccupation: wali?.occupation || '', guardianIncome: wali?.monthlyIncome || 0,

        hasKip: eco?.hasKip || false, kipNumber: eco?.kipNumber || '', namaKip: eco?.namaKip || '', layakPip: eco?.layakPip || false, alasanLayakPip: eco?.alasanLayakPip || '',
        hasPkh: eco?.hasPkh || false, hasKks: eco?.hasKks || false, kksNumber: eco?.kksNumber || '', isDtks: eco?.isDtks || false, houseOwnership: eco?.houseOwnership || '', dependentsCount: eco?.dependentsCount || 0,

        noAktaLahir: d.noAktaLahir || '', anakKe: d.anakKe || 0, jmlSaudara: d.jmlSaudara || 0, beratBadan: d.beratBadan || 0, tinggiBadan: d.tinggiBadan || 0, lingkarKepala: d.lingkarKepala || 0, jarakSekolah: d.jarakSekolah || 0,
        jenisTinggal: d.jenisTinggal || '', alatTransportasi: d.alatTransportasi || '', sekolahAsal: d.sekolahAsal || '', bank: d.bank || '', noRekening: d.noRekening || '', namaRekening: d.namaRekening || ''
      });
    }
  }, [student, form]);

  const mutation = useMutation({
    mutationFn: (data: CombinedStudentPayload) => {
      return isEdit ? studentService.update(id!, data as any) : studentService.create(data as any);
    },
    onSuccess: () => {
      toast.success(isEdit
        ? (locale === 'id' ? 'Data berhasil diperbarui' : 'Data updated successfully')
        : (locale === 'id' ? 'Siswa berhasil ditambahkan' : 'Student added successfully')
      );
      queryClient.invalidateQueries({ queryKey: ['students'] });
      navigate('/students');
    },
    onError: (error: Error) => {
      const errorMessage = error?.message || (locale === 'id' ? 'Terjadi kesalahan' : 'An error occurred');
      toast.error(errorMessage);
      if (errorMessage.includes('NIK')) {
        setActiveTab('pribadi'); form.setError('nik', { type: 'server', message: errorMessage });
      } else if (errorMessage.includes('NISN')) {
        setActiveTab('pribadi'); form.setError('nisn', { type: 'server', message: errorMessage });
      } else if (errorMessage.includes('NIS')) {
        setActiveTab('pribadi'); form.setError('nis', { type: 'server', message: errorMessage });
      }
    },
  });

  const onSubmit = (data: StudentFormValues) => {
    const parentsArray: any[] = [];
    if (data.fatherName) parentsArray.push({ relation: 'AYAH', fullName: data.fatherName, nik: data.fatherNik, phone: data.fatherPhone, email: data.fatherEmail, occupation: data.fatherOccupation, monthlyIncome: data.fatherIncome, isAlive: true });
    if (data.motherName) parentsArray.push({ relation: 'IBU', fullName: data.motherName, nik: data.motherNik, phone: data.motherPhone, email: data.motherEmail, occupation: data.motherOccupation, monthlyIncome: data.motherIncome, isAlive: true });
    if (data.guardianName) parentsArray.push({ relation: 'WALI', fullName: data.guardianName, nik: data.guardianNik, phone: data.guardianPhone, email: data.guardianEmail, occupation: data.guardianOccupation, monthlyIncome: data.guardianIncome, isAlive: true });

    const {
      fatherName, fatherNik, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
      motherName, motherNik, motherPhone, motherEmail, motherOccupation, motherIncome,
      guardianName, guardianNik, guardianPhone, guardianEmail, guardianOccupation, guardianIncome,
      hasKip, kipNumber, namaKip, layakPip, alasanLayakPip, hasPkh, hasKks, kksNumber, isDtks, houseOwnership, dependentsCount,
      noAktaLahir, anakKe, jmlSaudara, beratBadan, tinggiBadan, lingkarKepala, jarakSekolah, jenisTinggal, alatTransportasi, sekolahAsal, bank, noRekening, namaRekening,
      ...studentCoreData
    } = data;

    const economicData = {
      hasKip: !!hasKip, kipNumber: hasKip ? kipNumber : undefined, namaKip, layakPip: !!layakPip, alasanLayakPip,
      hasPkh: !!hasPkh, hasKks: !!hasKks, kksNumber: hasKks ? kksNumber : undefined, isDtks: !!isDtks, houseOwnership, dependentsCount, isOrphan: false,
    };

    const dapodikData = { noAktaLahir, anakKe, jmlSaudara, beratBadan, tinggiBadan, lingkarKepala, jarakSekolah, jenisTinggal, alatTransportasi, sekolahAsal, bank, noRekening, namaRekening };

    const payload: CombinedStudentPayload = {
      ...studentCoreData, ...dapodikData, schoolId: school?.id || '', parents: parentsArray, economic: economicData
    };

    mutation.mutate(payload);
  };

  const onInvalid = (errors: FieldErrors<StudentFormValues>) => {
    const errorKeys = Object.keys(errors);
    const tabFields = {
      pribadi: ['fullName', 'nickname', 'nis', 'nisn', 'nik', 'noKk', 'gender', 'birthPlace', 'birthDate', 'religion', 'address', 'rt', 'rw', 'kelurahan', 'kecamatan', 'city', 'province', 'postalCode', 'phone', 'email'],
      akademik: ['classId', 'entryDate'],
      orangtua: ['fatherName', 'motherName', 'guardianName'],
      ekonomi: ['hasKip', 'kipNumber'],
      dapodik: ['anakKe', 'beratBadan']
    };

    for (const [tab, fields] of Object.entries(tabFields)) {
      if (fields.some(field => errorKeys.includes(field))) {
        setActiveTab(tab); break;
      }
    }
    toast.error(locale === 'id' ? 'Gagal menyimpan! Mohon lengkapi isian yang berwarna merah.' : 'Failed to save! Please complete the highlighted fields.');
  };

  const handleNextTab = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === 'pribadi') {
      const isValid = await form.trigger(['nis', 'fullName', 'nisn', 'nik', 'noKk', 'gender', 'birthDate', 'religion', 'address', 'city', 'province']);
      if (isValid) setActiveTab('akademik'); else toast.warning(locale === 'id' ? 'Lengkapi Data Pribadi terlebih dahulu' : 'Complete Personal Data first');
    }
    else if (activeTab === 'akademik') {
      const isValid = await form.trigger(['classId', 'entryDate']);
      if (isValid) setActiveTab('orangtua'); else toast.warning(locale === 'id' ? 'Lengkapi Data Akademik' : 'Complete Academic Data');
    }
    else if (activeTab === 'orangtua') setActiveTab('ekonomi');
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

  if (isEdit && isFetching) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')} type="button"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isEdit ? (locale === 'id' ? 'Edit Data Siswa' : 'Edit Student') : (locale === 'id' ? 'Tambah Siswa Baru' : 'Add New Student')}</h1>
            <p className="text-muted-foreground">{locale === 'id' ? 'Formulir Pendaftaran & Pendataan terintegrasi struktur Verval PD (Dapodik).' : 'Registration form integrated with Dapodik structure.'}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} onKeyDown={preventAutoSubmitOnEnter} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            <TabsList className="grid w-full grid-cols-5 lg:w-[800px]">
              <TabsTrigger value="pribadi">{locale === 'id' ? 'Pribadi' : 'Personal'}</TabsTrigger>
              <TabsTrigger value="akademik">{locale === 'id' ? 'Akademik' : 'Academic'}</TabsTrigger>
              <TabsTrigger value="orangtua">{locale === 'id' ? 'Orang Tua/Wali' : 'Parents/Guardian'}</TabsTrigger>
              <TabsTrigger value="ekonomi">{locale === 'id' ? 'Kesejahteraan' : 'Welfare'}</TabsTrigger>
              <TabsTrigger value="dapodik" className="bg-amber-100/50 dark:bg-amber-900/30 data-[state=active]:bg-amber-100 dark:data-[state=active]:bg-amber-800">
                {locale === 'id' ? 'Dapodik / Fisik' : 'Dapodik'}
              </TabsTrigger>
            </TabsList>

            <Card className="mt-6 border-t-4 border-t-emerald-600 dark:bg-slate-900">
              <CardContent className="pt-6">

                {/* --- TAB 1: PRIBADI --- */}
                <TabsContent value="pribadi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap' : 'Full Name'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Sesuai Ijazah/Akta' : 'As in certificate'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nickname" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Panggilan' : 'Nickname'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nis" render={({ field }) => (<FormItem><FormLabel>NIS</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Nomor Induk Siswa' : 'Student ID'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nisn" render={({ field }) => (<FormItem><FormLabel>NISN</FormLabel><FormControl><Input placeholder="10 Digit" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK (16 Digit)' : 'National ID Number'}</FormLabel><FormControl><Input placeholder="16 Digit NIK" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="noKk" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Kartu Keluarga' : 'Family Card Number'}</FormLabel><FormControl><Input placeholder="16 Digit No. KK" {...field} /></FormControl><FormMessage /></FormItem>)} />

                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem><FormLabel>{locale === 'id' ? 'Jenis Kelamin' : 'Gender'}</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih' : 'Select'} /></SelectTrigger></FormControl><SelectContent><SelectItem value="L">{locale === 'id' ? 'Laki-laki' : 'Male'}</SelectItem><SelectItem value="P">{locale === 'id' ? 'Perempuan' : 'Female'}</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="religion" render={({ field }) => (
                      <FormItem><FormLabel>{locale === 'id' ? 'Agama' : 'Religion'}</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih' : 'Select'} /></SelectTrigger></FormControl><SelectContent><SelectItem value="ISLAM">Islam</SelectItem><SelectItem value="KRISTEN">Kristen</SelectItem><SelectItem value="KATOLIK">Katolik</SelectItem><SelectItem value="HINDU">Hindu</SelectItem><SelectItem value="BUDDHA">Buddha</SelectItem><SelectItem value="KONGHUCU">Konghucu</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                    )} />

                    <FormField control={form.control} name="birthPlace" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tempat Lahir' : 'Birth Place'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="birthDate" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tanggal Lahir' : 'Birth Date'}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border/50 dark:border-slate-800">
                    <h4 className="text-sm font-medium">{locale === 'id' ? 'Alamat & Kontak' : 'Address & Contact'}</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Alamat Jalan' : 'Street Address'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Nama jalan, blok, nomor rumah' : 'Street name, block, house number'} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField control={form.control} name="rt" render={({ field }) => (<FormItem><FormLabel>RT</FormLabel><FormControl><Input placeholder="001" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="rw" render={({ field }) => (<FormItem><FormLabel>RW</FormLabel><FormControl><Input placeholder="002" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kelurahan/Desa' : 'Village'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="kecamatan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kecamatan' : 'District'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="city" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kab/Kota' : 'City'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="province" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Provinsi' : 'Province'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="postalCode" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Kode Pos' : 'Postal Code'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. HP / Telepon' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 2: AKADEMIK --- */}
                <TabsContent value="akademik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="classId" render={({ field }) => (
                      <FormItem><FormLabel>{locale === 'id' ? 'Kelas' : 'Class'}</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingClasses}><FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih Kelas' : 'Select Class'} /></SelectTrigger></FormControl><SelectContent>{classesData?.map((cls) => (<SelectItem key={cls.id} value={cls.id}>{locale === 'id' ? 'Kelas' : 'Grade'} {cls.gradeLevel} - {cls.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="entryDate" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tanggal Masuk' : 'Entry Date'}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                </TabsContent>

                {/* --- TAB 3: ORANG TUA / WALI --- */}
                <TabsContent value="orangtua" className="m-0 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 border-b dark:border-slate-800 pb-2">{locale === 'id' ? 'Data Ayah' : 'Father Data'}</h4>
                      <FormField control={form.control} name="fatherName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Ayah' : 'Father Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Ayah' : 'Father NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="fatherIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan (Rp)' : 'Monthly Income'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-pink-600 dark:text-pink-400 border-b dark:border-slate-800 pb-2">{locale === 'id' ? 'Data Ibu' : 'Mother Data'}</h4>
                      <FormField control={form.control} name="motherName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Ibu' : 'Mother Full Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Ibu' : 'Mother NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan' : 'Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone' : 'Phone Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="motherIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan (Rp)' : 'Monthly Income'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border/50 dark:border-slate-800">
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-500 border-b dark:border-slate-800 pb-2">
                      {locale === 'id' ? 'Data Wali (Opsional - Isi jika siswa tinggal bersama Wali)' : 'Guardian Data (Optional)'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="guardianName" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nama Lengkap Wali' : 'Guardian Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianNik" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'NIK Wali' : 'Guardian NIK'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianOccupation" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Pekerjaan Wali' : 'Guardian Occupation'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianPhone" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Handphone Wali' : 'Guardian Phone'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="guardianIncome" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Penghasilan Bulanan Wali (Rp)' : 'Guardian Monthly Income'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 4: EKONOMI (DENGAN DESKRIPSI & DARK MODE FIX) --- */}
                <TabsContent value="ekonomi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Kotak PIP/KIP - Tambah dark:bg-slate-800/50 agar input tidak terlihat menyatu */}
                    <div className="space-y-4 col-span-1 md:col-span-2 border dark:border-slate-700 p-5 rounded-xl bg-blue-50/50 dark:bg-slate-800/50 shadow-sm">
                      <h4 className="font-bold text-blue-800 dark:text-blue-300">
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
                            <FormDescription className="text-xs text-muted-foreground">
                              {locale === 'id' ? 'Pilih Ya jika memiliki Kartu Indonesia Pintar fisik.' : 'Select Yes if student has a physical KIP card.'}
                            </FormDescription>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="kipNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Nomor KIP' : 'KIP Number'}</FormLabel>
                            <FormControl><Input placeholder={locale === 'id' ? '6 Digit di kartu' : '6 Digits on card'} {...field} disabled={!form.watch('hasKip')} /></FormControl>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="namaKip" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Nama Tertera di KIP' : 'Name on KIP Card'}</FormLabel>
                            <FormControl><Input placeholder={locale === 'id' ? 'Nama lengkap di kartu' : 'Full name on card'} {...field} disabled={!form.watch('hasKip')} /></FormControl>
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
                            <FormDescription className="text-xs text-muted-foreground">
                              {locale === 'id' ? 'Tandai Ya jika sekolah mengusulkan siswa ini mendapat PIP.' : 'Mark Yes if the school proposes this student for PIP.'}
                            </FormDescription>
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

                    {/* KOTAK Kesejahteraan Sosial Lainnya */}
                    <div className="space-y-4 col-span-1 md:col-span-2 border dark:border-slate-700 p-5 rounded-xl dark:bg-slate-800/30">
                      <h4 className="font-bold border-b dark:border-slate-700 pb-2">{locale === 'id' ? 'Bantuan Sosial Lainnya' : 'Other Social Assistance'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="hasPkh" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Penerima PKH?' : 'PKH Receiver?'}</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="true">{locale === 'id' ? 'Ya' : 'Yes'}</SelectItem>
                                <SelectItem value="false">{locale === 'id' ? 'Tidak' : 'No'}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs text-muted-foreground">
                              {locale === 'id' ? 'Program Keluarga Harapan (Bantuan Kemensos).' : 'Family Hope Program assistance.'}
                            </FormDescription>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="isDtks" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{locale === 'id' ? 'Terdaftar DTKS?' : 'Registered in DTKS?'}</FormLabel>
                            <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="true">{locale === 'id' ? 'Ya' : 'Yes'}</SelectItem>
                                <SelectItem value="false">{locale === 'id' ? 'Tidak' : 'No'}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs text-muted-foreground">
                              {locale === 'id' ? 'Data Terpadu Kesejahteraan Sosial (Database warga prasejahtera).' : 'Social Welfare Integrated Data.'}
                            </FormDescription>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 5: DAPODIK / KESEHATAN --- */}
                <TabsContent value="dapodik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4 border dark:border-slate-700 p-5 rounded-xl dark:bg-slate-800/30">
                      <h4 className="font-semibold border-b dark:border-slate-700 pb-2">{locale === 'id' ? 'Kesehatan & Fisik' : 'Physical Health'}</h4>
                      <FormField control={form.control} name="beratBadan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Berat Badan (kg)' : 'Weight (kg)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="tinggiBadan" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Tinggi Badan (cm)' : 'Height (cm)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="lingkarKepala" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Lingkar Kepala (cm)' : 'Head Circumference (cm)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                    </div>

                    <div className="space-y-4 border dark:border-slate-700 p-5 rounded-xl dark:bg-slate-800/30">
                      <h4 className="font-semibold border-b dark:border-slate-700 pb-2">{locale === 'id' ? 'Keluarga & Tempat Tinggal' : 'Family & Residence'}</h4>
                      <FormField control={form.control} name="anakKe" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Anak Ke-berapa' : 'Birth Order'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="jmlSaudara" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jumlah Saudara Kandung' : 'Number of Siblings'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="jarakSekolah" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jarak ke Sekolah (km)' : 'Distance to School (km)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="alatTransportasi" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Alat Transportasi' : 'Transportation'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Cth: Jalan Kaki, Motor' : 'e.g. Walk, Motorcycle'} {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="jenisTinggal" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Jenis Tinggal' : 'Residence Type'}</FormLabel><FormControl><Input placeholder={locale === 'id' ? 'Cth: Bersama Orang Tua, Kos' : 'e.g. With Parents, Boarding'} {...field} /></FormControl></FormItem>)} />
                    </div>

                    <div className="space-y-4 border dark:border-slate-700 p-5 rounded-xl dark:bg-slate-800/30">
                      <h4 className="font-semibold border-b dark:border-slate-700 pb-2">{locale === 'id' ? 'Registrasi & Bank' : 'Registration & Bank'}</h4>
                      <FormField control={form.control} name="noAktaLahir" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'No. Registrasi Akta Lahir' : 'Birth Certificate No.'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="sekolahAsal" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Sekolah Asal' : 'Previous School'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="bank" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Bank' : 'Bank Name'}</FormLabel><FormControl><Input placeholder="Cth: BRI, BNI" {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="noRekening" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Nomor Rekening Bank' : 'Account Number'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                      <FormField control={form.control} name="namaRekening" render={({ field }) => (<FormItem><FormLabel>{locale === 'id' ? 'Rekening Atas Nama' : 'Account Holder Name'}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                    </div>
                  </div>
                </TabsContent>

              </CardContent>
            </Card>
          </Tabs>

          <div className="flex justify-end space-x-4 pt-4">
            <Button type="button" variant="ghost" onClick={() => navigate('/students')} disabled={mutation.isPending}>
              <X className="mr-2 h-4 w-4" /> {locale === 'id' ? 'Batal' : 'Cancel'}
            </Button>
            {activeTab !== 'pribadi' && (
              <Button type="button" variant="outline" onClick={handlePrevTab}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {locale === 'id' ? 'Sebelumnya' : 'Previous'}
              </Button>
            )}
            {activeTab !== 'dapodik' ? (
              <Button type="button" onClick={handleNextTab} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {locale === 'id' ? 'Selanjutnya' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEdit ? (locale === 'id' ? 'Simpan Perubahan' : 'Save Changes') : (locale === 'id' ? 'Simpan Seluruh Data' : 'Save All Data')}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}