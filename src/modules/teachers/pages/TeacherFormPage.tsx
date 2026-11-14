import { useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  Save,
  X,
  GraduationCap,
  Building,
  Award,
  Briefcase,
} from 'lucide-react';

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
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { teacherService } from '../services/teacher.service';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { CreateTeacherPayload } from '../types/teacher.types';

const teacherSchema = z.object({
  fullName: z.string().min(1, 'Nama lengkap wajib diisi'),
  gender: z.string().min(1, 'Jenis kelamin wajib diisi'),
  nip: z.string().optional(),
  nuptk: z.string().optional(),
  nik: z.string().optional(),
  noKk: z.string().optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().optional(),
  religion: z.string().optional(),
  telepon: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  address: z.string().optional(),
  dusun: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  lintang: z.string().optional(),
  bujur: z.string().optional(),

  education: z.string().optional(),
  major: z.string().optional(),
  university: z.string().optional(),
  status: z.string().optional(),
  position: z.string().optional(),
  tugasTambahan: z.string().optional(),

  skCpns: z.string().optional(),
  tanggalCpns: z.string().optional(),
  skPengangkatan: z.string().optional(),
  tmtPengangkatan: z.string().optional(),
  lembagaPengangkatan: z.string().optional(),
  pangkatGolongan: z.string().optional(),
  sumberGaji: z.string().optional(),
  tmtPns: z.string().optional(),
  karpeg: z.string().optional(),

  namaIbuKandung: z.string().optional(),
  statusPerkawinan: z.string().optional(),
  namaSuamiIstri: z.string().optional(),
  nipSuamiIstri: z.string().optional(),
  pekerjaanSuamiIstri: z.string().optional(),
  karisKarsu: z.string().optional(),
  kewarganegaraan: z.string().optional(),

  npwp: z.string().optional(),
  namaWajibPajak: z.string().optional(),
  bank: z.string().optional(),
  nomorRekeningBank: z.string().optional(),
  rekeningAtasNama: z.string().optional(),

  isCertified: z.boolean().optional(),
  certificationNumber: z.string().optional(),
  sudahLisensiKepalaSekolah: z.boolean().optional(),
  pernahDiklatKepengawasan: z.boolean().optional(),
  keahlianBraille: z.boolean().optional(),
  keahlianBahasaIsyarat: z.boolean().optional(),
  nuks: z.string().optional(),

  joinDate: z.string().optional(),
  baseSalary: z.string().optional(),
  subjects: z.string().optional(),
  maxHoursPerWeek: z.string().optional(),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

interface FieldProps {
  name: Path<TeacherFormValues>;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'select' | 'boolean';
  placeholder?: string;
  options?: { label: string; value: string }[];
  className?: string;
}

const formatDateForInput = (dateStr?: string | null): string =>
  dateStr ? String(dateStr).split('T')[0] : '';

export function TeacherFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale } = useTranslation();
  const { school } = useAuthStore();
  const isEdit = Boolean(id);

  const dict = {
    addTitle: locale === 'id' ? 'Tambah Guru Baru' : 'Add New Teacher',
    editTitle: locale === 'id' ? 'Edit Data Guru' : 'Edit Teacher',
    addDesc:
      locale === 'id'
        ? 'Masukkan informasi Dapodik untuk guru baru.'
        : 'Enter Dapodik info for new teacher.',
    editDesc:
      locale === 'id'
        ? 'Perbarui informasi data guru yang sudah ada.'
        : 'Update existing teacher information.',
    tabPersonal: locale === 'id' ? 'Data Pribadi' : 'Personal',
    tabProf: locale === 'id' ? 'Kepegawaian' : 'Employment',
    tabTask: locale === 'id' ? 'Tugas & Lisensi' : 'Duties & Licenses',
    tabFamily: locale === 'id' ? 'Keluarga & Bank' : 'Family & Bank',
    btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
    btnSave: locale === 'id' ? 'Simpan Data' : 'Save Data',
    toastCreateSuccess:
      locale === 'id' ? 'Data guru berhasil ditambahkan' : 'Teacher created successfully',
    toastUpdateSuccess:
      locale === 'id' ? 'Data guru berhasil diperbarui' : 'Teacher updated successfully',
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
      noKk: '',
      birthDate: '',
      birthPlace: '',
      religion: '',
      telepon: '',
      phone: '',
      email: '',
      address: '',
      dusun: '',
      rt: '',
      rw: '',
      kelurahan: '',
      kecamatan: '',
      city: '',
      province: '',
      postalCode: '',
      lintang: '',
      bujur: '',
      education: '',
      major: '',
      university: '',
      status: 'HONORER',
      position: 'Guru',
      tugasTambahan: '',
      skCpns: '',
      tanggalCpns: '',
      skPengangkatan: '',
      tmtPengangkatan: '',
      lembagaPengangkatan: '',
      pangkatGolongan: '',
      sumberGaji: '',
      tmtPns: '',
      karpeg: '',
      namaIbuKandung: '',
      statusPerkawinan: '',
      namaSuamiIstri: '',
      nipSuamiIstri: '',
      pekerjaanSuamiIstri: '',
      karisKarsu: '',
      kewarganegaraan: 'Indonesia',
      npwp: '',
      namaWajibPajak: '',
      bank: '',
      nomorRekeningBank: '',
      rekeningAtasNama: '',
      isCertified: false,
      certificationNumber: '',
      sudahLisensiKepalaSekolah: false,
      pernahDiklatKepengawasan: false,
      keahlianBraille: false,
      keahlianBahasaIsyarat: false,
      nuks: '',
      joinDate: '',
      baseSalary: '',
      subjects: '',
      maxHoursPerWeek: '24',
    },
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['teacher', id, school?.id],
    queryFn: () => teacherService.getById(id!, school?.id),
    enabled: isEdit && Boolean(id),
  });

  useEffect(() => {
    if (response?.data) {
      const t = response.data;
      form.reset({
        fullName: t.fullName || '',
        gender: t.gender || '',
        nip: t.nip || '',
        nuptk: t.nuptk || '',
        nik: t.nik || '',
        noKk: t.noKk || '',
        birthDate: formatDateForInput(t.birthDate),
        birthPlace: t.birthPlace || '',
        religion: t.religion || '',
        telepon: t.telepon || '',
        phone: t.phone || '',
        email: t.email || '',
        address: t.address || '',
        dusun: t.dusun || '',
        rt: t.rt || '',
        rw: t.rw || '',
        kelurahan: t.kelurahan || '',
        kecamatan: t.kecamatan || '',
        city: t.city || '',
        province: t.province || '',
        postalCode: t.postalCode || '',
        lintang: t.lintang || '',
        bujur: t.bujur || '',
        education: t.education || '',
        major: t.major || '',
        university: t.university || '',
        status: t.status || '',
        position: t.position || '',
        tugasTambahan: t.tugasTambahan || '',
        skCpns: t.skCpns || '',
        tanggalCpns: formatDateForInput(t.tanggalCpns),
        skPengangkatan: t.skPengangkatan || '',
        tmtPengangkatan: formatDateForInput(t.tmtPengangkatan),
        lembagaPengangkatan: t.lembagaPengangkatan || '',
        pangkatGolongan: t.pangkatGolongan || '',
        sumberGaji: t.sumberGaji || '',
        tmtPns: formatDateForInput(t.tmtPns),
        karpeg: t.karpeg || '',
        namaIbuKandung: t.namaIbuKandung || '',
        statusPerkawinan: t.statusPerkawinan || '',
        namaSuamiIstri: t.namaSuamiIstri || '',
        nipSuamiIstri: t.nipSuamiIstri || '',
        pekerjaanSuamiIstri: t.pekerjaanSuamiIstri || '',
        karisKarsu: t.karisKarsu || '',
        kewarganegaraan: t.kewarganegaraan || 'Indonesia',
        npwp: t.npwp || '',
        namaWajibPajak: t.namaWajibPajak || '',
        bank: t.bank || '',
        nomorRekeningBank: t.nomorRekeningBank || '',
        rekeningAtasNama: t.rekeningAtasNama || '',
        isCertified: Boolean(t.isCertified),
        certificationNumber: t.certificationNumber || '',
        sudahLisensiKepalaSekolah: Boolean(t.sudahLisensiKepalaSekolah),
        pernahDiklatKepengawasan: Boolean(t.pernahDiklatKepengawasan),
        keahlianBraille: Boolean(t.keahlianBraille),
        keahlianBahasaIsyarat: Boolean(t.keahlianBahasaIsyarat),
        nuks: t.nuks || '',
        joinDate: formatDateForInput(t.joinDate),
        baseSalary: t.baseSalary !== null && t.baseSalary !== undefined ? String(t.baseSalary) : '',
        subjects: t.subjects || '',
        maxHoursPerWeek: String(t.maxHoursPerWeek || 24),
      });
    }
  }, [response, form]);

  const mutation = useMutation({
    mutationFn: (values: TeacherFormValues) => {
      if (!school?.id) {
        throw new Error('School ID tidak ditemukan. Harap pastikan institusi sudah dipilih.');
      }

      const parsedSalary =
        values.baseSalary && !Number.isNaN(Number(values.baseSalary))
          ? Number(values.baseSalary)
          : null;
      const parsedHours =
        values.maxHoursPerWeek && Number(values.maxHoursPerWeek) > 0
          ? Math.trunc(Number(values.maxHoursPerWeek))
          : 24;

      const payload: CreateTeacherPayload = {
        ...values,
        schoolId: school.id,
        gender: values.gender as 'L' | 'P',
        isActive: true,
        isCertified: values.isCertified ?? false,
        baseSalary: parsedSalary,
        maxHoursPerWeek: parsedHours,
      };

      return isEdit ? teacherService.update(id!, payload) : teacherService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['teacher', id] });
      }
      toast.success(isEdit ? dict.toastUpdateSuccess : dict.toastCreateSuccess);
      navigate('/teachers');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : dict.toastError);
    },
  });

  if (isEdit && isLoading) {
    return (
      <div className="flex h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const Field = ({
    name,
    label,
    type = 'text',
    placeholder = '',
    options = [],
    className = '',
  }: FieldProps) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel className={className}>{label}</FormLabel>
          {type === 'select' ? (
            <Select onValueChange={field.onChange} value={(field.value as string) || ''}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={placeholder || 'Pilih...'} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : type === 'boolean' ? (
            <Select
              onValueChange={(val) => field.onChange(val === 'true')}
              value={field.value ? 'true' : 'false'}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="true">Ya</SelectItem>
                <SelectItem value="false">Tidak</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <FormControl>
              <Input
                type={type}
                placeholder={placeholder}
                {...field}
                value={typeof field.value === 'boolean' ? '' : (field.value ?? '')}
              />
            </FormControl>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="space-y-6">
      {/* ================= HEADER KEMBALI ================= */}
      <div className="flex items-start sm:items-center gap-4">
        <Button variant="outline" size="icon" className="shrink-0 mt-1 sm:mt-0" asChild>
          <Link to="/teachers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? dict.editTitle : dict.addTitle}
          </h1>
          <p className="text-muted-foreground">{isEdit ? dict.editDesc : dict.addDesc}</p>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((v: TeacherFormValues) => mutation.mutate(v))}
          className="space-y-6"
        >
          <Card className="shadow-sm border-border overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <Tabs defaultValue="personal" className="w-full min-w-0">
                <div className="w-full overflow-x-auto pb-1 mb-6">
                  <TabsList className="h-auto gap-1 bg-muted/50 p-1 flex w-max min-w-full sm:min-w-0">
                    <TabsTrigger
                      value="personal"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <GraduationCap className="w-4 h-4 mr-2 shrink-0" />
                      {dict.tabPersonal}
                    </TabsTrigger>

                    <TabsTrigger
                      value="professional"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <Building className="w-4 h-4 mr-2 shrink-0" />
                      {dict.tabProf}
                    </TabsTrigger>

                    <TabsTrigger
                      value="tasks"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <Award className="w-4 h-4 mr-2 shrink-0" />
                      {dict.tabTask}
                    </TabsTrigger>

                    <TabsTrigger
                      value="family"
                      className="flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white"
                    >
                      <Briefcase className="w-4 h-4 mr-2 shrink-0" />
                      {dict.tabFamily}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* TAB 1: Data Pribadi & Alamat Dapodik */}
                <TabsContent value="personal" className="m-0">
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <Field name="fullName" label="Nama Lengkap *" placeholder="Sesuai Ijazah" />
                    <Field
                      name="gender"
                      label="Jenis Kelamin *"
                      type="select"
                      options={[
                        { label: 'Laki-laki', value: 'L' },
                        { label: 'Perempuan', value: 'P' },
                      ]}
                    />
                    <Field name="nik" label="NIK (Nomor Induk Kependudukan)" placeholder="16 Digit NIK" />
                    <Field name="noKk" label="Nomor Kartu Keluarga (KK)" placeholder="16 Digit KK" />
                    <Field name="birthPlace" label="Tempat Lahir" />
                    <Field name="birthDate" label="Tanggal Lahir" type="date" />
                    <Field
                      name="religion"
                      label="Agama / Kepercayaan"
                      type="select"
                      options={[
                        { label: 'Islam', value: 'ISLAM' },
                        { label: 'Kristen', value: 'KRISTEN' },
                        { label: 'Katolik', value: 'KATOLIK' },
                        { label: 'Hindu', value: 'HINDU' },
                        { label: 'Buddha', value: 'BUDDHA' },
                        { label: 'Konghucu', value: 'KONGHUCU' },
                        { label: 'Kepercayaan kpd Tuhan YME', value: 'KEPERCAYAAN' },
                      ]}
                    />
                    <Field name="kewarganegaraan" label="Kewarganegaraan" />
                    <Field name="namaIbuKandung" label="Nama Ibu Kandung" />
                    <Field name="phone" label="Nomor HP / WhatsApp" />
                    <Field name="telepon" label="Nomor Telepon Rumah" />
                    <Field name="email" label="Email Aktif" type="email" />

                    <div className="sm:col-span-2 border-t border-border mt-2 pt-4 font-semibold text-foreground">
                      Alamat Domisili (Dapodik)
                    </div>
                    <div className="sm:col-span-2">
                      <Field name="address" label="Alamat Jalan" />
                    </div>
                    <Field name="dusun" label="Nama Dusun" />
                    <div className="grid grid-cols-3 gap-3">
                      <Field name="rt" label="RT" placeholder="001" />
                      <Field name="rw" label="RW" placeholder="002" />
                      <Field name="postalCode" label="Kode Pos" placeholder="55111" />
                    </div>
                    <Field name="kelurahan" label="Desa / Kelurahan" />
                    <Field name="kecamatan" label="Kecamatan" />
                    <Field name="city" label="Kabupaten / Kota" />
                    <Field name="province" label="Provinsi" />
                    <Field name="lintang" label="Lintang (Latitude)" placeholder="-7.795580" />
                    <Field name="bujur" label="Bujur (Longitude)" placeholder="110.369490" />
                  </div>
                </TabsContent>

                {/* TAB 2: Kepegawaian */}
                <TabsContent value="professional" className="m-0">
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <Field
                      name="status"
                      label="Status Kepegawaian"
                      type="select"
                      options={[
                        { label: 'PNS', value: 'PNS' },
                        { label: 'CPNS', value: 'CPNS' },
                        { label: 'PPPK', value: 'PPPK' },
                        { label: 'HONORER', value: 'HONORER' },
                        { label: 'GTY', value: 'GTY' },
                        { label: 'GTT', value: 'GTT' },
                      ]}
                    />
                    <Field name="position" label="Jenis PTK / Jabatan" placeholder="Contoh: Guru" />
                    <Field name="nip" label="NIP (PNS/CPNS/PPPK)" />
                    <Field name="nuptk" label="NUPTK" />
                    <Field name="pangkatGolongan" label="Pangkat / Golongan" />
                    <Field name="sumberGaji" label="Sumber Gaji" />

                    <div className="sm:col-span-2 border-t border-border mt-2 pt-4 font-semibold text-foreground">
                      Data SK & Pengangkatan
                    </div>
                    <Field name="skCpns" label="SK CPNS" />
                    <Field name="tanggalCpns" label="Tanggal CPNS" type="date" />
                    <Field name="skPengangkatan" label="SK Pengangkatan" />
                    <Field name="tmtPengangkatan" label="TMT Pengangkatan" type="date" />
                    <Field name="lembagaPengangkatan" label="Lembaga Pengangkatan" />
                    <Field name="tmtPns" label="TMT PNS" type="date" />
                    <Field name="karpeg" label="Karpeg" />
                    <Field name="joinDate" label="Tanggal Bergabung di Sekolah" type="date" />
                  </div>
                </TabsContent>

                {/* TAB 3: Tugas & Lisensi */}
                <TabsContent value="tasks" className="m-0">
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <div className="sm:col-span-2 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20 shadow-none">
                      <Field
                        name="tugasTambahan"
                        label="Tugas Tambahan (Opsional)"
                        placeholder="Contoh: Kepala Sekolah, Bendahara BOS, Wakasek Kurikulum..."
                        className="text-amber-700 dark:text-amber-400 font-semibold"
                      />
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-2 font-medium">
                        *Tugas tambahan ini akan muncul sebagai label khusus (highlight) di profil guru.
                      </p>
                    </div>

                    <div className="sm:col-span-2 border-t border-border mt-2 pt-4 font-semibold text-foreground">
                      Pendidikan & Akademik
                    </div>
                    <Field
                      name="education"
                      label="Pendidikan Terakhir"
                      type="select"
                      options={[
                        { label: 'S3', value: 'S3' },
                        { label: 'S2', value: 'S2' },
                        { label: 'S1', value: 'S1' },
                        { label: 'D4', value: 'D4' },
                        { label: 'D3', value: 'D3' },
                        { label: 'SMA/SMK', value: 'SMA' },
                      ]}
                    />
                    <Field name="major" label="Jurusan" />
                    <Field name="university" label="Universitas / Perguruan Tinggi" />
                    <Field name="maxHoursPerWeek" label="Maks. Jam per Minggu" type="number" />
                    <div className="sm:col-span-2">
                      <Field
                        name="subjects"
                        label="Mata Pelajaran (Pisahkan dengan Koma)"
                        placeholder="Matematika, IPA"
                      />
                    </div>

                    <div className="sm:col-span-2 border-t border-border mt-2 pt-4 font-semibold text-foreground">
                      Sertifikasi & Lisensi
                    </div>
                    <Field name="isCertified" label="Sudah Sertifikasi Guru?" type="boolean" />
                    <Field name="certificationNumber" label="Nomor Sertifikasi" />
                    <Field
                      name="sudahLisensiKepalaSekolah"
                      label="Lisensi Kepala Sekolah?"
                      type="boolean"
                    />
                    <Field
                      name="pernahDiklatKepengawasan"
                      label="Pernah Diklat Kepengawasan?"
                      type="boolean"
                    />
                    <Field name="keahlianBraille" label="Keahlian Braille?" type="boolean" />
                    <Field
                      name="keahlianBahasaIsyarat"
                      label="Keahlian Bahasa Isyarat?"
                      type="boolean"
                    />
                    <Field name="nuks" label="NUKS (Nomor Unik Kepala Sekolah)" />
                  </div>
                </TabsContent>

                {/* TAB 4: Keluarga & Bank */}
                <TabsContent value="family" className="m-0">
                  <div className="grid gap-4 sm:grid-cols-2 pt-2">
                    <div className="sm:col-span-2 font-semibold text-foreground">Keluarga</div>
                    <Field
                      name="statusPerkawinan"
                      label="Status Perkawinan"
                      type="select"
                      options={[
                        { label: 'Kawin', value: 'Kawin' },
                        { label: 'Belum Kawin', value: 'Belum Kawin' },
                        { label: 'Janda/Duda', value: 'Janda/Duda' },
                      ]}
                    />
                    <Field name="namaSuamiIstri" label="Nama Suami / Istri" />
                    <Field name="nipSuamiIstri" label="NIP Suami / Istri" />
                    <Field name="pekerjaanSuamiIstri" label="Pekerjaan Suami / Istri" />
                    <Field name="karisKarsu" label="Karis / Karsu" />

                    <div className="sm:col-span-2 border-t border-border mt-2 pt-4 font-semibold text-foreground">
                      Pajak & Rekening Bank
                    </div>
                    <Field name="npwp" label="NPWP" />
                    <Field name="namaWajibPajak" label="Nama Wajib Pajak" />
                    <Field name="baseSalary" label="Gaji Pokok (Nominal)" type="number" />
                    <Field name="bank" label="Nama Bank" placeholder="Contoh: BRI, Mandiri, BNI" />
                    <Field name="nomorRekeningBank" label="Nomor Rekening" />
                    <Field name="rekeningAtasNama" label="Rekening Atas Nama" />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            {/* ================= ACTION BUTTONS ================= */}
            <div className="flex items-center justify-end gap-3 border-t border-border bg-card p-4 sm:p-6 rounded-b-xl">
              <Button
                variant="outline"
                type="button"
                onClick={() => navigate('/teachers')}
                disabled={mutation.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                {dict.btnCancel}
              </Button>

              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {dict.btnSave}
              </Button>
            </div>
          </Card>
        </form>
      </Form>
    </div>
  );
}

export default TeacherFormPage;