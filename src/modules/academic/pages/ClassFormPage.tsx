import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, X, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { academicService } from '../services/academic.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import type { AcademicYear, ClassItem, CreateClassPayload, UpdateClassPayload } from '../types/academic.types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const classSchema = z.object({
    name: z.string().trim().min(2, 'Nama kelas minimal 2 karakter / Class name must be at least 2 characters').max(100, 'Nama kelas maksimal 100 karakter / Class name must be at most 100 characters'),
    gradeLevel: z.coerce.number().int('Tingkat harus berupa bilangan bulat / Grade must be a whole number').min(0, 'Pilih tingkat / Select a grade').max(12, 'Tingkat maksimal 12 / Maximum grade is 12'),
    academicYearId: z.string().trim().min(1, 'Tahun ajaran wajib dipilih / Academic year is required'),
    homeroomTeacherId: z.string().optional(),
    capacity: z.coerce.number().int('Kapasitas harus berupa bilangan bulat / Capacity must be a whole number').min(1, 'Kapasitas minimal 1 / Minimum capacity is 1').max(500, 'Kapasitas maksimal 500 / Maximum capacity is 500'),
    major: z.string().trim().max(100, 'Jurusan maksimal 100 karakter / Major must be at most 100 characters').optional(),
});

type ClassFormValues = z.infer<typeof classSchema>;

interface TeacherOption {
    id: string;
    fullName: string;
}

interface ClassFormInnerProps {
    initialData?: ClassItem;
    academicYears: AcademicYear[];
    teachers: TeacherOption[];
    isEdit: boolean;
    schoolId: string;
    classId?: string;
}

