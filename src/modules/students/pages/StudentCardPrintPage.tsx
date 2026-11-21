// src/modules/students/pages/StudentCardPrintPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
    Printer,
    Search,
    Users,
    CheckSquare,
    Square,
    AlertCircle,
    Loader2,
    School,
    Barcode,
    X,
    ArrowLeft,
    Filter,
    FileSpreadsheet,
    Info,
    User,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { normalizeStudentSchoolId } from '../services/student.service';
import { encodeCode128B } from '../utils/code128Barcode';

// ============================================================================
// PARAMETER UKURAN KARTU & POSISI KONTEN (MUDAH DISESUAIKAN)
// ============================================================================
const CARD_WIDTH_MM = 85.6; // Lebar standar kartu ATM / CR80 (mm)
const CARD_HEIGHT_MM = 54; // Tinggi standar kartu ATM / CR80 (mm)
const CARD_GAP_X_MM = 5; // Jarak mendatar antar kartu kiri & kanan (mm)
const CARD_GAP_Y_MM = 5.5; // Jarak tegak antar baris kartu (mm)
const PRINT_GRID_WIDTH_MM = CARD_WIDTH_MM * 2 + CARD_GAP_X_MM; // Total lebar 2 kartu (176.2mm)
const BARCODE_HEIGHT_PX = 27; // Tinggi batang barcode di dalam kartu (px)
const CARDS_PER_A4_SHEET = 8; // 2 kolom x 4 baris per lembar A4

// Parameter Geser Isi Kartu (Bingkai Foto 3x4, Nama, NISN, Kelas, Jenis Kelamin)
const CARD_PROFILE_OFFSET_LEFT_MM = 8; // Geser blok foto & teks ke kanan di dalam kartu (mm)
const CARD_PROFILE_OFFSET_RIGHT_MM = 3.5; // Jarak aman dari tepi kanan kartu (mm)

// Parameter Geser Posisi Cetak di Kertas A4 (mm)
const PRINT_PAGE_MARGIN_MM = 6; // Margin dasar halaman A4 (mm)
const PRINT_OFFSET_LEFT_MM = 12; // Geser blok seluruh kartu ke kanan pada kertas A4 (mm)
const PRINT_OFFSET_TOP_MM = 4; // Jarak blok kartu dari tepi atas kertas A4 (mm)

interface PrintableStudent {
    id: string;
    fullName: string;
    nisn: string | null;
    nis: string | null;
    gender: string | null;
    photoUrl: string | null;
    status: string;
    classId: string;
    className: string;
}

interface RawStudentCardRow {
    id: string;
    fullName: string | null;
    nisn: string | null;
    nis: string | null;
    gender: string | null;
    photoUrl: string | null;
    status: string | null;
    classId: string | null;
    classes?: { name: string } | Array<{ name: string }> | null;
}

interface ClassOption {
    id: string;
    name: string;
    gradeLevel: number;
    academicYearId: string;
}

interface SchoolHeaderInfo {
    name: string;
    address: string | null;
    logoUrl: string | null;
}

/**
 * Mengambil kode pemindaian terbaik untuk barcode kartu pelajar.
 * Mengabaikan NISN sementara bawaan sistem yang berawalan "TK-".
 */
function resolveScanCode(student: Pick<PrintableStudent, 'nisn' | 'nis'>): string {
    const cleanNisn = (student.nisn ?? '').trim();
    const hasRealNisn = Boolean(cleanNisn) && !cleanNisn.toUpperCase().startsWith('TK-');
    const cleanNis = (student.nis ?? '').trim();

    if (hasRealNisn) return cleanNisn;
    if (cleanNis && cleanNis !== '-') return cleanNis;
    return '';
}

/**
 * Mengubah kode jenis kelamin dari database menjadi label yang rapi dibaca.
 */
