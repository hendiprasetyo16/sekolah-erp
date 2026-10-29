import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Loader2, Mail, Phone, Briefcase, Award, GraduationCap, Building } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { teacherService } from '../services/teacher.service';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate, formatCurrency } from '@/utils/format';
import { cn } from '@/utils/cn';

export default function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useTranslation();

  const dict = {
    title: locale === 'id' ? 'Profil Guru' : 'Teacher Profile',
    desc: locale === 'id' ? 'Lihat informasi detail tentang guru.' : 'View detailed information about the teacher.',
    back: locale === 'id' ? 'Kembali ke Data Guru' : 'Back to Teachers',
    editBtn: locale === 'id' ? 'Edit Data' : 'Edit Data',
    tabPersonal: locale === 'id' ? 'Data Pribadi' : 'Personal Info',
    tabProf: locale === 'id' ? 'Kepegawaian' : 'Employment',
    tabTask: locale === 'id' ? 'Tugas & Lisensi' : 'Duties & Licenses',
    tabFamily: locale === 'id' ? 'Keluarga & Finansial' : 'Family & Financial',
    noData: locale === 'id' ? '-' : '-',
    yes: locale === 'id' ? 'Ya' : 'Yes',
    no: locale === 'id' ? 'Tidak' : 'No',
  };

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => teacherService.getById(id!),
    enabled: !!id,
  });

  const teacher = response?.data;

  if (isLoading) {
    return (
      <div className="flex h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (isError || !teacher) {
    return (
      <div className="flex h-100 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">Gagal memuat data guru / Failed to load teacher data.</p>
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link to="/teachers">{dict.back}</Link>
        </Button>
      </div>
    );
  }

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  const statusColorMap: Record<string, string> = {
    PNS: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    CPNS: 'bg-blue-100 text-blue-800 border-blue-200',
    HONORER: 'bg-orange-100 text-orange-800 border-orange-200',
    GTY: 'bg-purple-100 text-purple-800 border-purple-200',
    GTT: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const InfoItem = ({ label, value }: { label: string, value: any }) => (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium text-foreground">{value || dict.noData}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <Button variant="outline" size="icon" className="shrink-0 mt-1 sm:mt-0" asChild>
            <Link to="/teachers"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{dict.title}</h1>
            <p className="text-sm text-muted-foreground">{dict.desc}</p>
          </div>
        </div>

        <Button asChild className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
          <Link to={`/teachers/${id}/edit`} className="flex justify-center items-center">
            <Edit className="mr-2 h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{dict.editBtn}</span>
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_3fr]">
        {/* ================= LEFT SIDEBAR (Profil Singkat) ================= */}
        <Card className="h-fit shadow-sm border-border">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-3xl font-bold text-white shadow-lg mb-4">
              {getInitials(teacher.fullName)}
            </div>
            <h2 className="text-xl font-bold text-foreground leading-tight">{teacher.fullName}</h2>
            <p className="text-sm text-muted-foreground mt-1">{teacher.position || 'Guru'}</p>

            <div className="flex flex-wrap justify-center gap-2 mt-3 mb-5">
              <Badge className={cn(teacher.status ? statusColorMap[teacher.status] : "bg-muted")} variant="outline">
                {teacher.status || 'Belum Diatur'}
              </Badge>
              {teacher.tugasTambahan && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                  <Briefcase className="w-3 h-3 mr-1 shrink-0" />
                  <span className="truncate max-w-30">{teacher.tugasTambahan}</span>
                </Badge>
              )}
            </div>

            <div className="w-full space-y-3 text-sm border-t border-border/50 pt-5">
              {teacher.phone && (
                <div className="flex items-center gap-3 text-muted-foreground justify-center">
                  <Phone className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="truncate">{teacher.phone}</span>
                </div>
              )}
              {teacher.email && (
                <div className="flex items-center gap-3 text-muted-foreground justify-center">
                  <Mail className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="truncate">{teacher.email}</span>
                </div>
              )}
              {teacher.isCertified && (
                <div className="flex items-center gap-3 text-emerald-600 justify-center font-medium mt-2 bg-emerald-50 py-1.5 rounded-md border border-emerald-100">
                  <Award className="h-4 w-4 shrink-0" />
                  <span>Guru Tersertifikasi</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ================= RIGHT CONTENT (Tabs Detail) ================= */}
        <Tabs defaultValue="personal" className="w-full min-w-0">

          {/* Menu Tabs: Styling untuk membedakan state Aktif dan Tidak Aktif dengan sangat jelas */}
          <div className="w-full overflow-x-auto pb-1 mb-4">
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

          {/* TAB 1: Data Pribadi */}
          <TabsContent value="personal" className="m-0 space-y-4">
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4"><CardTitle className="text-lg">Informasi Dasar (Dapodik)</CardTitle></CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label={locale === 'id' ? 'Nama Lengkap' : 'Full Name'} value={teacher.fullName} />
                <InfoItem label={locale === 'id' ? 'Jenis Kelamin' : 'Gender'} value={teacher.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
                <InfoItem label="NIK" value={teacher.nik} />
                <InfoItem label="No. KK" value={teacher.noKk} />
                <InfoItem label={locale === 'id' ? 'Tempat, Tanggal Lahir' : 'Birth Info'} value={`${teacher.birthPlace || dict.noData}, ${teacher.birthDate ? formatDate(teacher.birthDate) : dict.noData}`} />
                <InfoItem label={locale === 'id' ? 'Agama / Kepercayaan' : 'Religion'} value={dict.noData} />
                <InfoItem label={locale === 'id' ? 'Kewarganegaraan' : 'Nationality'} value={teacher.kewarganegaraan} />
                <InfoItem label={locale === 'id' ? 'Nama Ibu Kandung' : 'Mother Name'} value={teacher.namaIbuKandung} />
                <div className="sm:col-span-2"><InfoItem label={locale === 'id' ? 'Alamat Lengkap' : 'Address'} value={teacher.address} /></div>
                <InfoItem label="Lintang (Latitude)" value={teacher.lintang} />
                <InfoItem label="Bujur (Longitude)" value={teacher.bujur} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Kepegawaian */}
          <TabsContent value="professional" className="m-0 space-y-4">
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4"><CardTitle className="text-lg">Status & SK Pengangkatan</CardTitle></CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Status Kepegawaian" value={teacher.status} />
                <InfoItem label="Jabatan" value={teacher.position} />
                <InfoItem label="NIP" value={teacher.nip} />
                <InfoItem label="NUPTK" value={teacher.nuptk} />
                <InfoItem label="SK CPNS" value={teacher.skCpns} />
                <InfoItem label="Tanggal CPNS" value={teacher.tanggalCpns ? formatDate(teacher.tanggalCpns) : dict.noData} />
                <InfoItem label="SK Pengangkatan" value={teacher.skPengangkatan} />
                <InfoItem label="TMT Pengangkatan" value={teacher.tmtPengangkatan ? formatDate(teacher.tmtPengangkatan) : dict.noData} />
                <InfoItem label="Lembaga Pengangkatan" value={teacher.lembagaPengangkatan} />
                <InfoItem label="Pangkat / Golongan" value={teacher.pangkatGolongan} />
                <InfoItem label="Sumber Gaji" value={teacher.sumberGaji} />
                <InfoItem label="TMT PNS" value={teacher.tmtPns ? formatDate(teacher.tmtPns) : dict.noData} />
                <InfoItem label="Karpeg" value={teacher.karpeg} />
                <InfoItem label="Tanggal Bergabung" value={teacher.joinDate ? formatDate(teacher.joinDate) : dict.noData} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Tugas & Lisensi */}
          <TabsContent value="tasks" className="m-0 space-y-4">
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4"><CardTitle className="text-lg">Akademik, Tugas Tambahan & Kompetensi</CardTitle></CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <div className="sm:col-span-2 bg-amber-50 dark:bg-amber-500/10 p-4 rounded-lg mb-4 border border-amber-200 dark:border-amber-500/20">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Tugas Tambahan Saat Ini</div>
                  <div className="text-sm font-medium text-amber-950 dark:text-amber-100">
                    {teacher.tugasTambahan || 'Tidak ada tugas tambahan'}
                  </div>
                </div>

                <InfoItem label="Pendidikan Terakhir" value={`${teacher.education || dict.noData} - ${teacher.major || dict.noData}`} />
                <InfoItem label="Universitas / Institusi" value={teacher.university} />
                <InfoItem label="Sertifikasi Guru" value={teacher.isCertified ? `Ya (No: ${teacher.certificationNumber || '-'})` : dict.no} />
                <InfoItem label="Maksimal Jam Mengajar" value={`${teacher.maxHoursPerWeek || 24} Jam / Minggu`} />
                <InfoItem label="NUKS" value={teacher.nuks} />

                <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4 mt-4 bg-muted/30 p-4 rounded-lg border border-border/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Lisensi Kepala Sekolah</span>
                    <Badge variant={teacher.sudahLisensiKepalaSekolah ? "default" : "secondary"}>{teacher.sudahLisensiKepalaSekolah ? dict.yes : dict.no}</Badge>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Diklat Kepengawasan</span>
                    <Badge variant={teacher.pernahDiklatKepengawasan ? "default" : "secondary"}>{teacher.pernahDiklatKepengawasan ? dict.yes : dict.no}</Badge>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Keahlian Braille</span>
                    <Badge variant={teacher.keahlianBraille ? "default" : "secondary"}>{teacher.keahlianBraille ? dict.yes : dict.no}</Badge>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Keahlian Bahasa Isyarat</span>
                    <Badge variant={teacher.keahlianBahasaIsyarat ? "default" : "secondary"}>{teacher.keahlianBahasaIsyarat ? dict.yes : dict.no}</Badge>
                  </div>
                </div>

                <div className="sm:col-span-2 mt-5 border-t border-border/50 pt-5">
                  <div className="text-sm font-medium text-muted-foreground mb-3">Mata Pelajaran yang Diampu</div>
                  <div className="flex flex-wrap gap-2">
                    {teacher.subjects ? (
                      String(teacher.subjects).split(',').map((sub, i) => (
                        <Badge key={i} variant="outline" className="bg-background shadow-sm">{sub.trim()}</Badge>
                      ))
                    ) : (<span className="text-sm text-muted-foreground">{dict.noData}</span>)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Keluarga & Finansial */}
          <TabsContent value="family" className="m-0 space-y-4">
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4"><CardTitle className="text-lg">Keluarga & Pajak</CardTitle></CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Status Perkawinan" value={teacher.statusPerkawinan} />
                <InfoItem label="Nama Suami/Istri" value={teacher.namaSuamiIstri} />
                <InfoItem label="NIP Suami/Istri" value={teacher.nipSuamiIstri} />
                <InfoItem label="Pekerjaan Suami/Istri" value={teacher.pekerjaanSuamiIstri} />
                <InfoItem label="Karis / Karsu" value={teacher.karisKarsu} />
                <div className="col-span-1 hidden sm:block"></div>

                <InfoItem label="NPWP" value={teacher.npwp} />
                <InfoItem label="Nama Wajib Pajak" value={teacher.namaWajibPajak} />
                <InfoItem label="Gaji Pokok" value={teacher.baseSalary ? formatCurrency(teacher.baseSalary) : dict.noData} />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border">
              <CardHeader className="pb-4"><CardTitle className="text-lg">Informasi Rekening Bank</CardTitle></CardHeader>
              <CardContent className="grid gap-x-6 sm:grid-cols-2">
                <InfoItem label="Nama Bank" value={teacher.bank} />
                <InfoItem label="Nomor Rekening" value={teacher.nomorRekeningBank} />
                <InfoItem label="Rekening Atas Nama" value={teacher.rekeningAtasNama} />
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}