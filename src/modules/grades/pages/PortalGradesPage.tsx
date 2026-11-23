// src/modules/grades/pages/PortalGradesPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Award,
    BookOpen,
    Calendar,
    Download,
    FileText,
    GraduationCap,
    Loader2,
    Lock,
    Sparkles,
    UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { supabase } from '@/services/supabase.client';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/constants/translations';
import { gradeService } from '../services/grade.service';
import { generateCurriculumMerdekaReportPdf } from '../utils/reportPdfGenerator';
import type {
    ClassReportContext,
    ReportExamMode,
    StudentAchievementItem,
    StudentBasicProfile,
    StudentGradeRecord,
    StudentReportNoteRecord,
    SubjectOption,
} from '../types/grade.types';

interface LinkedStudentOption extends StudentBasicProfile {
    schoolId: string;
    relationship: string;
}

interface PublishedReportSummary {
    note: StudentReportNoteRecord;
    semesterType: 'GANJIL' | 'GENAP';
    academicYearName: string;
    className: string;
    gradeLevel: number;
    homeroomTeacherName: string;
    homeroomTeacherNip: string | null;
}

const CATEGORY_KEY_MAP: Record<string, TranslationKey> = {
    UMUM: 'portalGrades.cat_UMUM',
    PILIHAN: 'portalGrades.cat_PILIHAN',
    KEJURUAN: 'portalGrades.cat_KEJURUAN',
    MUATAN_LOKAL: 'portalGrades.cat_MUATAN_LOKAL',
    KOKURIKULER: 'portalGrades.cat_KOKURIKULER',
};