function ClassFormInner({ initialData, academicYears, teachers, isEdit, schoolId, classId }: ClassFormInnerProps) {
    const { locale } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const t = useMemo(() => ({
        ayLabel: locale === 'id' ? 'Tahun Ajaran' : 'Academic Year',
        ayPlaceholder: locale === 'id' ? 'Pilih Tahun Ajaran' : 'Select Academic Year',
        ayActive: locale === 'id' ? '(Aktif)' : '(Active)',
        gradeLabel: locale === 'id' ? 'Tingkat / Kelas' : 'Grade Level',
        gradePlaceholder: locale === 'id' ? 'Pilih Tingkat' : 'Select Grade',
        nameLabel: locale === 'id' ? 'Nama Rombel' : 'Class Name',
        namePlaceholder: locale === 'id' ? 'Contoh: Kelas 1A, 10 RPL A' : 'e.g. Class 1A, Grade 10A',
        capacityLabel: locale === 'id' ? 'Kapasitas Maksimal' : 'Maximum Capacity',
        teacherLabel: locale === 'id' ? 'Wali Kelas (Opsional)' : 'Homeroom Teacher (Optional)',
        teacherPlaceholder: locale === 'id' ? 'Pilih Wali Kelas' : 'Select Teacher',
        noTeacher: locale === 'id' ? '-- Belum Ada Wali Kelas --' : '-- No Homeroom Teacher --',
        btnCancel: locale === 'id' ? 'Batal' : 'Cancel',
        btnSave: locale === 'id' ? 'Simpan Perubahan' : 'Save Changes',
        btnCreate: locale === 'id' ? 'Buat Kelas' : 'Create Class',
        gradeTk: locale === 'id' ? 'TK / PAUD' : 'Kindergarten / Pre-K',
        gradeNum: (num: number) => locale === 'id' ? `Tingkat ${num}` : `Grade ${num}`,
        toastSuccessUpdate: locale === 'id' ? 'Kelas berhasil diperbarui.' : 'Class updated successfully.',
        toastSuccessCreate: locale === 'id' ? 'Kelas berhasil ditambahkan.' : 'Class created successfully.',
        noSchool: locale === 'id' ? 'Sekolah tidak ditemukan. Silakan masuk kembali.' : 'School context is missing. Please sign in again.',
    }), [locale]);

    const form = useForm<ClassFormValues>({
        resolver: zodResolver(classSchema),
        defaultValues: {
            name: initialData?.name ?? '',
            gradeLevel: Number(initialData?.gradeLevel ?? 1),
            academicYearId: initialData?.academicYearId ?? '',
            homeroomTeacherId: initialData?.homeroomTeacherId ?? 'none',
            capacity: Number(initialData?.capacity ?? 36),
            major: initialData?.major ?? '',
        },
    });

    const mutation = useMutation({
        mutationFn: async (values: ClassFormValues) => {
            if (!schoolId) throw new Error(t.noSchool);
            // Never trust a schoolId from form input; it comes from authenticated school context.
            const homeroomTeacherId = !values.homeroomTeacherId || values.homeroomTeacherId === 'none'
                ? null
                : values.homeroomTeacherId;
            const major = values.major?.trim() || null;
            if (isEdit) {
                if (!classId) throw new Error(locale === 'id' ? 'ID kelas tidak valid.' : 'Invalid class ID.');
                const payload: UpdateClassPayload = {
                    name: values.name.trim(),
                    gradeLevel: values.gradeLevel,
                    academicYearId: values.academicYearId,
                    capacity: values.capacity,
                    major,
                    homeroomTeacherId,
                };
                return academicService.updateClass(schoolId, classId, payload);
            }
            const payload: CreateClassPayload = {
                schoolId,
                name: values.name.trim(),
                gradeLevel: values.gradeLevel,
                academicYearId: values.academicYearId,
                capacity: values.capacity,
                major,
                homeroomTeacherId,
            };
            return academicService.createClass(payload);
        },
        onSuccess: async () => {
            toast.success(isEdit ? t.toastSuccessUpdate : t.toastSuccessCreate);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['classes', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['class', schoolId, classId] }),
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
            ]);
            navigate('/academic/master-data', { state: { tab: 'kelas' }, replace: true });
        },
        onError: (error: Error) => toast.error(error.message || (locale === 'id' ? 'Gagal menyimpan kelas.' : 'Failed to save class.')),
    });

    const onSubmit = (values: ClassFormValues) => mutation.mutate(values);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="academicYearId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.ayLabel} <span className="text-red-500">*</span></FormLabel>
                            <Select value={field.value || ''} onValueChange={field.onChange} disabled={mutation.isPending}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.ayPlaceholder} /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {academicYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.name} {year.isActive ? t.ayActive : ''}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.gradeLabel} <span className="text-red-500">*</span></FormLabel>
                            <Select value={field.value !== undefined ? String(field.value) : ''} onValueChange={(value) => field.onChange(Number(value))} disabled={mutation.isPending}>
                                <FormControl><SelectTrigger><SelectValue placeholder={t.gradePlaceholder} /></SelectTrigger></FormControl>
                                <SelectContent className="max-h-75">
                                    <SelectItem value="0">{t.gradeTk}</SelectItem>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((number) => <SelectItem key={number} value={String(number)}>{t.gradeNum(number)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.nameLabel} <span className="text-red-500">*</span></FormLabel>
                            <FormControl><Input autoComplete="off" maxLength={100} placeholder={t.namePlaceholder} {...field} disabled={mutation.isPending} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="capacity" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.capacityLabel} <span className="text-red-500">*</span></FormLabel>
                            <FormControl><Input type="number" min={1} max={500} step={1} {...field} disabled={mutation.isPending} onChange={(event) => field.onChange(event.target.value === '' ? '' : Number(event.target.value))} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <FormField control={form.control} name="major" render={({ field }) => (
                    <FormItem>
                        <FormLabel>{locale === 'id' ? 'Jurusan (Opsional)' : 'Major (Optional)'}</FormLabel>
                        <FormControl><Input maxLength={100} placeholder={locale === 'id' ? 'Contoh: RPL, TKJ (jika relevan)' : 'e.g. Software Engineering, if applicable'} {...field} disabled={mutation.isPending} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />

                <FormField control={form.control} name="homeroomTeacherId" render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t.teacherLabel}</FormLabel>
                        <Select value={field.value || 'none'} onValueChange={field.onChange} disabled={mutation.isPending}>
                            <FormControl><SelectTrigger><SelectValue placeholder={t.teacherPlaceholder} /></SelectTrigger></FormControl>
                            <SelectContent className="max-h-75">
                                <SelectItem value="none">{t.noTeacher}</SelectItem>
                                {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.fullName}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />

                <div className="flex justify-end gap-3 border-t border-border pt-4">
                    <Button type="button" variant="outline" onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })} disabled={mutation.isPending}>
                        <X className="mr-2 h-4 w-4" /> {t.btnCancel}
                    </Button>
                    <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={mutation.isPending || !schoolId}>
                        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isEdit ? t.btnSave : t.btnCreate}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