function formatGenderLabel(gender: string | null): string | null {
    if (!gender) return null;
    const normalized = gender.trim().toUpperCase();
    if (
        normalized === 'L' ||
        normalized === 'LAKI-LAKI' ||
        normalized === 'LAKI_LAKI' ||
        normalized === 'MALE'
    ) {
        return 'Laki-laki';
    }
    if (
        normalized === 'P' ||
        normalized === 'PEREMPUAN' ||
        normalized === 'FEMALE'
    ) {
        return 'Perempuan';
    }
    return gender;
}

/**
 * Komponen SVG Barcode Code 128B dengan tepi tajam (crispEdges) untuk hasil cetak optimal.
 */
function StudentBarcodeSvg({
    codeValue,
    height = BARCODE_HEIGHT_PX,
}: {
    codeValue: string;
    height?: number;
}) {
    const encoded = useMemo(() => encodeCode128B(codeValue), [codeValue]);

    if (!encoded) {
        return (
            <div className="text-[9px] text-red-600 font-semibold py-1">
                NISN/NIS tidak valid untuk barcode
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <svg
                viewBox={`0 0 ${encoded.totalModules} ${height}`}
                preserveAspectRatio="none"
                shapeRendering="crispEdges"
                className="w-full max-w-53.75 bg-white"
                style={{ height: `${height}px` }}
                aria-label={`Barcode ${encoded.value}`}
            >
                <rect
                    x={0}
                    y={0}
                    width={encoded.totalModules}
                    height={height}
                    fill="#FFFFFF"
                />
                {encoded.bars.map((bar, idx) => (
                    <rect
                        key={`${bar.x}-${idx}`}
                        x={bar.x}
                        y={0}
                        width={bar.width}
                        height={height}
                        fill="#000000"
                    />
                ))}
            </svg>
            <span className="text-[9.5px] font-mono font-bold tracking-[0.22em] text-slate-900 mt-1 leading-none">
                {encoded.value}
            </span>
        </div>
    );
}

/**
 * Komponen Desain 1 Kartu Pelajar (Digunakan untuk pratinjau layar & hasil cetak A4)
 */
function StudentIdCardBox({
    student,
    schoolInfo,
    academicYearLabel,
    isSelected,
    isPrintMode = false,
    onToggleSelect,
}: {
    student: PrintableStudent;
    schoolInfo: SchoolHeaderInfo;
    academicYearLabel: string;
    isSelected: boolean;
    isPrintMode?: boolean;
    onToggleSelect?: (id: string) => void;
}) {
    const scanCode = resolveScanCode(student);
    const hasRealNisn =
        Boolean(student.nisn) && !student.nisn!.toUpperCase().startsWith('TK-');
    const genderLabel = formatGenderLabel(student.gender);

    return (
        <div
            onClick={() => !isPrintMode && scanCode && onToggleSelect?.(student.id)}
            style={{
                width: `${CARD_WIDTH_MM}mm`,
                height: `${CARD_HEIGHT_MM}mm`,
            }}
            className={`student-id-card-item relative rounded-xl bg-white text-slate-900 overflow-hidden flex flex-col justify-between select-none ${isPrintMode
                ? 'border border-dashed border-slate-400 shadow-none'
                : !scanCode
                    ? 'border-2 border-red-300 opacity-65 cursor-not-allowed shadow-sm'
                    : isSelected
                        ? 'border-2 border-emerald-600 ring-2 ring-emerald-500/20 cursor-pointer shadow-sm transition'
                        : 'border-2 border-slate-300 opacity-50 cursor-pointer shadow-sm transition'
                }`}
        >
            {/* 1. HEADER KARTU SEKOLAH */}
            <div className="bg-linear-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-3.5 py-1.5 border-b-2 border-amber-400 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-md bg-white text-emerald-700 flex items-center justify-center overflow-hidden shrink-0">
                        {schoolInfo.logoUrl ? (
                            <img
                                src={schoolInfo.logoUrl}
                                alt={schoolInfo.name}
                                className="w-full h-full object-contain p-0.5"
                            />
                        ) : (
                            <School size={14} />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9.5px] font-extrabold uppercase tracking-wide text-white truncate leading-tight">
                            {schoolInfo.name}
                        </p>
                        <p className="text-[7px] font-medium text-emerald-100 truncate leading-tight">
                            {schoolInfo.address?.trim() || 'KARTU IDENTITAS & PRESENSI DIGITAL'}
                        </p>
                    </div>
                </div>

                {/* Lencana Tahun Ajaran + Centang (Centang hanya di layar) */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {academicYearLabel && (
                        <span className="px-1.5 py-0.5 rounded bg-white/15 border border-white/30 text-[7px] font-bold text-amber-200 tracking-tight leading-none">
                            {academicYearLabel}
                        </span>
                    )}
                    {!isPrintMode && scanCode && (
                        <div className="text-white">
                            {isSelected ? (
                                <CheckSquare size={14} />
                            ) : (
                                <Square size={14} className="text-emerald-200/80" />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. ISI PROFIL SISWA (DIGESER KE KANAN AGAR SEIMBANG DI TENGAH KARTU) */}
            <div
                style={{
                    paddingLeft: `${CARD_PROFILE_OFFSET_LEFT_MM}mm`,
                    paddingRight: `${CARD_PROFILE_OFFSET_RIGHT_MM}mm`,
                }}
                className="flex items-center gap-3.5 py-2 flex-1 min-h-0"
            >
                {/* Bingkai Pas Foto 3x4 */}
                <div className="w-13.5 h-17.5 rounded-lg border border-slate-300 bg-linear-to-b from-slate-50 to-slate-100 overflow-hidden flex flex-col items-center justify-center shrink-0">
                    {student.photoUrl ? (
                        <img
                            src={student.photoUrl}
                            alt={student.fullName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                            <User size={22} strokeWidth={1.75} className="text-emerald-600/70" />
                            <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                                3 × 4
                            </span>
                        </div>
                    )}
                </div>

                {/* Detail Nama, Nomor Induk, Kelas & Jenis Kelamin */}
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <p className="text-[11.5px] font-extrabold text-slate-900 leading-[1.2] line-clamp-2">
                        {student.fullName}
                    </p>

                    <p className="text-[9.5px] font-mono font-semibold text-slate-700 mt-1 leading-none">
                        {hasRealNisn
                            ? `NISN : ${student.nisn}`
                            : student.nis && student.nis !== '-'
                                ? `NIS : ${student.nis}`
                                : 'NISN/NIS Belum Diisi'}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[8.5px] font-bold text-emerald-800 leading-none">
                            Kelas {student.className}
                        </span>
                        {genderLabel && (
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[8.5px] font-semibold text-slate-700 leading-none">
                                {genderLabel}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. AREA BARCODE BAWAH */}
            <div className="px-3.5 pt-1.5 pb-1.5 bg-slate-50/90 border-t border-slate-200 flex items-center justify-center shrink-0">
                {scanCode ? (
                    <StudentBarcodeSvg codeValue={scanCode} />
                ) : (
                    <span className="text-[8.5px] text-red-600 font-bold text-center">
                        Lengkapi NISN/NIS di Master Siswa untuk mencetak barcode
                    </span>
                )}
            </div>
        </div>
    );
}

export function StudentCardPrintPage() {
    const { user, school } = useAuthStore();

    const schoolMeta = school as {
        id?: string;
        name?: string;
        address?: string | null;
        logoUrl?: string | null;
    } | null;

    const [activeSchoolId, setActiveSchoolId] = useState<string>(() =>
        normalizeStudentSchoolId(schoolMeta?.id) ||
        normalizeStudentSchoolId((user as { schoolId?: string } | null)?.schoolId) ||
        ''
    );

    const [schoolInfo, setSchoolInfo] = useState<SchoolHeaderInfo>({
        name: schoolMeta?.name ?? 'KARTU PRESENSI SISWA',
        address: schoolMeta?.address ?? null,
        logoUrl: schoolMeta?.logoUrl ?? null,
    });

    const [activeAcademicYearName, setActiveAcademicYearName] = useState<string>('');
    const [classesList, setClassesList] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
    const [selectedStatus, setSelectedStatus] = useState<string>('AKTIF');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [students, setStudents] = useState<PrintableStudent[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // 1. Pastikan schoolId terdeteksi dengan aman (baik dari store maupun profil Supabase)
    useEffect(() => {
        let mounted = true;
        async function resolveSchool() {
            const fromStore =
                normalizeStudentSchoolId(schoolMeta?.id) ||
                normalizeStudentSchoolId((user as { schoolId?: string } | null)?.schoolId);

            if (fromStore) {
                if (mounted) setActiveSchoolId(fromStore);
                return;
            }

            const {
                data: { user: authUser },
            } = await supabase.auth.getUser();
            if (!authUser) return;

            const { data: profile } = await supabase
                .from('users')
                .select('schoolId')
                .eq('id', authUser.id)
                .maybeSingle();

            const validId = normalizeStudentSchoolId(profile?.schoolId);
            if (mounted && validId) {
                setActiveSchoolId(validId);
            }
        }
        void resolveSchool();
        return () => {
            mounted = false;
        };
    }, [schoolMeta?.id, user]);

    // 2. Muat profil sekolah lengkap (alamat & logo), Tahun Ajaran aktif, serta daftar kelas
    useEffect(() => {
        if (!activeSchoolId) return;
        let mounted = true;

        async function loadSchoolAndClasses() {
            const [{ data: schoolRow }, { data: activeYear }, { data: classRows }] =
                await Promise.all([
                    supabase
                        .from('schools')
                        .select('name, address, logoUrl')
                        .eq('id', activeSchoolId)
                        .maybeSingle(),
                    supabase
                        .from('academic_years')
                        .select('id, name')
                        .eq('schoolId', activeSchoolId)
                        .eq('isActive', true)
                        .maybeSingle(),
                    supabase
                        .from('classes')
                        .select('id, name, gradeLevel, academicYearId')
                        .eq('schoolId', activeSchoolId)
                        .order('gradeLevel', { ascending: true })
                        .order('name', { ascending: true }),
                ]);

            if (!mounted) return;

            if (schoolRow) {
                setSchoolInfo({
                    name: schoolRow.name || schoolMeta?.name || 'KARTU PRESENSI SISWA',
                    address: schoolRow.address ?? schoolMeta?.address ?? null,
                    logoUrl: schoolRow.logoUrl ?? schoolMeta?.logoUrl ?? null,
                });
            }

            if (activeYear?.name) {
                const rawYearName = String(activeYear.name).trim();
                setActiveAcademicYearName(
                    rawYearName.toUpperCase().startsWith('TA')
                        ? rawYearName
                        : `TA ${rawYearName}`
                );
            }

            const allClasses = (classRows ?? []) as ClassOption[];
            const activeClasses = activeYear?.id
                ? allClasses.filter((c) => c.academicYearId === activeYear.id)
                : allClasses;

            const finalClasses = (activeClasses.length > 0 ? activeClasses : allClasses).map((c) => ({
                id: c.id,
                name: c.name,
            }));

            setClassesList(finalClasses);
            if (finalClasses.length > 0) {
                setSelectedClassId((prev) =>
                    prev === 'ALL' || !finalClasses.some((c) => c.id === prev)
                        ? finalClasses[0].id
                        : prev
                );
            }
        }

        void loadSchoolAndClasses();
        return () => {
            mounted = false;
        };
    }, [activeSchoolId, schoolMeta?.address, schoolMeta?.logoUrl, schoolMeta?.name]);

    // 3. Muat data siswa berdasarkan kelas & status
    const loadStudents = useCallback(async () => {
        if (!activeSchoolId) return;
        setIsLoading(true);
        setErrorMsg(null);

        try {
            let query = supabase
                .from('students')
                .select('id, fullName, nisn, nis, gender, photoUrl, status, classId, classes(name)')
                .eq('schoolId', activeSchoolId)
                .order('fullName', { ascending: true });

            if (selectedClassId !== 'ALL') {
                query = query.eq('classId', selectedClassId);
            }

            if (selectedStatus !== 'ALL') {
                query = query.eq('status', selectedStatus);
            }

            const { data, error } = await query;
            if (error) throw error;

            const typedRows = (data ?? []) as RawStudentCardRow[];
            const mapped: PrintableStudent[] = typedRows.map((row) => {
                const clsName = Array.isArray(row.classes)
                    ? row.classes[0]?.name
                    : row.classes?.name;

                return {
                    id: String(row.id),
                    fullName: row.fullName ?? 'Tanpa Nama',
                    nisn: row.nisn ?? null,
                    nis: row.nis ?? null,
                    gender: row.gender ?? null,
                    photoUrl: row.photoUrl ?? null,
                    status: row.status ?? 'AKTIF',
                    classId: row.classId ?? '',
                    className: clsName ?? '-',
                };
            });

            setStudents(mapped);

            // Otomatis centang semua siswa yang memiliki NISN asli atau NIS valid
            const validIds = mapped
                .filter((s) => Boolean(resolveScanCode(s)))
                .map((s) => s.id);
            setSelectedIds(new Set(validIds));
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : 'Gagal memuat data siswa.';
            setErrorMsg(msg);
        } finally {
            setIsLoading(false);
        }
    }, [activeSchoolId, selectedClassId, selectedStatus]);

    useEffect(() => {
        void loadStudents();
    }, [loadStudents]);

    const filteredStudents = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return students;
        return students.filter(
            (s) =>
                s.fullName.toLowerCase().includes(q) ||
                (s.nisn ?? '').toLowerCase().includes(q) ||
                (s.nis ?? '').toLowerCase().includes(q)
        );
    }, [students, searchQuery]);

    const cardsToPrint = useMemo(
        () => filteredStudents.filter((s) => selectedIds.has(s.id)),
        [filteredStudents, selectedIds]
    );

    const estimatedSheets = Math.max(
        1,
        Math.ceil(cardsToPrint.length / CARDS_PER_A4_SHEET)
    );

    const toggleStudentSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllFiltered = () => {
        const printableFiltered = filteredStudents.filter((s) => Boolean(resolveScanCode(s)));
        const allFilteredSelected =
            printableFiltered.length > 0 &&
            printableFiltered.every((s) => selectedIds.has(s.id));

        if (allFilteredSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                printableFiltered.forEach((s) => next.delete(s.id));
                return next;
            });
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                printableFiltered.forEach((s) => next.add(s.id));
                return next;
            });
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-5 max-w-6xl mx-auto">
            {/* CSS Khusus Cetak: Geser posisi eksplisit ke kanan agar kartu & bingkai foto utuh */}
            <style>{`
        @page {
          size: A4 portrait;
          margin: ${PRINT_PAGE_MARGIN_MM}mm;
        }
        @media screen {
          #print-mount-root {
            display: none !important;
          }
        }
        @media print {
          html, body {
            display: block !important;
            position: static !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            background: #FFFFFF !important;
            overflow: visible !important;
          }
          body > *:not(#print-mount-root) {
            display: none !important;
          }
          #print-mount-root {
            display: block !important;
            box-sizing: border-box !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
          }
          #print-cards-grid {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
            column-gap: ${CARD_GAP_X_MM}mm !important;
            row-gap: ${CARD_GAP_Y_MM}mm !important;
            width: ${PRINT_GRID_WIDTH_MM}mm !important;
            margin-top: ${PRINT_OFFSET_TOP_MM}mm !important;
            margin-left: ${PRINT_OFFSET_LEFT_MM}mm !important;
            margin-right: 0 !important;
            padding: 0 !important;
          }
          .student-id-card-item {
            flex: 0 0 ${CARD_WIDTH_MM}mm !important;
            width: ${CARD_WIDTH_MM}mm !important;
            height: ${CARD_HEIGHT_MM}mm !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

            {/* Header Halaman */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <Link
                        to="/students"
                        title="Kembali ke Daftar Siswa"
                        className="mt-0.5 rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                            <Barcode className="text-emerald-600" size={24} />
                            Cetak Kartu Pelajar & Barcode
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Ukuran standar CR80 ({CARD_WIDTH_MM} × {CARD_HEIGHT_MM} mm) ber-barcode Code 128 siap potong di kertas A4.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handlePrint}
                    disabled={cardsToPrint.length === 0}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                >
                    <Printer size={16} />
                    Cetak {cardsToPrint.length} Kartu ({estimatedSheets} Lembar A4)
                </button>
            </div>

            {/* Filter & Kontrol Pemilihan */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-44">
                        <label className="text-[11px] font-semibold block mb-1 text-muted-foreground">
                            Filter Kelas
                        </label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                        >
                            <option value="ALL">Semua Kelas</option>
                            {classesList.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                    Kelas {cls.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="min-w-36">
                        <label className="text-[11px] font-semibold block mb-1 text-muted-foreground">
                            Status Siswa
                        </label>
                        <div className="relative">
                            <Filter
                                size={13}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                            />
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                            >
                                <option value="AKTIF">Siswa Aktif</option>
                                <option value="ALL">Semua Status</option>
                                <option value="LULUS">Lulus</option>
                                <option value="MUTASI_KELUAR">Mutasi Keluar</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 min-w-60">
                        <label className="text-[11px] font-semibold block mb-1 text-muted-foreground">
                            Cari Nama / NISN / NIS
                        </label>
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-emerald-500">
                            <Search size={15} className="shrink-0 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Ketik nama siswa atau nomor NISN..."
                                className="w-full min-w-0 bg-transparent text-xs focus:outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        disabled={filteredStudents.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border bg-background hover:bg-muted transition cursor-pointer disabled:opacity-50"
                    >
                        <Users size={15} />
                        Pilih / Batal Semua ({filteredStudents.length})
                    </button>
                </div>

                {/* Bilah Ringkasan & Tips Cetak */}
                <div className="pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <Info size={14} className="text-emerald-600 shrink-0" />
                        <span>
                            Klik kartu untuk memilih/membatalkan cetak. Saat dialog print muncul, pilih kertas{' '}
                            <strong className="text-foreground">A4</strong>, skala{' '}
                            <strong className="text-foreground">100%</strong>, dan aktifkan{' '}
                            <strong className="text-foreground">Grafik Latar Belakang</strong>.
                        </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                        <FileSpreadsheet size={13} className="text-emerald-600" />
                        <span>
                            {cardsToPrint.length} dari {filteredStudents.length} kartu dipilih ({CARDS_PER_A4_SHEET} kartu/lembar)
                        </span>
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Area Pratinjau di Layar */}
            {isLoading ? (
                <div className="py-16 text-center text-xs opacity-70 flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin text-emerald-600" />
                    Memuat data siswa...
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-10 text-center text-xs opacity-70">
                    Tidak ada data siswa pada kelas/filter ini.
                </div>
            ) : (
                <div className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 place-items-center">
                        {filteredStudents.map((student) => (
                            <StudentIdCardBox
                                key={student.id}
                                student={student}
                                schoolInfo={schoolInfo}
                                academicYearLabel={activeAcademicYearName}
                                isSelected={selectedIds.has(student.id)}
                                onToggleSelect={toggleStudentSelection}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Wadah Cetak Khusus (Dirender langsung di document.body via Portal) */}
            {typeof document !== 'undefined' &&
                cardsToPrint.length > 0 &&
                createPortal(
                    <div id="print-mount-root">
                        <div id="print-cards-grid">
                            {cardsToPrint.map((student) => (
                                <StudentIdCardBox
                                    key={`print-${student.id}`}
                                    student={student}
                                    schoolInfo={schoolInfo}
                                    academicYearLabel={activeAcademicYearName}
                                    isSelected={true}
                                    isPrintMode={true}
                                />
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}

export default StudentCardPrintPage;