export default function PortalGradesPage() {
    // Perbaikan TS2339: gunakan `locale` sesuai tipe kembalian useTranslation()
    const { t, locale } = useTranslation();
    const activeLang: 'id' | 'en' = locale === 'en' ? 'en' : 'id';

    const tr = useCallback(
        (key: TranslationKey, vars?: Record<string, string | number>): string => {
            let text = String(t(key));
            if (vars) {
                Object.entries(vars).forEach(([k, v]) => {
                    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                });
            }
            return text;
        },
        [t]
    );

    const [linkedStudents, setLinkedStudents] = useState<LinkedStudentOption[]>(
        []
    );
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');

    const [publishedReports, setPublishedReports] = useState<
        PublishedReportSummary[]
    >([]);
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
    const [examMode, setExamMode] = useState<ReportExamMode>('SAS');

    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [grades, setGrades] = useState<StudentGradeRecord[]>([]);
    const [achievements, setAchievements] = useState<StudentAchievementItem[]>(
        []
    );

    const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
    const [isLoadingReport, setIsLoadingReport] = useState<boolean>(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

    // 1. Ambil daftar siswa yang terhubung dengan akun Siswa / Orang Tua
    useEffect(() => {
        let active = true;

        const loadLinkedStudents = async () => {
            setIsLoadingInitial(true);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) return;

                const { data: links, error } = await supabase
                    .from('user_student_links')
                    .select(
                        'relationship, isPrimary, student:students(id, schoolId, nis, nisn, fullName, gender, birthPlace, birthDate, religion, address)'
                    )
                    .eq('userId', user.id)
                    .order('isPrimary', { ascending: false });

                if (error) throw error;
                if (!active) return;

                const mapped: LinkedStudentOption[] = (links ?? [])
                    .map(
                        (row: Record<string, unknown>): LinkedStudentOption | null => {
                            const st = row.student as Record<string, unknown> | null;
                            if (!st) return null;
                            return {
                                id: String(st.id),
                                schoolId: String(st.schoolId),
                                nis: st.nis ? String(st.nis) : null,
                                nisn: String(st.nisn ?? '-'),
                                fullName: String(st.fullName ?? '-'),
                                gender: String(st.gender ?? 'L'),
                                birthPlace: String(st.birthPlace ?? '-'),
                                birthDate: String(st.birthDate ?? ''),
                                religion: st.religion ? String(st.religion) : null,
                                address: String(st.address ?? '-'),
                                relationship: String(row.relationship ?? 'SISWA'),
                            };
                        }
                    )
                    .filter((item): item is LinkedStudentOption => item !== null);

                setLinkedStudents(mapped);
                if (mapped.length > 0) {
                    setSelectedStudentId(mapped[0].id);
                }
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : tr('portalGrades.errLoadStudents')
                );
            } finally {
                if (active) setIsLoadingInitial(false);
            }
        };

        void loadLinkedStudents();
        return () => {
            active = false;
        };
    }, [tr]);

    const currentStudent = useMemo(
        () => linkedStudents.find((s) => s.id === selectedStudentId) ?? null,
        [linkedStudents, selectedStudentId]
    );

    // 2. Ambil daftar semester yang raportnya sudah dipublikasikan oleh Wali Kelas
    useEffect(() => {
        if (!currentStudent) {
            setPublishedReports([]);
            return;
        }

        let active = true;
        const loadPublishedSemesters = async () => {
            setIsLoadingReport(true);
            try {
                const { data, error } = await supabase
                    .from('student_report_notes')
                    .select(
                        `
            *,
            semester:semesters(id, type),
            academicYear:academic_years(id, name),
            classInfo:classes(id, name, gradeLevel, homeroomTeacher:teachers(fullName, nip))
          `
                    )
                    .eq('schoolId', currentStudent.schoolId)
                    .eq('studentId', currentStudent.id)
                    .or('isStsPublished.eq.true,isSasPublished.eq.true')
                    .order('createdAt', { ascending: false });

                if (error) throw error;
                if (!active) return;

                const summaries: PublishedReportSummary[] = (data ?? []).map(
                    (row: Record<string, unknown>) => {
                        const sem = row.semester as { type?: 'GANJIL' | 'GENAP' } | null;
                        const ay = row.academicYear as { name?: string } | null;
                        const cls = row.classInfo as {
                            name?: string;
                            gradeLevel?: number;
                            homeroomTeacher?: { fullName?: string; nip?: string | null };
                        } | null;

                        return {
                            note: {
                                id: String(row.id),
                                schoolId: String(row.schoolId),
                                academicYearId: String(row.academicYearId),
                                semesterId: String(row.semesterId),
                                classId: String(row.classId),
                                studentId: String(row.studentId),
                                extracurriculars: Array.isArray(row.extracurriculars)
                                    ? row.extracurriculars
                                    : [],
                                cocurricularNote: row.cocurricularNote
                                    ? String(row.cocurricularNote)
                                    : null,
                                stsHomeroomNote: row.stsHomeroomNote
                                    ? String(row.stsHomeroomNote)
                                    : null,
                                homeroomNote: row.homeroomNote
                                    ? String(row.homeroomNote)
                                    : null,
                                stsSickDays: Number(row.stsSickDays ?? 0),
                                stsPermissionDays: Number(row.stsPermissionDays ?? 0),
                                stsAlphaDays: Number(row.stsAlphaDays ?? 0),
                                sickDays: Number(row.sickDays ?? 0),
                                permissionDays: Number(row.permissionDays ?? 0),
                                alphaDays: Number(row.alphaDays ?? 0),
                                promotionStatus:
                                    (row.promotionStatus as StudentReportNoteRecord['promotionStatus']) ??
                                    'PROSES',
                                reportDateSts: row.reportDateSts
                                    ? String(row.reportDateSts)
                                    : null,
                                reportDateSas: row.reportDateSas
                                    ? String(row.reportDateSas)
                                    : null,
                                isStsPublished: Boolean(row.isStsPublished),
                                isSasPublished: Boolean(row.isSasPublished),
                            },
                            semesterType: sem?.type ?? 'GANJIL',
                            academicYearName: ay?.name ?? '-',
                            className: cls?.name ?? '-',
                            gradeLevel: Number(cls?.gradeLevel ?? 1),
                            homeroomTeacherName: cls?.homeroomTeacher?.fullName ?? '-',
                            homeroomTeacherNip: cls?.homeroomTeacher?.nip ?? null,
                        };
                    }
                );

                setPublishedReports(summaries);
                if (summaries.length > 0) {
                    const first = summaries[0];
                    setSelectedSemesterId(first.note.semesterId);
                    setExamMode(first.note.isSasPublished ? 'SAS' : 'STS');
                } else {
                    setSelectedSemesterId('');
                }
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : tr('portalGrades.errLoadReports')
                );
            } finally {
                if (active) setIsLoadingReport(false);
            }
        };

        void loadPublishedSemesters();
        return () => {
            active = false;
        };
    }, [currentStudent, tr]);

    const activeReportSummary = useMemo(
        () =>
            publishedReports.find((r) => r.note.semesterId === selectedSemesterId) ??
            null,
        [publishedReports, selectedSemesterId]
    );

    // 3. Muat Detail Nilai & Prestasi ketika Semester dipilih
    useEffect(() => {
        if (!currentStudent || !activeReportSummary) {
            setSubjects([]);
            setGrades([]);
            setAchievements([]);
            return;
        }

        if (
            examMode === 'SAS' &&
            !activeReportSummary.note.isSasPublished &&
            activeReportSummary.note.isStsPublished
        ) {
            setExamMode('STS');
        } else if (
            examMode === 'STS' &&
            !activeReportSummary.note.isStsPublished &&
            activeReportSummary.note.isSasPublished
        ) {
            setExamMode('SAS');
        }

        let active = true;
        const loadDetail = async () => {
            setIsLoadingReport(true);
            try {
                const res = await gradeService.getStudentCompleteReportBundle({
                    schoolId: currentStudent.schoolId,
                    semesterId: activeReportSummary.note.semesterId,
                    studentId: currentStudent.id,
                });

                if (!active) return;
                setSubjects(res.data.subjects);
                setGrades(res.data.grades);
                setAchievements(res.data.achievements);
            } catch (err) {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : tr('portalGrades.errLoadDetail')
                );
            } finally {
                if (active) setIsLoadingReport(false);
            }
        };

        void loadDetail();
        return () => {
            active = false;
        };
    }, [currentStudent, activeReportSummary, tr]);

    const handleDownloadPdf = useCallback(async () => {
        if (!currentStudent || !activeReportSummary) return;
        setIsDownloadingPdf(true);
        try {
            const bundleRes = await gradeService.getStudentCompleteReportBundle({
                schoolId: currentStudent.schoolId,
                semesterId: activeReportSummary.note.semesterId,
                studentId: currentStudent.id,
            });

            const classContext: ClassReportContext = {
                classId: activeReportSummary.note.classId,
                className: activeReportSummary.className,
                gradeLevel: activeReportSummary.gradeLevel,
                academicYearName: activeReportSummary.academicYearName,
                semesterType: activeReportSummary.semesterType,
                homeroomTeacherName: activeReportSummary.homeroomTeacherName,
                homeroomTeacherNip: activeReportSummary.homeroomTeacherNip,
            };

            await generateCurriculumMerdekaReportPdf({
                mode: examMode,
                lang: activeLang,
                school: bundleRes.data.school,
                classContext,
                student: currentStudent,
                subjects: bundleRes.data.subjects,
                grades: bundleRes.data.grades,
                reportNote: activeReportSummary.note,
                achievements: bundleRes.data.achievements,
            });

            toast.success(
                tr('portalGrades.toastPdfDownloaded', { mode: examMode })
            );
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : tr('portalGrades.errDownloadPdf')
            );
        } finally {
            setIsDownloadingPdf(false);
        }
    }, [currentStudent, activeReportSummary, examMode, activeLang, tr]);

    const gradeMap = useMemo(() => {
        const map = new Map<string, StudentGradeRecord>();
        grades.forEach((g) => map.set(g.subjectId, g));
        return map;
    }, [grades]);

    if (isLoadingInitial) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">{tr('common.loading')}</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header Portal */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {tr('portalGrades.pageTitle')}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {tr('portalGrades.pageSubtitle')}
                    </p>
                </div>

                {activeReportSummary && (
                    <button
                        type="button"
                        onClick={handleDownloadPdf}
                        disabled={isDownloadingPdf}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                        {isDownloadingPdf ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        {tr('portalGrades.btnDownloadPdf', { mode: examMode })}
                    </button>
                )}
            </div>

            {/* Pemilih Siswa & Pemilih Semester */}
            <Card className="border-none shadow-sm">
                <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            {tr('portalGrades.labelStudent')}
                        </label>
                        <select
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {linkedStudents.map((st) => (
                                <option key={st.id} value={st.id}>
                                    {st.fullName} (NISN: {st.nisn})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            {tr('portalGrades.labelPeriod')}
                        </label>
                        <select
                            value={selectedSemesterId}
                            onChange={(e) => setSelectedSemesterId(e.target.value)}
                            disabled={publishedReports.length === 0}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {publishedReports.length === 0 ? (
                                <option value="">
                                    {tr('portalGrades.noPublishedOption')}
                                </option>
                            ) : (
                                publishedReports.map((rep) => (
                                    <option
                                        key={rep.note.semesterId}
                                        value={rep.note.semesterId}
                                    >
                                        {tr('portalGrades.periodOptionLabel', {
                                            year: rep.academicYearName,
                                            semester: rep.semesterType,
                                            className: rep.className,
                                        })}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {activeReportSummary && (
                        <div className="flex items-center gap-2">
                            {activeReportSummary.note.isStsPublished && (
                                <button
                                    type="button"
                                    onClick={() => setExamMode('STS')}
                                    className={cn(
                                        'flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                                        examMode === 'STS'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background hover:bg-muted'
                                    )}
                                >
                                    {tr('portalGrades.btnReportSts')}
                                </button>
                            )}
                            {activeReportSummary.note.isSasPublished && (
                                <button
                                    type="button"
                                    onClick={() => setExamMode('SAS')}
                                    className={cn(
                                        'flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                                        examMode === 'SAS'
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background hover:bg-muted'
                                    )}
                                >
                                    {tr('portalGrades.btnReportSas')}
                                </button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Jika Belum Ada Raport yang Dipublikasikan */}
            {!activeReportSummary ? (
                <Card className="border-none shadow-sm">
                    <CardContent className="p-12 text-center space-y-3">
                        <Lock className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                        <h2 className="text-lg font-semibold">
                            {tr('portalGrades.emptyTitle')}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            {tr('portalGrades.emptyDesc')}
                        </p>
                    </CardContent>
                </Card>
            ) : isLoadingReport ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <p className="text-sm">{tr('portalGrades.loadingDetail')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Kartu Identitas Ringkas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="border-none shadow-sm">
                            <CardContent className="p-5 flex items-center gap-3.5">
                                <div className="p-3 rounded-xl bg-blue-500/10">
                                    <GraduationCap className="w-5 h-5 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        {tr('portalGrades.cardClassYear')}
                                    </p>
                                    <p className="font-bold text-sm">
                                        {activeReportSummary.className} —{' '}
                                        {activeReportSummary.academicYearName}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardContent className="p-5 flex items-center gap-3.5">
                                <div className="p-3 rounded-xl bg-emerald-500/10">
                                    <UserCheck className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        {tr('portalGrades.cardHomeroom')}
                                    </p>
                                    <p className="font-bold text-sm">
                                        {activeReportSummary.homeroomTeacherName}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardContent className="p-5 flex items-center gap-3.5">
                                <div className="p-3 rounded-xl bg-amber-500/10">
                                    <Calendar className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        {tr('portalGrades.cardAbsence', {
                                            mode: examMode,
                                        })}
                                    </p>
                                    <p className="font-bold text-sm">
                                        {tr('portalGrades.sickLabel')}:{' '}
                                        {examMode === 'STS'
                                            ? activeReportSummary.note.stsSickDays
                                            : activeReportSummary.note.sickDays}{' '}
                                        | {tr('portalGrades.permLabel')}:{' '}
                                        {examMode === 'STS'
                                            ? activeReportSummary.note.stsPermissionDays
                                            : activeReportSummary.note.permissionDays}{' '}
                                        | {tr('portalGrades.alphaLabel')}:{' '}
                                        {examMode === 'STS'
                                            ? activeReportSummary.note.stsAlphaDays
                                            : activeReportSummary.note.alphaDays}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tabel Nilai Mata Pelajaran */}
                    <Card className="border-none shadow-sm">
                        <CardHeader className="border-b">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-primary" />
                                {tr('portalGrades.tableTitle', { mode: examMode })}
                            </CardTitle>
                            <CardDescription>
                                {tr('portalGrades.tableSubtitle', {
                                    semester: activeReportSummary.semesterType,
                                })}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b">
                                    <tr>
                                        <th className="px-5 py-3.5 w-14 text-center">
                                            {tr('portalGrades.colNo')}
                                        </th>
                                        <th className="px-5 py-3.5 w-64">
                                            {tr('portalGrades.colSubject')}
                                        </th>
                                        <th className="px-5 py-3.5 w-28 text-center">
                                            {examMode === 'STS'
                                                ? tr('portalGrades.colScoreSts')
                                                : tr('portalGrades.colScoreSas')}
                                        </th>
                                        <th className="px-5 py-3.5">
                                            {tr('portalGrades.colCompetency')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subjects.map((subj, idx) => {
                                        const g = gradeMap.get(subj.id);
                                        const rawScore =
                                            examMode === 'STS'
                                                ? (g?.stsScore ?? g?.formativeAvg ?? null)
                                                : (g?.finalScore ?? null);
                                        const desc =
                                            examMode === 'STS'
                                                ? g?.stsCompetencyDescription ||
                                                g?.competencyDescription ||
                                                '-'
                                                : g?.competencyDescription || '-';

                                        const catKey = CATEGORY_KEY_MAP[subj.category];

                                        return (
                                            <tr
                                                key={subj.id}
                                                className="border-b last:border-0 hover:bg-muted/20 align-top"
                                            >
                                                <td className="px-5 py-4 text-center text-muted-foreground">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="font-semibold text-foreground">
                                                        {subj.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {catKey ? tr(catKey) : subj.category}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    {rawScore !== null &&
                                                        rawScore !== undefined ? (
                                                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-primary/10 text-primary font-bold">
                                                            {Math.round(rawScore)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            -
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-xs leading-relaxed text-foreground/90">
                                                    {desc}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    {/* Kokurikuler / Projek P5 (Mode SAS) */}
                    {examMode === 'SAS' &&
                        activeReportSummary.note.cocurricularNote &&
                        activeReportSummary.note.cocurricularNote.trim() !== '' && (
                            <Card className="border-none shadow-sm">
                                <CardHeader className="pb-3 border-b">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-indigo-500" />
                                        {tr('portalGrades.p5CardTitle')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 text-sm leading-relaxed">
                                    {activeReportSummary.note.cocurricularNote}
                                </CardContent>
                            </Card>
                        )}

                    {/* Ekstrakurikuler, Prestasi & Catatan Wali Kelas */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="border-none shadow-sm">
                            <CardHeader className="pb-3 border-b">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary" />
                                    {tr('portalGrades.noteCardTitle')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 text-sm leading-relaxed">
                                {examMode === 'STS'
                                    ? activeReportSummary.note.stsHomeroomNote ||
                                    tr('portalGrades.defaultNoteSts')
                                    : activeReportSummary.note.homeroomNote ||
                                    tr('portalGrades.defaultNoteSas')}
                            </CardContent>
                        </Card>

                        {examMode === 'SAS' && (
                            <Card className="border-none shadow-sm">
                                <CardHeader className="pb-3 border-b">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Award className="w-4 h-4 text-amber-500" />
                                        {tr('portalGrades.ekskulCardTitle')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 space-y-3 text-xs">
                                    {activeReportSummary.note.extracurriculars.length >
                                        0 ? (
                                        <div className="space-y-2">
                                            {activeReportSummary.note.extracurriculars.map(
                                                (ex, i) => (
                                                    <div
                                                        key={i}
                                                        className="p-2.5 rounded-lg border bg-muted/30 flex items-center justify-between gap-2"
                                                    >
                                                        <div>
                                                            <p className="font-semibold text-sm">
                                                                {ex.name}
                                                            </p>
                                                            <p className="text-muted-foreground">
                                                                {ex.description}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline">
                                                            {ex.predicate}
                                                        </Badge>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-muted-foreground">
                                            {tr('portalGrades.emptyEkskul')}
                                        </p>
                                    )}

                                    {achievements.length > 0 && (
                                        <div className="pt-2 border-t space-y-1.5">
                                            <p className="font-semibold text-foreground">
                                                {tr('portalGrades.achievementsTitle')}
                                            </p>
                                            {achievements.map((ach) => (
                                                <div
                                                    key={ach.id}
                                                    className="text-muted-foreground"
                                                >
                                                    - <strong>{ach.title}</strong> ({ach.level},{' '}
                                                    {ach.year})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}