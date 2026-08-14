import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
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

const studentSchema = z.object({
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

  hasKip: z.boolean().optional(),
  kipNumber: z.string().optional(),
  hasPkh: z.boolean().optional(),
  hasKks: z.boolean().optional(),
  kksNumber: z.string().optional(),
  isDtks: z.boolean().optional(),
  houseOwnership: z.string().optional(),
  dependentsCount: z.coerce.number().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

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
      nisn: '', nik: '', noKk: '', fullName: '', nickname: '', gender: 'L',
      birthDate: '', birthPlace: '', religion: '', address: '', rt: '', rw: '',
      kelurahan: '', kecamatan: '', city: '', province: '', postalCode: '',
      phone: '', email: '', classId: '', entryDate: new Date().toISOString().split('T')[0],
      fatherName: '', fatherNik: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', fatherIncome: 0,
      motherName: '', motherNik: '', motherPhone: '', motherEmail: '', motherOccupation: '', motherIncome: 0,
      hasKip: false, kipNumber: '', hasPkh: false, hasKks: false, kksNumber: '', isDtks: false, houseOwnership: '', dependentsCount: 0
    },
  });

  useEffect(() => {
    if (student?.data) {
      const d = student.data;
      const ayah = d.parents?.find((p: any) => p.relation === 'AYAH');
      const ibu = d.parents?.find((p: any) => p.relation === 'IBU');
      const eco = d.economic;

      form.reset({
        nisn: d.nisn, nik: d.nik, noKk: d.noKk || '', fullName: d.fullName,
        nickname: d.nickname || '', gender: d.gender, birthDate: d.birthDate.split('T')[0],
        birthPlace: d.birthPlace, religion: d.religion || '', address: d.address,
        rt: d.rt || '', rw: d.rw || '', kelurahan: d.kelurahan || '',
        kecamatan: d.kecamatan || '', city: d.city, province: d.province,
        postalCode: d.postalCode || '', phone: d.phone || '', email: d.email || '',
        classId: d.classId, entryDate: d.entryDate.split('T')[0],

        fatherName: ayah?.fullName || '',
        fatherNik: ayah?.nik || '',
        fatherPhone: ayah?.phone || '',
        fatherEmail: ayah?.email || '',
        fatherOccupation: ayah?.occupation || '',
        fatherIncome: ayah?.monthlyIncome || 0,

        motherName: ibu?.fullName || '',
        motherNik: ibu?.nik || '',
        motherPhone: ibu?.phone || '',
        motherEmail: ibu?.email || '',
        motherOccupation: ibu?.occupation || '',
        motherIncome: ibu?.monthlyIncome || 0,

        hasKip: eco?.hasKip || false,
        kipNumber: eco?.kipNumber || '',
        hasPkh: eco?.hasPkh || false,
        hasKks: eco?.hasKks || false,
        kksNumber: eco?.kksNumber || '',
        isDtks: eco?.isDtks || false,
        houseOwnership: eco?.houseOwnership || '',
        dependentsCount: eco?.dependentsCount || 0
      });
    }
  }, [student, form]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      return isEdit ? studentService.update(id!, data) : studentService.create(data);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Data berhasil diperbarui' : 'Siswa berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      navigate('/students');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Terjadi kesalahan');
    },
  });

  const onSubmit = (data: StudentFormValues) => {
    const parentsArray = [];

    if (data.fatherName) {
      parentsArray.push({
        relation: 'AYAH',
        fullName: data.fatherName,
        nik: data.fatherNik,
        phone: data.fatherPhone,
        email: data.fatherEmail,
        occupation: data.fatherOccupation,
        monthlyIncome: data.fatherIncome,
        isAlive: true
      });
    }

    if (data.motherName) {
      parentsArray.push({
        relation: 'IBU',
        fullName: data.motherName,
        nik: data.motherNik,
        phone: data.motherPhone,
        email: data.motherEmail,
        occupation: data.motherOccupation,
        monthlyIncome: data.motherIncome,
        isAlive: true
      });
    }

    const {
      fatherName, fatherNik, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
      motherName, motherNik, motherPhone, motherEmail, motherOccupation, motherIncome,
      hasKip, kipNumber, hasPkh, hasKks, kksNumber, isDtks, houseOwnership, dependentsCount,
      ...studentCoreData
    } = data;

    const economicData = {
      hasKip: !!hasKip,
      kipNumber: hasKip ? kipNumber : null,
      hasPkh: !!hasPkh,
      hasKks: !!hasKks,
      kksNumber: hasKks ? kksNumber : null,
      isDtks: !!isDtks,
      houseOwnership,
      dependentsCount
    };

    const payload = {
      ...studentCoreData,
      schoolId: school?.id || '',
      parents: parentsArray,
      economic: economicData
    };

    mutation.mutate(payload);
  };

  // Menambahkan e.preventDefault() agar aman dari klik ganda yang memicu submit
  const handleNextTab = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === 'pribadi') {
      const isTab1Valid = await form.trigger(['fullName', 'nisn', 'nik', 'noKk', 'gender', 'birthPlace', 'birthDate', 'religion', 'address', 'city', 'province']);
      if (isTab1Valid) setActiveTab('akademik');
      else toast.warning('Lengkapi Data Pribadi terlebih dahulu');
    }
    else if (activeTab === 'akademik') {
      const isTab2Valid = await form.trigger(['classId', 'entryDate']);
      if (isTab2Valid) setActiveTab('orangtua');
      else toast.warning('Lengkapi Data Akademik terlebih dahulu');
    }
    else if (activeTab === 'orangtua') {
      setActiveTab('ekonomi');
    }
  };

  const handlePrevTab = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === 'ekonomi') setActiveTab('orangtua');
    else if (activeTab === 'orangtua') setActiveTab('akademik');
    else if (activeTab === 'akademik') setActiveTab('pribadi');
  };

  // Diperbarui: mencegah Enter di seluruh form (bukan hanya input) kecuali text area
  const preventAutoSubmitOnEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')} type="button">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEdit ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
            </h1>
            <p className="text-muted-foreground">
              Lengkapi form di bawah ini secara menyeluruh.
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={preventAutoSubmitOnEnter} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
              <TabsTrigger value="pribadi">{locale === 'id' ? 'Data Pribadi' : 'Personal Data'}</TabsTrigger>
              <TabsTrigger value="akademik">{locale === 'id' ? 'Akademik' : 'Academic'}</TabsTrigger>
              <TabsTrigger value="orangtua">{locale === 'id' ? 'Orang Tua' : 'Parents'}</TabsTrigger>
              <TabsTrigger value="ekonomi">{locale === 'id' ? 'Ekonomi' : 'Economic'}</TabsTrigger>
            </TabsList>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>
                  {activeTab === 'pribadi' && 'Data Pribadi'}
                  {activeTab === 'akademik' && 'Data Akademik'}
                  {activeTab === 'orangtua' && 'Data Orang Tua / Wali'}
                  {activeTab === 'ekonomi' && 'Data Kesejahteraan Ekonomi'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* --- TAB 1: PRIBADI --- */}
                <TabsContent value="pribadi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="fullName" render={({ field }) => (
                      <FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Cth: Ahmad Suryadi" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="nickname" render={({ field }) => (
                      <FormItem><FormLabel>Nama Panggilan</FormLabel><FormControl><Input placeholder="Cth: Ahmad" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="nisn" render={({ field }) => (
                      <FormItem><FormLabel>NISN</FormLabel><FormControl><Input placeholder="10 digit NISN" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="nik" render={({ field }) => (
                      <FormItem><FormLabel>NIK</FormLabel><FormControl><Input placeholder="16 digit NIK" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="noKk" render={({ field }) => (
                      <FormItem><FormLabel>No. Kartu Keluarga</FormLabel><FormControl><Input placeholder="16 digit No KK" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jenis Kelamin</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="L">Laki-laki</SelectItem>
                            <SelectItem value="P">Perempuan</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="birthPlace" render={({ field }) => (
                      <FormItem><FormLabel>Tempat Lahir</FormLabel><FormControl><Input placeholder="Cth: Bandung" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="birthDate" render={({ field }) => (
                      <FormItem><FormLabel>Tanggal Lahir</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                    <FormField control={form.control} name="religion" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agama</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Pilih Agama" /></SelectTrigger></FormControl>
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
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <h4 className="text-sm font-medium">Alamat & Kontak</h4>
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Alamat Lengkap</FormLabel><FormControl><Input placeholder="Nama jalan, nomor rumah" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField control={form.control} name="rt" render={({ field }) => (
                        <FormItem><FormLabel>RT</FormLabel><FormControl><Input placeholder="001" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="rw" render={({ field }) => (
                        <FormItem><FormLabel>RW</FormLabel><FormControl><Input placeholder="002" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (
                        <FormItem><FormLabel>Kelurahan</FormLabel><FormControl><Input placeholder="Sukamaju" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="kecamatan" render={({ field }) => (
                        <FormItem><FormLabel>Kecamatan</FormLabel><FormControl><Input placeholder="Cibeunying" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem><FormLabel>Kab/Kota</FormLabel><FormControl><Input placeholder="Bandung" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="province" render={({ field }) => (
                        <FormItem><FormLabel>Provinsi</FormLabel><FormControl><Input placeholder="Jawa Barat" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 2: AKADEMIK --- */}
                <TabsContent value="akademik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="classId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kelas</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingClasses}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {classesData?.map((cls) => (
                              <SelectItem key={cls.id} value={cls.id}>
                                Kelas {cls.gradeLevel} - {cls.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="entryDate" render={({ field }) => (
                      <FormItem><FormLabel>Tanggal Masuk</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* --- TAB 3: ORANG TUA --- */}
                <TabsContent value="orangtua" className="m-0 space-y-8">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-blue-600 border-b pb-2">Data Ayah</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="fatherName" render={({ field }) => (
                        <FormItem><FormLabel>Nama Lengkap Ayah</FormLabel><FormControl><Input placeholder="Cth: Budi Santoso" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="fatherNik" render={({ field }) => (
                        <FormItem><FormLabel>NIK Ayah</FormLabel><FormControl><Input placeholder="16 digit NIK" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="fatherPhone" render={({ field }) => (
                        <FormItem><FormLabel>No. Handphone</FormLabel><FormControl><Input placeholder="Cth: 08123456789" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="fatherEmail" render={({ field }) => (
                        <FormItem><FormLabel>Email Ayah</FormLabel><FormControl><Input placeholder="Cth: ayah@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="fatherOccupation" render={({ field }) => (
                        <FormItem><FormLabel>Pekerjaan</FormLabel><FormControl><Input placeholder="Cth: Wiraswasta" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="fatherIncome" render={({ field }) => (
                        <FormItem><FormLabel>Penghasilan Bulanan (Rp)</FormLabel><FormControl><Input type="number" placeholder="Cth: 5000000" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h4 className="text-sm font-semibold text-pink-600 border-b pb-2">Data Ibu</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="motherName" render={({ field }) => (
                        <FormItem><FormLabel>Nama Lengkap Ibu</FormLabel><FormControl><Input placeholder="Cth: Siti Aminah" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="motherNik" render={({ field }) => (
                        <FormItem><FormLabel>NIK Ibu</FormLabel><FormControl><Input placeholder="16 digit NIK" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="motherPhone" render={({ field }) => (
                        <FormItem><FormLabel>No. Handphone</FormLabel><FormControl><Input placeholder="Cth: 08123456789" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="motherEmail" render={({ field }) => (
                        <FormItem><FormLabel>Email Ibu</FormLabel><FormControl><Input placeholder="Cth: ibu@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="motherOccupation" render={({ field }) => (
                        <FormItem><FormLabel>Pekerjaan</FormLabel><FormControl><Input placeholder="Cth: Guru" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="motherIncome" render={({ field }) => (
                        <FormItem><FormLabel>Penghasilan Bulanan (Rp)</FormLabel><FormControl><Input type="number" placeholder="Cth: 3000000" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                </TabsContent>

                {/* --- TAB 4: EKONOMI --- */}
                <TabsContent value="ekonomi" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    <div className="space-y-6 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="hasKip" render={({ field }) => (
                        <FormItem className="flex flex-col border p-4 rounded-lg">
                          <FormLabel>Penerima KIP?</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="true">Ya, Menerima</SelectItem><SelectItem value="false">Tidak</SelectItem></SelectContent>
                          </Select>
                          <FormDescription className="text-xs">Kartu Indonesia Pintar</FormDescription>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="hasPkh" render={({ field }) => (
                        <FormItem className="flex flex-col border p-4 rounded-lg">
                          <FormLabel>Penerima PKH?</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="true">Ya, Menerima</SelectItem><SelectItem value="false">Tidak</SelectItem></SelectContent>
                          </Select>
                          <FormDescription className="text-xs">Program Keluarga Harapan</FormDescription>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="isDtks" render={({ field }) => (
                        <FormItem className="flex flex-col border p-4 rounded-lg">
                          <FormLabel>Terdaftar DTKS?</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === 'true')} value={field.value ? 'true' : 'false'}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="true">Ya, Terdaftar</SelectItem>
                              <SelectItem value="false">Tidak</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs text-muted-foreground">
                            Data Terpadu Kesejahteraan Sosial (Database resmi keluarga prasejahtera).
                          </FormDescription>
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="kipNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nomor KIP</FormLabel>
                        <FormControl><Input placeholder="Cth: KIP-123456" {...field} disabled={!form.watch('hasKip')} /></FormControl>
                        <FormDescription>Isi jika siswa adalah penerima KIP.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="kksNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nomor KKS (Kartu Keluarga Sejahtera)</FormLabel>
                        <FormControl><Input placeholder="Kosongkan jika tidak ada" {...field} /></FormControl>
                        <FormDescription>
                          Isi jika siswa memiliki kartu bantuan sosial (keluarga prasejahtera/rentan).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="houseOwnership" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status Kepemilikan Rumah</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Pilih Status" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="MILIK_SENDIRI">Milik Sendiri</SelectItem>
                            <SelectItem value="SEWA">Sewa / Kontrak</SelectItem>
                            <SelectItem value="NUMPANG">Numpang</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="dependentsCount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jumlah Tanggungan Keluarga</FormLabel>
                        <FormControl><Input type="number" placeholder="Cth: 3" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                  </div>
                </TabsContent>

              </CardContent>
            </Card>
          </Tabs>

          <div className="flex justify-end space-x-4 pt-4">
            <Button type="button" variant="ghost" onClick={() => navigate('/students')} disabled={mutation.isPending}>
              <X className="mr-2 h-4 w-4" /> Batal
            </Button>

            {activeTab !== 'pribadi' && (
              <Button type="button" variant="outline" onClick={handlePrevTab}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Sebelumnya
              </Button>
            )}

            {activeTab !== 'ekonomi' ? (
              <Button type="button" onClick={handleNextTab} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Selanjutnya <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEdit ? 'Simpan Perubahan' : 'Simpan Seluruh Data'}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}