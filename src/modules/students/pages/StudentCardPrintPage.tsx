// src/modules/students/pages/StudentCardPrintPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { normalizeStudentSchoolId } from '../services/student.service';
import { encodeCode128B } from '../utils/code128Barcode';

// ============================================================================
// PARAMETER UKURAN KARTU & MARGIN CETAK (MUDAH DISESUAIKAN)
// ============================================================================
const CARD_WIDTH_MM = 85.6; // Lebar standar kartu ATM / CR80 (mm)
const CARD_HEIGHT_MM = 54; // Tinggi standar kartu ATM / CR80 (mm)
const BARCODE_HEIGHT_PX = 32; // Tinggi batang barcode di dalam kartu (px)
const CARDS_PER_A4_SHEET = 8; // 2 kolom x 4 baris per lembar A4 agar margin lega
const PRINT_MARGIN_VERTICAL_MM = 15; // Jarak aman atas & bawah kertas A4 (mm)
const PRINT_MARGIN_HORIZONTAL_MM = 10; // Jarak aman kiri & kanan kertas A4 (mm)

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
            <div className="text-[10px] text-red-600 font-semibold py-1">
                NISN/NIS mengandung karakter tidak valid untuk barcode
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <svg
                viewBox={`0 0 ${encoded.totalModules} ${height}`}
                preserveAspectRatio="none"
                shapeRendering="crispEdges"
                className="w-full max-w-48.75 bg-white"
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
            <span className="text-[9.5px] font-mono font-bold tracking-[0.2em] text-slate-900 mt-0.5 leading-none">
                {encoded.value}
            </span>
        </div>
    );
}