export function ClassFormPage() {
    const { locale } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { school } = useAuthStore();
    const schoolId = school?.id;

    const t = useMemo(() => ({
        pageTitleEdit: locale === 'id' ? 'Edit Kelas' : 'Edit Class',
        pageTitleAdd: locale === 'id' ? 'Tambah Kelas Baru' : 'Add New Class',
        pageDesc: locale === 'id' ? 'Atur rombongan belajar berdasarkan tingkat dan tahun ajaran.' : 'Manage classes by grade and academic year.',
        infoCard: locale === 'id' ? 'Informasi Kelas' : 'Class Information',
        noSchool: locale === 'id' ? 'Sekolah tidak ditemukan. Silakan masuk kembali.' : 'School context is missing. Please sign in again.',
        loading: locale === 'id' ? 'Memuat data...' : 'Loading data...',
        loadError: locale === 'id' ? 'Data kelas gagal dimuat.' : 'Failed to load class data.',
        missingClass: locale === 'id' ? 'Kelas tidak ditemukan atau Anda tidak memiliki akses.' : 'Class not found or access denied.',
        missingYears: locale === 'id' ? 'Belum ada tahun ajaran. Buat tahun ajaran terlebih dahulu.' : 'No academic years found. Create an academic year first.',
        retry: locale === 'id' ? 'Coba lagi' : 'Retry',
        back: locale === 'id' ? 'Kembali' : 'Back',
    }), [locale]);

    const academicYearsQuery = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: () => {
            if (!schoolId) throw new Error(t.noSchool);
            return academicService.getAcademicYears(schoolId);
        },
        enabled: Boolean(schoolId),
    });

    const teachersQuery = useQuery({
        queryKey: ['teachers-list', schoolId],
        queryFn: async (): Promise<TeacherOption[]> => {
            if (!schoolId) throw new Error(t.noSchool);
            const { data, error } = await supabase
                .from('teachers')
                .select('id, fullName')
                .eq('schoolId', schoolId)
                .eq('isActive', true)
                .order('fullName', { ascending: true });
            if (error) throw error;
            return (data ?? []).map((teacher) => ({ id: teacher.id, fullName: teacher.fullName }));
        },
        enabled: Boolean(schoolId),
    });

    const classQuery = useQuery({
        queryKey: ['class', schoolId, id],
        queryFn: () => {
            if (!schoolId || !id) throw new Error(t.missingClass);
            return academicService.getClassById(schoolId, id);
        },
        enabled: Boolean(isEdit && schoolId && id),
        retry: 1,
    });

    const academicYears: AcademicYear[] = academicYearsQuery.data?.data ?? [];
    const classData = classQuery.data?.data;
    const isLoading = academicYearsQuery.isLoading || teachersQuery.isLoading || (isEdit && classQuery.isLoading);
    const queryError = academicYearsQuery.error || teachersQuery.error || (isEdit ? classQuery.error : null);
    const classMissing = isEdit && !isLoading && !queryError && !classData;
    const canRenderForm = Boolean(schoolId) && !isLoading && !queryError && !classMissing && (!isEdit || Boolean(classData));

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" aria-label={t.back} onClick={() => navigate('/academic/master-data', { state: { tab: 'kelas' } })}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{isEdit ? t.pageTitleEdit : t.pageTitleAdd}</h1>
                    <p className="text-muted-foreground">{t.pageDesc}</p>
                </div>
            </div>

            <Card>
                <CardHeader className="border-b border-border bg-muted/20"><CardTitle className="text-lg">{t.infoCard}</CardTitle></CardHeader>
                <CardContent className="pt-6">
                    {!schoolId ? (
                        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{t.noSchool}</div>
                    ) : isLoading ? (
                        <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" />{t.loading}</div>
                    ) : queryError ? (
                        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                            <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{queryError instanceof Error ? queryError.message : t.loadError}</span></div>
                            <Button variant="outline" className="mt-3" onClick={() => { void academicYearsQuery.refetch(); void teachersQuery.refetch(); if (isEdit) void classQuery.refetch(); }}>{t.retry}</Button>
                        </div>
                    ) : classMissing ? (
                        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{t.missingClass}</div>
                    ) : academicYears.length === 0 ? (
                        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">{t.missingYears}<div><Button variant="outline" className="mt-3" onClick={() => navigate('/academic/master-data', { state: { tab: 'tahun-ajaran' } })}>{t.back}</Button></div></div>
                    ) : canRenderForm ? (
                        <ClassFormInner initialData={classData} academicYears={academicYears} teachers={teachersQuery.data ?? []} isEdit={isEdit} schoolId={schoolId} classId={id} />
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
