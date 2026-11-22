// src/modules/grades/pages/PortalGradesPage.tsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, FileDown, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { gradeService } from '../services/grade.service';
import { generateCurriculumMerdekaReportPdf } from '../utils/reportPdfGenerator';
import type {
    ClassReportContext,
    ReportExamMode,
    StudentBasicProfile,
    StudentGradeRecord,
    StudentReportNoteRecord,
    SubjectOption,
} from '../types/grade.types';

interface PortalStudentItem extends StudentBasicProfile {
    classId: string | null;
}

interface SemesterItem {
    id: string;
    type: 'GANJIL' | 'GENAP';
    isActive: boolean;
    academicYear: {
        id: string;
        name: string;
    } | null;
}

export function PortalGradesPage() {
    const { user, school } = useAuthStore();
    const schoolInfo = school as { id?: string } | null;

    const [resolvedSchoolId, setResolvedSchoolId] = useState<string>(
        schoolInfo?.id || user?.schoolId || ''
    );
    const [loading, setLoading] = useState<boolean>(true);
    const [printingMode, setPrintingMode] = useState<ReportExamMode | null>(null);
    const [students, setStudents] = useState<PortalStudentItem[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [semesters, setSemesters] = useState<SemesterItem[]>([]);
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');

    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [grades, setGrades] = useState<StudentGradeRecord[]>([]);
    const [reportNote, setReportNote] =
        useState<StudentReportNoteRecord | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // 1. Ambil daftar anak/siswa milik akun Siswa atau Orang Tua (disaring otomatis oleh RLS)
    useEffect(() => {
        let mounted = true;
        async function loadPortalContext() {
            setLoading(true);
            try {
                const {
                    data: { user: authUser },
                } = await supabase.auth.getUser();

                if (!authUser) {
                    if (mounted) setLoading(false);
                    return;
                }

                let activeSchoolId = schoolInfo?.id || user?.schoolId || '';
                if (!activeSchoolId) {
                    const { data: profile } = await supabase
                        .from('users')
                        .select('schoolId')
                        .eq('id', authUser.id)
                        .maybeSingle();
                    activeSchoolId = profile?.schoolId || '';
                }

                if (!mounted) return;
                setResolvedSchoolId(activeSchoolId);

                if (!activeSchoolId) {
                    setLoading(false);
                    return;
                }

                const [studentRes, semRes] = await Promise.all([
                    supabase
                        .from('students')
                        .select(
                            'id, nis, nisn, fullName, gender, birthPlace, birthDate, religion, address, classId'
                        )
                        .eq('schoolId', activeSchoolId)
                        .order('fullName', { ascending: true }),
                    supabase
                        .from('semesters')
                        .select('id, type, isActive, academicYear:academic_years(id, name)')
                        .eq('schoolId', activeSchoolId),
                ]);

                if (!mounted) return;

                if (studentRes.error) throw studentRes.error;
                if (semRes.error) throw semRes.error;

                const stList = (studentRes.data ?? []) as PortalStudentItem[];
                const semList = (semRes.data ?? []).map((s: Record<string, unknown>) => {
                    const ay = Array.isArray(s.academicYear)
                        ? s.academicYear[0]
                        : s.academicYear;
                    return {
                        id: String(s.id),
                        type: (s.type as 'GANJIL' | 'GENAP') ?? 'GANJIL',
                        isActive: Boolean(s.isActive),
                        academicYear: ay
                            ? {
                                id: String((ay as Record<string, unknown>).id),
                                name: String((ay as Record<string, unknown>).name),
                            }
                            : null,
                    };
                });

                setStudents(stList);
                setSemesters(semList);

                if (stList[0]) setSelectedStudentId(stList[0].id);
                const activeSem = semList.find((s) => s.isActive) ?? semList[0];
                if (activeSem) setSelectedSemesterId(activeSem.id);
            } catch (err) {
                if (mounted) {
                    const msg =
                        err instanceof Error
                            ? err.message
                            : 'Gagal memuat data raport siswa.';
                    setErrorMsg(msg);
                    toast.error(msg);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadPortalContext();
        return () => {
            mounted = false;
        };
    }, [schoolInfo?.id, user?.schoolId]);

    // 2. Muat nilai dan status publikasi raport saat semester / siswa berubah
    useEffect(() => {
        let mounted = true;
        async function loadGradesAndNote() {
            if (!resolvedSchoolId || !selectedStudentId || !selectedSemesterId) return;
            try {
                const [bundleRes, noteRes] = await Promise.all([
                    gradeService.getStudentCompleteReportBundle({
                        schoolId: resolvedSchoolId,
                        semesterId: selectedSemesterId,
                        studentId: selectedStudentId,
                    }),
                    supabase
                        .from('student_report_notes')
                        .select('*')
                        .eq('schoolId', resolvedSchoolId)
                        .eq('semesterId', selectedSemesterId)
                        .eq('studentId', selectedStudentId)
                        .maybeSingle(),
                ]);

                if (!mounted) return;
                setSubjects(bundleRes.data.subjects);
                setGrades(bundleRes.data.grades);

                if (noteRes.data) {
                    const row = noteRes.data as Record<string, unknown>;
                    const normalizedNote: StudentReportNoteRecord = {
                        id: String(row.id),
                        schoolId: String(row.schoolId),
                        academicYearId: String(row.academicYearId ?? ''),
                        semesterId: String(row.semesterId),
                        classId: String(row.classId),
                        studentId: String(row.studentId),
                        extracurriculars: Array.isArray(row.extracurriculars)
                            ? row.extracurriculars.map((ex: Record<string, unknown>) => ({
                                name: String(ex.name ?? ''),
                                predicate: String(ex.predicate ?? 'Baik'),
                                description: String(ex.description ?? ''),
                            }))
                            : [],
                        cocurricularNote: row.cocurricularNote
                            ? String(row.cocurricularNote)
                            : null,
                        stsHomeroomNote: row.stsHomeroomNote
                            ? String(row.stsHomeroomNote)
                            : null,
                        homeroomNote: row.homeroomNote ? String(row.homeroomNote) : null,
                        stsSickDays: Number(row.stsSickDays ?? 0),
                        stsPermissionDays: Number(row.stsPermissionDays ?? 0),
                        stsAlphaDays: Number(row.stsAlphaDays ?? 0),
                        sickDays: Number(row.sickDays ?? 0),
                        permissionDays: Number(row.permissionDays ?? 0),
                        alphaDays: Number(row.alphaDays ?? 0),
                        promotionStatus:
                            (row.promotionStatus as StudentReportNoteRecord['promotionStatus']) ??
                            'PROSES',
                        reportDateSts: row.reportDateSts ? String(row.reportDateSts) : null,
                        reportDateSas: row.reportDateSas ? String(row.reportDateSas) : null,
                        isStsPublished: Boolean(row.isStsPublished),
                        isSasPublished: Boolean(row.isSasPublished),
                    };
                    setReportNote(normalizedNote);
                } else {
                    setReportNote(null);
                }
            } catch (err) {
                if (mounted) {
                    const msg =
                        err instanceof Error ? err.message : 'Gagal memuat rincian nilai.';
                    setErrorMsg(msg);
                    toast.error(msg);
                }
            }
        }

        loadGradesAndNote();
        return () => {
            mounted = false;
        };
    }, [resolvedSchoolId, selectedStudentId, selectedSemesterId]);

    const handleDownloadPortalPdf = async (mode: ReportExamMode) => {
        const activeStudent = students.find((s) => s.id === selectedStudentId);
        const activeSemester = semesters.find((s) => s.id === selectedSemesterId);
        if (!activeStudent || !activeSemester || !reportNote || !resolvedSchoolId) {
            return;
        }

        setPrintingMode(mode);
        setErrorMsg(null);
        try {
            const [bundleRes, classRes] = await Promise.all([
                gradeService.getStudentCompleteReportBundle({
                    schoolId: resolvedSchoolId,
                    semesterId: selectedSemesterId,
                    studentId: selectedStudentId,
                }),
                activeStudent.classId
                    ? supabase
                        .from('classes')
                        .select(
                            'id, name, gradeLevel, major, homeroomTeacher:teachers(fullName, nip)'
                        )
                        .eq('id', activeStudent.classId)
                        .single()
                    : Promise.resolve({ data: null, error: null }),
            ]);

            const clsData = classRes.data as Record<string, unknown> | null;
            const rawTeacher = clsData?.homeroomTeacher
                ? Array.isArray(clsData.homeroomTeacher)
                    ? clsData.homeroomTeacher[0]
                    : clsData.homeroomTeacher
                : null;

            const classContext: ClassReportContext = {
                classId: activeStudent.classId ?? '',
                className: clsData?.name ? String(clsData.name) : '-',
                gradeLevel: clsData?.gradeLevel ? Number(clsData.gradeLevel) : 10,
                major: clsData?.major ? String(clsData.major) : null,
                academicYearName: activeSemester.academicYear?.name ?? '-',
                semesterType: activeSemester.type,
                homeroomTeacherName: rawTeacher
                    ? String((rawTeacher as Record<string, unknown>).fullName)
                    : 'Wali Kelas',
                homeroomTeacherNip: rawTeacher
                    ? ((rawTeacher as Record<string, unknown>).nip as string | null)
                    : null,
            };

            await generateCurriculumMerdekaReportPdf({
                mode,
                school: bundleRes.data.school,
                classContext,
                student: activeStudent,
                subjects: bundleRes.data.subjects,
                grades: bundleRes.data.grades,
                reportNote,
                achievements: bundleRes.data.achievements,
            });

            toast.success(`PDF Raport ${mode} berhasil diunduh.`);
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : 'Gagal mengunduh PDF Raport.';
            setErrorMsg(msg);
            toast.error(msg);
        } finally {
            setPrintingMode(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
                <p className="text-sm text-muted-foreground">
                    Memuat data hasil belajar...
                </p>
            </div>
        );
    }

    const isStsReady = Boolean(reportNote?.isStsPublished);
    const isSasReady = Boolean(reportNote?.isSasPublished);
    const gradeMap = new Map(grades.map((g) => [g.subjectId, g]));

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm md:flex-row md:items-center">
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        Hasil Belajar & E-Raport
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Pantau capaian kompetensi semester dan unduh dokumen PDF Raport
                        resmi.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    {students.length > 1 && (
                        <select
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                            className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                        >
                            {students.map((st) => (
                                <option key={st.id} value={st.id}>
                                    {st.fullName}
                                </option>
                            ))}
                        </select>
                    )}

                    <select
                        value={selectedSemesterId}
                        onChange={(e) => setSelectedSemesterId(e.target.value)}
                        className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                    >
                        {semesters.map((sem) => (
                            <option key={sem.id} value={sem.id}>
                                {sem.academicYear?.name ?? ''} - Semester {sem.type}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    {errorMsg}
                </div>
            )}

            {/* Tombol Unduh Raport Sesuai Status Publikasi */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                    <div>
                        <h2 className="text-sm font-bold text-foreground">
                            Raport Tengah Semester (STS)
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {isStsReady
                                ? 'Raport STS telah dipublikasikan oleh Wali Kelas.'
                                : 'Menunggu publikasi dari Wali Kelas.'}
                        </p>
                    </div>
                    {isStsReady ? (
                        <button
                            type="button"
                            disabled={printingMode === 'STS'}
                            onClick={() => handleDownloadPortalPdf('STS')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                            <FileDown className="h-4 w-4" />
                            {printingMode === 'STS' ? 'Memproses...' : 'Unduh PDF STS'}
                        </button>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" />
                            Belum Rilis
                        </span>
                    )}
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                    <div>
                        <h2 className="text-sm font-bold text-foreground">
                            Raport Akhir Semester (SAS)
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {isSasReady
                                ? 'Raport Akhir Semester telah dipublikasikan oleh Wali Kelas.'
                                : 'Menunggu publikasi dari Wali Kelas.'}
                        </p>
                    </div>
                    {isSasReady ? (
                        <button
                            type="button"
                            disabled={printingMode === 'SAS'}
                            onClick={() => handleDownloadPortalPdf('SAS')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            <FileDown className="h-4 w-4" />
                            {printingMode === 'SAS' ? 'Memproses...' : 'Unduh PDF SAS'}
                        </button>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <Lock className="h-3.5 w-3.5" />
                            Belum Rilis
                        </span>
                    )}
                </div>
            </div>

            {/* Tabel Pratinjau Nilai */}
            {!isStsReady && !isSasReady ? (
                <div className="rounded-xl border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
                    <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
                    Nilai semester ini belum dipublikasikan oleh Wali Kelas.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm">
                    <table className="min-w-full divide-y divide-border/50 text-sm">
                        <thead className="bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 text-center">No</th>
                                <th className="px-4 py-3 text-left">Mata Pelajaran</th>
                                {isStsReady && <th className="px-4 py-3 text-center">Nilai STS</th>}
                                {isSasReady && (
                                    <th className="px-4 py-3 text-center">Nilai Akhir</th>
                                )}
                                <th className="px-4 py-3 text-left">Capaian Kompetensi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {subjects.map((subj, idx) => {
                                const g = gradeMap.get(subj.id);
                                return (
                                    <tr
                                        key={subj.id}
                                        className="hover:bg-muted/30 transition-colors"
                                    >
                                        <td className="px-4 py-3 text-center text-muted-foreground">
                                            {idx + 1}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-foreground">
                                            {subj.name}
                                        </td>
                                        {isStsReady && (
                                            <td className="px-4 py-3 text-center font-semibold text-amber-600">
                                                {g?.stsScore !== null && g?.stsScore !== undefined
                                                    ? g.stsScore
                                                    : '-'}
                                            </td>
                                        )}
                                        {isSasReady && (
                                            <td className="px-4 py-3 text-center font-bold text-emerald-600">
                                                {g?.finalScore !== null && g?.finalScore !== undefined
                                                    ? g.finalScore
                                                    : '-'}
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {isSasReady
                                                ? g?.competencyDescription || '-'
                                                : g?.stsCompetencyDescription || '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </motion.div>
    );
}

export default PortalGradesPage;