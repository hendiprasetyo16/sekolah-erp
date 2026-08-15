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

// ============================================================================
// SUB-KOMPONEN: Hanya dirender saat SEMUA data (Master & Relasi) sudah siap 100%
// ============================================================================
function ClassFormInner({ initialData, academicYears, teachers, isEdit, school, classId }: {
    initialData?: any;
    academicYears: any[];
    teachers: any[];
    isEdit: boolean;
    school: any;
    classId?: string;
}) {
    const { locale } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Inisialisasi MURNI menggunakan defaultValues (Tanpa reset, tanpa useEffect)
    const form = useForm<ClassFormValues>({
        resolver: zodResolver(classSchema),
        defaultValues: isEdit && initialData ? {
            name: initialData.name ?? '',
            gradeLevel: Number(initialData.gradeLevel ?? 1),
            academicYearId: initialData.academicYearId ?? '',
            homeroomTeacherId: initialData.homeroomTeacherId ?? 'none',
            capacity: Number(initialData.capacity ?? 36),
            major: initialData.major ?? '',
        } : {
            name: '', gradeLevel: 1, academicYearId: '', homeroomTeacherId: 'none', capacity: 36, major: ''
        }
    });

    const mutation = useMutation({
        mutationFn: (data: CreateClassPayload) => {
            return isEdit ? academicService.updateClass(classId!, data) : academicService.createClass(data);
        },
        onSuccess: async () => {
            // 1. Tampilkan notifikasi sukses
            toast.success(isEdit ? 'Kelas berhasil diperbarui' : 'Kelas berhasil ditambahkan');

            // 2. Hapus cache daftar kelas (agar tabel terupdate)
            await queryClient.invalidateQueries({ queryKey: ['classes'] });

            // 3. FIX BUG: Hapus cache spesifik untuk kelas ini (agar form edit terupdate)
            if (isEdit && classId) {
                await queryClient.invalidateQueries({ queryKey: ['class', classId] });
            }

            // 4. Kembali ke halaman master data
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

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="academicYearId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tahun Ajaran <span className="text-red-500">*</span></FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Tahun Ajaran" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {academicYears.map(ay => (
                                        <SelectItem key={ay.id} value={ay.id}>
                                            {ay.name} {ay.isActive ? '(Aktif)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tingkat / Grade <span className="text-red-500">*</span></FormLabel>
                            <Select value={field.value ? String(field.value) : ""} onValueChange={(val) => field.onChange(Number(val))}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih Tingkat" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                        <SelectItem key={num} value={String(num)}>Tingkat {num}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nama Rombel <span className="text-red-500">*</span></FormLabel>
                            <FormControl><Input placeholder="Cth: Kelas 1A, 10 RPL A" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="capacity" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Kapasitas Maksimal</FormLabel>
                            <FormControl><Input type="number" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <FormField control={form.control} name="homeroomTeacherId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Wali Kelas (Opsional)</FormLabel>
                        <Select value={field.value || 'none'} onValueChange={field.onChange}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih Wali Kelas" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="none">-- Belum Ada Wali Kelas --</SelectItem>
                                {teachers.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button type="button" variant="outline" onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })} disabled={mutation.isPending}>
                        <X className="w-4 h-4 mr-2" /> Batal
                    </Button>
                    <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={mutation.isPending}>
                        {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {isEdit ? 'Simpan Perubahan' : 'Buat Kelas'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

// ============================================================================
// KOMPONEN UTAMA: Bertugas sebagai Data Fetcher & Loading State Guard
// ============================================================================
export function ClassFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id;
    const navigate = useNavigate();
    const { school } = useAuthStore();

    const { data: academicYearsResponse, isLoading: isLoadingAy } = useQuery({
        queryKey: ['academic-years', school?.id],
        queryFn: () => academicService.getAcademicYears(school?.id || ''),
        enabled: !!school?.id,
    });
    const academicYears = academicYearsResponse?.data || [];

    const { data: teachers, isLoading: isLoadingTeachers } = useQuery({
        queryKey: ['teachers-list', school?.id],
        queryFn: async () => {
            const { data, error } = await supabase.from('teachers').select('id, fullName').eq('schoolId', school?.id || '').eq('isActive', true);
            if (error) throw error;
            return data as { id: string; fullName: string }[];
        },
        enabled: !!school?.id,
    });

    const { data: classDataResponse, isLoading: isFetchingClass } = useQuery({
        queryKey: ['class', id],
        queryFn: () => academicService.getClassById(id!),
        enabled: isEdit,
    });
    const classData = classDataResponse?.data;

    // GUARD: Jangan render form sampai semua data relasi dan data utama siap
    const isDataReady = isEdit
        ? (!isLoadingAy && !isLoadingTeachers && !isFetchingClass && classData)
        : (!isLoadingAy && !isLoadingTeachers);

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center space-x-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {isEdit ? 'Edit Kelas' : 'Tambah Kelas Baru'}
                    </h1>
                    <p className="text-muted-foreground">
                        Atur rombongan belajar berdasarkan tingkat dan tahun ajaran.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="bg-muted/20 border-b border-border">
                    <CardTitle className="text-lg">Informasi Kelas</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    {!isDataReady ? (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                        </div>
                    ) : (
                        <ClassFormInner
                            initialData={classData}
                            academicYears={academicYears}
                            teachers={teachers || []}
                            isEdit={isEdit}
                            school={school}
                            classId={id}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}