export function StudentCardPrintPage() {
    const { user, school } = useAuthStore();

    const schoolMeta = school as {
        id?: string;
        name?: string;
        npsn?: string | null;
        logoUrl?: string | null;
    } | null;

    const [activeSchoolId, setActiveSchoolId] = useState<string>(() =>
        normalizeStudentSchoolId(schoolMeta?.id) ||
        normalizeStudentSchoolId((user as { schoolId?: string } | null)?.schoolId) ||
        ''
    );

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

    // 2. Muat daftar kelas (prioritaskan Tahun Ajaran Aktif)
    useEffect(() => {
        if (!activeSchoolId) return;
        let mounted = true;

        async function loadClasses() {
            const [{ data: activeYear }, { data: classRows }] = await Promise.all([
                supabase
                    .from('academic_years')
                    .select('id')
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

        void loadClasses();
        return () => {
            mounted = false;
        };
    }, [activeSchoolId]);

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
            {/* Aturan CSS Khusus Cetak Kertas A4 (Tengah Presisi & Margin Atas-Bawah Lega) */}
            <style>{`
        @page {
          size: A4 portrait;
          margin: ${PRINT_MARGIN_VERTICAL_MM}mm ${PRINT_MARGIN_HORIZONTAL_MM}mm;
        }
        @media print {
          *, *::before, *::after {
            overflow: visible !important;
            box-sizing: border-box !important;
          }
          html, body, #root, #root > div, #root > div > div {
            display: block !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            padding-left: 0 !important;
            margin-left: 0 !important;
            background: #FFFFFF !important;
          }
          aside, nav, header, footer, .print\\:hidden {
            display: none !important;
          }
          main, [role="main"] {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #printable-preview-wrapper {
            border: none !important;
            background: #FFFFFF !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          #printable-student-cards-area {
            display: grid !important;
            grid-template-columns: repeat(2, ${CARD_WIDTH_MM}mm) !important;
            justify-content: center !important;
            align-content: start !important;
            gap: 6mm 8mm !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 2mm 0 0 0 !important;
            background: #FFFFFF !important;
          }
          .student-id-card-item {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-shadow: none !important;
            border-width: 1px !important;
            border-style: dashed !important;
            border-color: #94a3b8 !important;
          }
        }
      `}</style>

            {/* Header Halaman (Sembunyi saat Print) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
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

            {/* Filter & Kontrol Pemilihan (Sembunyi saat Print) */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 print:hidden">
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
                            Klik kartu untuk memilih/membatalkan cetak. Saat dialog print muncul, pilih ukuran kertas{' '}
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
                <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-200 text-xs flex items-center gap-2 print:hidden">
                    <AlertCircle size={16} />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Area Pratinjau & Area Cetak Kartu */}
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
                <div
                    id="printable-preview-wrapper"
                    className="rounded-2xl border border-border bg-muted/30 p-5 sm:p-6"
                >
                    <div
                        id="printable-student-cards-area"
                        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 place-items-center"
                    >
                        {filteredStudents.map((student) => {
                            const scanCode = resolveScanCode(student);
                            const isSelected = selectedIds.has(student.id);
                            const hasRealNisn =
                                Boolean(student.nisn) && !student.nisn!.toUpperCase().startsWith('TK-');

                            return (
                                <div
                                    key={student.id}
                                    onClick={() => scanCode && toggleStudentSelection(student.id)}
                                    style={{
                                        width: `${CARD_WIDTH_MM}mm`,
                                        height: `${CARD_HEIGHT_MM}mm`,
                                    }}
                                    className={`student-id-card-item relative rounded-xl border-2 bg-white text-slate-900 shadow-sm overflow-hidden flex flex-col justify-between transition select-none ${!scanCode
                                        ? 'border-red-300 opacity-65 cursor-not-allowed print:hidden'
                                        : isSelected
                                            ? 'border-emerald-600 ring-2 ring-emerald-500/20 cursor-pointer'
                                            : 'border-slate-300 opacity-50 cursor-pointer print:hidden'
                                        }`}
                                >
                                    {/* Header Kartu Sekolah (Gradien Hijau + Aksen Emas) */}
                                    <div className="bg-linear-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-3 py-1.5 border-b-2 border-amber-400 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded-md bg-white text-emerald-700 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                                                {schoolMeta?.logoUrl ? (
                                                    <img
                                                        src={schoolMeta.logoUrl}
                                                        alt={schoolMeta.name ?? 'Logo Sekolah'}
                                                        className="w-full h-full object-contain p-0.5"
                                                    />
                                                ) : (
                                                    <School size={14} />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9.5px] font-extrabold uppercase tracking-wide text-white truncate leading-tight">
                                                    {schoolMeta?.name ?? 'KARTU PRESENSI SISWA'}
                                                </p>
                                                <p className="text-[7.5px] font-medium text-emerald-100 tracking-wider leading-tight">
                                                    KARTU PELAJAR & PRESENSI DIGITAL
                                                </p>
                                            </div>
                                        </div>

                                        {/* Indikator Centang (Hanya Tampil di Layar, Sembunyi saat Print) */}
                                        {scanCode && (
                                            <div className="print:hidden text-white shrink-0">
                                                {isSelected ? (
                                                    <CheckSquare size={15} />
                                                ) : (
                                                    <Square size={15} className="text-emerald-200/80" />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Isi Profil Siswa */}
                                    <div className="flex items-center gap-2.5 px-3 py-1.5 flex-1">
                                        <div className="w-11 h-14 rounded-lg border border-slate-300 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                                            {student.photoUrl ? (
                                                <img
                                                    src={student.photoUrl}
                                                    alt={student.fullName}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-base font-extrabold text-emerald-700">
                                                    {student.fullName.charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <p className="text-[11px] font-extrabold text-slate-900 leading-tight line-clamp-2">
                                                {student.fullName}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[8.5px] font-bold text-emerald-800 leading-none">
                                                    Kelas {student.className}
                                                </span>
                                            </div>
                                            <p className="text-[9px] font-mono font-semibold text-slate-600 leading-none">
                                                {hasRealNisn
                                                    ? `NISN: ${student.nisn}`
                                                    : student.nis && student.nis !== '-'
                                                        ? `NIS: ${student.nis}`
                                                        : 'NISN/NIS Belum Diisi'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Area Barcode Bawah */}
                                    <div className="px-3 pt-1 pb-1.5 bg-slate-50/70 border-t border-slate-200 flex items-center justify-center">
                                        {scanCode ? (
                                            <StudentBarcodeSvg codeValue={scanCode} />
                                        ) : (
                                            <span className="text-[9px] text-red-600 font-bold text-center">
                                                Lengkapi NISN/NIS di Master Siswa untuk mencetak barcode
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default StudentCardPrintPage;