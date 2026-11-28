import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    AlertCircle,
    BookOpen,
    Clock,
    Edit3,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Users,
    X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { useAuthStore } from '@/modules/auth/store/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { useTranslation } from '@/hooks/useTranslation';
import {
    normalizeTeacherSchoolId,
    teacherService,
} from '../services/teacher.service';
import type { TeacherSubjectAssignmentItem } from '../types/teacher.types';

export interface TeacherSubjectAssignmentSectionProps {
    schoolId?: string | null;
    readOnly?: boolean;
}

type ViewMode = 'by-teacher' | 'table';

interface TeacherWorkloadGroup {
    teacherId: string;
    teacherName: string;
    teacherNip: string | null;
    maxHours: number;
    totalHours: number;
    homeroomClasses: string[];
    assignments: TeacherSubjectAssignmentItem[];
}

const ALL_VALUE = '__ALL__';

export function TeacherSubjectAssignmentSection({
    schoolId: propSchoolId,
    readOnly = false,
}: TeacherSubjectAssignmentSectionProps) {
    const queryClient = useQueryClient();
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { school, user: currentUser } = useAuthStore();
    const { hasPermission } = usePermission();

    const activeSchoolId = useMemo(
        () =>
            normalizeTeacherSchoolId(propSchoolId) ??
            normalizeTeacherSchoolId(school?.id) ??
            normalizeTeacherSchoolId(currentUser?.schoolId),
        [propSchoolId, school?.id, currentUser?.schoolId]
    );

    const canCreate = !readOnly && hasPermission('teachers', 'create');
    const canUpdate = !readOnly && hasPermission('teachers', 'update');
    const canDelete = !readOnly && hasPermission('teachers', 'delete');

    // Filter & view state
    const [selectedYearId, setSelectedYearId] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('by-teacher');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTeacherId, setFilterTeacherId] = useState<string>(ALL_VALUE);
    const [filterSubjectId, setFilterSubjectId] = useState<string>(ALL_VALUE);
    const [filterClassId, setFilterClassId] = useState<string>(ALL_VALUE);

    // Create modal state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [formTeacherId, setFormTeacherId] = useState('');
    const [formSubjectId, setFormSubjectId] = useState('');
    const [formClassIds, setFormClassIds] = useState<string[]>([]);
    const [formWeeklyHours, setFormWeeklyHours] = useState('2');
    const [formIsPrimary, setFormIsPrimary] = useState<'primary' | 'secondary'>('primary');
    const [formNotes, setFormNotes] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    // Edit modal state
    const [editingItem, setEditingItem] = useState<TeacherSubjectAssignmentItem | null>(null);
    const [editWeeklyHours, setEditWeeklyHours] = useState('2');
    const [editIsPrimary, setEditIsPrimary] = useState<'primary' | 'secondary'>('primary');
    const [editNotes, setEditNotes] = useState('');
    const [editError, setEditError] = useState<string | null>(null);

    // Delete confirmation state
    const [deletingItem, setDeletingItem] = useState<TeacherSubjectAssignmentItem | null>(null);

    // Reset filter & tahun ajaran terpilih saat sekolah aktif berpindah
    useEffect(() => {
        setSelectedYearId('');
        setSearchQuery('');
        setFilterTeacherId(ALL_VALUE);
        setFilterSubjectId(ALL_VALUE);
        setFilterClassId(ALL_VALUE);
    }, [activeSchoolId]);

    // 1. Fetch dropdown options (academic years, teachers, subjects, classes)
    const optionsQuery = useQuery({
        queryKey: ['teacher-assignment-options', activeSchoolId, selectedYearId || null],
        queryFn: () =>
            teacherService.getAssignmentFormOptions(
                activeSchoolId!,
                selectedYearId || null
            ),
        enabled: Boolean(activeSchoolId),
    });

    useEffect(() => {
        const resolvedId = optionsQuery.data?.activeAcademicYearId ?? '';
        if (resolvedId && !selectedYearId) {
            setSelectedYearId(resolvedId);
        }
    }, [optionsQuery.data?.activeAcademicYearId, selectedYearId]);

    const effectiveYearId =
        selectedYearId || optionsQuery.data?.activeAcademicYearId || '';

    // 2. Fetch active subject assignments for the selected academic year
    const assignmentsQuery = useQuery({
        queryKey: ['teacher-subject-assignments', activeSchoolId, effectiveYearId],
        queryFn: () =>
            teacherService.listSubjectAssignments({
                schoolId: activeSchoolId!,
                academicYearId: effectiveYearId || null,
            }),
        enabled: Boolean(activeSchoolId) && Boolean(effectiveYearId),
    });

    const academicYears = optionsQuery.data?.academicYears ?? [];
    const teachers = optionsQuery.data?.teachers ?? [];
    const subjects = optionsQuery.data?.subjects ?? [];
    const classes = optionsQuery.data?.classes ?? [];
    const assignments = assignmentsQuery.data ?? [];

    // Total JP per teacher across the entire selected academic year
    const teacherHoursMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const item of assignments) {
            map.set(item.teacherId, (map.get(item.teacherId) ?? 0) + item.weeklyHours);
        }
        return map;
    }, [assignments]);

    // Precompute homeroom classes per teacher ID (O(M))
    const homeroomsByTeacherMap = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const cls of classes) {
            if (!cls.homeroomTeacherId) continue;
            const existing = map.get(cls.homeroomTeacherId) ?? [];
            existing.push(cls.name);
            map.set(cls.homeroomTeacherId, existing);
        }
        return map;
    }, [classes]);

    // Filtered assignments
    const filteredAssignments = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return assignments.filter((item) => {
            if (filterTeacherId !== ALL_VALUE && item.teacherId !== filterTeacherId) {
                return false;
            }
            if (filterSubjectId !== ALL_VALUE && item.subjectId !== filterSubjectId) {
                return false;
            }
            if (filterClassId !== ALL_VALUE && item.classId !== filterClassId) {
                return false;
            }
            if (!q) return true;

            return (
                item.teacherName.toLowerCase().includes(q) ||
                (item.teacherNip && item.teacherNip.toLowerCase().includes(q)) ||
                item.subjectName.toLowerCase().includes(q) ||
                (item.subjectCode && item.subjectCode.toLowerCase().includes(q)) ||
                item.className.toLowerCase().includes(q) ||
                (item.notes && item.notes.toLowerCase().includes(q))
            );
        });
    }, [assignments, filterTeacherId, filterSubjectId, filterClassId, searchQuery]);

    // Grouped by teacher
    const groupedByTeacher = useMemo<TeacherWorkloadGroup[]>(() => {
        const groups = new Map<string, TeacherWorkloadGroup>();

        for (const item of filteredAssignments) {
            let group = groups.get(item.teacherId);
            if (!group) {
                group = {
                    teacherId: item.teacherId,
                    teacherName: item.teacherName,
                    teacherNip: item.teacherNip,
                    maxHours: item.teacherMaxHours || 24,
                    totalHours: teacherHoursMap.get(item.teacherId) ?? 0,
                    homeroomClasses: homeroomsByTeacherMap.get(item.teacherId) ?? [],
                    assignments: [],
                };
                groups.set(item.teacherId, group);
            }
            group.assignments.push(item);
        }

        return Array.from(groups.values()).sort((a, b) =>
            a.teacherName.localeCompare(b.teacherName, 'id')
        );
    }, [filteredAssignments, homeroomsByTeacherMap, teacherHoursMap]);

    // KPI metrics
    const summaryStats = useMemo(() => {
        const distinctTeachers = new Set<string>();
        const distinctClasses = new Set<string>();
        let totalJp = 0;

        for (const item of assignments) {
            distinctTeachers.add(item.teacherId);
            distinctClasses.add(item.classId);
            totalJp += item.weeklyHours;
        }

        let overloadedCount = 0;
        for (const t of teachers) {
            const currentHours = teacherHoursMap.get(t.id) ?? 0;
            if (currentHours > (t.maxHoursPerWeek || 24)) {
                overloadedCount += 1;
            }
        }

        return {
            assignedTeacherCount: distinctTeachers.size,
            totalTeacherCount: teachers.length,
            assignedClassCount: distinctClasses.size,
            totalClassCount: classes.length,
            totalAssignments: assignments.length,
            totalJp,
            overloadedCount,
        };
    }, [assignments, teachers, classes, teacherHoursMap]);

    // Existing assignment map for selected teacher + subject inside create modal
    const existingClassAssignmentsForForm = useMemo(() => {
        const map = new Map<string, TeacherSubjectAssignmentItem>();
        if (!formTeacherId || !formSubjectId) return map;
        for (const item of assignments) {
            if (item.teacherId === formTeacherId && item.subjectId === formSubjectId) {
                map.set(item.classId, item);
            }
        }
        return map;
    }, [assignments, formTeacherId, formSubjectId]);

    // Live workload projection in create modal
    const createModalHoursPreview = useMemo(() => {
        if (!formTeacherId) return null;
        const selectedTeacher = teachers.find((t) => t.id === formTeacherId);
        if (!selectedTeacher) return null;

        const baseHours = teacherHoursMap.get(formTeacherId) ?? 0;
        const safeHours = Math.max(1, Math.min(40, Math.trunc(Number(formWeeklyHours) || 0)));

        let delta = 0;
        for (const cid of formClassIds) {
            const existing = existingClassAssignmentsForForm.get(cid);
            if (existing) {
                delta += safeHours - existing.weeklyHours;
            } else {
                delta += safeHours;
            }
        }

        return {
            teacherName: selectedTeacher.fullName,
            maxHours: selectedTeacher.maxHoursPerWeek || 24,
            currentHours: baseHours,
            projectedHours: baseHours + delta,
        };
    }, [
        formTeacherId,
        teachers,
        teacherHoursMap,
        formWeeklyHours,
        formClassIds,
        existingClassAssignmentsForForm,
    ]);

    // Mutations
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!activeSchoolId) {
                throw new Error(
                    isId ? 'Sekolah aktif belum dipilih.' : 'Active school is not selected.'
                );
            }
            if (!effectiveYearId) {
                throw new Error(
                    isId ? 'Tahun ajaran belum dipilih.' : 'Academic year is not selected.'
                );
            }
            if (!formTeacherId) {
                throw new Error(
                    isId
                        ? 'Pilih guru pengampu terlebih dahulu.'
                        : 'Please select a teacher first.'
                );
            }
            if (!formSubjectId) {
                throw new Error(
                    isId
                        ? 'Pilih mata pelajaran terlebih dahulu.'
                        : 'Please select a subject first.'
                );
            }
            if (formClassIds.length === 0) {
                throw new Error(
                    isId
                        ? 'Pilih minimal satu kelas / rombel tujuan.'
                        : 'Select at least one target class.'
                );
            }
            const parsedHours = Math.trunc(Number(formWeeklyHours));
            if (!Number.isFinite(parsedHours) || parsedHours < 1 || parsedHours > 40) {
                throw new Error(
                    isId
                        ? 'Jam pelajaran per minggu harus antara 1 hingga 40 JP.'
                        : 'Weekly teaching hours must be between 1 and 40 JP.'
                );
            }

            return teacherService.assignSubjectToClasses({
                schoolId: activeSchoolId,
                academicYearId: effectiveYearId,
                teacherId: formTeacherId,
                subjectId: formSubjectId,
                classIds: formClassIds,
                weeklyHours: parsedHours,
                isPrimary: formIsPrimary === 'primary',
                notes: formNotes.trim() || null,
            });
        },
        onSuccess: (res) => {
            setFormError(null);
            setIsCreateOpen(false);
            queryClient.invalidateQueries({
                queryKey: ['teacher-subject-assignments', activeSchoolId],
            });
            toast.success(res.message);
        },
        onError: (err: unknown) => {
            const msg =
                err instanceof Error
                    ? err.message
                    : isId
                        ? 'Gagal menyimpan penugasan mata pelajaran.'
                        : 'Failed to save subject assignment.';
            setFormError(msg);
            toast.error(msg);
        },
    });

    const updateMutation = useMutation({
        mutationFn: async () => {
            if (!activeSchoolId || !editingItem) {
                throw new Error(
                    isId ? 'Data penugasan tidak valid.' : 'Invalid assignment record.'
                );
            }
            const parsedHours = Math.trunc(Number(editWeeklyHours));
            if (!Number.isFinite(parsedHours) || parsedHours < 1 || parsedHours > 40) {
                throw new Error(
                    isId
                        ? 'Jam pelajaran per minggu harus antara 1 hingga 40 JP.'
                        : 'Weekly teaching hours must be between 1 and 40 JP.'
                );
            }

            return teacherService.updateSubjectAssignment(editingItem.id, activeSchoolId, {
                weeklyHours: parsedHours,
                isPrimary: editIsPrimary === 'primary',
                notes: editNotes.trim() || null,
            });
        },
        onSuccess: (res) => {
            setEditError(null);
            setEditingItem(null);
            queryClient.invalidateQueries({
                queryKey: ['teacher-subject-assignments', activeSchoolId],
            });
            toast.success(res.message);
        },
        onError: (err: unknown) => {
            const msg =
                err instanceof Error
                    ? err.message
                    : isId
                        ? 'Gagal memperbarui penugasan mengajar.'
                        : 'Failed to update teaching assignment.';
            setEditError(msg);
            toast.error(msg);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!activeSchoolId || !deletingItem) {
                throw new Error(
                    isId ? 'Data penugasan tidak valid.' : 'Invalid assignment record.'
                );
            }
            return teacherService.deleteSubjectAssignment(deletingItem.id, activeSchoolId);
        },
        onSuccess: (res) => {
            setDeletingItem(null);
            queryClient.invalidateQueries({
                queryKey: ['teacher-subject-assignments', activeSchoolId],
            });
            toast.success(res.message);
        },
        onError: (err: unknown) => {
            const msg =
                err instanceof Error
                    ? err.message
                    : isId
                        ? 'Gagal menghapus penugasan mata pelajaran.'
                        : 'Failed to delete subject assignment.';
            setDeletingItem(null);
            toast.error(msg);
        },
    });

    const isAnyModalOpen = Boolean(isCreateOpen || editingItem || deletingItem);
    const isAnyMutationPending =
        createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

    // Tutup modal aktif via tombol Escape saat tidak sedang memproses mutasi
    useEffect(() => {
        if (!isAnyModalOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || isAnyMutationPending) return;
            if (deletingItem) {
                setDeletingItem(null);
            } else if (editingItem) {
                setEditingItem(null);
            } else if (isCreateOpen) {
                setIsCreateOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAnyModalOpen, isAnyMutationPending, deletingItem, editingItem, isCreateOpen]);

    const openCreateModal = (preselectedTeacherId?: string) => {
        setFormTeacherId(preselectedTeacherId ?? '');
        setFormSubjectId('');
        setFormClassIds([]);
        setFormWeeklyHours('2');
        setFormIsPrimary('primary');
        setFormNotes('');
        setFormError(null);
        setIsCreateOpen(true);
    };

    const toggleFormClass = (classId: string) => {
        setFormClassIds((prev) =>
            prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
        );
    };

    const openEditModal = (item: TeacherSubjectAssignmentItem) => {
        setEditingItem(item);
        setEditWeeklyHours(String(item.weeklyHours));
        setEditIsPrimary(item.isPrimary ? 'primary' : 'secondary');
        setEditNotes(item.notes ?? '');
        setEditError(null);
    };

    const handleYearChange = (newYearId: string) => {
        setSelectedYearId(newYearId);
        setFilterClassId(ALL_VALUE);
    };

    const resetFilters = () => {
        setSearchQuery('');
        setFilterTeacherId(ALL_VALUE);
        setFilterSubjectId(ALL_VALUE);
        setFilterClassId(ALL_VALUE);
    };

    const hasActiveFilters = Boolean(
        searchQuery.trim() ||
        filterTeacherId !== ALL_VALUE ||
        filterSubjectId !== ALL_VALUE ||
        filterClassId !== ALL_VALUE
    );

    if (!activeSchoolId) {
        return (
            <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10">
                <CardContent className="flex items-center gap-3 p-6 text-sm text-amber-900 dark:text-amber-300">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>
                        {isId
                            ? 'Pilih sekolah aktif terlebih dahulu pada switcher institusi untuk mengelola penugasan mata pelajaran.'
                            : 'Please select an active school first to manage subject assignments.'}
                    </span>
                </CardContent>
            </Card>
        );
    }

    const isLoadingData = optionsQuery.isLoading || assignmentsQuery.isLoading;
    const queryError = optionsQuery.error ?? assignmentsQuery.error;

    return (
        <div className="space-y-6">
            {/* Header & Academic Year Controls */}
            <Card className="border-border shadow-sm">
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                                <BookOpen className="h-4 w-4" />
                            </div>
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">
                                {isId
                                    ? 'Penugasan Mata Pelajaran & Beban Mengajar (JP)'
                                    : 'Subject Assignments & Weekly Teaching Load'}
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {isId
                                ? 'Distribusikan guru pengampu per rombel dan pantau total jam pelajaran mingguan per PTK.'
                                : 'Assign subject teachers per class and monitor weekly teaching hours per teacher.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-55">
                            <Select
                                value={effectiveYearId || undefined}
                                onValueChange={handleYearChange}
                                disabled={optionsQuery.isLoading || academicYears.length === 0}
                            >
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={
                                            isId ? 'Pilih Tahun Ajaran' : 'Select Academic Year'
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {academicYears.map((yr) => (
                                        <SelectItem key={yr.id} value={yr.id}>
                                            {isId ? 'TA' : 'AY'} {yr.name}{' '}
                                            {yr.isActive ? (isId ? '(Aktif)' : '(Active)') : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {canCreate && (
                            <Button
                                type="button"
                                onClick={() => openCreateModal()}
                                disabled={optionsQuery.isLoading || !effectiveYearId}
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {isId ? 'Tambah Penugasan' : 'Assign Subject'}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Error State */}
            {queryError && (
                <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-2.5">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>
                            {queryError instanceof Error
                                ? queryError.message
                                : isId
                                    ? 'Gagal memuat data penugasan mata pelajaran.'
                                    : 'Failed to load subject assignment data.'}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void optionsQuery.refetch();
                            void assignmentsQuery.refetch();
                        }}
                    >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        {isId ? 'Coba Lagi' : 'Retry'}
                    </Button>
                </div>
            )}

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-border shadow-none">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                            <span>{isId ? 'Guru Terjadwal' : 'Assigned Teachers'}</span>
                            <Users className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-foreground">
                                {summaryStats.assignedTeacherCount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                / {summaryStats.totalTeacherCount}{' '}
                                {isId ? 'PTK aktif' : 'active teachers'}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border shadow-none">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                            <span>{isId ? 'Rombel Terisi' : 'Classes Covered'}</span>
                            <BookOpen className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-foreground">
                                {summaryStats.assignedClassCount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                / {summaryStats.totalClassCount}{' '}
                                {isId ? 'rombel aktif' : 'active classes'}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border shadow-none">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                            <span>{isId ? 'Total Jam Terdistribusi' : 'Total Weekly JP'}</span>
                            <Clock className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {summaryStats.totalJp} JP
                            </span>
                            <span className="text-xs text-muted-foreground">
                                ({summaryStats.totalAssignments}{' '}
                                {isId ? 'penugasan' : 'assignments'})
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border shadow-none">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                            <span>{isId ? 'Melebihi Kuota JP' : 'Over Max Hours'}</span>
                            <AlertCircle
                                className={`h-4 w-4 ${summaryStats.overloadedCount > 0
                                    ? 'text-rose-600'
                                    : 'text-muted-foreground'
                                    }`}
                            />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span
                                className={`text-2xl font-bold ${summaryStats.overloadedCount > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-foreground'
                                    }`}
                            >
                                {summaryStats.overloadedCount} {isId ? 'Guru' : 'Teachers'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {isId ? 'di atas batas mingguan' : 'above weekly limit'}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter & View Switcher */}
            <Card className="border-border shadow-sm">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="search"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={
                                        isId
                                            ? 'Cari guru, NIP, mapel, kelas...'
                                            : 'Search teacher, NIP, subject, class...'
                                    }
                                    className="pl-9"
                                />
                            </div>

                            <Select value={filterTeacherId} onValueChange={setFilterTeacherId}>
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={isId ? 'Semua Guru' : 'All Teachers'}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_VALUE}>
                                        {isId ? 'Semua Guru' : 'All Teachers'}
                                    </SelectItem>
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={filterSubjectId} onValueChange={setFilterSubjectId}>
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={
                                            isId ? 'Semua Mata Pelajaran' : 'All Subjects'
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_VALUE}>
                                        {isId ? 'Semua Mata Pelajaran' : 'All Subjects'}
                                    </SelectItem>
                                    {subjects.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.code ? `[${s.code}] ${s.name}` : s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={filterClassId} onValueChange={setFilterClassId}>
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={
                                            isId ? 'Semua Kelas / Rombel' : 'All Classes'
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_VALUE}>
                                        {isId ? 'Semua Kelas / Rombel' : 'All Classes'}
                                    </SelectItem>
                                    {classes.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name} {c.major ? `(${c.major})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between gap-2 lg:justify-end">
                            {hasActiveFilters && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetFilters}
                                >
                                    {isId ? 'Reset' : 'Reset'}
                                </Button>
                            )}

                            <div
                                role="group"
                                aria-label={
                                    isId
                                        ? 'Mode tampilan penugasan'
                                        : 'Assignment view mode'
                                }
                                className="inline-flex rounded-lg border border-border bg-muted/60 p-1"
                            >
                                <button
                                    type="button"
                                    onClick={() => setViewMode('by-teacher')}
                                    aria-pressed={viewMode === 'by-teacher'}
                                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === 'by-teacher'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {isId ? 'Rekap per Guru' : 'By Teacher'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    aria-pressed={viewMode === 'table'}
                                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${viewMode === 'table'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {isId ? 'Tabel Rincian' : 'Detailed Table'}
                                </button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Content Area */}
            {isLoadingData ? (
                <div className="flex min-h-60 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                </div>
            ) : filteredAssignments.length === 0 ? (
                <Card className="border-dashed border-border">
                    <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-foreground">
                            {hasActiveFilters
                                ? isId
                                    ? 'Tidak ada penugasan yang sesuai filter'
                                    : 'No assignments match the current filters'
                                : isId
                                    ? 'Belum ada penugasan mata pelajaran'
                                    : 'No subject assignments yet'}
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                            {hasActiveFilters
                                ? isId
                                    ? 'Ubah kata kunci pencarian atau atur ulang filter guru, mata pelajaran, dan kelas.'
                                    : 'Adjust your search keyword or reset the teacher, subject, and class filters.'
                                : isId
                                    ? 'Mulai distribusikan mata pelajaran dan jam mengajar per rombel pada tahun ajaran ini.'
                                    : 'Start assigning subjects and weekly teaching hours per class for this academic year.'}
                        </p>
                        {canCreate && !hasActiveFilters && effectiveYearId && (
                            <Button
                                type="button"
                                onClick={() => openCreateModal()}
                                className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {isId ? 'Tambah Penugasan Pertama' : 'Add First Assignment'}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : viewMode === 'by-teacher' ? (
                /* REKAP PER GURU */
                <div className="space-y-4">
                    {groupedByTeacher.map((group) => {
                        const ratio = group.maxHours > 0 ? group.totalHours / group.maxHours : 0;
                        const isOverload = group.totalHours > group.maxHours;
                        const isNearLimit = !isOverload && ratio >= 0.85;
                        const barWidth = Math.min(100, Math.round(ratio * 100));

                        return (
                            <Card
                                key={group.teacherId}
                                className="overflow-hidden border-border shadow-sm"
                            >
                                <div className="flex flex-col gap-4 border-b border-border bg-muted/30 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-base font-semibold text-foreground">
                                                {group.teacherName}
                                            </h3>
                                            {group.teacherNip && (
                                                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                                    NIP {group.teacherNip}
                                                </span>
                                            )}
                                            {group.homeroomClasses.length > 0 && (
                                                <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                                                    {isId ? 'Wali Kelas:' : 'Homeroom:'}{' '}
                                                    {group.homeroomClasses.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {isId
                                                ? `Mengampu ${group.assignments.length} rombel/mapel pada tahun ajaran ini`
                                                : `Teaching ${group.assignments.length} class/subject assignment(s) this academic year`}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                        <div className="min-w-47.5">
                                            <div className="flex items-center justify-between text-xs font-medium">
                                                <span className="text-muted-foreground">
                                                    {isId ? 'Beban Mengajar' : 'Teaching Load'}
                                                </span>
                                                <span
                                                    className={
                                                        isOverload
                                                            ? 'font-bold text-rose-600 dark:text-rose-400'
                                                            : isNearLimit
                                                                ? 'font-semibold text-amber-600 dark:text-amber-400'
                                                                : 'font-semibold text-emerald-600 dark:text-emerald-400'
                                                    }
                                                >
                                                    {group.totalHours} / {group.maxHours} JP
                                                </span>
                                            </div>
                                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isOverload
                                                        ? 'bg-rose-600'
                                                        : isNearLimit
                                                            ? 'bg-amber-500'
                                                            : 'bg-emerald-600'
                                                        }`}
                                                    style={{ width: `${barWidth}%` }}
                                                />
                                            </div>
                                        </div>

                                        {canCreate && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openCreateModal(group.teacherId)}
                                            >
                                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                {isId ? 'Tambah Kelas' : 'Add Class'}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="divide-y divide-border">
                                    {group.assignments.map((item) => {
                                        const isOwnHomeroom = item.homeroomTeacherId === item.teacherId;
                                        return (
                                            <div
                                                key={item.id}
                                                className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-medium text-foreground">
                                                            {item.subjectName}
                                                        </span>
                                                        {item.subjectCode && (
                                                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                                                {item.subjectCode}
                                                            </span>
                                                        )}
                                                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                                            {isId ? 'Kelas' : 'Class'} {item.className}
                                                            {item.classMajor ? ` (${item.classMajor})` : ''}
                                                        </span>
                                                        <span
                                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.isPrimary
                                                                ? 'bg-muted text-foreground'
                                                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                                                }`}
                                                        >
                                                            {item.isPrimary
                                                                ? isId
                                                                    ? 'Pengampu Utama'
                                                                    : 'Primary Teacher'
                                                                : isId
                                                                    ? 'Pendamping'
                                                                    : 'Co-Teacher'}
                                                        </span>
                                                        {isOwnHomeroom && (
                                                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                                                                {isId ? 'Kelas Perwalian' : 'Homeroom Class'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                        {item.homeroomTeacherName && (
                                                            <span>
                                                                {isId ? 'Wali Kelas:' : 'Homeroom:'}{' '}
                                                                {item.homeroomTeacherName}
                                                            </span>
                                                        )}
                                                        {item.notes && (
                                                            <span>
                                                                {isId ? 'Catatan:' : 'Notes:'}{' '}
                                                                {item.notes}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                                    <span className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">
                                                        {item.weeklyHours} JP /{' '}
                                                        {isId ? 'minggu' : 'week'}
                                                    </span>

                                                    {(canUpdate || canDelete) && (
                                                        <div className="flex items-center gap-1">
                                                            {canUpdate && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => openEditModal(item)}
                                                                >
                                                                    <Edit3 className="mr-1 h-3.5 w-3.5" />
                                                                    {isId ? 'Ubah' : 'Edit'}
                                                                </Button>
                                                            )}
                                                            {canDelete && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setDeletingItem(item)}
                                                                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                                                >
                                                                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                                                                    {isId ? 'Hapus' : 'Delete'}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                /* TABEL RINCIAN */
                <Card className="overflow-hidden border-border shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border text-left text-sm">
                            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-3.5">
                                        {isId ? 'Guru Pengampu' : 'Teacher'}
                                    </th>
                                    <th scope="col" className="px-4 py-3.5">
                                        {isId ? 'Mata Pelajaran' : 'Subject'}
                                    </th>
                                    <th scope="col" className="px-4 py-3.5">
                                        {isId ? 'Kelas / Rombel' : 'Class'}
                                    </th>
                                    <th scope="col" className="px-4 py-3.5">
                                        {isId ? 'Peran' : 'Role'}
                                    </th>
                                    <th scope="col" className="px-4 py-3.5 text-right">
                                        {isId ? 'Beban (JP)' : 'Load (JP)'}
                                    </th>
                                    {(canUpdate || canDelete) && (
                                        <th scope="col" className="px-4 py-3.5 text-right">
                                            {isId ? 'Aksi' : 'Actions'}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredAssignments.map((item) => {
                                    const totalTeacherHours = teacherHoursMap.get(item.teacherId) ?? 0;
                                    const isOverload = totalTeacherHours > (item.teacherMaxHours || 24);

                                    return (
                                        <tr key={item.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-3.5">
                                                <div className="font-medium text-foreground">
                                                    {item.teacherName}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    Total:{' '}
                                                    <span
                                                        className={
                                                            isOverload
                                                                ? 'font-semibold text-rose-600 dark:text-rose-400'
                                                                : 'text-foreground'
                                                        }
                                                    >
                                                        {totalTeacherHours}/{item.teacherMaxHours} JP
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="font-medium text-foreground">
                                                    {item.subjectName}
                                                </div>
                                                {item.subjectCode && (
                                                    <div className="font-mono text-xs text-muted-foreground">
                                                        {item.subjectCode}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="font-medium text-foreground">
                                                    {item.className}
                                                    {item.classMajor ? ` (${item.classMajor})` : ''}
                                                </div>
                                                {item.homeroomTeacherName && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {isId ? 'Wali:' : 'Homeroom:'}{' '}
                                                        {item.homeroomTeacherName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${item.isPrimary
                                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                                        }`}
                                                >
                                                    {item.isPrimary
                                                        ? isId
                                                            ? 'Utama'
                                                            : 'Primary'
                                                        : isId
                                                            ? 'Pendamping'
                                                            : 'Co-Teacher'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-semibold text-foreground">
                                                {item.weeklyHours} JP
                                            </td>
                                            {(canUpdate || canDelete) && (
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="inline-flex items-center gap-1">
                                                        {canUpdate && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openEditModal(item)}
                                                            >
                                                                {isId ? 'Ubah' : 'Edit'}
                                                            </Button>
                                                        )}
                                                        {canDelete && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setDeletingItem(item)}
                                                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                                            >
                                                                {isId ? 'Hapus' : 'Delete'}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* MODAL: TAMBAH PENUGASAN MULTI-KELAS */}
            {isCreateOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-create-assignment-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                    onClick={() => {
                        if (!createMutation.isPending) setIsCreateOpen(false);
                    }}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-border pb-4">
                            <div>
                                <h3
                                    id="modal-create-assignment-title"
                                    className="text-lg font-semibold"
                                >
                                    {isId
                                        ? 'Tambah Penugasan Mata Pelajaran'
                                        : 'Assign Subject to Classes'}
                                </h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {isId
                                        ? 'Pilih satu guru dan mata pelajaran, lalu centang satu atau beberapa rombel tujuan sekaligus.'
                                        : 'Select a teacher and subject, then check one or more target classes at once.'}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={createMutation.isPending}
                                onClick={() => setIsCreateOpen(false)}
                                aria-label={isId ? 'Tutup dialog' : 'Close dialog'}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                createMutation.mutate();
                            }}
                            className="mt-5 space-y-4"
                        >
                            {formError && (
                                <div
                                    role="alert"
                                    className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                                >
                                    {formError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-foreground">
                                        {isId ? 'Guru Pengampu' : 'Teacher'}{' '}
                                        <span className="text-rose-600">*</span>
                                    </label>
                                    <Select
                                        value={formTeacherId || undefined}
                                        onValueChange={setFormTeacherId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue
                                                placeholder={
                                                    isId ? '-- Pilih Guru --' : '-- Select Teacher --'
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {teachers.map((t) => {
                                                const used = teacherHoursMap.get(t.id) ?? 0;
                                                return (
                                                    <SelectItem key={t.id} value={t.id}>
                                                        {t.fullName} ({used}/{t.maxHoursPerWeek} JP)
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-foreground">
                                        {isId ? 'Mata Pelajaran' : 'Subject'}{' '}
                                        <span className="text-rose-600">*</span>
                                    </label>
                                    <Select
                                        value={formSubjectId || undefined}
                                        onValueChange={setFormSubjectId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue
                                                placeholder={
                                                    isId
                                                        ? '-- Pilih Mata Pelajaran --'
                                                        : '-- Select Subject --'
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {subjects.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.code ? `[${s.code}] ${s.name}` : s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Multi-class checkbox selector */}
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground">
                                        {isId ? 'Kelas / Rombel Tujuan' : 'Target Classes'}{' '}
                                        <span className="text-rose-600">*</span> (
                                        {formClassIds.length}{' '}
                                        {isId ? 'dipilih' : 'selected'})
                                    </span>
                                    {classes.length > 0 && (
                                        <div className="flex items-center gap-2 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setFormClassIds(classes.map((c) => c.id))}
                                                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                                            >
                                                {isId ? 'Pilih Semua' : 'Select All'}
                                            </button>
                                            <span className="text-muted-foreground">|</span>
                                            <button
                                                type="button"
                                                onClick={() => setFormClassIds([])}
                                                className="text-muted-foreground hover:underline"
                                            >
                                                {isId ? 'Kosongkan' : 'Clear'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {classes.length === 0 ? (
                                    <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                        {isId
                                            ? 'Belum ada data kelas aktif pada tahun ajaran yang dipilih.'
                                            : 'No active classes found for the selected academic year.'}
                                    </p>
                                ) : (
                                    <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2">
                                        {classes.map((cls) => {
                                            const checked = formClassIds.includes(cls.id);
                                            const existing = existingClassAssignmentsForForm.get(cls.id);
                                            return (
                                                <label
                                                    key={cls.id}
                                                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition ${checked
                                                        ? 'border-emerald-600 bg-emerald-500/10'
                                                        : 'border-border bg-card hover:border-emerald-500/50'
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleFormClass(cls.id)}
                                                        className="mt-0.5 h-4 w-4 rounded border-border accent-emerald-600"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-semibold text-foreground">
                                                            {cls.name} {cls.major ? `(${cls.major})` : ''}
                                                        </div>
                                                        {cls.homeroomTeacherName && (
                                                            <div className="truncate text-[11px] text-muted-foreground">
                                                                {isId ? 'Wali:' : 'Homeroom:'}{' '}
                                                                {cls.homeroomTeacherName}
                                                            </div>
                                                        )}
                                                        {existing && (
                                                            <div className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                                                {isId
                                                                    ? `Sudah terpasang (${existing.weeklyHours} JP — akan diperbarui)`
                                                                    : `Already assigned (${existing.weeklyHours} JP — will update)`}
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="create-weekly-hours"
                                        className="text-xs font-semibold text-foreground"
                                    >
                                        {isId
                                            ? 'Jam Pelajaran per Minggu (per Kelas)'
                                            : 'Weekly Hours (per Class)'}{' '}
                                        <span className="text-rose-600">*</span>
                                    </label>
                                    <Input
                                        id="create-weekly-hours"
                                        type="number"
                                        min={1}
                                        max={40}
                                        step={1}
                                        value={formWeeklyHours}
                                        onChange={(e) => setFormWeeklyHours(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-foreground">
                                        {isId ? 'Status Pengampu' : 'Teacher Role'}
                                    </label>
                                    <Select
                                        value={formIsPrimary}
                                        onValueChange={(v) =>
                                            setFormIsPrimary(v as 'primary' | 'secondary')
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="primary">
                                                {isId
                                                    ? 'Guru Pengampu Utama'
                                                    : 'Primary Subject Teacher'}
                                            </SelectItem>
                                            <SelectItem value="secondary">
                                                {isId
                                                    ? 'Guru Pendamping / Tim Teaching'
                                                    : 'Co-Teacher / Team Teaching'}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label
                                    htmlFor="create-notes"
                                    className="text-xs font-semibold text-foreground"
                                >
                                    {isId
                                        ? 'Catatan Penugasan (Opsional)'
                                        : 'Assignment Notes (Optional)'}
                                </label>
                                <Input
                                    id="create-notes"
                                    type="text"
                                    maxLength={200}
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder={
                                        isId
                                            ? 'Contoh: Semester Ganjil, Praktikum Lab, atau Nomor SK'
                                            : 'e.g., Odd Semester, Lab Session, or Decree Number'
                                    }
                                />
                            </div>

                            {/* Live Workload Projection */}
                            {createModalHoursPreview && formClassIds.length > 0 && (
                                <div
                                    className={`rounded-xl border px-4 py-3 text-xs ${createModalHoursPreview.projectedHours >
                                        createModalHoursPreview.maxHours
                                        ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                                        : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                                        }`}
                                >
                                    {isId ? 'Estimasi beban mengajar' : 'Projected teaching load'}{' '}
                                    <strong>{createModalHoursPreview.teacherName}</strong>:{' '}
                                    <strong>
                                        {createModalHoursPreview.currentHours} JP →{' '}
                                        {createModalHoursPreview.projectedHours} JP
                                    </strong>{' '}
                                    (
                                    {isId
                                        ? `batas maksimal ${createModalHoursPreview.maxHours} JP/minggu`
                                        : `max limit ${createModalHoursPreview.maxHours} JP/week`}
                                    ).
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsCreateOpen(false)}
                                    disabled={createMutation.isPending}
                                >
                                    {isId ? 'Batal' : 'Cancel'}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={createMutation.isPending}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {createMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {isId ? 'Simpan Penugasan' : 'Save Assignment'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: UBAH PENUGASAN */}
            {editingItem && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-edit-assignment-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                    onClick={() => {
                        if (!updateMutation.isPending) setEditingItem(null);
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3
                            id="modal-edit-assignment-title"
                            className="text-lg font-semibold"
                        >
                            {isId ? 'Ubah Penugasan Mengajar' : 'Edit Teaching Assignment'}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {editingItem.teacherName} — {editingItem.subjectName} (
                            {isId ? 'Kelas' : 'Class'} {editingItem.className})
                        </p>

                        <form
                            onSubmit={(e: FormEvent) => {
                                e.preventDefault();
                                updateMutation.mutate();
                            }}
                            className="mt-4 space-y-4"
                        >
                            {editError && (
                                <div
                                    role="alert"
                                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                                >
                                    {editError}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label
                                    htmlFor="edit-weekly-hours"
                                    className="text-xs font-semibold text-foreground"
                                >
                                    {isId
                                        ? 'Jam Pelajaran per Minggu'
                                        : 'Weekly Teaching Hours'}{' '}
                                    <span className="text-rose-600">*</span>
                                </label>
                                <Input
                                    id="edit-weekly-hours"
                                    type="number"
                                    min={1}
                                    max={40}
                                    step={1}
                                    value={editWeeklyHours}
                                    onChange={(e) => setEditWeeklyHours(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-foreground">
                                    {isId ? 'Status Pengampu' : 'Teacher Role'}
                                </label>
                                <Select
                                    value={editIsPrimary}
                                    onValueChange={(v) =>
                                        setEditIsPrimary(v as 'primary' | 'secondary')
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="primary">
                                            {isId
                                                ? 'Guru Pengampu Utama'
                                                : 'Primary Subject Teacher'}
                                        </SelectItem>
                                        <SelectItem value="secondary">
                                            {isId
                                                ? 'Guru Pendamping / Tim Teaching'
                                                : 'Co-Teacher / Team Teaching'}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <label
                                    htmlFor="edit-notes"
                                    className="text-xs font-semibold text-foreground"
                                >
                                    {isId ? 'Catatan (Opsional)' : 'Notes (Optional)'}
                                </label>
                                <Input
                                    id="edit-notes"
                                    type="text"
                                    maxLength={200}
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setEditingItem(null)}
                                    disabled={updateMutation.isPending}
                                >
                                    {isId ? 'Batal' : 'Cancel'}
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={updateMutation.isPending}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {updateMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {isId ? 'Simpan Perubahan' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: KONFIRMASI HAPUS */}
            {deletingItem && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-delete-assignment-title"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                    onClick={() => {
                        if (!deleteMutation.isPending) setDeletingItem(null);
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3
                            id="modal-delete-assignment-title"
                            className="text-lg font-semibold"
                        >
                            {isId
                                ? 'Hapus Penugasan Mengajar?'
                                : 'Remove Teaching Assignment?'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {isId ? (
                                <>
                                    Penugasan{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.subjectName}
                                    </strong>{' '}
                                    untuk{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.teacherName}
                                    </strong>{' '}
                                    di kelas{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.className}
                                    </strong>{' '}
                                    ({deletingItem.weeklyHours} JP) akan dihapus.
                                </>
                            ) : (
                                <>
                                    The assignment of{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.subjectName}
                                    </strong>{' '}
                                    for{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.teacherName}
                                    </strong>{' '}
                                    in class{' '}
                                    <strong className="text-foreground">
                                        {deletingItem.className}
                                    </strong>{' '}
                                    ({deletingItem.weeklyHours} JP) will be removed.
                                </>
                            )}
                        </p>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDeletingItem(null)}
                                disabled={deleteMutation.isPending}
                            >
                                {isId ? 'Batal' : 'Cancel'}
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => deleteMutation.mutate()}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {isId ? 'Ya, Hapus' : 'Yes, Remove'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TeacherSubjectAssignmentSection;