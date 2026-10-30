import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { academicService } from '../services/academic.service';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import type {
    AcademicYear,
    ClassItem,
    CreateClassPayload,
    UpdateClassPayload,
} from '../types/academic.types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const CLASS_LIST_ROUTE = '/academic/master-data';
const CLASS_LIST_STATE = { state: { tab: 'kelas' } };

const classSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Nama kelas minimal 2 karakter / Class name must be at least 2 characters')
        .max(100, 'Nama kelas maksimal 100 karakter / Class name must be at most 100 characters'),
    gradeLevel: z.coerce
        .number()
        .int('Tingkat harus berupa bilangan bulat / Grade must be a whole number')
        .min(0, 'Pilih tingkat / Select a grade')
        .max(12, 'Tingkat maksimal 12 / Maximum grade is 12'),
    academicYearId: z
        .string()
        .trim()
        .min(1, 'Tahun ajaran wajib dipilih / Academic year is required'),
    homeroomTeacherId: z.string().optional(),
    capacity: z.coerce
        .number()
        .int('Kapasitas harus berupa bilangan bulat / Capacity must be a whole number')
        .min(1, 'Kapasitas minimal 1 / Minimum capacity is 1')
        .max(500, 'Kapasitas maksimal 500 / Maximum capacity is 500'),
    major: z
        .string()
        .trim()
        .max(100, 'Jurusan maksimal 100 karakter / Major must be at most 100 characters')
        .optional(),
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

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = error.message;
        if (typeof message === 'string' && message.length > 0) return message;
    }
    return fallback;
}

