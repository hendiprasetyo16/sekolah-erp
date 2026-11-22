// src/modules/grades/pages/GradesAndReportPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Award,
    BookOpen,
    CheckCircle2,
    FileDown,
    Loader2,
    Lock,
    Plus,
    RefreshCw,
    Save,
    Sparkles,
    Trash2,
    Unlock,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { gradeService, type GradeSheetRow } from '../services/grade.service';
import { generateCurriculumMerdekaReportPdf } from '../utils/reportPdfGenerator';
import type {
    ClassRankingRow,
    ClassReportContext,
    ExtracurricularItem,
    GradeWeights,
    PromotionStatus,
    ReportExamMode,
    StudentReportNoteRecord,
    SubjectOption,
} from '../types/grade.types';

interface AcademicYearOption {
    id: string;
    name: string;
    isActive: boolean;
}

interface SemesterOption {
    id: string;
    academicYearId: string;
    type: 'GANJIL' | 'GENAP';
    isActive: boolean;
}

interface ClassOption {
    id: string;
    name: string;
    gradeLevel: number;
    major: string | null;
    homeroomTeacher: {
        id: string;
        fullName: string;
        nip: string | null;
    } | null;
}

type ActiveTab = 'INPUT_NILAI' | 'WALI_KELAS_RAPORT' | 'PERINGKAT_KELAS';

/**
 * Menentukan predikat huruf berdasarkan skor numerik (0-100)
 */
function calculatePredicate(score: number | null): string | null {
    if (score === null || Number.isNaN(score)) return null;
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    return 'D';
}

/**
 * Menghitung Nilai Akhir secara berbobot dari komponen Formatif, STS, dan SAS
 */
function computeWeightedFinalScore(
    formativeAvg: number | null,
    stsScore: number | null,
    sasScore: number | null,
    weights: GradeWeights
): number | null {
    const f = formativeAvg ?? 0;
    const sts = stsScore ?? 0;
    const sas = sasScore ?? 0;

    if (formativeAvg === null && stsScore === null && sasScore === null) {
        return null;
    }

    const totalWeight = weights.formative + weights.sts + weights.sas;
    if (totalWeight <= 0) return null;

    const raw =
        (f * weights.formative + sts * weights.sts + sas * weights.sas) / totalWeight;
    return Math.round(raw * 100) / 100;
}

