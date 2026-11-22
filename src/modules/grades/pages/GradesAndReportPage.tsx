// src/modules/grades/pages/GradesAndReportPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Award,
    BookOpen,
    Calendar,
    CheckCircle2,
    ClipboardCheck,
    Download,
    FileSpreadsheet,
    FileText,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Search,
    Sparkles,
    Trash2,
    Trophy,
    Users,
    X,
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
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import {
    gradeService,
    type GradeSheetRow,
} from '../services/grade.service';
import {
    generateClassBatchReportPdf,
    generateCurriculumMerdekaReportPdf,
} from '../utils/reportPdfGenerator';
import type {
    ClassRankingRow,
    ClassReportContext,
    ExtracurricularItem,
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
    homeroomTeacherName: string;
    homeroomTeacherNip: string | null;
}

interface StudentCrossSubjectGrade {
    studentId: string;
    subjectId: string;
    formativeAvg: number | null;
    stsScore: number | null;
    sasScore: number | null;
    finalScore: number | null;
}

type ActiveTab = 'GRADES' | 'NOTES' | 'RANKING';
type P5LevelCode = 'MB' | 'SB' | 'BSH' | 'SAB';

/**
 * Daftar Tema Resmi Projek Penguatan Profil Pelajar Pancasila (P5)
 * sesuai Panduan Pembelajaran dan Asesmen Kurikulum Merdeka.
 */
const P5_OFFICIAL_THEMES: string[] = [
    'Gaya Hidup Berkelanjutan',
    'Kearifan Lokal',
    'Bhinneka Tunggal Ika',
    'Bangunlah Jiwa dan Raganya',
    'Suara Demokrasi',
    'Rekayasa dan Teknologi',
    'Kewirausahaan',
    'Kebekerjaan',
];

/**
 * 6 Dimensi Resmi Profil Pelajar Pancasila
 */
const P5_DIMENSIONS: { id: string; shortLabel: string; fullLabel: string }[] = [
    {
        id: 'BERIMAN',
        shortLabel: 'Beriman & Berakhlak Mulia',
        fullLabel: 'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia',
    },
    {
        id: 'GLOBAL',
        shortLabel: 'Berkebinekaan Global',
        fullLabel: 'Berkebinekaan Global',
    },
    {
        id: 'GOTONG_ROYONG',
        shortLabel: 'Bergotong Royong',
        fullLabel: 'Bergotong Royong',
    },
    {
        id: 'MANDIRI',
        shortLabel: 'Mandiri',
        fullLabel: 'Mandiri',
    },
    {
        id: 'BERNALAR_KRITIS',
        shortLabel: 'Bernalar Kritis',
        fullLabel: 'Bernalar Kritis',
    },
    {
        id: 'KREATIF',
        shortLabel: 'Kreatif',
        fullLabel: 'Kreatif',
    },
];

/**
 * 4 Predikat Capaian Perkembangan Kokurikuler / P5 Kurikulum Merdeka
 */
const P5_LEVEL_OPTIONS: {
    code: P5LevelCode;
    label: string;
    fullTitle: string;
    badgeClass: string;
}[] = [
        {
            code: 'SAB',
            label: 'SAB — Sangat Berkembang',
            fullTitle: 'Sangat Berkembang (SAB)',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        },
        {
            code: 'BSH',
            label: 'BSH — Berkembang Sesuai Harapan',
            fullTitle: 'Berkembang Sesuai Harapan (BSH)',
            badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        },
        {
            code: 'SB',
            label: 'SB — Sedang Berkembang',
            fullTitle: 'Sedang Berkembang (SB)',
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        },
        {
            code: 'MB',
            label: 'MB — Mulai Berkembang',
            fullTitle: 'Mulai Berkembang (MB)',
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        },
    ];

function clampScore(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    if (Number.isNaN(num)) return null;
    return Math.max(0, Math.min(100, Math.round(num * 100) / 100));
}

function computeFormativeAverage(scores: number[]): number | null {
    const valid = scores.filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (valid.length === 0) return null;
    const sum = valid.reduce((acc, cur) => acc + cur, 0);
    return Math.round((sum / valid.length) * 100) / 100;
}

function computeWeightedFinalScore(
    formativeAvg: number | null,
    stsScore: number | null,
    sasScore: number | null,
    weights: { formative: number; sts: number; sas: number }
): number | null {
    let weightedSum = 0;
    let activeWeight = 0;

    if (formativeAvg !== null && !Number.isNaN(formativeAvg)) {
        weightedSum += formativeAvg * weights.formative;
        activeWeight += weights.formative;
    }
    if (stsScore !== null && !Number.isNaN(stsScore)) {
        weightedSum += stsScore * weights.sts;
        activeWeight += weights.sts;
    }
    if (sasScore !== null && !Number.isNaN(sasScore)) {
        weightedSum += sasScore * weights.sas;
        activeWeight += weights.sas;
    }

    if (activeWeight <= 0) return null;
    return Math.round((weightedSum / activeWeight) * 100) / 100;
}

function computePredicate(score: number | null): string | null {
    if (score === null || Number.isNaN(score)) return null;
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    return 'D';
}

function buildAutoDescription(
    subjectName: string,
    score: number | null,
    isSts: boolean
): string {
    if (score === null) return '';
    const periodLabel = isSts ? 'tengah semester ini' : 'semester ini';
    if (score >= 90) {
        return `Menunjukkan penguasaan yang sangat baik dalam memahami dan menerapkan kompetensi ${subjectName} pada ${periodLabel}.`;
    }
    if (score >= 80) {
        return `Menunjukkan penguasaan yang baik dalam memahami kompetensi dasar ${subjectName} pada ${periodLabel}.`;
    }
    if (score >= 70) {
        return `Cukup mampu memahami kompetensi ${subjectName} pada ${periodLabel}, namun perlu latihan tambahan pada beberapa materi.`;
    }
    return `Memerlukan bimbingan dan pendampingan lebih intensif untuk mencapai ketuntasan kompetensi ${subjectName} pada ${periodLabel}.`;
}

/**
 * Menyusun paragraf deskriptif Kokurikuler / Projek P5 sesuai format resmi
 * Raport Kurikulum Merdeka (Tema + Kegiatan + Dimensi + Capaian MB/SB/BSH/SAB).
 */
function composeP5Narrative(params: {
    studentName: string;
    theme: string;
    activityTitle: string;
    dimensions: string[];
    level: P5LevelCode;
}): string {
    const firstName =
        params.studentName.trim().split(' ')[0] || params.studentName;
    const levelObj =
        P5_LEVEL_OPTIONS.find((l) => l.code === params.level) ??
        P5_LEVEL_OPTIONS[1];

    const dimList =
        params.dimensions.length > 0
            ? params.dimensions.join(', ')
            : 'Bergotong Royong, Bernalar Kritis, dan Kreatif';

    const activityClause = params.activityTitle.trim()
        ? ` melalui kegiatan "${params.activityTitle.trim()}"`
        : '';

    const behaviorTail: Record<P5LevelCode, string> = {
        SAB: 'dengan menunjukkan inisiatif tinggi, konsistensi kolaborasi, serta mampu menjadi teladan dalam kelompok.',
        BSH: 'melalui partisipasi aktif dalam diskusi kelompok dan penyelesaian produk projek sesuai target yang ditetapkan.',
        SB: 'dan mulai menunjukkan keterlibatan positif dalam tahapan projek, namun masih memerlukan penguatan pada konsistensi kerja mandiri.',
        MB: 'dengan pendampingan bertahap dari fasilitator untuk menumbuhkan keberanian berpendapat dan kerja sama kelompok.',
    };

    return `Dalam kegiatan Kokurikuler / Projek Penguatan Profil Pelajar Pancasila (P5) bertema "${params.theme}"${activityClause}, ananda ${firstName} menunjukkan capaian ${levelObj.fullTitle} pada dimensi ${dimList} ${behaviorTail[params.level]}`;
}

/**
 * Mendeteksi kode predikat P5 (SAB/BSH/SB/MB) dari teks cocurricularNote yang sudah tersimpan.
 */
function detectP5LevelFromText(text?: string | null): P5LevelCode {
    if (!text) return 'BSH';
    if (text.includes('(SAB)') || text.includes('Sangat Berkembang')) return 'SAB';
    if (text.includes('(MB)') || text.includes('Mulai Berkembang')) return 'MB';
    if (text.includes('(SB)') || text.includes('Sedang Berkembang')) return 'SB';
    return 'BSH';
}

/**
 * Menghitung rekomendasi predikat P5 otomatis dari rata-rata capaian nilai siswa.
 */
function inferP5LevelFromScores(
    subjectScores: { subjectName: string; score: number }[]
): P5LevelCode {
    if (subjectScores.length === 0) return 'BSH';
    const avg =
        subjectScores.reduce((acc, item) => acc + item.score, 0) /
        subjectScores.length;
    if (avg >= 88) return 'SAB';
    if (avg >= 75) return 'BSH';
    if (avg >= 65) return 'SB';
    return 'MB';
}

/**
 * Generator Catatan Wali Kelas otomatis berdasarkan nilai seluruh mapel,
 * rekap kehadiran, dan keaktifan ekstrakurikuler.
 */