function ClassFormInner({
    initialData,
    academicYears,
    teachers,
    isEdit,
    schoolId,
    classId,
}: ClassFormInnerProps) {
    const { locale } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const isId = locale === 'id';

    const t = useMemo(
        () => ({
            ayLabel: isId ? 'Tahun Ajaran' : 'Academic Year',
            ayPlaceholder: isId ? 'Pilih Tahun Ajaran' : 'Select Academic Year',
            ayActive: isId ? '(Aktif)' : '(Active)',
            gradeLabel: isId ? 'Tingkat / Kelas' : 'Grade Level',
            gradePlaceholder: isId ? 'Pilih Tingkat' : 'Select Grade',
            nameLabel: isId ? 'Nama Rombel' : 'Class Name',
            namePlaceholder: isId ? 'Contoh: Kelas 1A, 10 RPL A' : 'e.g. Class 1A, Grade 10A',
            capacityLabel: isId ? 'Kapasitas Maksimal' : 'Maximum Capacity',
            teacherLabel: isId ? 'Wali Kelas (Opsional)' : 'Homeroom Teacher (Optional)',
            teacherPlaceholder: isId ? 'Pilih Wali Kelas' : 'Select Teacher',
            noTeacher: isId ? '-- Belum Ada Wali Kelas --' : '-- No Homeroom Teacher --',
            majorLabel: isId ? 'Jurusan (Opsional)' : 'Major (Optional)',
            majorPlaceholder: isId ? 'Contoh: RPL, TKJ (jika relevan)' : 'e.g. Software Engineering, if applicable',
            btnCancel: isId ? 'Batal' : 'Cancel',
            btnSave: isId ? 'Simpan Perubahan' : 'Save Changes',
            btnCreate: isId ? 'Buat Kelas' : 'Create Class',
            gradeTk: isId ? 'TK / PAUD' : 'Kindergarten / Pre-K',
            gradeNum: (num: number) => (isId ? `Tingkat ${num}` : `Grade ${num}`),
            toastSuccessUpdate: isId ? 'Kelas berhasil diperbarui.' : 'Class updated successfully.',
            toastSuccessCreate: isId ? 'Kelas berhasil ditambahkan.' : 'Class created successfully.',
            noSchool: isId ? 'Sekolah tidak ditemukan. Silakan masuk kembali.' : 'School context is missing. Please sign in again.',
            invalidYear: isId ? 'Tahun ajaran tidak valid atau bukan milik sekolah ini.' : 'Invalid academic year or it does not belong to this school.',
            invalidTeacher: isId ? 'Wali kelas tidak valid atau bukan milik sekolah ini.' : 'Invalid homeroom teacher or the teacher does not belong to this school.',
            invalidClass: isId ? 'ID kelas tidak valid.' : 'Invalid class ID.',
            saveError: isId ? 'Gagal menyimpan kelas.' : 'Failed to save class.',
        }),
        [isId],
    );

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

            // Validasi referensi dilakukan lagi sebelum mutation; validasi otoritatif
            // tetap wajib diterapkan di service/database dan melalui RLS.
            const selectedYear = academicYears.find((year) => year.id === values.academicYearId);
            if (!selectedYear) throw new Error(t.invalidYear);

            const selectedTeacherId = values.homeroomTeacherId && values.homeroomTeacherId !== 'none'
                ? values.homeroomTeacherId
                : null;
            if (selectedTeacherId && !teachers.some((teacher) => teacher.id === selectedTeacherId)) {
                throw new Error(t.invalidTeacher);
            }

            const payloadFields = {
                name: values.name.trim(),
                gradeLevel: values.gradeLevel,
                academicYearId: values.academicYearId,
                capacity: values.capacity,
                major: values.major?.trim() || null,
                homeroomTeacherId: selectedTeacherId,
            };

            if (isEdit) {
                if (!classId) throw new Error(t.invalidClass);
                const payload: UpdateClassPayload = payloadFields;
                return academicService.updateClass(schoolId, classId, payload);
            }

            const payload: CreateClassPayload = {
                schoolId,
                ...payloadFields,
            };
            return academicService.createClass(payload);
        },
        onSuccess: async () => {
            toast.success(isEdit ? t.toastSuccessUpdate : t.toastSuccessCreate);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['classes', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['class', schoolId, classId] }),
                queryClient.invalidateQueries({ queryKey: ['classes-list', schoolId] }),
                queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
            ]);
            navigate(CLASS_LIST_ROUTE, { ...CLASS_LIST_STATE, replace: true });
        },
        onError: (error: unknown) => toast.error(getErrorMessage(error, t.saveError)),
    });

    const onSubmit = (values: ClassFormValues) => mutation.mutate(values);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="academicYearId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.ayLabel} <span className="text-red-500">*</span></FormLabel>
                                <Select value={field.value || ''} onValueChange={field.onChange} disabled={mutation.isPending}>
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder={t.ayPlaceholder} /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {academicYears.map((year) => (
                                            <SelectItem key={year.id} value={year.id}>
                                                {year.name} {year.isActive ? t.ayActive : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="gradeLevel"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.gradeLabel} <span className="text-red-500">*</span></FormLabel>
                                <Select
                                    value={field.value !== undefined ? String(field.value) : ''}
                                    onValueChange={(value) => field.onChange(Number(value))}
                                    disabled={mutation.isPending}
                                >
                                    <FormControl>
                                        <SelectTrigger><SelectValue placeholder={t.gradePlaceholder} /></SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-75">
                                        <SelectItem value="0">{t.gradeTk}</SelectItem>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((number) => (
                                            <SelectItem key={number} value={String(number)}>{t.gradeNum(number)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.nameLabel} <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="off"
                                        maxLength={100}
                                        placeholder={t.namePlaceholder}
                                        {...field}
                                        disabled={mutation.isPending}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="capacity"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.capacityLabel} <span className="text-red-500">*</span></FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={500}
                                        step={1}
                                        name={field.name}
                                        ref={field.ref}
                                        onBlur={field.onBlur}
                                        value={field.value ?? ''}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            field.onChange(value === '' ? Number.NaN : Number(value));
                                        }}
                                        disabled={mutation.isPending}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="major"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.majorLabel}</FormLabel>
                            <FormControl>
                                <Input
                                    maxLength={100}
                                    placeholder={t.majorPlaceholder}
                                    {...field}
                                    value={field.value ?? ''}
                                    disabled={mutation.isPending}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="homeroomTeacherId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.teacherLabel}</FormLabel>
                            <Select value={field.value || 'none'} onValueChange={field.onChange} disabled={mutation.isPending}>
                                <FormControl>
                                    <SelectTrigger><SelectValue placeholder={t.teacherPlaceholder} /></SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-75">
                                    <SelectItem value="none">{t.noTeacher}</SelectItem>
                                    {teachers.map((teacher) => (
                                        <SelectItem key={teacher.id} value={teacher.id}>{teacher.fullName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-3 border-t border-border pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate(CLASS_LIST_ROUTE, CLASS_LIST_STATE)}
                        disabled={mutation.isPending}
                    >
                        <X className="mr-2 h-4 w-4" /> {t.btnCancel}
                    </Button>
                    <Button
                        type="submit"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={mutation.isPending || !schoolId}
                    >
                        {mutation.isPending
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Save className="mr-2 h-4 w-4" />}
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
    const isId = locale === 'id';

    const t = useMemo(
        () => ({
            pageTitleEdit: isId ? 'Edit Kelas' : 'Edit Class',
            pageTitleAdd: isId ? 'Tambah Kelas Baru' : 'Add New Class',
            pageDesc: isId
                ? 'Atur rombongan belajar berdasarkan tingkat dan tahun ajaran.'
                : 'Manage classes by grade level and academic year.',
            infoCard: isId ? 'Informasi Kelas' : 'Class Information',
            noSchool: isId ? 'Sekolah tidak ditemukan. Silakan masuk kembali.' : 'School context is missing. Please sign in again.',
            loading: isId ? 'Memuat data...' : 'Loading data...',
            loadError: isId ? 'Data kelas gagal dimuat.' : 'Failed to load class data.',
            missingClass: isId
                ? 'Kelas tidak ditemukan atau Anda tidak memiliki akses.'
                : 'Class not found or access denied.',
            missingYears: isId
                ? 'Belum ada tahun ajaran. Buat tahun ajaran terlebih dahulu.'
                : 'No academic years found. Create an academic year first.',
            retry: isId ? 'Coba lagi' : 'Retry',
            back: isId ? 'Kembali' : 'Back',
            createYear: isId ? 'Buat Tahun Ajaran' : 'Create Academic Year',
        }),
        [isId],
    );

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
            return (data ?? []).map((teacher) => ({
                id: teacher.id,
                fullName: teacher.fullName,
            }));
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
    const isLoading =
        academicYearsQuery.isLoading ||
        teachersQuery.isLoading ||
        (isEdit && classQuery.isLoading);
    const queryError = academicYearsQuery.error || teachersQuery.error || (isEdit ? classQuery.error : null);
    const classMissing = isEdit && !isLoading && !queryError && !classData;
    const canRenderForm =
        Boolean(schoolId) &&
        !isLoading &&
        !queryError &&
        !classMissing &&
        (!isEdit || Boolean(classData));

    const retryQueries = () => {
        void Promise.all([
            academicYearsQuery.refetch(),
            teachersQuery.refetch(),
            ...(isEdit ? [classQuery.refetch()] : []),
        ]);
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.back}
                    onClick={() => navigate(CLASS_LIST_ROUTE, CLASS_LIST_STATE)}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {isEdit ? t.pageTitleEdit : t.pageTitleAdd}
                    </h1>
                    <p className="text-muted-foreground">{t.pageDesc}</p>
                </div>
            </div>

            <Card>
                <CardHeader className="border-b border-border bg-muted/20">
                    <CardTitle className="text-lg">{t.infoCard}</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    {!schoolId ? (
                        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            {t.noSchool}
                        </div>
                    ) : isLoading ? (
                        <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                            {t.loading}
                        </div>
                    ) : queryError ? (
                        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                                <span>{getErrorMessage(queryError, t.loadError)}</span>
                            </div>
                            <Button variant="outline" className="mt-3" onClick={retryQueries}>
                                {t.retry}
                            </Button>
                        </div>
                    ) : classMissing ? (
                        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
                            {t.missingClass}
                        </div>
                    ) : academicYears.length === 0 ? (
                        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-900">
                            {t.missingYears}
                            <div>
                                <Button
                                    variant="outline"
                                    className="mt-3"
                                    onClick={() => navigate(CLASS_LIST_ROUTE, { state: { tab: 'tahun-ajaran' } })}
                                >
                                    {t.createYear}
                                </Button>
                            </div>
                        </div>
                    ) : canRenderForm ? (
                        <ClassFormInner
                            key={`${schoolId}-${id ?? 'new'}`}
                            initialData={classData}
                            academicYears={academicYears}
                            teachers={teachersQuery.data ?? []}
                            isEdit={isEdit}
                            schoolId={schoolId}
                            classId={id}
                        />
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
