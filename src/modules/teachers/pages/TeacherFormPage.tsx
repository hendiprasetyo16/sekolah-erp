import React, { useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { teacherService } from '../services/teacher.service';
import { useTranslation } from '@/hooks/useTranslation';

// Schema validasi dengan pesan error bilingual
const teacherSchema = z.object({
  fullName: z.string().min(1, 'Nama lengkap wajib diisi / Full name is required'),
  gender: z.string().min(1, 'Jenis kelamin wajib diisi / Gender is required'),
  nip: z.string().optional(),
  nuptk: z.string().optional(),
  nik: z.string().optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid / Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  education: z.string().optional(),
  major: z.string().optional(),
  university: z.string().optional(),
  status: z.string().optional(),
  position: z.string().optional(),
  isCertified: z.boolean(),
  certificationNumber: z.string().optional(),
  joinDate: z.string().optional(),
  baseSalary: z.coerce.number().optional(),
  subjects: z.string().optional(),
  maxHoursPerWeek: z.coerce.number(),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

export default function TeacherFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { locale } = useTranslation();
  const isEdit = Boolean(id);

  // Kamus terjemahan lokal
  const dict = {
    addTitle: locale === 'id' ? 'Tambah Guru Baru' : 'Add New Teacher',
    editTitle: locale === 'id' ? 'Edit Data Guru' : 'Edit Teacher',
    addDesc: locale === 'id' ? 'Masukkan informasi untuk guru baru.' : 'Enter information for a new teacher.',
    editDesc: locale === 'id' ? 'Perbarui informasi data guru yang sudah ada.' : 'Update existing teacher information.',
    tabPersonal: locale === 'id' ? 'Data Pribadi' : 'Personal Information',
    tabProf: locale === 'id' ? 'Kepegawaian & Akademik' : 'Employment & Academic',
    cardPersonalTitle: locale === 'id' ? 'Informasi Pribadi' : 'Personal Information',
    cardPersonalDesc: locale === 'id' ? 'Detail pribadi dan informasi kontak guru.' : "Teacher's personal details and contact information.",
    cardProfTitle: locale === 'id' ? 'Informasi Kepegawaian & Akademik' : 'Employment & Academic Information',
    cardProfDesc: locale === 'id' ? 'Latar belakang profesional dan penugasan sekolah.' : "Teacher's professional background and school assignment.",
    fullName: locale === 'id' ? 'Nama Lengkap' : 'Full Name',
    gender: locale === 'id' ? 'Jenis Kelamin' : 'Gender',
    genderPlaceholder: locale === 'id' ? 'Pilih jenis kelamin' : 'Select gender',
    male: locale === 'id' ? 'Laki-laki' : 'Male',
    female: locale === 'id' ? 'Perempuan' : 'Female',
    nik: 'NIK',
    birthPlace: locale === 'id' ? 'Tempat Lahir' : 'Birth Place',
    birthDate: locale === 'id' ? 'Tanggal Lahir' : 'Birth Date',
    phone: locale === 'id' ? 'Nomor Telepon' : 'Phone Number',
    email: 'Email',
    address: locale === 'id' ? 'Alamat Lengkap' : 'Full Address',
    nip: 'NIP',
    nuptk: 'NUPTK',
    status: 'Status',
    statusPlaceholder: locale === 'id' ? 'Pilih status' : 'Select status',
    position: locale === 'id' ? 'Jabatan' : 'Position',
    positionPlaceholder: locale === 'id' ? 'Cth. Guru Kelas' : 'e.g. Homeroom Teacher',
    education: locale === 'id' ? 'Pendidikan' : 'Education',
    educationPlaceholder: locale === 'id' ? 'Pilih pendidikan' : 'Select education',
    major: locale === 'id' ? 'Jurusan' : 'Major',
    majorPlaceholder: locale === 'id' ? 'Cth. Pendidikan Matematika' : 'e.g. Mathematics Education',
    university: locale === 'id' ? 'Universitas' : 'University',
    universityPlaceholder: locale === 'id' ? 'Nama universitas' : 'University name',
    isCertified: locale === 'id' ? 'Status Sertifikasi' : 'Certification Status',
    certifiedPlaceholder: locale === 'id' ? 'Apakah sudah sertifikasi?' : 'Is certified?',
    certifiedYes: locale === 'id' ? 'Sudah Sertifikasi' : 'Certified',
    certifiedNo: locale === 'id' ? 'Belum Sertifikasi' : 'Not Certified',
    certNumber: locale === 'id' ? 'Nomor Sertifikasi' : 'Certification Number',
    joinDate: locale === 'id' ? 'Tanggal Bergabung' : 'Join Date',
    baseSalary: locale === 'id' ? 'Gaji Pokok' : 'Base Salary',
    maxHours: locale === 'id' ? 'Maks. Jam per Minggu' : 'Max Hours Per Week',
    subjects: locale === 'id' ? 'Mata Pelajaran (pisahkan dengan koma)' : 'Subjects (comma separated)',
    subjectsPlaceholder: locale === 'id' ? 'Cth. Matematika, Fisika' : 'e.g. Math, Physics',
    btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
    btnSave: locale === 'id' ? 'Simpan' : 'Save',
    toastCreateSuccess: locale === 'id' ? 'Data guru berhasil ditambahkan' : 'Teacher created successfully',
    toastUpdateSuccess: locale === 'id' ? 'Data guru berhasil diperbarui' : 'Teacher updated successfully',
    toastError: locale === 'id' ? 'Gagal menyimpan data guru' : 'Failed to save teacher',
  };

  const form = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      fullName: '',
      gender: '',
      nip: '',
      nuptk: '',
      nik: '',
      birthDate: '',
      birthPlace: '',
      phone: '',
      email: '',
      address: '',
      education: '',
      major: '',
      university: '',
      status: '',
      position: '',
      isCertified: false,
      certificationNumber: '',
      joinDate: '',
      baseSalary: 0,
      subjects: '',
      maxHoursPerWeek: 24,
    },
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => teacherService.getById(id!),
    enabled: isEdit,
  });

  const teacher = response?.data;

  useEffect(() => {
    if (teacher) {
      form.reset({
        fullName: teacher.fullName || '',
        gender: teacher.gender || '',
        nip: teacher.nip || '',
        nuptk: teacher.nuptk || '',
        nik: teacher.nik || '',
        birthDate: teacher.birthDate ? String(teacher.birthDate).split('T')[0] : '',
        birthPlace: teacher.birthPlace || '',
        phone: teacher.phone || '',
        email: teacher.email || '',
        address: teacher.address || '',
        education: teacher.education || '',
        major: teacher.major || '',
        university: teacher.university || '',
        status: teacher.status || '',
        position: teacher.position || '',
        isCertified: teacher.isCertified || false,
        certificationNumber: teacher.certificationNumber || '',
        joinDate: teacher.joinDate ? String(teacher.joinDate).split('T')[0] : '',
        baseSalary: teacher.baseSalary || 0,
        subjects: typeof teacher.subjects === 'string' ? teacher.subjects : (Array.isArray(teacher.subjects) ? (teacher.subjects as unknown as string[]).join(', ') : ''),
        maxHoursPerWeek: teacher.maxHoursPerWeek || 24,
      });
    }
  }, [teacher, form]);

  const mutation = useMutation({
    mutationFn: (values: TeacherFormValues) => {
      const payload = {
        ...values,
        gender: values.gender as 'L' | 'P',
        status: values.status || '',
        position: values.position || '',
        isActive: true,
      };
      return isEdit ? teacherService.update(id!, payload) : teacherService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? dict.toastUpdateSuccess : dict.toastCreateSuccess);
      navigate('/teachers');
    },
    onError: (error) => {
      console.error(error);
      toast.error(dict.toastError);
    },
  });

  const onSubmit = (values: TeacherFormValues) => {
    mutation.mutate(values);
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link to="/teachers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? dict.editTitle : dict.addTitle}
          </h1>
          <p className="text-muted-foreground">
            {isEdit ? dict.editDesc : dict.addDesc}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="personal">{dict.tabPersonal}</TabsTrigger>
              <TabsTrigger value="professional">{dict.tabProf}</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.cardPersonalTitle}</CardTitle>
                  <CardDescription>
                    {dict.cardPersonalDesc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.fullName} <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.gender} <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={dict.genderPlaceholder} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="L">{dict.male}</SelectItem>
                            <SelectItem value="P">{dict.female}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nik"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.nik}</FormLabel>
                        <FormControl>
                          <Input placeholder="16-digit NIK" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="birthPlace"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.birthPlace}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.birthPlace} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.birthDate}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.phone}</FormLabel>
                        <FormControl>
                          <Input placeholder="08xxxxxxxxxx" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.email}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="teacher@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{dict.address}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.address} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="professional" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.cardProfTitle}</CardTitle>
                  <CardDescription>
                    {dict.cardProfDesc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="nip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.nip}</FormLabel>
                        <FormControl>
                          <Input placeholder="NIP" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nuptk"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.nuptk}</FormLabel>
                        <FormControl>
                          <Input placeholder="NUPTK" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.status}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={dict.statusPlaceholder} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="PNS">PNS</SelectItem>
                            <SelectItem value="CPNS">CPNS</SelectItem>
                            <SelectItem value="HONORER">HONORER</SelectItem>
                            <SelectItem value="GTY">GTY</SelectItem>
                            <SelectItem value="GTT">GTT</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.position}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.positionPlaceholder} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="education"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.education}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={dict.educationPlaceholder} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="S3">S3</SelectItem>
                            <SelectItem value="S2">S2</SelectItem>
                            <SelectItem value="S1">S1</SelectItem>
                            <SelectItem value="D4">D4</SelectItem>
                            <SelectItem value="D3">D3</SelectItem>
                            <SelectItem value="SMA">SMA</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="major"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.major}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.majorPlaceholder} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="university"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.university}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.universityPlaceholder} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isCertified"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.isCertified}</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === 'true')}
                          defaultValue={field.value ? 'true' : 'false'}
                          value={field.value ? 'true' : 'false'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={dict.certifiedPlaceholder} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="true">{dict.certifiedYes}</SelectItem>
                            <SelectItem value="false">{dict.certifiedNo}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="certificationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.certNumber}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.certNumber} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="joinDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.joinDate}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="baseSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.baseSalary}</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxHoursPerWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{dict.maxHours}</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subjects"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{dict.subjects}</FormLabel>
                        <FormControl>
                          <Input placeholder={dict.subjectsPlaceholder} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-end space-x-4">
            <Button variant="outline" type="button" onClick={() => navigate('/teachers')} disabled={mutation.isPending}>
              <X className="mr-2 h-4 w-4" /> {dict.btnCancel}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> {dict.btnSave}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}