function buildAutoHomeroomNote(params: {
    studentName: string;
    mode: ReportExamMode;
    subjectScores: { subjectName: string; score: number }[];
    sickDays: number;
    permissionDays: number;
    alphaDays: number;
    extracurriculars: ExtracurricularItem[];
}): string {
    const {
        studentName,
        mode,
        subjectScores,
        sickDays,
        permissionDays,
        alphaDays,
        extracurriculars,
    } = params;

    const firstName = studentName.trim().split(' ')[0] || studentName;
    const periodText =
        mode === 'STS' ? 'tengah semester ini' : 'akhir semester ini';

    const parts: string[] = [];

    if (subjectScores.length > 0) {
        const sorted = [...subjectScores].sort((a, b) => b.score - a.score);
        const avg =
            sorted.reduce((sum, item) => sum + item.score, 0) / sorted.length;
        const topTwo = sorted
            .slice(0, 2)
            .map((s) => s.subjectName)
            .join(' dan ');
        const needSupport = sorted
            .filter((s) => s.score < 75)
            .slice(-2)
            .map((s) => s.subjectName);

        if (avg >= 90) {
            parts.push(
                `Ananda ${firstName} menunjukkan prestasi akademik yang sangat membanggakan pada ${periodText}, khususnya pada mata pelajaran ${topTwo}. Pertahankan semangat belajar dan ketekunan yang sudah sangat baik ini.`
            );
        } else if (avg >= 80) {
            parts.push(
                `Ananda ${firstName} menunjukkan perkembangan belajar yang baik pada ${periodText} dengan capaian menonjol di mata pelajaran ${topTwo}. Terus tingkatkan konsistensi belajar agar meraih hasil yang lebih optimal.`
            );
        } else if (avg >= 70) {
            const supportText =
                needSupport.length > 0
                    ? ` serta memperbanyak latihan pada mata pelajaran ${needSupport.join(' dan ')}`
                    : '';
            parts.push(
                `Ananda ${firstName} mengikuti pembelajaran dengan cukup baik pada ${periodText}. Diharapkan lebih percaya diri dalam berdiskusi${supportText}.`
            );
        } else {
            const supportText =
                needSupport.length > 0
                    ? ` terutama pada mata pelajaran ${needSupport.join(' dan ')}`
                    : '';
            parts.push(
                `Ananda ${firstName} perlu meningkatkan fokus dan kedisiplinan belajar pada ${periodText}${supportText}. Kerja sama antara sekolah dan orang tua sangat diharapkan untuk mendampingi belajar di rumah.`
            );
        }
    } else {
        parts.push(
            `Ananda ${firstName} mengikuti kegiatan pembelajaran dengan baik pada ${periodText}. Terus jaga motivasi belajar, sikap santun, dan semangat berprestasi.`
        );
    }

    const activeEkskul = extracurriculars
        .filter((e) => e.name.trim())
        .map((e) => e.name.trim());
    if (activeEkskul.length > 0) {
        parts.push(
            `Keaktifan dalam kegiatan ekstrakurikuler ${activeEkskul.join(', ')} patut diapresiasi.`
        );
    }

    if (alphaDays >= 3) {
        parts.push(
            `Perlu perhatian khusus terkait kedisiplinan kehadiran di sekolah agar tidak tertinggal materi pelajaran.`
        );
    } else if (alphaDays === 0 && sickDays === 0 && permissionDays === 0) {
        parts.push(`Kedisiplinan dan tingkat kehadiran sangat baik.`);
    }

    return parts.join(' ');
}

