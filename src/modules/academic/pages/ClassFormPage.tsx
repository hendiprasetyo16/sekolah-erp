import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, X, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { academicService } from '../services/academic.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { CreateClassPayload } from '../types/academic.types';

const classSchema = z.object({
    name: z.string().min(2, 'Nama kelas minimal 2 karakter / Name requires 2 chars'),
    gradeLevel: z.coerce.number().min(1, 'Pilih tingkat / Select grade level').max(12),
    academicYearId: z.string().min(1, 'Tahun ajaran wajib dipilih / Academic year is required'),
    homeroomTeacherId: z.string().optional().or(z.literal('none')),
    capacity: z.coerce.number().min(1, 'Kapasitas minimal 1 / Min capacity is 1'),
    major: z.string().optional(),
});

type ClassFormValues = z.infer<typeof classSchema>;

export function ClassFormPage() {
    const { locale } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { school } = useAuthStore();

    const { data: academicYearsResponse, isLoading: isLoadingAy } = useQuery({
        queryKey: ['academic-years', school?.id],
        queryFn: () => academicService.getAcademicYears(school?.id || ''),
        enabled: !!school?.id,
    });
    const academicYears = academicYearsResponse?.data || [];

    const { data: teachers } = useQuery({
        queryKey: ['teachers-list', school?.id],
        queryFn: async () => {
            const { data, error } = await supabase.from('teachers').select('id, fullName').eq('schoolId', school?.id || '').eq('isActive', true);
            if (error) throw error;
            return data as { id: string; fullName: string }[];
        },
        enabled: !!school?.id,
    });

    const { data: classData, isLoading: isFetching } = useQuery({
        queryKey: ['class', id],
        queryFn: () => academicService.getClassById(id!),
        enabled: isEdit,
    });

    // PERBAIKAN: Menggunakan "values" agar data dari database otomatis mengisi Dropdown
    const form = useForm<ClassFormValues>({
        resolver: zodResolver(classSchema),
        defaultValues: { name: '', gradeLevel: 1, academicYearId: '', homeroomTeacherId: 'none', capacity: 36, major: '' },
        values: classData?.data ? {
            name: classData.data.name,
            gradeLevel: classData.data.gradeLevel,
            academicYearId: classData.data.academicYearId,
            homeroomTeacherId: classData.data.homeroomTeacherId || 'none',
            capacity: classData.data.capacity,
            major: classData.data.major || '',
        } : undefined
    });

    const mutation = useMutation({
        mutationFn: (data: CreateClassPayload) => {
            return isEdit ? academicService.updateClass(id!, data) : academicService.createClass(data);
        },
        onSuccess: () => {
            toast.success(isEdit
                ? (locale === 'id' ? 'Kelas berhasil diperbarui' : 'Class updated successfully')
                : (locale === 'id' ? 'Kelas berhasil ditambahkan' : 'Class added successfully'));
            queryClient.invalidateQueries({ queryKey: ['classes'] });

            // PERBAIKAN ROUTING: Memberikan pesan khusus agar terbuka di tab "kelas"
            navigate('/academic/master-data', { state: { tab: 'kelas' } });
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const onSubmit = (values: ClassFormValues) => {
        if (!school?.id) return;
        const payload: CreateClassPayload = {
            schoolId: school.id,
            name: values.name,
            gradeLevel: values.gradeLevel,
            academicYearId: values.academicYearId,
            capacity: values.capacity,
            major: values.major || undefined,
            homeroomTeacherId: values.homeroomTeacherId === 'none' ? undefined : values.homeroomTeacherId,
        };
        mutation.mutate(payload);
    };

    if (isEdit && isFetching) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center space-x-4">
                {/* PERBAIKAN ROUTING BATAL: Kembali ke tab kelas */}
                <Button variant="ghost" size="icon" onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {isEdit ? (locale === 'id' ? 'Edit Kelas' : 'Edit Class') : (locale === 'id' ? 'Tambah Kelas Baru' : 'Add New Class')}
                    </h1>
                    <p className="text-muted-foreground">
                        {locale === 'id' ? 'Atur rombongan belajar berdasarkan tingkat dan tahun ajaran.' : 'Manage classes based on grade level and academic year.'}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="bg-muted/20 border-b border-border">
                    <CardTitle className="text-lg">{locale === 'id' ? 'Informasi Kelas' : 'Class Information'}</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="academicYearId" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{locale === 'id' ? 'Tahun Ajaran' : 'Academic Year'} <span className="text-red-500">*</span></FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || undefined} disabled={isLoadingAy}>
                                            <FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih Tahun Ajaran' : 'Select Academic Year'} /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {academicYears.map(ay => (
                                                    <SelectItem key={ay.id} value={ay.id}>
                                                        {ay.name} {ay.isActive ? (locale === 'id' ? '(Aktif)' : '(Active)') : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />

                                <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{locale === 'id' ? 'Tingkat / Grade' : 'Grade Level'} <span className="text-red-500">*</span></FormLabel>
                                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                                            <FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih Tingkat' : 'Select Grade'} /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                                    <SelectItem key={num} value={String(num)}>{locale === 'id' ? 'Tingkat' : 'Grade'} {num}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>{locale === 'id' ? 'Contoh: 1 untuk Kelas 1 SD.' : 'Example: 1 for 1st Grade.'}</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="name" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{locale === 'id' ? 'Nama Rombel' : 'Class Name'} <span className="text-red-500">*</span></FormLabel>
                                        <FormControl><Input placeholder="Cth: Kelas 1A, 10 RPL A" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />

                                <FormField control={form.control} name="capacity" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{locale === 'id' ? 'Kapasitas Maksimal' : 'Max Capacity'}</FormLabel>
                                        <FormControl><Input type="number" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>

                            <FormField control={form.control} name="homeroomTeacherId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{locale === 'id' ? 'Wali Kelas' : 'Homeroom Teacher'} (Opsional)</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || 'none'}>
                                        <FormControl><SelectTrigger><SelectValue placeholder={locale === 'id' ? 'Pilih Wali Kelas' : 'Select Teacher'} /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="none">-- {locale === 'id' ? 'Belum Ada Wali Kelas' : 'No Homeroom Teacher'} --</SelectItem>
                                            {teachers?.map(t => (
                                                <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                                {/* PERBAIKAN ROUTING BATAL: Kembali ke tab kelas */}
                                <Button type="button" variant="outline" onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })} disabled={mutation.isPending}>
                                    <X className="w-4 h-4 mr-2" /> {locale === 'id' ? 'Batal' : 'Cancel'}
                                </Button>
                                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={mutation.isPending}>
                                    {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    {isEdit ? (locale === 'id' ? 'Simpan Perubahan' : 'Save Changes') : (locale === 'id' ? 'Buat Kelas' : 'Create Class')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}