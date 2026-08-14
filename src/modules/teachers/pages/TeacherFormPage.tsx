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

const teacherSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  gender: z.string().min(1, 'Gender is required'),
  nip: z.string().optional(),
  nuptk: z.string().optional(),
  nik: z.string().optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  education: z.string().optional(),
  major: z.string().optional(),
  university: z.string().optional(),
  status: z.string().optional(),
  position: z.string().optional(),
  isCertified: z.boolean().default(false),
  certificationNumber: z.string().optional(),
  joinDate: z.string().optional(),
  baseSalary: z.coerce.number().optional(),
  subjects: z.string().optional(),
  maxHoursPerWeek: z.coerce.number().default(24),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

export default function TeacherFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isEdit = Boolean(id);

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

  const { data: teacher, isLoading } = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => teacherService.getById(id!),
    enabled: isEdit,
  });

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
        subjects: typeof teacher.subjects === 'string' ? teacher.subjects : (teacher.subjects?.join(', ') || ''),
        maxHoursPerWeek: teacher.maxHoursPerWeek || 24,
      });
    }
  }, [teacher, form]);

  const mutation = useMutation({
    mutationFn: (values: TeacherFormValues) => {
      const payload = {
        ...values,
        subjects: values.subjects ? values.subjects.split(',').map(s => s.trim()) : [],
      };
      return isEdit ? teacherService.update(id!, payload) : teacherService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Teacher updated successfully' : 'Teacher created successfully');
      navigate('/teachers');
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to save teacher');
    },
  });

  const onSubmit = (values: TeacherFormValues) => {
    mutation.mutate(values);
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
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
            {isEdit ? 'Edit Teacher' : 'Add New Teacher'}
          </h1>
          <p className="text-muted-foreground">
            {isEdit
              ? 'Update existing teacher information'
              : 'Enter information for a new teacher'}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="personal">Data Pribadi</TabsTrigger>
              <TabsTrigger value="professional">Kepegawaian & Akademik</TabsTrigger>
            </TabsList>
            
            <TabsContent value="personal" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Teacher's personal details and contact information.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name <span className="text-destructive">*</span></FormLabel>
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
                        <FormLabel>Gender <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="L">Laki-laki (L)</SelectItem>
                            <SelectItem value="P">Perempuan (P)</SelectItem>
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
                        <FormLabel>NIK</FormLabel>
                        <FormControl>
                          <Input placeholder="16 digits NIK" {...field} />
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
                        <FormLabel>Birth Place</FormLabel>
                        <FormControl>
                          <Input placeholder="City" {...field} />
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
                        <FormLabel>Birth Date</FormLabel>
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="08..." {...field} />
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
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="example@email.com" {...field} />
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
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Full address" {...field} />
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
                  <CardTitle>Professional Information</CardTitle>
                  <CardDescription>
                    Employment status, education, and academic details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="nip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NIP</FormLabel>
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
                        <FormLabel>NUPTK</FormLabel>
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
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
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
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Guru Kelas" {...field} />
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
                        <FormLabel>Education</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select education" />
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
                        <FormLabel>Major</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Pendidikan Matematika" {...field} />
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
                        <FormLabel>University</FormLabel>
                        <FormControl>
                          <Input placeholder="University name" {...field} />
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
                        <FormLabel>Certification Status</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === 'true')} 
                          defaultValue={field.value ? 'true' : 'false'}
                          value={field.value ? 'true' : 'false'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Is certified?" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="true">Certified</SelectItem>
                            <SelectItem value="false">Not Certified</SelectItem>
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
                        <FormLabel>Certification Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Cert number if applicable" {...field} />
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
                        <FormLabel>Join Date</FormLabel>
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
                        <FormLabel>Base Salary</FormLabel>
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
                        <FormLabel>Max Hours Per Week</FormLabel>
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
                        <FormLabel>Subjects (comma separated)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Matematika, Fisika" {...field} />
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
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