export default function GradesAndReportPage() {
    const authUser = useAuthStore((state) => state.user);
    const authSchool = useAuthStore((state) => state.school);

    const [resolvedSchoolId, setResolvedSchoolId] = useState<string>('');
    const [teacherId, setTeacherId] = useState<string | null>(null);

    const { isElementaryHomeroomRestricted, homeroomClassIds } =
        useTeacherScope(resolvedSchoolId);

    // Filter Akademik
    const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
    const [selectedYearId, setSelectedYearId] = useState<string>('');
    const [semesters, setSemesters] = useState<SemesterOption[]>([]);
    const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

    const [examMode, setExamMode] = useState<ReportExamMode>('SAS');
    const [activeTab, setActiveTab] = useState<ActiveTab>('GRADES');

    // Bobot Penilaian
    const [weights, setWeights] = useState({
        formative: 40,
        sts: 30,
        sas: 30,
    });

    const [tpCount, setTpCount] = useState<number>(3);

    // State Data Tab 1: Nilai Mapel
    const [gradeRows, setGradeRows] = useState<GradeSheetRow[]>([]);
    const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
    const [isSavingGrades, setIsSavingGrades] = useState<boolean>(false);

    // State Data Tab 2: Catatan Wali Kelas, Kokurikuler P5 & Publikasi
    const [notesMap, setNotesMap] = useState<
        Map<string, StudentReportNoteRecord>
    >(new Map());
    const [classAllGrades, setClassAllGrades] = useState<
        StudentCrossSubjectGrade[]
    >([]);
    const [classReportDate, setClassReportDate] = useState<string>(() =>
        new Date().toISOString().slice(0, 10)
    );
    const [noteSearchQuery, setNoteSearchQuery] = useState<string>('');
    const [hasUnsavedNotes, setHasUnsavedNotes] = useState<boolean>(false);

    // Master Konfigurasi Projek P5 Tingkat Kelas
    const [p5Theme, setP5Theme] = useState<string>(P5_OFFICIAL_THEMES[0]);
    const [p5ActivityTitle, setP5ActivityTitle] = useState<string>('');
    const [p5Dimensions, setP5Dimensions] = useState<string[]>([
        'Bergotong Royong',
        'Bernalar Kritis',
        'Kreatif',
    ]);
    const [p5LevelByStudent, setP5LevelByStudent] = useState<
        Record<string, P5LevelCode>
    >({});

    // Drawer / Modal Detail Siswa (Ekskul & Edit Narasi Lengkap)
    const [detailStudentRow, setDetailStudentRow] =
        useState<GradeSheetRow | null>(null);

    const [isSyncingAttendance, setIsSyncingAttendance] =
        useState<boolean>(false);
    const [isSavingAllNotes, setIsSavingAllNotes] = useState<boolean>(false);
    const [isPublishingBatch, setIsPublishingBatch] = useState<boolean>(false);
    const [printingStudentId, setPrintingStudentId] = useState<string | null>(
        null
    );
    const [isPrintingBatch, setIsPrintingBatch] = useState<boolean>(false);

    // State Data Tab 3: Peringkat Kelas
    const [rankings, setRankings] = useState<ClassRankingRow[]>([]);
    const [isLoadingRankings, setIsLoadingRankings] = useState<boolean>(false);

    // 1. Resolusi School ID & Teacher ID
    useEffect(() => {
        let active = true;
        const initIdentity = async () => {
            let sId = authSchool?.id || authUser?.schoolId || '';
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!sId && user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('schoolId')
                    .eq('id', user.id)
                    .single();
                sId = (profile?.schoolId as string) || '';
            }

            if (active) setResolvedSchoolId(sId);

            if (sId && user) {
                const { data: teacherRow } = await supabase
                    .from('teachers')
                    .select('id')
                    .eq('schoolId', sId)
                    .eq('userId', user.id)
                    .maybeSingle();

                if (active && teacherRow?.id) {
                    setTeacherId(String(teacherRow.id));
                }
            }
        };

        void initIdentity();
        return () => {
            active = false;
        };
    }, [authSchool?.id, authUser?.schoolId]);

    // 2. Muat Tahun Ajaran, Semester, dan Mata Pelajaran
    useEffect(() => {
        if (!resolvedSchoolId) return;
        let active = true;

        const loadMasterFilters = async () => {
            const [ayRes, semRes, subjRes] = await Promise.all([
                supabase
                    .from('academic_years')
                    .select('id, name, isActive')
                    .eq('schoolId', resolvedSchoolId)
                    .order('startYear', { ascending: false }),
                supabase
                    .from('semesters')
                    .select('id, academicYearId, type, isActive')
                    .eq('schoolId', resolvedSchoolId)
                    .order('type', { ascending: true }),
                supabase
                    .from('subjects')
                    .select('id, code, name, category, sortOrder')
                    .eq('schoolId', resolvedSchoolId)
                    .eq('isActive', true)
                    .order('sortOrder', { ascending: true })
                    .order('name', { ascending: true }),
            ]);

            if (!active) return;

            const ayList = (ayRes.data ?? []) as AcademicYearOption[];
            const semList = (semRes.data ?? []) as SemesterOption[];
            const subjList = (subjRes.data ?? []) as SubjectOption[];

            setAcademicYears(ayList);
            setSemesters(semList);
            setSubjects(subjList);

            const activeAy = ayList.find((a) => a.isActive) ?? ayList[0];
            if (activeAy) {
                setSelectedYearId(activeAy.id);
                const relatedSems = semList.filter(
                    (s) => s.academicYearId === activeAy.id
                );
                const activeSem =
                    relatedSems.find((s) => s.isActive) ?? relatedSems[0];
                if (activeSem) setSelectedSemesterId(activeSem.id);
            }

            if (subjList.length > 0 && !selectedSubjectId) {
                setSelectedSubjectId(subjList[0].id);
            }
        };

        void loadMasterFilters();
        return () => {
            active = false;
        };
    }, [resolvedSchoolId]);

    const filteredSemesters = useMemo(
        () => semesters.filter((s) => s.academicYearId === selectedYearId),
        [semesters, selectedYearId]
    );

    useEffect(() => {
        if (
            filteredSemesters.length > 0 &&
            !filteredSemesters.some((s) => s.id === selectedSemesterId)
        ) {
            const activeSem =
                filteredSemesters.find((s) => s.isActive) ?? filteredSemesters[0];
            setSelectedSemesterId(activeSem.id);
        }
    }, [filteredSemesters, selectedSemesterId]);

    // 3. Muat Daftar Kelas
    useEffect(() => {
        if (!resolvedSchoolId || !selectedYearId) return;
        let active = true;

        const loadClasses = async () => {
            const { data, error } = await supabase
                .from('classes')
                .select(
                    'id, name, gradeLevel, homeroomTeacher:teachers(fullName, nip)'
                )
                .eq('schoolId', resolvedSchoolId)
                .eq('academicYearId', selectedYearId)
                .order('gradeLevel', { ascending: true })
                .order('name', { ascending: true });

            if (error || !active) return;

            let mapped: ClassOption[] = (data ?? []).map(
                (row: Record<string, unknown>) => {
                    const hr = row.homeroomTeacher as
                        | { fullName?: string; nip?: string | null }
                        | null
                        | undefined;
                    return {
                        id: String(row.id),
                        name: String(row.name),
                        gradeLevel: Number(row.gradeLevel ?? 1),
                        homeroomTeacherName: hr?.fullName || '-',
                        homeroomTeacherNip: hr?.nip || null,
                    };
                }
            );

            if (isElementaryHomeroomRestricted && homeroomClassIds.length > 0) {
                mapped = mapped.filter((c) => homeroomClassIds.includes(c.id));
            }

            setClasses(mapped);
            if (mapped.length > 0 && !mapped.some((c) => c.id === selectedClassId)) {
                setSelectedClassId(mapped[0].id);
            } else if (mapped.length === 0) {
                setSelectedClassId('');
            }
        };

        void loadClasses();
        return () => {
            active = false;
        };
    }, [
        resolvedSchoolId,
        selectedYearId,
        isElementaryHomeroomRestricted,
        homeroomClassIds,
    ]);

    // 4. Muat Lembar Nilai & Catatan Wali Kelas
    const loadGradeAndNotesData = useCallback(async () => {
        if (
            !resolvedSchoolId ||
            !selectedYearId ||
            !selectedSemesterId ||
            !selectedClassId ||
            !selectedSubjectId
        ) {
            setGradeRows([]);
            return;
        }

        setIsLoadingSheet(true);
        try {
            const [sheetRes, notesRes] = await Promise.all([
                gradeService.getSubjectGradeSheet({
                    schoolId: resolvedSchoolId,
                    academicYearId: selectedYearId,
                    semesterId: selectedSemesterId,
                    classId: selectedClassId,
                    subjectId: selectedSubjectId,
                    teacherId,
                }),
                gradeService.getClassReportNotes({
                    schoolId: resolvedSchoolId,
                    academicYearId: selectedYearId,
                    semesterId: selectedSemesterId,
                    classId: selectedClassId,
                }),
            ]);

            const rows = sheetRes.data;
            const maxExistingTp = rows.reduce(
                (max, r) => Math.max(max, r.grade.formativeScores.length),
                3
            );
            setTpCount(Math.max(3, maxExistingTp));
            setGradeRows(rows);
            setNotesMap(notesRes.data);
            setHasUnsavedNotes(false);

            // Pulihkan predikat P5 (SAB/BSH/SB/MB) dari data tersimpan
            const detectedLevels: Record<string, P5LevelCode> = {};
            rows.forEach((r) => {
                const existing = notesRes.data.get(r.student.id);
                detectedLevels[r.student.id] = detectP5LevelFromText(
                    existing?.cocurricularNote
                );
            });
            setP5LevelByStudent(detectedLevels);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Gagal memuat lembar nilai.'
            );
        } finally {
            setIsLoadingSheet(false);
        }
    }, [
        resolvedSchoolId,
        selectedYearId,
        selectedSemesterId,
        selectedClassId,
        selectedSubjectId,
        teacherId,
    ]);

    useEffect(() => {
        void loadGradeAndNotesData();
    }, [loadGradeAndNotesData]);

    // Sinkronisasi Tanggal Raport Kelas dari data yang sudah tersimpan saat mode STS/SAS berganti
    useEffect(() => {
        const firstNote = Array.from(notesMap.values())[0];
        if (!firstNote) return;
        const savedDate =
            examMode === 'STS' ? firstNote.reportDateSts : firstNote.reportDateSas;
        if (savedDate) {
            setClassReportDate(savedDate);
        }
    }, [notesMap, examMode]);

    // 5. Muat Nilai Seluruh Mapel untuk Generator Catatan & P5 Otomatis di Tab 2
    const loadAllClassGradesForNotes = useCallback(async () => {
        if (!resolvedSchoolId || !selectedSemesterId || !selectedClassId) return;
        const { data } = await supabase
            .from('student_grades')
            .select(
                'studentId, subjectId, formativeAvg, stsScore, sasScore, finalScore'
            )
            .eq('schoolId', resolvedSchoolId)
            .eq('semesterId', selectedSemesterId)
            .eq('classId', selectedClassId);

        if (data) {
            setClassAllGrades(
                data.map((r: Record<string, unknown>) => ({
                    studentId: String(r.studentId),
                    subjectId: String(r.subjectId),
                    formativeAvg:
                        r.formativeAvg !== null && r.formativeAvg !== undefined
                            ? Number(r.formativeAvg)
                            : null,
                    stsScore:
                        r.stsScore !== null && r.stsScore !== undefined
                            ? Number(r.stsScore)
                            : null,
                    sasScore:
                        r.sasScore !== null && r.sasScore !== undefined
                            ? Number(r.sasScore)
                            : null,
                    finalScore:
                        r.finalScore !== null && r.finalScore !== undefined
                            ? Number(r.finalScore)
                            : null,
                }))
            );
        }
    }, [resolvedSchoolId, selectedSemesterId, selectedClassId]);

    useEffect(() => {
        if (activeTab === 'NOTES') {
            void loadAllClassGradesForNotes();
        }
    }, [activeTab, loadAllClassGradesForNotes]);

    // 6. Muat Peringkat Kelas saat Tab Ranking dibuka
    const loadRankings = useCallback(async () => {
        if (!resolvedSchoolId || !selectedSemesterId || !selectedClassId) return;
        setIsLoadingRankings(true);
        try {
            const res = await gradeService.getClassRankings({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
                examType: examMode,
            });
            setRankings(res.data);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Gagal memuat peringkat kelas.'
            );
        } finally {
            setIsLoadingRankings(false);
        }
    }, [resolvedSchoolId, selectedSemesterId, selectedClassId, examMode]);

    useEffect(() => {
        if (activeTab === 'RANKING') {
            void loadRankings();
        }
    }, [activeTab, loadRankings]);

    // Handler Perubahan Nilai Formatif (TP ke-i)
    const handleFormativeTpChange = (
        studentId: string,
        tpIndex: number,
        rawValue: string
    ) => {
        const parsedVal = clampScore(rawValue);
        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.student.id !== studentId) return row;

                const nextScores = [...row.grade.formativeScores];
                while (nextScores.length <= tpIndex) {
                    nextScores.push(Number.NaN);
                }
                nextScores[tpIndex] = parsedVal === null ? Number.NaN : parsedVal;

                const cleanedScores = nextScores.filter((n) => !Number.isNaN(n));
                const nextAvg = computeFormativeAverage(cleanedScores);
                const nextFinal = row.isManualFinalScore
                    ? row.grade.finalScore
                    : computeWeightedFinalScore(
                        nextAvg,
                        row.grade.stsScore,
                        row.grade.sasScore,
                        weights
                    );

                return {
                    ...row,
                    grade: {
                        ...row.grade,
                        formativeScores: cleanedScores,
                        formativeAvg: nextAvg,
                        finalScore: nextFinal,
                        predicate: computePredicate(nextFinal),
                    },
                };
            })
        );
    };

    const handleExamScoreChange = (
        studentId: string,
        field: 'stsScore' | 'sasScore' | 'finalScore',
        rawValue: string
    ) => {
        const parsedVal = clampScore(rawValue);
        setGradeRows((prev) =>
            prev.map((row) => {
                if (row.student.id !== studentId) return row;

                if (field === 'finalScore') {
                    return {
                        ...row,
                        isManualFinalScore: parsedVal !== null,
                        grade: {
                            ...row.grade,
                            finalScore: parsedVal,
                            predicate: computePredicate(parsedVal),
                        },
                    };
                }

                const nextSts = field === 'stsScore' ? parsedVal : row.grade.stsScore;
                const nextSas = field === 'sasScore' ? parsedVal : row.grade.sasScore;
                const nextFinal = row.isManualFinalScore
                    ? row.grade.finalScore
                    : computeWeightedFinalScore(
                        row.grade.formativeAvg,
                        nextSts,
                        nextSas,
                        weights
                    );

                return {
                    ...row,
                    grade: {
                        ...row.grade,
                        stsScore: nextSts,
                        sasScore: nextSas,
                        finalScore: nextFinal,
                        predicate: computePredicate(nextFinal),
                    },
                };
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
                    ? {
                        ...row,
                        grade: {
                            ...row.grade,
                            [field]: value,
                        },
                    }
                    : row
            )
        );
    };

    const handleRecalculateAll = () => {
        setGradeRows((prev) =>
            prev.map((row) => {
                const nextFinal = computeWeightedFinalScore(
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
                        finalScore: nextFinal,
                        predicate: computePredicate(nextFinal),
                    },
                };
            })
        );
        toast.success('Seluruh nilai akhir berhasil dihitung ulang sesuai bobot.');
    };

    const handleAutoFillDescriptions = () => {
        const subjName =
            subjects.find((s) => s.id === selectedSubjectId)?.name ||
            'mata pelajaran ini';

        setGradeRows((prev) =>
            prev.map((row) => {
                const stsBasis = row.grade.stsScore ?? row.grade.formativeAvg;
                const sasBasis = row.grade.finalScore;

                return {
                    ...row,
                    grade: {
                        ...row.grade,
                        stsCompetencyDescription:
                            row.grade.stsCompetencyDescription?.trim()
                                ? row.grade.stsCompetencyDescription
                                : buildAutoDescription(subjName, stsBasis, true),
                        competencyDescription: row.grade.competencyDescription?.trim()
                            ? row.grade.competencyDescription
                            : buildAutoDescription(subjName, sasBasis, false),
                    },
                };
            })
        );
        toast.success(
            'Deskripsi capaian kompetensi otomatis berhasil diisi untuk kolom yang masih kosong.'
        );
    };

    const handleSaveAllGrades = async () => {
        if (gradeRows.length === 0) return;
        setIsSavingGrades(true);
        try {
            const records = gradeRows.map((r) => r.grade);
            const res = await gradeService.saveSubjectGradesBatch(records);
            toast.success(res.message);
            await loadGradeAndNotesData();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Gagal menyimpan data nilai.'
            );
        } finally {
            setIsSavingGrades(false);
        }
    };

    // Helper Catatan Raport per Siswa (otomatis memakai classReportDate)
    const getOrInitStudentNote = useCallback(
        (studentId: string): StudentReportNoteRecord => {
            const existing = notesMap.get(studentId);
            if (existing) {
                return {
                    ...existing,
                    reportDateSts:
                        examMode === 'STS'
                            ? classReportDate || existing.reportDateSts
                            : existing.reportDateSts,
                    reportDateSas:
                        examMode === 'SAS'
                            ? classReportDate || existing.reportDateSas
                            : existing.reportDateSas,
                };
            }
            return {
                schoolId: resolvedSchoolId,
                academicYearId: selectedYearId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
                studentId,
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
                reportDateSts: classReportDate,
                reportDateSas: classReportDate,
                isStsPublished: false,
                isSasPublished: false,
            };
        },
        [
            notesMap,
            examMode,
            classReportDate,
            resolvedSchoolId,
            selectedYearId,
            selectedSemesterId,
            selectedClassId,
        ]
    );

    const updateStudentNoteState = (
        studentId: string,
        updater: (prev: StudentReportNoteRecord) => StudentReportNoteRecord
    ) => {
        setHasUnsavedNotes(true);
        setNotesMap((prev) => {
            const next = new Map(prev);
            const current = getOrInitStudentNote(studentId);
            next.set(studentId, updater(current));
            return next;
        });
    };

    // Terapkan tanggal raport kelas ke semua siswa
    const handleClassReportDateChange = (newDate: string) => {
        setClassReportDate(newDate);
        setHasUnsavedNotes(true);
        setNotesMap((prev) => {
            const next = new Map(prev);
            gradeRows.forEach((row) => {
                const current = getOrInitStudentNote(row.student.id);
                next.set(row.student.id, {
                    ...current,
                    reportDateSts:
                        examMode === 'STS' ? newDate || null : current.reportDateSts,
                    reportDateSas:
                        examMode === 'SAS' ? newDate || null : current.reportDateSas,
                });
            });
            return next;
        });
    };

    // Toggle pilihan Dimensi Profil Pelajar Pancasila kelas
    const toggleP5Dimension = (shortLabel: string) => {
        setP5Dimensions((prev) =>
            prev.includes(shortLabel)
                ? prev.filter((d) => d !== shortLabel)
                : [...prev, shortLabel]
        );
    };

    // Ubah predikat P5 (MB / SB / BSH / SAB) pada 1 siswa & langsung susun narasi resminya
    const handleStudentP5LevelChange = (
        row: GradeSheetRow,
        newLevel: P5LevelCode
    ) => {
        setP5LevelByStudent((prev) => ({
            ...prev,
            [row.student.id]: newLevel,
        }));

        const narrative = composeP5Narrative({
            studentName: row.student.fullName,
            theme: p5Theme,
            activityTitle: p5ActivityTitle,
            dimensions: p5Dimensions,
            level: newLevel,
        });

        updateStudentNoteState(row.student.id, (prev) => ({
            ...prev,
            cocurricularNote: narrative,
        }));
    };

    // Ambil daftar nilai semua mapel milik 1 siswa untuk generator otomatis
    const getStudentSubjectScores = useCallback(
        (studentId: string): { subjectName: string; score: number }[] => {
            const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
            return classAllGrades
                .filter((g) => g.studentId === studentId)
                .map((g) => {
                    const rawScore =
                        examMode === 'STS'
                            ? (g.stsScore ?? g.formativeAvg)
                            : (g.finalScore ?? g.sasScore ?? g.stsScore);
                    return {
                        subjectName:
                            subjectNameById.get(g.subjectId) || 'Mata Pelajaran',
                        score: rawScore,
                    };
                })
                .filter(
                    (item): item is { subjectName: string; score: number } =>
                        item.score !== null && !Number.isNaN(item.score)
                );
        },
        [classAllGrades, subjects, examMode]
    );

    // Generate catatan wali kelas & narasi P5 otomatis untuk 1 siswa
    const handleGenerateSingleStudentNotes = (row: GradeSheetRow) => {
        const current = getOrInitStudentNote(row.student.id);
        const subjectScores = getStudentSubjectScores(row.student.id);
        const inferredLevel = inferP5LevelFromScores(subjectScores);

        setP5LevelByStudent((prev) => ({
            ...prev,
            [row.student.id]: inferredLevel,
        }));

        const autoHomeroom = buildAutoHomeroomNote({
            studentName: row.student.fullName,
            mode: examMode,
            subjectScores,
            sickDays:
                examMode === 'STS' ? current.stsSickDays : current.sickDays,
            permissionDays:
                examMode === 'STS'
                    ? current.stsPermissionDays
                    : current.permissionDays,
            alphaDays:
                examMode === 'STS' ? current.stsAlphaDays : current.alphaDays,
            extracurriculars: current.extracurriculars,
        });

        const autoP5 = composeP5Narrative({
            studentName: row.student.fullName,
            theme: p5Theme,
            activityTitle: p5ActivityTitle,
            dimensions: p5Dimensions,
            level: inferredLevel,
        });

        updateStudentNoteState(row.student.id, (prev) => ({
            ...prev,
            stsHomeroomNote:
                examMode === 'STS' ? autoHomeroom : prev.stsHomeroomNote,
            homeroomNote:
                examMode === 'SAS' ? autoHomeroom : prev.homeroomNote,
            cocurricularNote: examMode === 'SAS' ? autoP5 : prev.cocurricularNote,
        }));

        toast.success(
            `Catatan & P5 (${inferredLevel}) untuk ${row.student.fullName} berhasil dibuat.`
        );
    };

    // Generate catatan wali kelas & P5 otomatis untuk SELURUH SISWA di kelas
    const handleGenerateAllClassNotes = (overwriteExisting: boolean) => {
        if (gradeRows.length === 0) return;

        let updatedCount = 0;
        const nextLevels: Record<string, P5LevelCode> = { ...p5LevelByStudent };

        setNotesMap((prev) => {
            const next = new Map(prev);
            gradeRows.forEach((row) => {
                const current = getOrInitStudentNote(row.student.id);
                const subjectScores = getStudentSubjectScores(row.student.id);
                const inferredLevel = inferP5LevelFromScores(subjectScores);

                const existingNote =
                    examMode === 'STS'
                        ? current.stsHomeroomNote
                        : current.homeroomNote;

                const shouldFillHomeroom =
                    overwriteExisting || !existingNote?.trim();
                const shouldFillP5 =
                    examMode === 'SAS' &&
                    (overwriteExisting || !current.cocurricularNote?.trim());

                if (shouldFillHomeroom || shouldFillP5) {
                    updatedCount += 1;
                }

                if (shouldFillP5) {
                    nextLevels[row.student.id] = inferredLevel;
                }

                const autoHomeroom = buildAutoHomeroomNote({
                    studentName: row.student.fullName,
                    mode: examMode,
                    subjectScores,
                    sickDays:
                        examMode === 'STS'
                            ? current.stsSickDays
                            : current.sickDays,
                    permissionDays:
                        examMode === 'STS'
                            ? current.stsPermissionDays
                            : current.permissionDays,
                    alphaDays:
                        examMode === 'STS'
                            ? current.stsAlphaDays
                            : current.alphaDays,
                    extracurriculars: current.extracurriculars,
                });

                const autoP5 = composeP5Narrative({
                    studentName: row.student.fullName,
                    theme: p5Theme,
                    activityTitle: p5ActivityTitle,
                    dimensions: p5Dimensions,
                    level: inferredLevel,
                });

                next.set(row.student.id, {
                    ...current,
                    stsHomeroomNote:
                        examMode === 'STS' && shouldFillHomeroom
                            ? autoHomeroom
                            : current.stsHomeroomNote,
                    homeroomNote:
                        examMode === 'SAS' && shouldFillHomeroom
                            ? autoHomeroom
                            : current.homeroomNote,
                    cocurricularNote: shouldFillP5
                        ? autoP5
                        : current.cocurricularNote,
                });
            });
            return next;
        });

        setP5LevelByStudent(nextLevels);
        setHasUnsavedNotes(true);
        toast.success(
            `Catatan & Kokurikuler P5 berhasil dibuat untuk ${updatedCount} siswa. Klik "Simpan Semua Catatan" untuk menyimpan ke database.`
        );
    };

    // Terapkan status kenaikan kelas / kelulusan massal untuk satu kelas
    const handleBulkPromotionStatus = (status: PromotionStatus) => {
        if (gradeRows.length === 0) return;
        setHasUnsavedNotes(true);
        setNotesMap((prev) => {
            const next = new Map(prev);
            gradeRows.forEach((row) => {
                const current = getOrInitStudentNote(row.student.id);
                next.set(row.student.id, {
                    ...current,
                    promotionStatus: status,
                });
            });
            return next;
        });
        toast.success(
            `Status evaluasi seluruh siswa diubah ke "${status.replace('_', ' ')}".`
        );
    };

    // Simpan seluruh catatan siswa satu kelas sekaligus
    const handleSaveAllNotesBatch = async () => {
        if (gradeRows.length === 0) return;
        setIsSavingAllNotes(true);
        try {
            for (const row of gradeRows) {
                const note = getOrInitStudentNote(row.student.id);
                await gradeService.saveStudentReportNote(note, authUser?.id);
            }
            setHasUnsavedNotes(false);
            toast.success(
                `Seluruh catatan raport ${examMode} (${gradeRows.length} siswa) berhasil disimpan.`
            );
            await loadGradeAndNotesData();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal menyimpan semua catatan kelas.'
            );
        } finally {
            setIsSavingAllNotes(false);
        }
    };

    const handleSyncDailyAttendance = async () => {
        if (!resolvedSchoolId || !selectedSemesterId || !selectedClassId) return;
        setIsSyncingAttendance(true);
        try {
            const res = await gradeService.syncAttendanceFromDaily({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
            });
            toast.success(res.message);
            await loadGradeAndNotesData();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal menyinkronkan data kehadiran.'
            );
        } finally {
            setIsSyncingAttendance(false);
        }
    };

    const handlePublishAllClassReports = async (
        mode: ReportExamMode,
        publish: boolean
    ) => {
        if (
            !resolvedSchoolId ||
            !selectedYearId ||
            !selectedSemesterId ||
            !selectedClassId
        )
            return;
        setIsPublishingBatch(true);
        try {
            const syncedMap = new Map<string, StudentReportNoteRecord>();
            gradeRows.forEach((r) => {
                syncedMap.set(r.student.id, getOrInitStudentNote(r.student.id));
            });

            const studentIds = gradeRows.map((r) => r.student.id);
            const res = await gradeService.publishClassReportsBatch({
                schoolId: resolvedSchoolId,
                academicYearId: selectedYearId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
                studentIds,
                existingNotesMap: syncedMap,
                mode,
                isPublished: publish,
                updatedBy: authUser?.id,
            });
            toast.success(res.message);
            await loadGradeAndNotesData();
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal memperbarui publikasi raport kelas.'
            );
        } finally {
            setIsPublishingBatch(false);
        }
    };

    const currentClassContext = useMemo((): ClassReportContext | null => {
        const cls = classes.find((c) => c.id === selectedClassId);
        const ay = academicYears.find((a) => a.id === selectedYearId);
        const sem = semesters.find((s) => s.id === selectedSemesterId);
        if (!cls || !ay || !sem) return null;

        return {
            classId: cls.id,
            className: cls.name,
            gradeLevel: cls.gradeLevel,
            academicYearName: ay.name,
            semesterType: sem.type,
            homeroomTeacherName: cls.homeroomTeacherName,
            homeroomTeacherNip: cls.homeroomTeacherNip,
        };
    }, [
        classes,
        selectedClassId,
        academicYears,
        selectedYearId,
        semesters,
        selectedSemesterId,
    ]);

    const handlePrintSingleStudentPdf = async (row: GradeSheetRow) => {
        if (!resolvedSchoolId || !selectedSemesterId || !currentClassContext)
            return;
        setPrintingStudentId(row.student.id);
        try {
            const bundleRes = await gradeService.getStudentCompleteReportBundle({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                studentId: row.student.id,
            });

            await generateCurriculumMerdekaReportPdf({
                mode: examMode,
                school: bundleRes.data.school,
                classContext: currentClassContext,
                student: row.student,
                subjects: bundleRes.data.subjects,
                grades: bundleRes.data.grades,
                reportNote: getOrInitStudentNote(row.student.id),
                achievements: bundleRes.data.achievements,
            });

            toast.success(
                `PDF Raport ${examMode} untuk ${row.student.fullName} berhasil diunduh.`
            );
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : 'Gagal mencetak PDF raport.'
            );
        } finally {
            setPrintingStudentId(null);
        }
    };

    const handlePrintEntireClassPdf = async () => {
        if (
            !resolvedSchoolId ||
            !selectedSemesterId ||
            !selectedClassId ||
            !currentClassContext ||
            gradeRows.length === 0
        )
            return;

        setIsPrintingBatch(true);
        try {
            const studentIds = gradeRows.map((r) => r.student.id);
            const batchRes = await gradeService.getClassCompleteReportBundles({
                schoolId: resolvedSchoolId,
                semesterId: selectedSemesterId,
                classId: selectedClassId,
                studentIds,
            });

            const inputs = gradeRows.map((row) => ({
                mode: examMode,
                school: batchRes.data.school,
                classContext: currentClassContext,
                student: row.student,
                subjects: batchRes.data.subjects,
                grades: batchRes.data.gradesByStudent.get(row.student.id) ?? [],
                reportNote: getOrInitStudentNote(row.student.id),
                achievements:
                    batchRes.data.achievementsByStudent.get(row.student.id) ?? [],
            }));

            await generateClassBatchReportPdf(inputs);
            toast.success(
                `PDF Raport ${examMode} untuk ${inputs.length} siswa berhasil diunduh.`
            );
        } catch (err) {
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Gagal mencetak PDF satu kelas.'
            );
        } finally {
            setIsPrintingBatch(false);
        }
    };

    // Filter baris siswa pada Tab 2 berdasarkan pencarian nama/NISN
    const filteredNoteRows = useMemo(() => {
        const q = noteSearchQuery.trim().toLowerCase();
        if (!q) return gradeRows;
        return gradeRows.filter(
            (r) =>
                r.student.fullName.toLowerCase().includes(q) ||
                r.student.nisn.toLowerCase().includes(q) ||
                (r.student.nis ?? '').toLowerCase().includes(q)
        );
    }, [gradeRows, noteSearchQuery]);

    return (
        <div className="p-6 space-y-6">
            {/* Header Halaman */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Penilaian &amp; Raport Kurikulum Merdeka
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Kelola nilai formatif, STS, SAS, deskripsi capaian kompetensi,
                        kokurikuler P5, catatan wali kelas, hingga cetak PDF raport resmi.
                    </p>
                </div>

                {/* Saklar Mode Raport STS / SAS */}
                <div className="inline-flex items-center p-1 rounded-xl border bg-muted/50">
                    <button
                        type="button"
                        onClick={() => setExamMode('STS')}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                            examMode === 'STS'
                                ? 'bg-primary text-primary-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Tengah Semester (STS)
                    </button>
                    <button
                        type="button"
                        onClick={() => setExamMode('SAS')}
                        className={cn(
                            'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                            examMode === 'SAS'
                                ? 'bg-primary text-primary-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Akhir Semester (SAS)
                    </button>
                </div>
            </div>

            {/* Filter Tahun Ajaran, Semester, Kelas, dan Mata Pelajaran */}
            <Card className="border-none shadow-sm">
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            Tahun Ajaran
                        </label>
                        <select
                            value={selectedYearId}
                            onChange={(e) => setSelectedYearId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {academicYears.map((ay) => (
                                <option key={ay.id} value={ay.id}>
                                    {ay.name} {ay.isActive ? '(Aktif)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            Semester
                        </label>
                        <select
                            value={selectedSemesterId}
                            onChange={(e) => setSelectedSemesterId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {filteredSemesters.map((sem) => (
                                <option key={sem.id} value={sem.id}>
                                    Semester {sem.type} {sem.isActive ? '(Aktif)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            Kelas / Rombel
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {classes.length === 0 ? (
                                <option value="">Belum ada kelas</option>
                            ) : (
                                classes.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name} (Wali: {cls.homeroomTeacherName})
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                            Mata Pelajaran
                        </label>
                        <select
                            value={selectedSubjectId}
                            onChange={(e) => setSelectedSubjectId(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg border bg-background"
                        >
                            {subjects.length === 0 ? (
                                <option value="">Belum ada mata pelajaran</option>
                            ) : (
                                subjects.map((subj) => (
                                    <option key={subj.id} value={subj.id}>
                                        {subj.code ? `[${subj.code}] ` : ''}
                                        {subj.name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Navigasi 3 Tab Utama */}
            <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <button
                    type="button"
                    onClick={() => setActiveTab('GRADES')}
                    className={cn(
                        'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        activeTab === 'GRADES'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card border hover:bg-muted'
                    )}
                >
                    <FileSpreadsheet className="w-4 h-4" />
                    1. Input Nilai &amp; Capaian Kompetensi
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('NOTES')}
                    className={cn(
                        'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        activeTab === 'NOTES'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card border hover:bg-muted'
                    )}
                >
                    <ClipboardCheck className="w-4 h-4" />
                    2. Kokurikuler P5, Catatan Wali Kelas &amp; PDF
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('RANKING')}
                    className={cn(
                        'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        activeTab === 'RANKING'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card border hover:bg-muted'
                    )}
                >
                    <Trophy className="w-4 h-4" />
                    3. Peringkat Kelas (Khusus Guru)
                </button>
            </div>

            {/* ==================================================================== */}
            {/* TAB 1: LEMBAR INPUT NILAI MATA PELAJARAN                            */}
            {/* ==================================================================== */}
            {activeTab === 'GRADES' && (
                <Card className="border-none shadow-sm">
                    <CardHeader className="border-b space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg">
                                    Lembar Penilaian Mata Pelajaran
                                </CardTitle>
                                <CardDescription>
                                    Nilai Akhir otomatis dihitung dari komponen yang sudah terisi
                                    (STS tidak turun jika SAS masih kosong).
                                </CardDescription>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleAutoFillDescriptions}
                                    disabled={gradeRows.length === 0}
                                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50"
                                >
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                    Isi Deskripsi Otomatis
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSaveAllGrades}
                                    disabled={isSavingGrades || gradeRows.length === 0}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSavingGrades ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    Simpan Semua Nilai
                                </button>
                            </div>
                        </div>

                        {/* Pengaturan Bobot & Jumlah Kolom TP */}
                        <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-muted/40 border text-xs">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground">
                                    Bobot Nilai (%):
                                </span>
                                <label className="inline-flex items-center gap-1.5">
                                    <span>Formatif</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={weights.formative}
                                        onChange={(e) =>
                                            setWeights({
                                                ...weights,
                                                formative: Number(e.target.value) || 0,
                                            })
                                        }
                                        className="w-14 px-2 py-1 rounded border bg-background text-center font-semibold"
                                    />
                                </label>
                                <label className="inline-flex items-center gap-1.5">
                                    <span>STS</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={weights.sts}
                                        onChange={(e) =>
                                            setWeights({
                                                ...weights,
                                                sts: Number(e.target.value) || 0,
                                            })
                                        }
                                        className="w-14 px-2 py-1 rounded border bg-background text-center font-semibold"
                                    />
                                </label>
                                <label className="inline-flex items-center gap-1.5">
                                    <span>SAS</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={weights.sas}
                                        onChange={(e) =>
                                            setWeights({
                                                ...weights,
                                                sas: Number(e.target.value) || 0,
                                            })
                                        }
                                        className="w-14 px-2 py-1 rounded border bg-background text-center font-semibold"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={handleRecalculateAll}
                                    className="px-2.5 py-1 rounded border bg-background hover:bg-muted font-medium"
                                >
                                    Hitung Ulang
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                    Kolom Nilai TP:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setTpCount((c) => Math.max(1, c - 1))}
                                    className="px-2 py-1 rounded border bg-background hover:bg-muted font-bold"
                                >
                                    -
                                </button>
                                <span className="font-mono font-bold px-1">{tpCount} TP</span>
                                <button
                                    type="button"
                                    onClick={() => setTpCount((c) => Math.min(10, c + 1))}
                                    className="px-2 py-1 rounded border bg-background hover:bg-muted font-bold"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        {isLoadingSheet ? (
                            <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-sm">Memuat daftar siswa dan nilai...</p>
                            </div>
                        ) : gradeRows.length === 0 ? (
                            <div className="p-12 text-center space-y-2 text-muted-foreground">
                                <Users className="w-10 h-10 mx-auto opacity-40" />
                                <p className="font-medium text-foreground">
                                    Tidak ada siswa aktif pada kelas terpilih
                                </p>
                                <p className="text-xs">
                                    Pastikan kelas dan mata pelajaran sudah dipilih dengan benar.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead className="bg-muted/60 text-muted-foreground uppercase border-b">
                                        <tr>
                                            <th className="px-3 py-3 w-10 text-center">No</th>
                                            <th className="px-3 py-3 min-w-45">Nama Siswa</th>
                                            {Array.from({ length: tpCount }).map((_, idx) => (
                                                <th
                                                    key={idx}
                                                    className="px-2 py-3 w-16 text-center bg-blue-50/50 dark:bg-blue-950/20"
                                                >
                                                    TP {idx + 1}
                                                </th>
                                            ))}
                                            <th className="px-2 py-3 w-16 text-center font-bold">
                                                Rata TP
                                            </th>
                                            <th className="px-2 py-3 w-20 text-center bg-amber-50/50 dark:bg-amber-950/20">
                                                STS
                                            </th>
                                            <th className="px-2 py-3 w-20 text-center bg-emerald-50/50 dark:bg-emerald-950/20">
                                                SAS
                                            </th>
                                            <th className="px-2 py-3 w-20 text-center font-bold">
                                                Nilai Akhir
                                            </th>
                                            <th className="px-2 py-3 w-14 text-center">Pred</th>
                                            <th className="px-3 py-3 min-w-57.5">
                                                Deskripsi Capaian Kompetensi (STS)
                                            </th>
                                            <th className="px-3 py-3 min-w-57.5">
                                                Deskripsi Capaian Kompetensi (SAS / Akhir)
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gradeRows.map((row, idx) => (
                                            <tr
                                                key={row.student.id}
                                                className="border-b hover:bg-muted/20 align-top"
                                            >
                                                <td className="px-3 py-3 text-center text-muted-foreground">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold text-foreground text-sm">
                                                        {row.student.fullName}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground font-mono">
                                                        NISN: {row.student.nisn}
                                                    </div>
                                                </td>

                                                {/* Kolom Input TP 1..N */}
                                                {Array.from({ length: tpCount }).map((_, tpIdx) => {
                                                    const val = row.grade.formativeScores[tpIdx];
                                                    return (
                                                        <td
                                                            key={tpIdx}
                                                            className="px-1.5 py-2.5 text-center bg-blue-50/20 dark:bg-blue-950/10"
                                                        >
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                step="0.01"
                                                                value={
                                                                    val !== undefined && !Number.isNaN(val)
                                                                        ? val
                                                                        : ''
                                                                }
                                                                onChange={(e) =>
                                                                    handleFormativeTpChange(
                                                                        row.student.id,
                                                                        tpIdx,
                                                                        e.target.value
                                                                    )
                                                                }
                                                                className="w-14 px-1.5 py-1.5 text-center rounded border bg-background font-medium"
                                                            />
                                                        </td>
                                                    );
                                                })}

                                                <td className="px-2 py-3 text-center font-semibold">
                                                    {row.grade.formativeAvg !== null
                                                        ? row.grade.formativeAvg.toFixed(1)
                                                        : '-'}
                                                </td>

                                                {/* Nilai STS */}
                                                <td className="px-1.5 py-2.5 text-center bg-amber-50/20 dark:bg-amber-950/10">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={row.grade.stsScore ?? ''}
                                                        onChange={(e) =>
                                                            handleExamScoreChange(
                                                                row.student.id,
                                                                'stsScore',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="w-16 px-1.5 py-1.5 text-center rounded border bg-background font-semibold"
                                                    />
                                                </td>

                                                {/* Nilai SAS */}
                                                <td className="px-1.5 py-2.5 text-center bg-emerald-50/20 dark:bg-emerald-950/10">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={row.grade.sasScore ?? ''}
                                                        onChange={(e) =>
                                                            handleExamScoreChange(
                                                                row.student.id,
                                                                'sasScore',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="w-16 px-1.5 py-1.5 text-center rounded border bg-background font-semibold"
                                                    />
                                                </td>

                                                {/* Nilai Akhir */}
                                                <td className="px-1.5 py-2.5 text-center">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        step="0.01"
                                                        value={row.grade.finalScore ?? ''}
                                                        onChange={(e) =>
                                                            handleExamScoreChange(
                                                                row.student.id,
                                                                'finalScore',
                                                                e.target.value
                                                            )
                                                        }
                                                        className="w-16 px-1.5 py-1.5 text-center rounded border border-primary/40 bg-primary/5 font-bold text-primary"
                                                    />
                                                </td>

                                                <td className="px-2 py-3 text-center">
                                                    {row.grade.predicate ? (
                                                        <Badge variant="outline" className="font-bold">
                                                            {row.grade.predicate}
                                                        </Badge>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>

                                                {/* Deskripsi STS */}
                                                <td className="px-2 py-2.5">
                                                    <textarea
                                                        rows={2}
                                                        value={row.grade.stsCompetencyDescription ?? ''}
                                                        onChange={(e) =>
                                                            handleDescriptionChange(
                                                                row.student.id,
                                                                'stsCompetencyDescription',
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder="Capaian tengah semester..."
                                                        className="w-full p-2 rounded border bg-background text-xs resize-y"
                                                    />
                                                </td>

                                                {/* Deskripsi SAS / Akhir */}
                                                <td className="px-2 py-2.5">
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
                                                        placeholder="Capaian akhir semester..."
                                                        className="w-full p-2 rounded border bg-background text-xs resize-y"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ==================================================================== */}
            {/* TAB 2: KOKURIKULER P5, CATATAN WALI KELAS, PUBLIKASI & CETAK PDF     */}
            {/* ==================================================================== */}
            {activeTab === 'NOTES' && (
                <div className="space-y-4">
                    {/* TINGKAT 1: PANEL KONFIGURASI KELAS & AKSI MASSAL */}
                    <Card className="border-none shadow-sm">
                        <CardHeader className="pb-3 border-b">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <span>
                                            Pengaturan Raport Kelas ({examMode})
                                        </span>
                                        {hasUnsavedNotes && (
                                            <Badge className="bg-amber-500 text-white text-[11px]">
                                                Perubahan Belum Disimpan
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription>
                                        Atur tanggal raport, Tema &amp; Dimensi Projek P5 sekali
                                        untuk seluruh kelas, lalu gunakan tabel cepat di bawah.
                                    </CardDescription>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveAllNotesBatch}
                                        disabled={isSavingAllNotes || gradeRows.length === 0}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-2xs"
                                    >
                                        {isSavingAllNotes ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        Simpan Semua Catatan ({gradeRows.length} Siswa)
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handlePrintEntireClassPdf}
                                        disabled={isPrintingBatch || gradeRows.length === 0}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 shadow-2xs"
                                    >
                                        {isPrintingBatch ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        Unduh PDF Satu Kelas ({gradeRows.length} Siswa)
                                    </button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4">
                            {/* Master Konfigurasi Projek P5 Kelas (Tampil pada Mode SAS) */}
                            {examMode === 'SAS' && (
                                <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/60 space-y-3">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
                                        <Award className="w-4 h-4" />
                                        <span>
                                            Master Kokurikuler / Projek Penguatan Profil Pelajar
                                            Pancasila (P5) Kelas Ini
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <label className="block font-semibold mb-1 text-foreground">
                                                1. Tema Projek P5 (Kurikulum Merdeka)
                                            </label>
                                            <select
                                                value={p5Theme}
                                                onChange={(e) => setP5Theme(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border bg-background font-medium"
                                            >
                                                {P5_OFFICIAL_THEMES.map((theme) => (
                                                    <option key={theme} value={theme}>
                                                        {theme}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block font-semibold mb-1 text-foreground">
                                                2. Judul Kegiatan Spesifik{' '}
                                                <span className="text-muted-foreground font-normal">
                                                    (Opsional)
                                                </span>
                                            </label>
                                            <input
                                                type="text"
                                                value={p5ActivityTitle}
                                                onChange={(e) =>
                                                    setP5ActivityTitle(e.target.value)
                                                }
                                                placeholder="Misal: Pengolahan Sampah Organik & Karya Daur Ulang"
                                                className="w-full px-3 py-2 rounded-lg border bg-background"
                                            />
                                        </div>
                                    </div>

                                    <div className="text-xs space-y-1.5">
                                        <label className="block font-semibold text-foreground">
                                            3. Dimensi Profil Pelajar Pancasila yang Diamati:
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {P5_DIMENSIONS.map((dim) => {
                                                const active = p5Dimensions.includes(
                                                    dim.shortLabel
                                                );
                                                return (
                                                    <button
                                                        key={dim.id}
                                                        type="button"
                                                        onClick={() =>
                                                            toggleP5Dimension(dim.shortLabel)
                                                        }
                                                        className={cn(
                                                            'px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                                                            active
                                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                                : 'bg-background text-muted-foreground hover:bg-muted'
                                                        )}
                                                    >
                                                        {active ? '✓ ' : '+ '}
                                                        {dim.shortLabel}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Toolbar Aksi Massal Satu Kelas */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    {/* Tanggal Raport Seragam */}
                                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border text-xs">
                                        <Calendar className="w-3.5 h-3.5 text-primary" />
                                        <span className="font-semibold">
                                            Tgl Raport ({examMode}):
                                        </span>
                                        <input
                                            type="date"
                                            value={classReportDate}
                                            onChange={(e) =>
                                                handleClassReportDateChange(e.target.value)
                                            }
                                            className="px-2 py-1 text-xs rounded border bg-background font-medium"
                                        />
                                    </div>

                                    {/* Tombol Generate Otomatis Satu Kelas */}
                                    <button
                                        type="button"
                                        onClick={() => handleGenerateAllClassNotes(true)}
                                        disabled={gradeRows.length === 0}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 disabled:opacity-50"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        Auto-Generate Catatan &amp; P5 Semua Siswa
                                    </button>

                                    {/* Sinkronisasi Absensi */}
                                    <button
                                        type="button"
                                        onClick={handleSyncDailyAttendance}
                                        disabled={isSyncingAttendance || !selectedClassId}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-card text-xs font-medium hover:bg-muted disabled:opacity-50"
                                    >
                                        {isSyncingAttendance ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                                        )}
                                        Sinkron Absensi
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Set Status Kenaikan Massal (Saat SAS) */}
                                    {examMode === 'SAS' && (
                                        <select
                                            defaultValue=""
                                            onChange={(e) => {
                                                if (!e.target.value) return;
                                                handleBulkPromotionStatus(
                                                    e.target.value as PromotionStatus
                                                );
                                                e.target.value = '';
                                            }}
                                            className="px-3 py-2 rounded-lg border bg-background text-xs font-medium"
                                        >
                                            <option value="" disabled>
                                                Set Status Kenaikan Massal...
                                            </option>
                                            <option value="NAIK_KELAS">
                                                Semua: Naik Kelas
                                            </option>
                                            <option value="LULUS">
                                                Semua: Lulus Satuan Pendidikan
                                            </option>
                                            <option value="PROSES">
                                                Semua: Dalam Proses Evaluasi
                                            </option>
                                        </select>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            handlePublishAllClassReports(examMode, true)
                                        }
                                        disabled={
                                            isPublishingBatch || gradeRows.length === 0
                                        }
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Publikasikan Semua {examMode}
                                    </button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* TINGKAT 2: TABEL INPUT PADAT (COMPACT SPREADSHEET TABLE) */}
                    <Card className="border-none shadow-sm">
                        <CardHeader className="py-3.5 px-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">
                                Menampilkan <strong>{filteredNoteRows.length}</strong> dari{' '}
                                <strong>{gradeRows.length}</strong> siswa. Edit langsung di
                                tabel, lalu klik <strong>Simpan Semua Catatan</strong> di atas.
                            </div>

                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={noteSearchQuery}
                                    onChange={(e) => setNoteSearchQuery(e.target.value)}
                                    placeholder="Filter nama / NISN siswa..."
                                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-background w-full sm:w-56"
                                />
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            {filteredNoteRows.length === 0 ? (
                                <div className="p-10 text-center text-sm text-muted-foreground">
                                    Tidak ada data siswa yang cocok dengan filter.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead className="bg-muted/60 text-muted-foreground uppercase border-b">
                                            <tr>
                                                <th className="px-3 py-3 w-10 text-center">
                                                    No
                                                </th>
                                                <th className="px-3 py-3 min-w-43.75">
                                                    Nama Siswa
                                                </th>
                                                <th className="px-2 py-3 w-36 text-center">
                                                    Absensi (S / I / A)
                                                </th>
                                                {examMode === 'SAS' && (
                                                    <th className="px-3 py-3 min-w-50">
                                                        Capaian P5 (MB/SB/BSH/SAB)
                                                    </th>
                                                )}
                                                <th className="px-3 py-3 min-w-65">
                                                    Catatan Wali Kelas ({examMode})
                                                </th>
                                                <th className="px-3 py-3 min-w-41.25">
                                                    Ekskul &amp; Status
                                                </th>
                                                <th className="px-3 py-3 w-28 text-center">
                                                    Publikasi
                                                </th>
                                                <th className="px-3 py-3 w-24 text-right">
                                                    Aksi
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredNoteRows.map((row, idx) => {
                                                const note = getOrInitStudentNote(
                                                    row.student.id
                                                );
                                                const p5Code =
                                                    p5LevelByStudent[row.student.id] ??
                                                    'BSH';
                                                const p5Meta =
                                                    P5_LEVEL_OPTIONS.find(
                                                        (o) => o.code === p5Code
                                                    ) ?? P5_LEVEL_OPTIONS[1];
                                                const isPublished =
                                                    examMode === 'STS'
                                                        ? note.isStsPublished
                                                        : note.isSasPublished;
                                                const isPrintingThis =
                                                    printingStudentId === row.student.id;

                                                return (
                                                    <tr
                                                        key={row.student.id}
                                                        className="border-b last:border-0 hover:bg-muted/20 align-top"
                                                    >
                                                        {/* Nomor */}
                                                        <td className="px-3 py-3 text-center text-muted-foreground font-mono">
                                                            {idx + 1}
                                                        </td>

                                                        {/* Identitas Siswa */}
                                                        <td className="px-3 py-3">
                                                            <div className="font-semibold text-foreground text-sm leading-snug">
                                                                {row.student.fullName}
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                                                NISN: {row.student.nisn}
                                                            </div>
                                                        </td>

                                                        {/* Absensi Padat S / I / A */}
                                                        <td className="px-2 py-3">
                                                            <div className="grid grid-cols-3 gap-1">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    title="Sakit"
                                                                    value={
                                                                        examMode === 'STS'
                                                                            ? note.stsSickDays
                                                                            : note.sickDays
                                                                    }
                                                                    onChange={(e) => {
                                                                        const val = Math.max(
                                                                            0,
                                                                            Number(
                                                                                e.target.value
                                                                            ) || 0
                                                                        );
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                stsSickDays:
                                                                                    examMode ===
                                                                                        'STS'
                                                                                        ? val
                                                                                        : prev.stsSickDays,
                                                                                sickDays:
                                                                                    examMode ===
                                                                                        'SAS'
                                                                                        ? val
                                                                                        : prev.sickDays,
                                                                            })
                                                                        );
                                                                    }}
                                                                    className="w-10 px-1 py-1.5 text-center rounded border bg-background font-semibold"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    title="Izin"
                                                                    value={
                                                                        examMode === 'STS'
                                                                            ? note.stsPermissionDays
                                                                            : note.permissionDays
                                                                    }
                                                                    onChange={(e) => {
                                                                        const val = Math.max(
                                                                            0,
                                                                            Number(
                                                                                e.target.value
                                                                            ) || 0
                                                                        );
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                stsPermissionDays:
                                                                                    examMode ===
                                                                                        'STS'
                                                                                        ? val
                                                                                        : prev.stsPermissionDays,
                                                                                permissionDays:
                                                                                    examMode ===
                                                                                        'SAS'
                                                                                        ? val
                                                                                        : prev.permissionDays,
                                                                            })
                                                                        );
                                                                    }}
                                                                    className="w-10 px-1 py-1.5 text-center rounded border bg-background font-semibold"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    title="Alpha"
                                                                    value={
                                                                        examMode === 'STS'
                                                                            ? note.stsAlphaDays
                                                                            : note.alphaDays
                                                                    }
                                                                    onChange={(e) => {
                                                                        const val = Math.max(
                                                                            0,
                                                                            Number(
                                                                                e.target.value
                                                                            ) || 0
                                                                        );
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                stsAlphaDays:
                                                                                    examMode ===
                                                                                        'STS'
                                                                                        ? val
                                                                                        : prev.stsAlphaDays,
                                                                                alphaDays:
                                                                                    examMode ===
                                                                                        'SAS'
                                                                                        ? val
                                                                                        : prev.alphaDays,
                                                                            })
                                                                        );
                                                                    }}
                                                                    className="w-10 px-1 py-1.5 text-center rounded border bg-background font-semibold"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-1 text-[10px] text-center text-muted-foreground mt-0.5">
                                                                <span>S</span>
                                                                <span>I</span>
                                                                <span>A</span>
                                                            </div>
                                                        </td>

                                                        {/* Kolom Kokurikuler / Projek P5 (Mode SAS) */}
                                                        {examMode === 'SAS' && (
                                                            <td className="px-3 py-3 space-y-1.5">
                                                                <select
                                                                    value={p5Code}
                                                                    onChange={(e) =>
                                                                        handleStudentP5LevelChange(
                                                                            row,
                                                                            e.target
                                                                                .value as P5LevelCode
                                                                        )
                                                                    }
                                                                    className={cn(
                                                                        'w-full px-2 py-1.5 rounded-lg border text-xs font-semibold',
                                                                        p5Meta.badgeClass
                                                                    )}
                                                                >
                                                                    {P5_LEVEL_OPTIONS.map(
                                                                        (opt) => (
                                                                            <option
                                                                                key={opt.code}
                                                                                value={opt.code}
                                                                            >
                                                                                {opt.label}
                                                                            </option>
                                                                        )
                                                                    )}
                                                                </select>
                                                                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                                                    {note.cocurricularNote?.trim() ||
                                                                        'Belum ada narasi P5 (pilih predikat di atas)'}
                                                                </p>
                                                            </td>
                                                        )}

                                                        {/* Catatan Wali Kelas Inline */}
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-start gap-1.5">
                                                                <textarea
                                                                    rows={2}
                                                                    value={
                                                                        examMode === 'STS'
                                                                            ? (note.stsHomeroomNote ??
                                                                                '')
                                                                            : (note.homeroomNote ??
                                                                                '')
                                                                    }
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                stsHomeroomNote:
                                                                                    examMode ===
                                                                                        'STS'
                                                                                        ? e.target
                                                                                            .value
                                                                                        : prev.stsHomeroomNote,
                                                                                homeroomNote:
                                                                                    examMode ===
                                                                                        'SAS'
                                                                                        ? e.target
                                                                                            .value
                                                                                        : prev.homeroomNote,
                                                                            })
                                                                        )
                                                                    }
                                                                    placeholder="Tulis atau klik ikon ✨..."
                                                                    className="w-full p-2 rounded-lg border bg-background text-xs resize-y"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    title="Generate Catatan & P5 Otomatis untuk siswa ini"
                                                                    onClick={() =>
                                                                        handleGenerateSingleStudentNotes(
                                                                            row
                                                                        )
                                                                    }
                                                                    className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 shrink-0"
                                                                >
                                                                    <Sparkles className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>

                                                        {/* Ringkasan Ekskul & Status Kenaikan */}
                                                        <td className="px-3 py-3 space-y-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setDetailStudentRow(row)
                                                                }
                                                                className="w-full inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-medium"
                                                            >
                                                                <span>
                                                                    Ekskul (
                                                                    {
                                                                        note.extracurriculars
                                                                            .length
                                                                    }
                                                                    ) &amp; Narasi
                                                                </span>
                                                                <Pencil className="w-3 h-3 text-muted-foreground" />
                                                            </button>

                                                            {examMode === 'SAS' && (
                                                                <select
                                                                    value={note.promotionStatus}
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                promotionStatus:
                                                                                    e.target
                                                                                        .value as PromotionStatus,
                                                                            })
                                                                        )
                                                                    }
                                                                    className="w-full px-2 py-1 rounded border bg-muted/40 text-[11px] font-medium"
                                                                >
                                                                    <option value="PROSES">
                                                                        Proses Evaluasi
                                                                    </option>
                                                                    <option value="NAIK_KELAS">
                                                                        Naik Kelas
                                                                    </option>
                                                                    <option value="TINGGAL_KELAS">
                                                                        Tinggal Kelas
                                                                    </option>
                                                                    <option value="LULUS">
                                                                        Lulus
                                                                    </option>
                                                                    <option value="TIDAK_LULUS">
                                                                        Tidak Lulus
                                                                    </option>
                                                                </select>
                                                            )}
                                                        </td>

                                                        {/* Status Publikasi */}
                                                        <td className="px-3 py-3 text-center">
                                                            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-muted/30 cursor-pointer text-[11px] font-semibold">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isPublished}
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            row.student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                isStsPublished:
                                                                                    examMode ===
                                                                                        'STS'
                                                                                        ? e.target
                                                                                            .checked
                                                                                        : prev.isStsPublished,
                                                                                isSasPublished:
                                                                                    examMode ===
                                                                                        'SAS'
                                                                                        ? e.target
                                                                                            .checked
                                                                                        : prev.isSasPublished,
                                                                            })
                                                                        )
                                                                    }
                                                                />
                                                                <span>
                                                                    {isPublished
                                                                        ? 'Terbit'
                                                                        : 'Draft'}
                                                                </span>
                                                            </label>
                                                        </td>

                                                        {/* Unduh PDF Per Siswa */}
                                                        <td className="px-3 py-3 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handlePrintSingleStudentPdf(
                                                                        row
                                                                    )
                                                                }
                                                                disabled={isPrintingThis}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-50"
                                                            >
                                                                {isPrintingThis ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <FileText className="w-3.5 h-3.5 text-red-500" />
                                                                )}
                                                                PDF
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL DETAIL SISWA: EKSTRAKURIKULER & SUNTING NARASI LENGKAP P5      */}
            {/* ==================================================================== */}
            {detailStudentRow && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setDetailStudentRow(null)}
                >
                    <div
                        className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {(() => {
                            const note = getOrInitStudentNote(
                                detailStudentRow.student.id
                            );
                            return (
                                <>
                                    <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-card z-10">
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                {detailStudentRow.student.fullName}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                NIS: {detailStudentRow.student.nis || '-'} |
                                                NISN: {detailStudentRow.student.nisn}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDetailStudentRow(null)}
                                            className="p-1.5 rounded-lg hover:bg-muted"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="p-6 space-y-5 text-xs">
                                        {/* Narasi Lengkap Kokurikuler / Projek P5 */}
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <label className="font-bold text-sm">
                                                    Deskripsi Kokurikuler / Projek P5 (Raport)
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleStudentP5LevelChange(
                                                            detailStudentRow,
                                                            p5LevelByStudent[
                                                            detailStudentRow.student.id
                                                            ] ?? 'BSH'
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100"
                                                >
                                                    <Sparkles className="w-3 h-3" />
                                                    Susun Ulang dari Master P5 Kelas
                                                </button>
                                            </div>
                                            <textarea
                                                rows={4}
                                                value={note.cocurricularNote ?? ''}
                                                onChange={(e) =>
                                                    updateStudentNoteState(
                                                        detailStudentRow.student.id,
                                                        (prev) => ({
                                                            ...prev,
                                                            cocurricularNote: e.target.value,
                                                        })
                                                    )
                                                }
                                                placeholder="Narasi capaian Projek Penguatan Profil Pelajar Pancasila..."
                                                className="w-full p-3 rounded-xl border bg-background text-xs leading-relaxed"
                                            />
                                        </div>

                                        {/* Kegiatan Ekstrakurikuler */}
                                        <div className="space-y-2.5 pt-3 border-t">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-sm flex items-center gap-1.5">
                                                    <BookOpen className="w-4 h-4 text-primary" />
                                                    Kegiatan Ekstrakurikuler
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        updateStudentNoteState(
                                                            detailStudentRow.student.id,
                                                            (prev) => ({
                                                                ...prev,
                                                                extracurriculars: [
                                                                    ...prev.extracurriculars,
                                                                    {
                                                                        name: '',
                                                                        predicate: 'Baik',
                                                                        description: '',
                                                                    },
                                                                ],
                                                            })
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Tambah Ekskul
                                                </button>
                                            </div>

                                            {note.extracurriculars.length === 0 ? (
                                                <p className="text-muted-foreground italic py-2">
                                                    Belum ada kegiatan ekstrakurikuler untuk
                                                    siswa ini.
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {note.extracurriculars.map(
                                                        (
                                                            ex: ExtracurricularItem,
                                                            exIdx: number
                                                        ) => (
                                                            <div
                                                                key={exIdx}
                                                                className="grid grid-cols-12 gap-2 items-center"
                                                            >
                                                                <input
                                                                    type="text"
                                                                    value={ex.name}
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            detailStudentRow
                                                                                .student.id,
                                                                            (prev) => {
                                                                                const list = [
                                                                                    ...prev.extracurriculars,
                                                                                ];
                                                                                list[exIdx] = {
                                                                                    ...list[exIdx],
                                                                                    name: e.target
                                                                                        .value,
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    extracurriculars:
                                                                                        list,
                                                                                };
                                                                            }
                                                                        )
                                                                    }
                                                                    placeholder="Nama Ekskul (mis. Pramuka)"
                                                                    className="col-span-4 px-2.5 py-2 rounded-lg border bg-background"
                                                                />
                                                                <select
                                                                    value={ex.predicate}
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            detailStudentRow
                                                                                .student.id,
                                                                            (prev) => {
                                                                                const list = [
                                                                                    ...prev.extracurriculars,
                                                                                ];
                                                                                list[exIdx] = {
                                                                                    ...list[exIdx],
                                                                                    predicate:
                                                                                        e.target
                                                                                            .value,
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    extracurriculars:
                                                                                        list,
                                                                                };
                                                                            }
                                                                        )
                                                                    }
                                                                    className="col-span-3 px-2 py-2 rounded-lg border bg-background"
                                                                >
                                                                    <option value="Sangat Baik">
                                                                        Sangat Baik
                                                                    </option>
                                                                    <option value="Baik">
                                                                        Baik
                                                                    </option>
                                                                    <option value="Cukup">
                                                                        Cukup
                                                                    </option>
                                                                </select>
                                                                <input
                                                                    type="text"
                                                                    value={ex.description}
                                                                    onChange={(e) =>
                                                                        updateStudentNoteState(
                                                                            detailStudentRow
                                                                                .student.id,
                                                                            (prev) => {
                                                                                const list = [
                                                                                    ...prev.extracurriculars,
                                                                                ];
                                                                                list[exIdx] = {
                                                                                    ...list[exIdx],
                                                                                    description:
                                                                                        e.target
                                                                                            .value,
                                                                                };
                                                                                return {
                                                                                    ...prev,
                                                                                    extracurriculars:
                                                                                        list,
                                                                                };
                                                                            }
                                                                        )
                                                                    }
                                                                    placeholder="Keterangan singkat..."
                                                                    className="col-span-4 px-2.5 py-2 rounded-lg border bg-background"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        updateStudentNoteState(
                                                                            detailStudentRow
                                                                                .student.id,
                                                                            (prev) => ({
                                                                                ...prev,
                                                                                extracurriculars:
                                                                                    prev.extracurriculars.filter(
                                                                                        (
                                                                                            _,
                                                                                            i
                                                                                        ) =>
                                                                                            i !==
                                                                                            exIdx
                                                                                    ),
                                                                            })
                                                                        )
                                                                    }
                                                                    className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setDetailStudentRow(null)}
                                            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                                        >
                                            Selesai
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* TAB 3: PERINGKAT KELAS (KHUSUS GURU & WALI KELAS)                    */}
            {/* ==================================================================== */}
            {activeTab === 'RANKING' && (
                <Card className="border-none shadow-sm">
                    <CardHeader className="border-b flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">
                                Peringkat Kelas — Mode {examMode}
                            </CardTitle>
                            <CardDescription>
                                Data peringkat internal khusus Guru, Wali Kelas, dan Pimpinan
                                Sekolah (tidak ditampilkan di portal siswa/orang tua).
                            </CardDescription>
                        </div>
                        <button
                            type="button"
                            onClick={loadRankings}
                            disabled={isLoadingRankings}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted"
                        >
                            <RefreshCw
                                className={cn(
                                    'w-3.5 h-3.5',
                                    isLoadingRankings && 'animate-spin'
                                )}
                            />
                            Muat Ulang
                        </button>
                    </CardHeader>

                    <CardContent className="p-0">
                        {isLoadingRankings ? (
                            <div className="p-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                                <p className="text-sm">Menghitung peringkat kelas...</p>
                            </div>
                        ) : rankings.length === 0 ? (
                            <div className="p-12 text-center text-sm text-muted-foreground">
                                Belum ada data nilai untuk dihitung peringkatnya.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b">
                                        <tr>
                                            <th className="px-6 py-3.5 w-24 text-center">
                                                Peringkat
                                            </th>
                                            <th className="px-6 py-3.5">Nama Siswa</th>
                                            <th className="px-6 py-3.5 text-center">Mapel Dinilai</th>
                                            <th className="px-6 py-3.5 text-right">Total Nilai</th>
                                            <th className="px-6 py-3.5 text-right">Rata-Rata</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rankings.map((r) => (
                                            <tr
                                                key={r.studentId}
                                                className="border-b last:border-0 hover:bg-muted/20"
                                            >
                                                <td className="px-6 py-3.5 text-center">
                                                    {r.rank !== null ? (
                                                        <span
                                                            className={cn(
                                                                'inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs',
                                                                r.rank === 1
                                                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                                    : r.rank === 2
                                                                        ? 'bg-slate-200 text-slate-800'
                                                                        : r.rank === 3
                                                                            ? 'bg-orange-100 text-orange-800'
                                                                            : 'bg-muted text-foreground'
                                                            )}
                                                        >
                                                            #{r.rank}
                                                        </span>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                                <td className="px-6 py-3.5">
                                                    <div className="font-semibold">{r.fullName}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        NISN: {r.nisn}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3.5 text-center">
                                                    {r.gradedSubjects} mapel
                                                </td>
                                                <td className="px-6 py-3.5 text-right font-mono">
                                                    {r.totalScore.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-3.5 text-right font-bold text-primary font-mono">
                                                    {r.averageScore.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}