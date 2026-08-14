import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Edit, User, MapPin, Phone,
  GraduationCap, Building2, UserCircle2
} from 'lucide-react';
import { studentService } from '../services/student.service';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDate } from '@/utils/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { StudentParent } from '../types/student.types';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();

  const { data: studentResponse, isLoading, isError } = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.getById(id!),
  });

  const student = studentResponse?.data;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        {locale === 'id' ? 'Memuat data...' : 'Loading data...'}
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-red-500 font-medium">
        {locale === 'id' ? 'Gagal memuat data siswa' : 'Failed to load student data'}
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AKTIF': return 'success';
      case 'MUTASI_KELUAR': return 'warning';
      case 'LULUS': return 'default';
      case 'DO': return 'destructive';
      case 'CUTI': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    if (locale === 'id') return status;
    switch (status) {
      case 'AKTIF': return 'ACTIVE';
      case 'MUTASI_KELUAR': return 'TRANSFERRED';
      case 'LULUS': return 'GRADUATED';
      case 'DO': return 'DROPPED OUT';
      case 'CUTI': return 'ON LEAVE';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/students')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {locale === 'id' ? 'Detail Siswa' : 'Student Detail'}
          </h1>
        </div>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Link to={`/students/${id}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            {locale === 'id' ? 'Edit Data' : 'Edit Data'}
          </Link>
        </Button>
      </div>

      {/* Profile Overview Card */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
            <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-200">
              <UserCircle2 className="h-12 w-12" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold">{student.fullName}</h2>
                <Badge variant={getStatusColor(student.status)}>
                  {getStatusLabel(student.status)}
                </Badge>
              </div>

              {/* PENAMBAHAN LABEL NO INDUK YANG JELAS */}
              <div className="mt-2 text-sm font-medium text-foreground bg-muted/50 inline-block px-3 py-1 rounded-md border border-border/50">
                NIS: <span className="text-emerald-700 font-bold ml-1 mr-3">{student.nis || '-'}</span>
                NISN: <span className="text-emerald-700 font-bold ml-1">{student.nisn}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 ml-1">NIK: {student.nik}</p>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <Building2 className="mr-2 h-4 w-4" />
                  {locale === 'id' ? 'Kelas: ' : 'Class: '} {student.className}
                </div>
                <div className="flex items-center">
                  <MapPin className="mr-2 h-4 w-4" />
                  {student.city}, {student.province}
                </div>
                <div className="flex items-center">
                  <Phone className="mr-2 h-4 w-4" />
                  {student.phone || '-'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Tabs */}
      <Tabs defaultValue="pribadi" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="pribadi">{locale === 'id' ? 'Identitas & Akademik' : 'Identity & Academic'}</TabsTrigger>
          <TabsTrigger value="orangtua">{locale === 'id' ? 'Orang Tua/Wali' : 'Parents'}</TabsTrigger>
          <TabsTrigger value="ekonomi">{locale === 'id' ? 'Ekonomi (PIP/KIP)' : 'Economic Data'}</TabsTrigger>
          <TabsTrigger value="dokumen">{locale === 'id' ? 'Dokumen' : 'Documents'}</TabsTrigger>
        </TabsList>

        <TabsContent value="pribadi" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kartu Data Pribadi */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <User className="mr-2 h-5 w-5 text-emerald-500" />
                  {locale === 'id' ? 'Data Pribadi' : 'Personal Data'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'No. Induk (NIS)' : 'Student ID (NIS)'}</span>
                  <span className="font-bold text-foreground col-span-2">{student.nis || '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">NISN</span>
                  <span className="font-medium col-span-2">{student.nisn}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Nama Lengkap' : 'Full Name'}</span>
                  <span className="font-medium col-span-2">{student.fullName}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'No. KK' : 'Family Card No.'}</span>
                  <span className="font-medium col-span-2">{student.noKk || '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Tempat, Tgl Lahir' : 'Place, Date of Birth'}</span>
                  <span className="font-medium col-span-2">{student.birthPlace}, {formatDate(student.birthDate)}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Jenis Kelamin' : 'Gender'}</span>
                  <span className="font-medium col-span-2">
                    {student.gender === 'L' ? (locale === 'id' ? 'Laki-laki' : 'Male') : (locale === 'id' ? 'Perempuan' : 'Female')}
                  </span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Agama' : 'Religion'}</span>
                  <span className="font-medium col-span-2 capitalize">{student.religion.toLowerCase()}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Alamat Lengkap' : 'Full Address'}</span>
                  <span className="font-medium col-span-2 leading-relaxed">
                    {student.address}, RT {student.rt || '-'}/RW {student.rw || '-'}<br />
                    {locale === 'id' ? 'Kel.' : 'Village'} {student.kelurahan || '-'}, {locale === 'id' ? 'Kec.' : 'District'} {student.kecamatan || '-'}<br />
                    {student.city}, {student.province} {student.postalCode || ''}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Kartu Data Akademik */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <GraduationCap className="mr-2 h-5 w-5 text-emerald-500" />
                  {locale === 'id' ? 'Data Akademik' : 'Academic Data'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">Status</span>
                  <span className="font-medium col-span-2">
                    <Badge variant={getStatusColor(student.status)}>{getStatusLabel(student.status)}</Badge>
                  </span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Kelas Saat Ini' : 'Current Class'}</span>
                  <span className="font-medium col-span-2">{student.className} ({locale === 'id' ? 'Tingkat' : 'Grade'} {student.gradeLevel})</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Tanggal Masuk' : 'Entry Date'}</span>
                  <span className="font-medium col-span-2">{formatDate(student.entryDate)}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Asal Sekolah' : 'Previous School'}</span>
                  <span className="font-medium col-span-2">{student.previousSchool || '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Jarak ke Sekolah' : 'Distance to School'}</span>
                  <span className="font-medium col-span-2">{student.distanceToSchool ? `${student.distanceToSchool} km` : '-'}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                  <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Transportasi' : 'Transportation'}</span>
                  <span className="font-medium col-span-2">{student.transport || '-'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orangtua" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {student.parents?.map((parent: StudentParent) => (
              <Card key={parent.id} className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center capitalize">
                    {parent.relation === 'AYAH'
                      ? <User className="mr-2 h-5 w-5 text-blue-500" />
                      : <User className="mr-2 h-5 w-5 text-pink-500" />}
                    {parent.relation === 'AYAH'
                      ? (locale === 'id' ? 'Data Ayah' : 'Father Data')
                      : (locale === 'id' ? 'Data Ibu' : 'Mother Data')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Nama Lengkap' : 'Full Name'}</span>
                    <span className="font-medium col-span-2">{parent.fullName}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">NIK</span>
                    <span className="font-medium col-span-2">{parent.nik || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Pendidikan' : 'Education'}</span>
                    <span className="font-medium col-span-2">{parent.education || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'Pekerjaan' : 'Occupation'}</span>
                    <span className="font-medium col-span-2">{parent.occupation || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">{locale === 'id' ? 'No. Handphone' : 'Phone Number'}</span>
                    <span className="font-medium col-span-2">{parent.phone || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 border-b border-border/50 pb-2">
                    <span className="text-muted-foreground col-span-1">Status</span>
                    <span className="font-medium col-span-2">
                      <Badge variant={parent.isAlive ? "outline" : "secondary"}>
                        {parent.isAlive
                          ? (locale === 'id' ? 'Masih Hidup' : 'Alive')
                          : (locale === 'id' ? 'Meninggal' : 'Deceased')}
                      </Badge>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!student.parents || student.parents.length === 0) && (
              <div className="col-span-2 p-8 text-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                {locale === 'id'
                  ? 'Data orang tua/wali belum dilengkapi.'
                  : 'Parent/guardian data has not been provided yet.'}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ekonomi" className="mt-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                {locale === 'id' ? 'Kesejahteraan & Bantuan (PIP/KIP)' : 'Welfare & Assistance (PIP/KIP)'}
              </CardTitle>
              <CardDescription>
                {locale === 'id'
                  ? 'Data ekonomi digunakan untuk menentukan kelayakan beasiswa/bantuan PIP.'
                  : 'Economic data is used to determine eligibility for scholarships or PIP assistance.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                {locale === 'id'
                  ? 'Detail ekonomi akan ditampilkan di sini pada pengembangan fase selanjutnya.'
                  : 'Economic details will be displayed here in the next development phase.'}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dokumen" className="mt-6">
          <Card className="shadow-sm">
            <CardContent className="p-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed mt-6">
              {locale === 'id'
                ? 'Modul unggah dokumen (Ijazah, KK, Akta Kelahiran) sedang dalam tahap pengembangan.'
                : 'The document upload module (Certificates, Family Card, Birth Certificate) is under development.'}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}