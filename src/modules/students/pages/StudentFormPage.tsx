import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, X, ArrowLeft, Loader2 } from 'lucide-react';
import { studentService } from '../services/student.service';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Zod Schema for validation
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
});

type StudentFormValues = z.infer<typeof studentSchema>;

export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('pribadi');

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
    },
  });

  useEffect(() => {
    if (student?.data) {
      const d = student.data;
      form.reset({
        nisn: d.nisn, nik: d.nik, noKk: d.noKk || '', fullName: d.fullName,
        nickname: d.nickname || '', gender: d.gender, birthDate: d.birthDate.split('T')[0],
        birthPlace: d.birthPlace, religion: d.religion || '', address: d.address,
        rt: d.rt || '', rw: d.rw || '', kelurahan: d.kelurahan || '',
        kecamatan: d.kecamatan || '', city: d.city, province: d.province,
        postalCode: d.postalCode || '', phone: d.phone || '', email: d.email || '',
        classId: d.classId, entryDate: d.entryDate.split('T')[0],
      });
    }
  }, [student, form]);

  const mutation = useMutation({
    mutationFn: (data: StudentFormValues) => {
      return isEdit ? studentService.update(id!, data) : studentService.create(data);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Data siswa berhasil diperbarui' : 'Siswa berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      navigate('/students');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Terjadi kesalahan');
    },
  });

  const onSubmit = (data: StudentFormValues) => {
    mutation.mutate(data);
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isEdit ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
            </h1>
            <p className="text-muted-foreground">
              Lengkapi form di bawah ini untuk {isEdit ? 'memperbarui data' : 'menambahkan'} siswa.
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
              <TabsTrigger value="pribadi">Data Pribadi</TabsTrigger>
              <TabsTrigger value="akademik">Akademik</TabsTrigger>
              <TabsTrigger value="orangtua" disabled>Orang Tua</TabsTrigger>
              <TabsTrigger value="ekonomi" disabled>Ekonomi</TabsTrigger>
            </TabsList>
            
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>{activeTab === 'pribadi' ? 'Data Pribadi' : 'Data Akademik'}</CardTitle>
                <CardDescription>
                  Pastikan data yang diisi sesuai dengan dokumen resmi (Kartu Keluarga/Akta Kelahiran).
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Pilih Jenis Kelamin" /></SelectTrigger>
                          </FormControl>
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
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Pilih Agama" /></SelectTrigger>
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
                      <FormField control={form.control} name="postalCode" render={({ field }) => (
                        <FormItem><FormLabel>Kode Pos</FormLabel><FormControl><Input placeholder="40123" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="akademik" className="m-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="classId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kelas</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cls-1">XII RPL 1</SelectItem>
                            <SelectItem value="cls-2">XI TKJ 2</SelectItem>
                            <SelectItem value="cls-3">X MM 1</SelectItem>
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
              </CardContent>
            </Card>
          </Tabs>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => navigate('/students')} disabled={mutation.isPending}>
              <X className="mr-2 h-4 w-4" /> Batal
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? 'Simpan Perubahan' : 'Simpan Siswa'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
