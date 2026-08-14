import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Edit, Loader2, Mail, Phone } from 'lucide-react';

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
  const { t } = useTranslation();

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => teacherService.getById(id!),
    enabled: !!id,
  });

  // FIX 1: Mengekstrak 'data' dari response API
  const teacher = response?.data;

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !teacher) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Failed to load teacher data.</p>
        <Button variant="outline" asChild>
          <Link to="/teachers">Back to Teachers</Link>
        </Button>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const statusColorMap: Record<string, string> = {
    PNS: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    CPNS: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    HONORER: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    GTY: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    GTT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link to="/teachers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teacher Profile</h1>
            <p className="text-muted-foreground">View detailed information about the teacher</p>
          </div>
        </div>
        <Button asChild>
          <Link to={`/teachers/${id}/edit`}>
            <Edit className="mr-2 h-4 w-4" /> Edit Data
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_3fr]">
        <Card className="h-fit">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-3xl font-semibold text-primary mb-4">
              {getInitials(teacher.fullName)}
            </div>
            <h2 className="text-xl font-bold">{teacher.fullName}</h2>
            <p className="text-sm text-muted-foreground mb-4">{teacher.position || 'Teacher'}</p>

            <Badge className={cn("mb-6", teacher.status ? statusColorMap[teacher.status] : "")} variant="secondary">
              {teacher.status || 'No Status'}
            </Badge>

            <div className="w-full space-y-3 text-sm">
              {teacher.phone && (
                <div className="flex items-center gap-2 text-muted-foreground justify-center">
                  <Phone className="h-4 w-4" />
                  <span>{teacher.phone}</span>
                </div>
              )}
              {teacher.email && (
                <div className="flex items-center gap-2 text-muted-foreground justify-center">
                  <Mail className="h-4 w-4" />
                  <span>{teacher.email}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="personal">Data Pribadi</TabsTrigger>
            <TabsTrigger value="professional">Data Kepegawaian</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Full Name</div>
                  <div>{teacher.fullName}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">NIK</div>
                  <div>{teacher.nik || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Gender</div>
                  <div>{teacher.gender === 'L' ? 'Laki-laki (L)' : teacher.gender === 'P' ? 'Perempuan (P)' : '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Birth Place & Date</div>
                  <div>
                    {teacher.birthPlace || '-'}, {teacher.birthDate ? formatDate(teacher.birthDate) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Phone</div>
                  <div>{teacher.phone || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Email</div>
                  <div>{teacher.email || '-'}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-sm font-medium text-muted-foreground">Address</div>
                  <div>{teacher.address || '-'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Education Background</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Latest Education</div>
                  <div>{teacher.education || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">University</div>
                  <div>{teacher.university || '-'}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-sm font-medium text-muted-foreground">Major</div>
                  <div>{teacher.major || '-'}</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="professional" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Employment Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">NIP</div>
                  <div>{teacher.nip || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">NUPTK</div>
                  <div>{teacher.nuptk || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <div>{teacher.status || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Position</div>
                  <div>{teacher.position || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Join Date</div>
                  <div>{teacher.joinDate ? formatDate(teacher.joinDate) : '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Base Salary</div>
                  <div>{teacher.baseSalary ? formatCurrency(teacher.baseSalary) : '-'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Academic & Certification</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Certification Status</div>
                  <div>
                    {teacher.isCertified ? (
                      <Badge variant="default" className="bg-green-500 hover:bg-green-600">Certified</Badge>
                    ) : (
                      <Badge variant="secondary">Not Certified</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Certification Number</div>
                  <div>{teacher.certificationNumber || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Max Hours Per Week</div>
                  <div>{teacher.maxHoursPerWeek || 24} hours</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-sm font-medium text-muted-foreground">Subjects</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {/* FIX 2: Menambahkan tipe 'string' dan 'number' pada parameter .map() */}
                    {teacher.subjects && Array.isArray(teacher.subjects) && teacher.subjects.length > 0 ? (
                      teacher.subjects.map((sub: string, i: number) => (
                        <Badge key={i} variant="outline">{sub}</Badge>
                      ))
                    ) : (
                      typeof teacher.subjects === 'string' && teacher.subjects ? (
                        teacher.subjects.split(',').map((sub: string, i: number) => (
                          <Badge key={i} variant="outline">{sub.trim()}</Badge>
                        ))
                      ) : '-'
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}