export function GradesAndReportPage() {
    const { locale } = useTranslation();
    const { school, user } = useAuthStore();

    const isId = locale === 'id';
    const tr = (idText: string, enText: string) => (isId ? idText : enText);

    const schoolInfo = school as { id?: string; name?: string } | null;

    const initialRoles = useMemo(
        () =>
            Array.from(
                new Set([
                    ...((user as { roles?: string[] } | null)?.roles || []),
                    ...(user?.role ? [user.role] : []),
                ])
            ),
        [user]
    );

    const [resolvedSchoolId, setResolvedSchoolId] = useState<string>(
        schoolInfo?.id || user?.schoolId || ''
    );
    const [currentUserId, setCurrentUserId] = useState<string>(user?.id || '');
    const [effectiveRoles, setEffectiveRoles] = useState<string[]>(initialRoles);
    const teacherScope = useTeacherScope(resolvedSchoolId);

    const isSuperAdmin = useMemo(
        () => effectiveRoles.includes('SUPER_ADMIN'),
        [effectiveRoles]
    );

    const isStudentOrParentOnly = useMemo(
        () =>
            effectiveRoles.length > 0 &&
            effectiveRoles.every((role) => role === 'SISWA' || role === 'ORANG_TUA'),
        [effectiveRoles]
    );

    // Sinkronisasi Role Multi-Role & SchoolId aktif (selaras dengan StudentListPage)
    useEffect(() => {
        let mounted = true;
        async function resolvePermissions() {
            try {
                const {
                    data: { user: authUser },
                } = await supabase.auth.getUser();
                if (!authUser) return;

                const [{ data: profile }, { data: allRoles }] = await Promise.all([
                    supabase
                        .from('users')
                        .select('schoolId, role')
                        .eq('id', authUser.id)
                        .maybeSingle(),
                    supabase.rpc('get_user_all_roles'),
                ]);

                const mergedRoles: string[] = Array.from(
                    new Set([
                        ...(Array.isArray(allRoles) ? (allRoles as string[]) : []),
                        ...(profile?.role ? [profile.role] : []),
                        ...initialRoles,
                    ])
                );

                if (!mounted) return;
                setCurrentUserId(authUser.id);
                setEffectiveRoles(mergedRoles);
                setResolvedSchoolId(
                    schoolInfo?.id || profile?.schoolId || user?.schoolId || ''
                );
            } catch {
                if (mounted) {
                    setResolvedSchoolId(schoolInfo?.id || user?.schoolId || '');
                }
            }
        }
        resolvePermissions();
        return () => {
            mounted = false;
        };
    }, [schoolInfo?.id, user?.schoolId, initialRoles]);

    const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>('INPUT_NILAI');
    const [loadingInit, setLoadingInit] = useState<boolean>(true);
    const [loadingSheet, setLoadingSheet] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    // Filter Master Akademik
    const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
    const [semesters, setSemesters] = useState<SemesterOption[]>([]);
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);

    const [selectedYearId, setSelectedYearId] = useState<string>('');
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

    // Bobot Nilai Dinamis (Default: 40% Formatif, 30% STS, 30% SAS)
    const [weights, setWeights] = useState<GradeWeights>({
        formative: 40,
        sts: 30,
        sas: 30,
    });

    // State Tab 1: Nilai Mata Pelajaran
    const [gradeRows, setGradeRows] = useState<GradeSheetRow[]>([]);

    // State Tab 2: Catatan Wali Kelas & Raport
    const [reportNotesMap, setReportNotesMap] = useState<
        Map<string, StudentReportNoteRecord>
    >(() => new Map());
    const [selectedStudentForNote, setSelectedStudentForNote] =
        useState<string>('');
    const [printingStudentId, setPrintingStudentId] = useState<string | null>(
        null
    );

    // State Tab 3: Peringkat Kelas
    const [rankingMode, setRankingMode] = useState<ReportExamMode>('SAS');
    const [rankings, setRankings] = useState<ClassRankingRow[]>([]);

    // Saring daftar kelas apabila user adalah Wali Kelas jenjang SD
    const visibleClasses = useMemo(() => {
        if (teacherScope.isElementaryHomeroomRestricted) {
            return classes.filter((c) =>
                teacherScope.homeroomClassIds.includes(String(c.id))
            );
        }
        return classes;
    }, [
        classes,
        teacherScope.isElementaryHomeroomRestricted,
        teacherScope.homeroomClassIds,
    ]);

    // ==========================================================================
    // 1. MUAT DATA MASTER & PROFIL GURU AKTIF
    // ==========================================================================
    useEffect(() => {
        let isMounted = true;
        async function fetchMasterFilters() {
            if (!resolvedSchoolId) {
                setLoadingInit(false);
                return;
            }
            setLoadingInit(true);
            try {
                const [ayRes, semRes, clsRes, subjRes, teacherRes] = await Promise.all([
                    supabase
                        .from('academic_years')
                        .select('id, name, isActive')
                        .eq('schoolId', resolvedSchoolId)
                        .order('startYear', { ascending: false }),
                    supabase
                        .from('semesters')
                        .select('id, academicYearId, type, isActive')
                        .eq('schoolId', resolvedSchoolId),
                    supabase
                        .from('classes')
                        .select(
                            'id, name, gradeLevel, major, homeroomTeacher:teachers(id, fullName, nip)'
                        )
                        .eq('schoolId', resolvedSchoolId)
                        .order('gradeLevel', { ascending: true })
                        .order('name', { ascending: true }),
                    supabase
                        .from('subjects')
                        .select('id, code, name, category, sortOrder')
                        .eq('schoolId', resolvedSchoolId)
                        .eq('isActive', true)
                        .order('sortOrder', { ascending: true })
                        .order('name', { ascending: true }),
                    currentUserId
                        ? supabase
                            .from('teachers')
                            .select('id')
                            .eq('schoolId', resolvedSchoolId)
                            .eq('userId', currentUserId)
                            .maybeSingle()
                        : Promise.resolve({ data: null, error: null }),
                ]);

                if (!isMounted) return;

                if (teacherRes.data?.id) {
                    setCurrentTeacherId(String(teacherRes.data.id));
                }

                const ayList = (ayRes.data ?? []) as AcademicYearOption[];
                const semList = (semRes.data ?? []) as SemesterOption[];
                const clsList = (clsRes.data ?? []).map((c: Record<string, unknown>) => {
                    const rawTeacher = Array.isArray(c.homeroomTeacher)
                        ? c.homeroomTeacher[0]
                        : c.homeroomTeacher;
                    return {
                        id: String(c.id),
                        name: String(c.name),
                        gradeLevel: Number(c.gradeLevel),
                        major: c.major ? String(c.major) : null,
                        homeroomTeacher: rawTeacher
                            ? {
                                id: String((rawTeacher as Record<string, unknown>).id),
                                fullName: String(
                                    (rawTeacher as Record<string, unknown>).fullName
                                ),
                                nip: (rawTeacher as Record<string, unknown>).nip
                                    ? String((rawTeacher as Record<string, unknown>).nip)
                                    : null,
                            }
                            : null,
                    };
                });
                const subjList = (subjRes.data ?? []) as SubjectOption[];

                setAcademicYears(ayList);
                setSemesters(semList);
                setClasses(clsList);
                setSubjects(subjList);

                const activeYear = ayList.find((y) => y.isActive) ?? ayList[0];
                if (activeYear) {
                    setSelectedYearId(activeYear.id);
                    const activeSem =
                        semList.find(
                            (s) => s.academicYearId === activeYear.id && s.isActive
                        ) ?? semList.find((s) => s.academicYearId === activeYear.id);
                    if (activeSem) setSelectedSemesterId(activeSem.id);
                }
                if (clsList[0]) setSelectedClassId(clsList[0].id);
                if (subjList[0]) setSelectedSubjectId(subjList[0].id);
            } catch (err) {
                if (isMounted) {
                    const msg =
                        err instanceof Error
                            ? err.message
                            : tr(
                                'Gagal memuat filter akademik.',
                                'Failed to load academic filters.'
                            );
                    setFeedback({ type: 'error', text: msg });
                    toast.error(msg);
                }
            } finally {
                if (isMounted) setLoadingInit(false);
            }
        }

        fetchMasterFilters();
        return () => {
            isMounted = false;
        };
    }, [resolvedSchoolId, currentUserId, isId]);

    useEffect(() => {
        if (
            visibleClasses.length > 0 &&
            !visibleClasses.some((c) => c.id === selectedClassId)
        ) {
            setSelectedClassId(visibleClasses[0].id);
        }
    }, [visibleClasses, selectedClassId]);

    const filteredSemesters = useMemo(
        () => semesters.filter((s) => s.academicYearId === selectedYearId),
        [semesters, selectedYearId]
    );

    // ==========================================================================
    // 2. MUAT LEMBAR NILAI & CATATAN RAPORT SAAT FILTER BERUBAH
    // ==========================================================================
    const loadClassGradeAndReportData = useCallback(async () => {
        if (
            !resolvedSchoolId ||
            !selectedYearId ||
            !selectedSemesterId ||
            !selectedClassId
        ) {
            return;
        }

        setLoadingSheet(true);
        setFeedback(null);
        try {
            const [sheetRes, notesRes] = await Promise.all([
                selectedSubjectId
                    ? gradeService.getSubjectGradeSheet({
                        schoolId: resolvedSchoolId,
                        academicYearId: selectedYearId,
                        semesterId: selectedSemesterId,
                        classId: selectedClassId,
                        subjectId: selectedSubjectId,
                        teacherId: currentTeacherId,
                    })
                    : Promise.resolve({
                        success: true,
                        data: [] as GradeSheetRow[],
                        message: '',
                    }),
                gradeService.getClassReportNotes({
                    schoolId: resolvedSchoolId,
                    academicYearId: selectedYearId,
                    semesterId: selectedSemesterId,
                    classId: selectedClassId,
                }),
            ]);

            setGradeRows(sheetRes.data);
            setReportNotesMap(notesRes.data);
            if (sheetRes.data.length > 0) {
                setSelectedStudentForNote((prev) => prev || sheetRes.data[0].student.id);
            }
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr(
                        'Gagal memuat data nilai kelas.',
                        'Failed to load class grade data.'
                    );
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setLoadingSheet(false);
        }
    }, [
        resolvedSchoolId,
        selectedYearId,
        selectedSemesterId,
        selectedClassId,
        selectedSubjectId,
        currentTeacherId,
        isId,
    ]);

    useEffect(() => {
        loadClassGradeAndReportData();
    }, [loadClassGradeAndReportData]);

    // ==========================================================================
    // 3. MUAT PERINGKAT KELAS (TAB 3)
    // ==========================================================================
    const loadRankings = useCallback(async () => {
        if (
            isStudentOrParentOnly ||
            !resolvedSchoolId ||
            !selectedSemesterId ||
            !selectedClassId ||
            activeTab !== 'PERINGKAT_KELAS'
        ) {
            return;
        }
        setLoadingSheet(true);
        try {
            const res = await gradeService.getClassRankings({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
                examType: rankingMode,
            });
            setRankings(res.data);
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr('Gagal memuat peringkat kelas.', 'Failed to load class rankings.');
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setLoadingSheet(false);
        }
    }, [
        isStudentOrParentOnly,
        resolvedSchoolId,
        selectedSemesterId,
        selectedClassId,
        activeTab,
        rankingMode,
        isId,
    ]);

    useEffect(() => {
        loadRankings();
    }, [loadRankings]);

    // ==========================================================================
    // 4. LOGIKA HITUNG BOBOT & EDIT MANUAL NILAI AKHIR
    // ==========================================================================
    const handleWeightChange = (field: keyof GradeWeights, value: number) => {
        const safeVal = Math.max(0, Math.min(100, Number.isNaN(value) ? 0 : value));
        const nextWeights = { ...weights, [field]: safeVal };
        setWeights(nextWeights);

        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.isManualFinalScore) return row;
                const recalculated = computeWeightedFinalScore(
                    row.grade.formativeAvg,
                    row.grade.stsScore,
                    row.grade.sasScore,
                    nextWeights
                );
                return {
                    ...row,
                    grade: {
                        ...row.grade,
                        finalScore: recalculated,
                        predicate: calculatePredicate(recalculated),
                    },
                };
            })
        );
    };

    const handleScoreComponentChange = (
        studentId: string,
        field: 'formativeAvg' | 'stsScore' | 'sasScore',
        rawValue: string
    ) => {
        const parsed =
            rawValue.trim() === ''
                ? null
                : Math.max(0, Math.min(100, Number(rawValue)));
        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.student.id !== studentId) return row;
                const updatedGrade = {
                    ...row.grade,
                    [field]: parsed !== null && Number.isNaN(parsed) ? null : parsed,
                };

                if (!row.isManualFinalScore) {
                    const autoFinal = computeWeightedFinalScore(
                        updatedGrade.formativeAvg,
                        updatedGrade.stsScore,
                        updatedGrade.sasScore,
                        weights
                    );
                    updatedGrade.finalScore = autoFinal;
                    updatedGrade.predicate = calculatePredicate(autoFinal);
                }

                return {
                    ...row,
                    grade: updatedGrade,
                };
            })
        );
    };

    const handleManualFinalScoreChange = (
        studentId: string,
        rawValue: string
    ) => {
        const parsed =
            rawValue.trim() === ''
                ? null
                : Math.max(0, Math.min(100, Number(rawValue)));
        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.student.id !== studentId) return row;
                const cleanVal =
                    parsed !== null && Number.isNaN(parsed) ? null : parsed;
                return {
                    ...row,
                    isManualFinalScore: true,
                    grade: {
                        ...row.grade,
                        finalScore: cleanVal,
                        predicate: calculatePredicate(cleanVal),
                    },
                };
            })
        );
    };

    const toggleManualLock = (studentId: string) => {
        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.student.id !== studentId) return row;
                const nextManual = !row.isManualFinalScore;
                if (!nextManual) {
                    const autoFinal = computeWeightedFinalScore(
                        row.grade.formativeAvg,
                        row.grade.stsScore,
                        row.grade.sasScore,
                        weights
                    );
                    return {
                        ...row,
                        isManualFinalScore: false,
                        grade: {
                            ...row.grade,
                            finalScore: autoFinal,
                            predicate: calculatePredicate(autoFinal),
                        },
                    };
                }
                return { ...row, isManualFinalScore: true };
            })
        );
    };

    const handleDescriptionChange = (
        studentId: string,
        field: 'stsCompetencyDescription' | 'competencyDescription',
        value: string
    ) => {
        setGradeRows((prev) =>
            prev.map((row) =>
                row.student.id === studentId
                    ? { ...row, grade: { ...row.grade, [field]: value } }
                    : row
            )
        );
    };

    const handleAutoGenerateDescriptions = () => {
        const subjectName =
            subjects.find((s) => s.id === selectedSubjectId)?.name ??
            'mata pelajaran ini';
        setGradeRows((prev) =>
            prev.map((row) => {
                const score =
                    row.grade.finalScore ?? row.grade.stsScore ?? row.grade.formativeAvg;
                if (score === null) return row;

                let levelPhrase = 'menunjukkan penguasaan yang baik';
                if (score >= 90)
                    levelPhrase =
                        'menunjukkan penguasaan yang sangat baik dan melampaui ekspektasi';
                else if (score >= 80) levelPhrase = 'menunjukkan penguasaan yang baik';
                else if (score >= 70)
                    levelPhrase =
                        'cukup menguasai materi dasar, namun perlu penguatan latihan';
                else
                    levelPhrase =
                        'memerlukan bimbingan intensif dalam memahami konsep dasar';

                const generated = `Ananda ${row.student.fullName} ${levelPhrase} pada kompetensi ${subjectName}.`;
                return {
                    ...row,
                    grade: {
                        ...row.grade,
                        stsCompetencyDescription:
                            row.grade.stsCompetencyDescription || generated,
                        competencyDescription: generated,
                    },
                };
            })
        );
        const msg = tr(
            'Template deskripsi capaian kompetensi berhasil dibuat otomatis.',
            'Competency descriptions generated automatically.'
        );
        setFeedback({ type: 'success', text: msg });
        toast.success(msg);
    };

    const handleSaveAllGrades = async () => {
        const totalWeight = weights.formative + weights.sts + weights.sas;
        if (totalWeight !== 100) {
            const msg = tr(
                `Total bobot saat ini ${totalWeight}%. Pastikan jumlah bobot Formatif + STS + SAS sama dengan 100%.`,
                `Current total weight is ${totalWeight}%. Ensure Formative + STS + SAS equals 100%.`
            );
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
            return;
        }

        setSaving(true);
        setFeedback(null);
        try {
            const payload = gradeRows.map((r) => r.grade);
            const res = await gradeService.saveSubjectGradesBatch(payload);
            setFeedback({ type: 'success', text: res.message });
            toast.success(res.message);
            await loadClassGradeAndReportData();
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr('Gagal menyimpan nilai.', 'Failed to save grades.');
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    // ==========================================================================
    // 5. HANDLER TAB WALI KELAS, ABSENSI & CETAK PDF RAPORT
    // ==========================================================================
    const currentStudentNote: StudentReportNoteRecord = useMemo(() => {
        const existing = reportNotesMap.get(selectedStudentForNote);
        if (existing) return existing;
        return {
            schoolId: resolvedSchoolId,
            academicYearId: selectedYearId,
            semesterId: selectedSemesterId,
            classId: selectedClassId,
            studentId: selectedStudentForNote,
            extracurriculars: [],
            cocurricularNote: '',
            stsHomeroomNote: '',
            homeroomNote: '',
            stsSickDays: 0,
            stsPermissionDays: 0,
            stsAlphaDays: 0,
            sickDays: 0,
            permissionDays: 0,
            alphaDays: 0,
            promotionStatus: 'PROSES',
            reportDateSts: new Date().toISOString().slice(0, 10),
            reportDateSas: new Date().toISOString().slice(0, 10),
            isStsPublished: false,
            isSasPublished: false,
        };
    }, [
        reportNotesMap,
        selectedStudentForNote,
        resolvedSchoolId,
        selectedYearId,
        selectedSemesterId,
        selectedClassId,
    ]);

    const updateActiveStudentNote = (patch: Partial<StudentReportNoteRecord>) => {
        if (!selectedStudentForNote) return;
        setReportNotesMap((prev) => {
            const next = new Map(prev);
            next.set(selectedStudentForNote, { ...currentStudentNote, ...patch });
            return next;
        });
    };

    const handleAddExtracurricular = () => {
        const nextList: ExtracurricularItem[] = [
            ...currentStudentNote.extracurriculars,
            { name: '', predicate: 'Baik', description: '' },
        ];
        updateActiveStudentNote({ extracurriculars: nextList });
    };

    const handleSaveReportNote = async () => {
        if (!selectedStudentForNote) return;
        setSaving(true);
        setFeedback(null);
        try {
            const res = await gradeService.saveStudentReportNote(
                currentStudentNote,
                currentUserId
            );
            setReportNotesMap((prev) => {
                const next = new Map(prev);
                next.set(selectedStudentForNote, currentStudentNote);
                return next;
            });
            setFeedback({ type: 'success', text: res.message });
            toast.success(res.message);
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr('Gagal menyimpan catatan raport.', 'Failed to save report notes.');
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleSyncAttendance = async () => {
        if (!resolvedSchoolId || !selectedSemesterId || !selectedClassId) return;
        setSaving(true);
        setFeedback(null);
        try {
            const res = await gradeService.syncAttendanceFromDaily({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
            });
            setFeedback({ type: 'success', text: res.message });
            toast.success(res.message);
            await loadClassGradeAndReportData();
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr('Gagal sinkronisasi absensi.', 'Failed to sync attendance.');
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handlePrintStudentPdf = async (
        studentId: string,
        mode: ReportExamMode
    ) => {
        const targetRow = gradeRows.find((r) => r.student.id === studentId);
        const activeClass = visibleClasses.find((c) => c.id === selectedClassId);
        const activeYear = academicYears.find((y) => y.id === selectedYearId);
        const activeSem = semesters.find((s) => s.id === selectedSemesterId);

        if (!targetRow || !activeClass || !activeYear || !activeSem) {
            const msg = tr(
                'Data kelas atau siswa belum lengkap untuk dicetak.',
                'Class or student data is incomplete for printing.'
            );
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
            return;
        }

        setPrintingStudentId(`${studentId}-${mode}`);
        setFeedback(null);
        try {
            const bundleRes = await gradeService.getStudentCompleteReportBundle({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                studentId,
            });

            const classContext: ClassReportContext = {
                classId: activeClass.id,
                className: activeClass.name,
                gradeLevel: activeClass.gradeLevel,
                major: activeClass.major,
                academicYearName: activeYear.name,
                semesterType: activeSem.type,
                homeroomTeacherName:
                    activeClass.homeroomTeacher?.fullName ?? 'Wali Kelas',
                homeroomTeacherNip: activeClass.homeroomTeacher?.nip ?? null,
            };

            const noteRecord = reportNotesMap.get(studentId) ?? {
                ...currentStudentNote,
                studentId,
            };

            await generateCurriculumMerdekaReportPdf({
                mode,
                school: bundleRes.data.school,
                classContext,
                student: targetRow.student,
                subjects: bundleRes.data.subjects,
                grades: bundleRes.data.grades,
                reportNote: noteRecord,
                achievements: bundleRes.data.achievements,
            });

            const msg = tr(
                `PDF Raport ${mode} untuk ${targetRow.student.fullName} berhasil diunduh.`,
                `${mode} Report PDF for ${targetRow.student.fullName} downloaded.`
            );
            setFeedback({ type: 'success', text: msg });
            toast.success(msg);
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : tr('Gagal mencetak PDF raport.', 'Failed to generate report PDF.');
            setFeedback({ type: 'error', text: msg });
            toast.error(msg);
        } finally {
            setPrintingStudentId(null);
        }
    };

    if (loadingInit) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
                <p className="text-sm text-muted-foreground">
                    {tr(
                        'Memuat data akademik Modul Nilai & Raport...',
                        'Loading Grades & Report academic data...'
                    )}
                </p>
            </div>
        );
    }

    const totalWeight = weights.formative + weights.sts + weights.sas;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header Halaman */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm md:flex-row md:items-center">
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        {tr(
                            'Nilai & Raport Kurikulum Merdeka',
                            'Curriculum Merdeka Grades & Reports'
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {tr(
                            'Kelola asesmen formatif, STS, SAS, deskripsi capaian kompetensi, serta cetak PDF Raport.',
                            'Manage formative, mid-term, final assessments, competency descriptions, and PDF reports.'
                        )}
                    </p>
                </div>

                {/* Navigasi Tab */}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('INPUT_NILAI')}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                            activeTab === 'INPUT_NILAI'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-muted/60 text-foreground hover:bg-muted'
                        )}
                    >
                        <BookOpen className="h-4 w-4" />
                        {tr('Input Nilai Mapel', 'Subject Grades')}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('WALI_KELAS_RAPORT')}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                            activeTab === 'WALI_KELAS_RAPORT'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-muted/60 text-foreground hover:bg-muted'
                        )}
                    >
                        <Users className="h-4 w-4" />
                        {tr('Wali Kelas & Cetak Raport', 'Homeroom & Print Report')}
                    </button>

                    {!isStudentOrParentOnly && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('PERINGKAT_KELAS')}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                                activeTab === 'PERINGKAT_KELAS'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-muted/60 text-foreground hover:bg-muted'
                            )}
                        >
                            <Award className="h-4 w-4" />
                            {tr('Peringkat Kelas', 'Class Rankings')}
                        </button>
                    )}
                </div>
            </div>

            {/* Peringatan Super Admin Lintas Sekolah */}
            {isSuperAdmin && !resolvedSchoolId && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        <p className="font-semibold">
                            {tr(
                                'Mode Super Admin Lintas Sekolah',
                                'Cross-School Super Admin Mode'
                            )}
                        </p>
                        <p className="mt-0.5">
                            {tr(
                                'Pilih sekolah aktif terlebih dahulu pada switcher sekolah sebelum mengelola nilai dan raport.',
                                'Select an active school from the school switcher before managing grades and reports.'
                            )}
                        </p>
                    </div>
                </div>
            )}

            {/* Filter Bar Global */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                        {tr('Tahun Ajaran', 'Academic Year')}
                    </label>
                    <select
                        value={selectedYearId}
                        onChange={(e) => {
                            const nextYear = e.target.value;
                            setSelectedYearId(nextYear);
                            const firstSem = semesters.find(
                                (s) => s.academicYearId === nextYear
                            );
                            if (firstSem) setSelectedSemesterId(firstSem.id);
                        }}
                        className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                    >
                        {academicYears.map((y) => (
                            <option key={y.id} value={y.id}>
                                {y.name} {y.isActive ? '(Aktif)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                        {tr('Semester', 'Semester')}
                    </label>
                    <select
                        value={selectedSemesterId}
                        onChange={(e) => setSelectedSemesterId(e.target.value)}
                        className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                    >
                        {filteredSemesters.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.type} {s.isActive ? '(Aktif)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                        {tr('Kelas', 'Class')}
                    </label>
                    <select
                        value={selectedClassId}
                        onChange={(e) => {
                            setSelectedClassId(e.target.value);
                            setSelectedStudentForNote('');
                        }}
                        className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                    >
                        {visibleClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                {activeTab === 'INPUT_NILAI' && (
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                            {tr('Mata Pelajaran', 'Subject')}
                        </label>
                        <select
                            value={selectedSubjectId}
                            onChange={(e) => setSelectedSubjectId(e.target.value)}
                            className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
                        >
                            {subjects.map((subj) => (
                                <option key={subj.id} value={subj.id}>
                                    {subj.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Notifikasi Status */}
            {feedback && (
                <div
                    className={cn(
                        'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm',
                        feedback.type === 'success'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    )}
                >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{feedback.text}</span>
                </div>
            )}

            {/* ==================================================================== */}
            {/* TAB 1: INPUT NILAI MAPEL (BOBOT OTOMATIS + EDIT MANUAL)              */}
            {/* ==================================================================== */}
            {activeTab === 'INPUT_NILAI' && (
                <div className="space-y-4">
                    <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/50 bg-card p-4 shadow-sm lg:flex-row lg:items-center">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-semibold text-foreground">
                                {tr('Bobot Nilai Akhir:', 'Final Score Weights:')}
                            </span>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                Formatif (%)
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={weights.formative}
                                    onChange={(e) =>
                                        handleWeightChange('formative', Number(e.target.value))
                                    }
                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center font-semibold text-foreground"
                                />
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                STS (%)
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={weights.sts}
                                    onChange={(e) =>
                                        handleWeightChange('sts', Number(e.target.value))
                                    }
                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center font-semibold text-foreground"
                                />
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                SAS (%)
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={weights.sas}
                                    onChange={(e) =>
                                        handleWeightChange('sas', Number(e.target.value))
                                    }
                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center font-semibold text-foreground"
                                />
                            </label>
                            <span
                                className={cn(
                                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                    totalWeight === 100
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                )}
                            >
                                Total: {totalWeight}%
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleAutoGenerateDescriptions}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-500/20 dark:text-teal-300"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                {tr('Buat Deskripsi Otomatis', 'Auto-Generate Descriptions')}
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={handleSaveAllGrades}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <Save className="h-3.5 w-3.5" />
                                {saving
                                    ? tr('Menyimpan...', 'Saving...')
                                    : tr('Simpan Semua Nilai', 'Save All Grades')}
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm">
                        <table className="min-w-full divide-y divide-border/50 text-sm">
                            <thead className="bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-3 text-center">No</th>
                                    <th className="px-3 py-3 text-left">
                                        {tr('Nama Peserta Didik', 'Student Name')}
                                    </th>
                                    <th className="px-2 py-3 text-center">Rata2 Formatif</th>
                                    <th className="px-2 py-3 text-center">Nilai STS</th>
                                    <th className="px-2 py-3 text-center">Nilai SAS</th>
                                    <th className="px-2 py-3 text-center">
                                        Nilai Akhir (Auto / Manual)
                                    </th>
                                    <th className="px-2 py-3 text-center">Predikat</th>
                                    <th className="px-3 py-3 text-left">
                                        Deskripsi Capaian Kompetensi (SAS)
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {loadingSheet ? (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="py-8 text-center text-muted-foreground"
                                        >
                                            <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-2" />
                                            {tr('Memuat daftar siswa...', 'Loading students...')}
                                        </td>
                                    </tr>
                                ) : gradeRows.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={8}
                                            className="py-8 text-center text-muted-foreground"
                                        >
                                            {tr(
                                                'Tidak ada siswa aktif di kelas ini.',
                                                'No active students in this class.'
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    gradeRows.map((row, idx) => (
                                        <tr
                                            key={row.student.id}
                                            className="hover:bg-muted/30 transition-colors"
                                        >
                                            <td className="px-3 py-2.5 text-center text-muted-foreground">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-foreground">
                                                    {row.student.fullName}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    NISN: {row.student.nisn}
                                                </div>
                                            </td>

                                            <td className="px-2 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={row.grade.formativeAvg ?? ''}
                                                    onChange={(e) =>
                                                        handleScoreComponentChange(
                                                            row.student.id,
                                                            'formativeAvg',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                                                    placeholder="-"
                                                />
                                            </td>

                                            <td className="px-2 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={row.grade.stsScore ?? ''}
                                                    onChange={(e) =>
                                                        handleScoreComponentChange(
                                                            row.student.id,
                                                            'stsScore',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                                                    placeholder="-"
                                                />
                                            </td>

                                            <td className="px-2 py-2.5 text-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={row.grade.sasScore ?? ''}
                                                    onChange={(e) =>
                                                        handleScoreComponentChange(
                                                            row.student.id,
                                                            'sasScore',
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                                                    placeholder="-"
                                                />
                                            </td>

                                            <td className="px-2 py-2.5 text-center">
                                                <div className="inline-flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={row.grade.finalScore ?? ''}
                                                        onChange={(e) =>
                                                            handleManualFinalScoreChange(
                                                                row.student.id,
                                                                e.target.value
                                                            )
                                                        }
                                                        className={cn(
                                                            'w-20 rounded border px-2 py-1 text-center text-sm font-bold',
                                                            row.isManualFinalScore
                                                                ? 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                                                : 'border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                        )}
                                                        placeholder="-"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleManualLock(row.student.id)}
                                                        title={
                                                            row.isManualFinalScore
                                                                ? 'Mode Manual Aktif (Klik untuk kembalikan ke hitung bobot otomatis)'
                                                                : 'Mode Otomatis Berbobot (Klik untuk kunci/edit manual)'
                                                        }
                                                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                                                    >
                                                        {row.isManualFinalScore ? (
                                                            <Lock className="h-3.5 w-3.5 text-amber-600" />
                                                        ) : (
                                                            <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>

                                            <td className="px-2 py-2.5 text-center">
                                                <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                                                    {row.grade.predicate ?? '-'}
                                                </span>
                                            </td>

                                            <td className="px-3 py-2.5">
                                                <textarea
                                                    rows={2}
                                                    value={row.grade.competencyDescription ?? ''}
                                                    onChange={(e) =>
                                                        handleDescriptionChange(
                                                            row.student.id,
                                                            'competencyDescription',
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="Deskripsi capaian kompetensi akhir..."
                                                    className="w-full min-w-60 rounded border border-border bg-background p-1.5 text-xs text-foreground"
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* TAB 2: WALI KELAS, ABSENSI, PUBLIKASI & CETAK PDF RAPORT             */}
            {/* ==================================================================== */}
            {activeTab === 'WALI_KELAS_RAPORT' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="space-y-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-foreground">
                                {tr('Daftar Siswa & Cetak PDF', 'Student List & PDF Print')}
                            </h2>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={handleSyncAttendance}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                                title="Tarik data Sakit, Izin, Alpa dari presensi harian"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {tr('Sinkron Absensi', 'Sync Attendance')}
                            </button>
                        </div>

                        <div className="max-h-135 divide-y divide-border/50 overflow-y-auto">
                            {gradeRows.map((row) => {
                                const isSelected = row.student.id === selectedStudentForNote;
                                return (
                                    <div
                                        key={row.student.id}
                                        onClick={() => setSelectedStudentForNote(row.student.id)}
                                        className={cn(
                                            'cursor-pointer rounded-lg p-3 transition',
                                            isSelected
                                                ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                                                : 'hover:bg-muted/40'
                                        )}
                                    >
                                        <div className="font-semibold text-foreground">
                                            {row.student.fullName}
                                        </div>
                                        <div className="mb-2 text-xs text-muted-foreground">
                                            NISN: {row.student.nisn}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={
                                                    printingStudentId === `${row.student.id}-STS`
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintStudentPdf(row.student.id, 'STS');
                                                }}
                                                className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                            >
                                                <FileDown className="h-3.5 w-3.5" />
                                                PDF STS
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    printingStudentId === `${row.student.id}-SAS`
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintStudentPdf(row.student.id, 'SAS');
                                                }}
                                                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                <FileDown className="h-3.5 w-3.5" />
                                                PDF SAS
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-5 rounded-xl border border-border/50 bg-card p-5 shadow-sm lg:col-span-2">
                        {!selectedStudentForNote ? (
                            <p className="text-sm text-muted-foreground">
                                {tr(
                                    'Pilih siswa di sebelah kiri untuk mengisi raport.',
                                    'Select a student on the left to edit their report.'
                                )}
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                                    <div>
                                        <h2 className="text-base font-bold text-foreground">
                                            Detail Raport:{' '}
                                            {
                                                gradeRows.find(
                                                    (r) => r.student.id === selectedStudentForNote
                                                )?.student.fullName
                                            }
                                        </h2>
                                        <p className="text-xs text-muted-foreground">
                                            Isi catatan wali kelas, ekstrakurikuler, rekap
                                            ketidakhadiran, dan status publikasi.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={handleSaveReportNote}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                        {tr('Simpan Raport Siswa', 'Save Student Report')}
                                    </button>
                                </div>

                                {/* Ekstrakurikuler */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold uppercase text-foreground">
                                            Kegiatan Ekstrakurikuler
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleAddExtracurricular}
                                            className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/80"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Tambah Ekskul
                                        </button>
                                    </div>

                                    {currentStudentNote.extracurriculars.map((ex, i) => (
                                        <div
                                            key={i}
                                            className="grid grid-cols-1 gap-2 sm:grid-cols-12"
                                        >
                                            <input
                                                type="text"
                                                placeholder="Nama Ekskul (mis. Hizbul Wathan)"
                                                value={ex.name}
                                                onChange={(e) => {
                                                    const list = [...currentStudentNote.extracurriculars];
                                                    list[i] = { ...list[i], name: e.target.value };
                                                    updateActiveStudentNote({ extracurriculars: list });
                                                }}
                                                className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground sm:col-span-4"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Predikat (Sangat Baik / Baik)"
                                                value={ex.predicate}
                                                onChange={(e) => {
                                                    const list = [...currentStudentNote.extracurriculars];
                                                    list[i] = { ...list[i], predicate: e.target.value };
                                                    updateActiveStudentNote({ extracurriculars: list });
                                                }}
                                                className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground sm:col-span-3"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Keterangan capaian"
                                                value={ex.description}
                                                onChange={(e) => {
                                                    const list = [...currentStudentNote.extracurriculars];
                                                    list[i] = {
                                                        ...list[i],
                                                        description: e.target.value,
                                                    };
                                                    updateActiveStudentNote({ extracurriculars: list });
                                                }}
                                                className="rounded border border-border bg-background px-2.5 py-1.5 text-xs text-foreground sm:col-span-4"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const list =
                                                        currentStudentNote.extracurriculars.filter(
                                                            (_, idx) => idx !== i
                                                        );
                                                    updateActiveStudentNote({ extracurriculars: list });
                                                }}
                                                className="inline-flex items-center justify-center rounded bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 sm:col-span-1"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Catatan Kokurikuler & Wali Kelas */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-bold text-foreground">
                                            Catatan Wali Kelas (STS / Tengah Semester)
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={currentStudentNote.stsHomeroomNote ?? ''}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    stsHomeroomNote: e.target.value,
                                                })
                                            }
                                            className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-bold text-foreground">
                                            Catatan Wali Kelas (SAS / Akhir Semester)
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={currentStudentNote.homeroomNote ?? ''}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    homeroomNote: e.target.value,
                                                })
                                            }
                                            className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-bold text-foreground">
                                        Catatan Kokurikuler / Projek P5 (Raport Akhir)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={currentStudentNote.cocurricularNote ?? ''}
                                        onChange={(e) =>
                                            updateActiveStudentNote({
                                                cocurricularNote: e.target.value,
                                            })
                                        }
                                        className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground"
                                    />
                                </div>

                                {/* Rekap Ketidakhadiran STS & SAS */}
                                <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-6">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Sakit STS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.stsSickDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    stsSickDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Izin STS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.stsPermissionDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    stsPermissionDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Alpa STS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.stsAlphaDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    stsAlphaDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Sakit SAS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.sickDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    sickDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Izin SAS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.permissionDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    permissionDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-muted-foreground">
                                            Alpa SAS
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={currentStudentNote.alphaDays}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    alphaDays: Number(e.target.value) || 0,
                                                })
                                            }
                                            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                        />
                                    </div>
                                </div>

                                {/* Keputusan Kenaikan, Tanggal Cetak & Publikasi */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-bold text-foreground">
                                            Keputusan Kenaikan / Kelulusan
                                        </label>
                                        <select
                                            value={currentStudentNote.promotionStatus}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    promotionStatus: e.target.value as PromotionStatus,
                                                })
                                            }
                                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                                        >
                                            <option value="PROSES">Dalam Proses Semester</option>
                                            <option value="NAIK_KELAS">Naik Kelas</option>
                                            <option value="TINGGAL_KELAS">Tinggal Kelas</option>
                                            <option value="LULUS">Lulus Satuan Pendidikan</option>
                                            <option value="TIDAK_LULUS">Tidak Lulus</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-bold text-foreground">
                                            Tanggal Raport STS
                                        </label>
                                        <input
                                            type="date"
                                            value={currentStudentNote.reportDateSts ?? ''}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    reportDateSts: e.target.value,
                                                })
                                            }
                                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-bold text-foreground">
                                            Tanggal Raport SAS
                                        </label>
                                        <input
                                            type="date"
                                            value={currentStudentNote.reportDateSas ?? ''}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    reportDateSas: e.target.value,
                                                })
                                            }
                                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                                        />
                                    </div>
                                </div>

                                {/* Saklar Publikasi ke Akun Siswa & Orang Tua */}
                                <div className="flex flex-wrap gap-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                                        <input
                                            type="checkbox"
                                            checked={currentStudentNote.isStsPublished}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    isStsPublished: e.target.checked,
                                                })
                                            }
                                            className="h-4 w-4 rounded accent-emerald-600"
                                        />
                                        Publikasikan Raport STS ke Siswa & Orang Tua
                                    </label>

                                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                                        <input
                                            type="checkbox"
                                            checked={currentStudentNote.isSasPublished}
                                            onChange={(e) =>
                                                updateActiveStudentNote({
                                                    isSasPublished: e.target.checked,
                                                })
                                            }
                                            className="h-4 w-4 rounded accent-emerald-600"
                                        />
                                        Publikasikan Raport SAS ke Siswa & Orang Tua
                                    </label>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* TAB 3: PERINGKAT KELAS KHUSUS GURU & WALI KELAS (RPC)                */}
            {/* ==================================================================== */}
            {activeTab === 'PERINGKAT_KELAS' && !isStudentOrParentOnly && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                        <div>
                            <h2 className="text-sm font-bold text-foreground">
                                Peringkat Akademik Kelas (Khusus Internal Guru & Wali Kelas)
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Data ini dilindungi RLS dan tidak ditampilkan pada akun Siswa
                                maupun Orang Tua.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {(['STS', 'SAS'] as ReportExamMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setRankingMode(mode)}
                                    className={cn(
                                        'rounded-lg px-3 py-1.5 text-xs font-semibold',
                                        rankingMode === mode
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-muted text-foreground hover:bg-muted/80'
                                    )}
                                >
                                    Mode {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm">
                        <table className="min-w-full divide-y divide-border/50 text-sm">
                            <thead className="bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 text-center">Peringkat</th>
                                    <th className="px-4 py-3 text-left">NISN</th>
                                    <th className="px-4 py-3 text-left">Nama Peserta Didik</th>
                                    <th className="px-4 py-3 text-center">Mapel Dinilai</th>
                                    <th className="px-4 py-3 text-center">Jumlah Nilai</th>
                                    <th className="px-4 py-3 text-center">Rata-Rata</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {rankings.map((row) => (
                                    <tr
                                        key={row.studentId}
                                        className="hover:bg-muted/30 transition-colors"
                                    >
                                        <td className="px-4 py-3 text-center font-bold text-emerald-600">
                                            {row.rank ? `#${row.rank}` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {row.nisn}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {row.fullName}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {row.gradedSubjects}
                                        </td>
                                        <td className="px-4 py-3 text-center font-semibold">
                                            {row.totalScore}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-emerald-600">
                                            {row.averageScore}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

export default GradesAndReportPage;