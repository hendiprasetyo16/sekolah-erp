// src/modules/students/pages/StudentCardPrintPage.tsx
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
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
    QrCode,
    X,
    ArrowLeft,
    Filter,
    FileSpreadsheet,
    Info,
    User,
    ChevronLeft,
    ChevronRight,
    PenTool,
    Stamp,
    FlipHorizontal2,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { normalizeStudentSchoolId } from '../services/student.service';
import { encodeCode128B } from '../utils/code128Barcode';
import { encodeQrCodeSvg } from '../utils/qrCodeGenerator';

// ============================================================================
// PARAMETER UKURAN KARTU, QR CODE & POSISI KONTEN (MUDAH DISESUAIKAN)
// ============================================================================
const CARD_WIDTH_MM = 85.6; // Lebar standar kartu ATM / CR80 (mm)
const CARD_HEIGHT_MM = 54; // Tinggi standar kartu ATM / CR80 (mm)
const CARD_GAP_X_MM = 5; // Jarak mendatar antar kartu kiri & kanan (mm)
const CARD_GAP_Y_MM = 5.5; // Jarak tegak antar baris kartu (mm)
const PRINT_GRID_WIDTH_MM = CARD_WIDTH_MM * 2 + CARD_GAP_X_MM; // Total lebar 2 kartu (176.2mm)
const CARDS_PER_A4_SHEET = 8; // 2 kolom x 4 baris per lembar A4

type CardCodeMode = 'HYBRID' | 'QR_ONLY' | 'BARCODE_ONLY';
const DEFAULT_CARD_CODE_MODE: CardCodeMode = 'HYBRID';

type CardSideMode = 'FRONT_ONLY' | 'DOUBLE_SIDED';

// Ukuran Barcode & QR Code di dalam kartu
const BARCODE_ONLY_HEIGHT_PX = 27;
const BARCODE_HYBRID_HEIGHT_PX = 19;
const QR_HYBRID_SIZE_MM = 15.5;
const QR_ONLY_SIZE_MM = 21.5;

// Parameter Geser Isi Kartu
const CARD_PROFILE_OFFSET_LEFT_MM = 4.5;
const CARD_PROFILE_OFFSET_RIGHT_MM = 3.5;

// Parameter Geser Posisi Cetak di Kertas A4 (mm)
const PRINT_PAGE_MARGIN_MM = 6;
const PRINT_OFFSET_LEFT_MM = 12;
const PRINT_OFFSET_TOP_MM = 4;

// Parameter Pagination Pratinjau Layar
const DEFAULT_PREVIEW_PAGE_SIZE = 24;
const PREVIEW_PAGE_SIZE_OPTIONS = [12, 24, 48, 0] as const;

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
    principalName: string | null;
    principalNip: string | null;
    principalSignatureUrl: string | null;
    schoolStampUrl: string | null;
}

function resolveScanCode(student: Pick<PrintableStudent, 'nisn' | 'nis'>): string {
    const cleanNisn = (student.nisn ?? '').trim();
    const hasRealNisn = Boolean(cleanNisn) && !cleanNisn.toUpperCase().startsWith('TK-');
    const cleanNis = (student.nis ?? '').trim();

    if (hasRealNisn) return cleanNisn;
    if (cleanNis && cleanNis !== '-') return cleanNis;
    return '';
}

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

const StudentBarcodeSvg = memo(function StudentBarcodeSvg({
    codeValue,
    height = BARCODE_ONLY_HEIGHT_PX,
    showText = true,
}: {
    codeValue: string;
    height?: number;
    showText?: boolean;
}) {
    const barcodeData = useMemo(() => {
        const encoded = encodeCode128B(codeValue);
        if (!encoded) return null;
        const pathD = encoded.bars
            .map((bar) => `M${bar.x} 0h${bar.width}v${height}h-${bar.width}Z`)
            .join('');
        return {
            totalModules: encoded.totalModules,
            value: encoded.value,
            pathD,
        };
    }, [codeValue, height]);

    if (!barcodeData) {
        return (
            <div className="text-[9px] text-red-600 font-semibold py-1">
                NISN/NIS tidak valid untuk barcode
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <svg
                viewBox={`0 0 ${barcodeData.totalModules} ${height}`}
                preserveAspectRatio="none"
                shapeRendering="crispEdges"
                className="w-full max-w-53.75 bg-white"
                style={{ height: `${height}px` }}
                aria-label={`Barcode ${barcodeData.value}`}
            >
                <rect
                    x={0}
                    y={0}
                    width={barcodeData.totalModules}
                    height={height}
                    fill="#FFFFFF"
                />
                <path d={barcodeData.pathD} fill="#000000" />
            </svg>
            {showText && (
                <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-slate-900 mt-0.5 leading-none">
                    {barcodeData.value}
                </span>
            )}
        </div>
    );
});

const StudentQrCodeSvg = memo(function StudentQrCodeSvg({
    codeValue,
    sizeMm,
    caption,
}: {
    codeValue: string;
    sizeMm: number;
    caption?: string;
}) {
    const qrData = useMemo(() => encodeQrCodeSvg(codeValue), [codeValue]);

    if (!qrData) return null;

    return (
        <div className="flex flex-col items-center justify-center shrink-0">
            <div className="p-1 rounded-lg border border-slate-300 bg-white shadow-2xs flex items-center justify-center">
                <svg
                    viewBox={`-1 -1 ${qrData.size + 2} ${qrData.size + 2}`}
                    shapeRendering="crispEdges"
                    style={{
                        width: `${sizeMm}mm`,
                        height: `${sizeMm}mm`,
                    }}
                    className="block bg-white"
                    aria-label={`QR Code ${qrData.value}`}
                >
                    <rect
                        x={-1}
                        y={-1}
                        width={qrData.size + 2}
                        height={qrData.size + 2}
                        fill="#FFFFFF"
                    />
                    <path d={qrData.pathD} fill="#000000" />
                </svg>
            </div>
            {caption && (
                <span className="text-[7.5px] font-mono font-bold tracking-wider text-slate-700 mt-0.5 leading-none">
                    {caption}
                </span>
            )}
        </div>
    );
});

/**
 * Komponen Sisi Depan Kartu Pelajar
 */
const StudentIdCardBox = memo(function StudentIdCardBox({
    student,
    schoolInfo,
    academicYearLabel,
    codeMode,
    showSignatureOnFront,
    showStampOnFront,
    isSelected,
    isPrintMode = false,
    onToggleSelect,
}: {
    student: PrintableStudent;
    schoolInfo: SchoolHeaderInfo;
    academicYearLabel: string;
    codeMode: CardCodeMode;
    showSignatureOnFront: boolean;
    showStampOnFront: boolean;
    isSelected: boolean;
    isPrintMode?: boolean;
    onToggleSelect?: (id: string) => void;
}) {
    const scanCode = resolveScanCode(student);
    const hasRealNisn =
        Boolean(student.nisn) && !student.nisn!.toUpperCase().startsWith('TK-');
    const genderLabel = formatGenderLabel(student.gender);

    const showQr = codeMode === 'HYBRID' || codeMode === 'QR_ONLY';
    const showBarcode = codeMode === 'HYBRID' || codeMode === 'BARCODE_ONLY';

    const hasValidationBlock =
        (showSignatureOnFront && (schoolInfo.principalSignatureUrl || schoolInfo.principalName)) ||
        (showStampOnFront && Boolean(schoolInfo.schoolStampUrl));

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
            <div className="bg-linear-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-3 py-1.5 border-b-2 border-amber-400 flex items-center justify-between gap-2 shrink-0">
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
                        <p className="text-[9px] font-extrabold uppercase tracking-wide text-white truncate leading-tight">
                            {schoolInfo.name}
                        </p>
                        <p className="text-[6.8px] font-medium text-emerald-100 truncate leading-tight">
                            {schoolInfo.address?.trim() || 'KARTU IDENTITAS & PRESENSI DIGITAL'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {academicYearLabel && (
                        <span className="px-1.5 py-0.5 rounded bg-white/15 border border-white/30 text-[6.8px] font-bold text-amber-200 tracking-tight leading-none">
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

            {/* 2. ISI PROFIL SISWA + QR CODE + TTD & STEMPEL */}
            <div
                style={{
                    paddingLeft: `${codeMode === 'BARCODE_ONLY' ? 8 : CARD_PROFILE_OFFSET_LEFT_MM}mm`,
                    paddingRight: `${CARD_PROFILE_OFFSET_RIGHT_MM}mm`,
                }}
                className="relative flex items-center justify-between gap-2 py-1 flex-1 min-h-0"
            >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Bingkai Pas Foto 3x4 */}
                    <div className="w-12 h-16 rounded-lg border border-slate-300 bg-linear-to-b from-slate-50 to-slate-100 overflow-hidden flex flex-col items-center justify-center shrink-0">
                        {student.photoUrl ? (
                            <img
                                src={student.photoUrl}
                                alt={student.fullName}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-400">
                                <User size={19} strokeWidth={1.75} className="text-emerald-600/70" />
                                <span className="text-[6.5px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                                    3 × 4
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Detail Nama, Nomor Induk, Kelas & Pengesahan Mini */}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <p className="text-[10px] font-extrabold text-slate-900 leading-[1.15] line-clamp-2">
                            {student.fullName}
                        </p>

                        <p className="text-[8.5px] font-mono font-semibold text-slate-700 mt-0.5 leading-none">
                            {hasRealNisn
                                ? `NISN: ${student.nisn}`
                                : student.nis && student.nis !== '-'
                                    ? `NIS: ${student.nis}`
                                    : 'NISN/NIS Belum Diisi'}
                        </p>

                        <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[7.5px] font-bold text-emerald-800 leading-none">
                                Kelas {student.className}
                            </span>
                            {genderLabel && (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[7.5px] font-semibold text-slate-700 leading-none">
                                    {genderLabel}
                                </span>
                            )}
                        </div>

                        {/* TTD Kepala Sekolah + Stempel Terpisah (Jika diaktifkan di Sisi Depan) */}
                        {hasValidationBlock && (
                            <div className="mt-1 flex items-center gap-1.5 leading-none">
                                <div className="relative flex items-center justify-center min-w-16">
                                    {showStampOnFront && schoolInfo.schoolStampUrl && (
                                        <img
                                            src={schoolInfo.schoolStampUrl}
                                            alt="Stempel Sekolah"
                                            className="pointer-events-none absolute -left-1 h-5.5 w-5.5 object-contain opacity-85 mix-blend-multiply"
                                        />
                                    )}
                                    {showSignatureOnFront && schoolInfo.principalSignatureUrl && (
                                        <img
                                            src={schoolInfo.principalSignatureUrl}
                                            alt="TTD Kepala Sekolah"
                                            className="relative z-10 h-5 max-w-16 object-contain"
                                        />
                                    )}
                                </div>
                                {showSignatureOnFront && schoolInfo.principalName && (
                                    <div className="min-w-0">
                                        <p className="text-[5.5px] text-slate-500">Kepala Sekolah,</p>
                                        <p className="text-[6px] font-bold text-slate-800 truncate underline">
                                            {schoolInfo.principalName}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Slot QR Code Kanan */}
                {showQr && scanCode && (
                    <StudentQrCodeSvg
                        codeValue={scanCode}
                        sizeMm={codeMode === 'QR_ONLY' ? QR_ONLY_SIZE_MM : QR_HYBRID_SIZE_MM}
                        caption={codeMode === 'QR_ONLY' ? scanCode : undefined}
                    />
                )}
            </div>

            {/* 3. AREA BARCODE BAWAH ATAU FOOTER QR_ONLY */}
            {showBarcode ? (
                <div className="px-3.5 pt-1 pb-1 bg-slate-50/95 border-t border-slate-200 flex items-center justify-center shrink-0">
                    {scanCode ? (
                        <StudentBarcodeSvg
                            codeValue={scanCode}
                            height={
                                codeMode === 'HYBRID'
                                    ? BARCODE_HYBRID_HEIGHT_PX
                                    : BARCODE_ONLY_HEIGHT_PX
                            }
                            showText={true}
                        />
                    ) : (
                        <span className="text-[8.5px] text-red-600 font-bold text-center">
                            Lengkapi NISN/NIS di Master Siswa untuk mencetak kode presensi
                        </span>
                    )}
                </div>
            ) : (
                <div className="px-3.5 py-1.5 bg-emerald-50/80 border-t border-emerald-200/80 flex items-center justify-between text-[7.5px] text-emerald-900 shrink-0">
                    {scanCode ? (
                        <>
                            <span className="font-semibold">
                                Arahkan QR Code ke kamera kiosk saat datang & pulang
                            </span>
                            <span className="font-mono font-bold text-emerald-700">
                                AKTIF
                            </span>
                        </>
                    ) : (
                        <span className="text-red-600 font-bold mx-auto">
                            Lengkapi NISN/NIS di Master Siswa untuk mencetak QR Code
                        </span>
                    )}
                </div>
            )}
        </div>
    );
});

/**
 * Komponen Sisi Belakang Kartu Pelajar (Ketentuan Kartu + Pengesahan TTD & Stempel Lengkap)
 */
const StudentIdCardBackBox = memo(function StudentIdCardBackBox({
    student,
    schoolInfo,
    isPrintMode = false,
}: {
    student: PrintableStudent;
    schoolInfo: SchoolHeaderInfo;
    isPrintMode?: boolean;
}) {
    return (
        <div
            style={{
                width: `${CARD_WIDTH_MM}mm`,
                height: `${CARD_HEIGHT_MM}mm`,
            }}
            className={`student-id-card-item relative rounded-xl bg-white text-slate-900 overflow-hidden flex flex-col justify-between select-none ${isPrintMode
                ? 'border border-dashed border-slate-400 shadow-none'
                : 'border-2 border-slate-300 shadow-sm'
                }`}
        >
            {/* Header Belakang */}
            <div className="bg-slate-800 text-white px-3 py-1 border-b-2 border-emerald-500 flex items-center justify-between shrink-0">
                <span className="text-[7.5px] font-bold uppercase tracking-wider">
                    Ketentuan & Pengesahan Kartu Pelajar
                </span>
                <span className="text-[7px] font-mono text-emerald-300 truncate max-w-28">
                    {student.fullName}
                </span>
            </div>

            {/* Konten Tengah: Tata Tertib Kartu */}
            <div className="px-3.5 py-2 flex-1 flex flex-col justify-between min-h-0 text-[7px] text-slate-700">
                <ol className="list-decimal pl-3.5 space-y-0.5 text-[6.8px] leading-snug text-slate-700">
                    <li>Kartu ini adalah identitas resmi peserta didik {schoolInfo.name}.</li>
                    <li>Wajib dibawa setiap hari untuk presensi digital & layanan sekolah.</li>
                    <li>Dilarang meminjamkan atau memindahtangankan kartu kepada pihak lain.</li>
                    <li>Apabila menemukan kartu ini, mohon kembalikan ke kantor {schoolInfo.name}.</li>
                </ol>

                {/* Area Pengesahan TTD Kepala Sekolah + Stempel Terpisah */}
                <div className="flex items-end justify-between pt-1 border-t border-slate-200/80">
                    <div className="text-[6.2px] text-slate-500 max-w-36 leading-tight">
                        Berlaku selama pemegang tercatat aktif sebagai peserta didik.
                    </div>

                    <div className="flex flex-col items-center text-center min-w-30 leading-tight">
                        <span className="text-[6.5px] text-slate-700">Kepala Sekolah,</span>
                        <div className="relative flex h-8 w-28 items-center justify-center my-0.5">
                            {schoolInfo.schoolStampUrl && (
                                <img
                                    src={schoolInfo.schoolStampUrl}
                                    alt="Stempel Sekolah"
                                    className="pointer-events-none absolute left-1 h-8 w-8 object-contain opacity-85 mix-blend-multiply"
                                />
                            )}
                            {schoolInfo.principalSignatureUrl && (
                                <img
                                    src={schoolInfo.principalSignatureUrl}
                                    alt="TTD Kepala Sekolah"
                                    className="relative z-10 h-7.5 max-w-24 object-contain"
                                />
                            )}
                        </div>
                        <span className="text-[7px] font-bold text-slate-900 underline">
                            {schoolInfo.principalName || '_______________________'}
                        </span>
                        {schoolInfo.principalNip && (
                            <span className="text-[6px] font-mono text-slate-600">
                                NIP/NBM. {schoolInfo.principalNip}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export function StudentCardPrintPage() {
    const { user, school } = useAuthStore();

    const schoolMeta = school as {
        id?: string;
        name?: string;
        address?: string | null;
        logoUrl?: string | null;
        principalName?: string | null;
        principalNip?: string | null;
        principalSignatureUrl?: string | null;
        schoolStampUrl?: string | null;
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
        principalName: schoolMeta?.principalName ?? null,
        principalNip: schoolMeta?.principalNip ?? null,
        principalSignatureUrl: schoolMeta?.principalSignatureUrl ?? null,
        schoolStampUrl: schoolMeta?.schoolStampUrl ?? null,
    });

    const [activeAcademicYearName, setActiveAcademicYearName] = useState<string>('');
    const [classesList, setClassesList] = useState<Array<{ id: string; name: string }>>([]);
    const [isClassesReady, setIsClassesReady] = useState<boolean>(false);
    const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
    const [selectedStatus, setSelectedStatus] = useState<string>('AKTIF');
    const [cardCodeMode, setCardCodeMode] = useState<CardCodeMode>(DEFAULT_CARD_CODE_MODE);
    const [cardSideMode, setCardSideMode] = useState<CardSideMode>('FRONT_ONLY');
    const [showSignatureOnFront, setShowSignatureOnFront] = useState<boolean>(true);
    const [showStampOnFront, setShowStampOnFront] = useState<boolean>(true);

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [students, setStudents] = useState<PrintableStudent[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PREVIEW_PAGE_SIZE);
    const [isPrinting, setIsPrinting] = useState<boolean>(false);

    useEffect(() => {
        const handleBeforePrint = () => setIsPrinting(true);
        const handleAfterPrint = () => setIsPrinting(false);

        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, []);

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

    useEffect(() => {
        if (!activeSchoolId) return;
        let mounted = true;
        setIsClassesReady(false);

        async function loadSchoolAndClasses() {
            try {
                const [{ data: schoolRow }, { data: activeYear }, { data: classRows }] =
                    await Promise.all([
                        supabase
                            .from('schools')
                            .select(
                                'name, address, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl'
                            )
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
                    setSchoolInfo((prev) => ({
                        name: schoolRow.name || prev.name || 'KARTU PRESENSI SISWA',
                        address: schoolRow.address ?? prev.address ?? null,
                        logoUrl: schoolRow.logoUrl ?? prev.logoUrl ?? null,
                        principalName: schoolRow.principalName ?? prev.principalName ?? null,
                        principalNip: schoolRow.principalNip ?? prev.principalNip ?? null,
                        principalSignatureUrl:
                            schoolRow.principalSignatureUrl ?? prev.principalSignatureUrl ?? null,
                        schoolStampUrl: schoolRow.schoolStampUrl ?? prev.schoolStampUrl ?? null,
                    }));
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

                const finalClasses = (activeClasses.length > 0 ? activeClasses : allClasses).map(
                    (c) => ({
                        id: c.id,
                        name: c.name,
                    })
                );

                setClassesList(finalClasses);
                if (finalClasses.length > 0) {
                    setSelectedClassId((prev) =>
                        prev === 'ALL' || !finalClasses.some((c) => c.id === prev)
                            ? finalClasses[0].id
                            : prev
                    );
                }
            } finally {
                if (mounted) {
                    setIsClassesReady(true);
                }
            }
        }

        void loadSchoolAndClasses();
        return () => {
            mounted = false;
        };
    }, [activeSchoolId]);

    const loadStudents = useCallback(async () => {
        if (!activeSchoolId || !isClassesReady) return;
        setIsLoading(true);
        setErrorMsg(null);
        setCurrentPage(1);

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

            const validIds = mapped
                .filter((s) => Boolean(resolveScanCode(s)))
                .map((s) => s.id);
            setSelectedIds(new Set(validIds));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Gagal memuat data siswa.';
            setErrorMsg(msg);
        } finally {
            setIsLoading(false);
        }
    }, [activeSchoolId, isClassesReady, selectedClassId, selectedStatus]);

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

    const effectivePageSize = pageSize === 0 ? filteredStudents.length || 1 : pageSize;
    const totalPages =
        pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredStudents.length / effectivePageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedPreviewStudents = useMemo(() => {
        if (pageSize === 0) return filteredStudents;
        const startIdx = (safeCurrentPage - 1) * pageSize;
        return filteredStudents.slice(startIdx, startIdx + pageSize);
    }, [filteredStudents, pageSize, safeCurrentPage]);

    const startItemNumber =
        filteredStudents.length === 0
            ? 0
            : pageSize === 0
                ? 1
                : (safeCurrentPage - 1) * pageSize + 1;
    const endItemNumber =
        pageSize === 0
            ? filteredStudents.length
            : Math.min(safeCurrentPage * pageSize, filteredStudents.length);

    const cardsToPrint = useMemo(
        () => filteredStudents.filter((s) => selectedIds.has(s.id)),
        [filteredStudents, selectedIds]
    );

    const totalCardFaces =
        cardSideMode === 'DOUBLE_SIDED' ? cardsToPrint.length * 2 : cardsToPrint.length;
    const estimatedSheets = Math.max(1, Math.ceil(totalCardFaces / CARDS_PER_A4_SHEET));

    const toggleStudentSelection = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

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
        if (cardsToPrint.length === 0) return;
        setIsPrinting(true);
        requestAnimationFrame(() => {
            setTimeout(() => {
                window.print();
            }, 60);
        });
    };

    const showLoadingState = isLoading || (Boolean(activeSchoolId) && !isClassesReady);

    return (
        <div className="space-y-5 max-w-6xl mx-auto">
            {/* CSS Khusus Cetak */}
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
                            <QrCode className="text-emerald-600" size={24} />
                            Cetak Kartu Pelajar (QR Code & Barcode)
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Ukuran standar CR80 ({CARD_WIDTH_MM} × {CARD_HEIGHT_MM} mm) dilengkapi Logo Sekolah, TTD Kepala Sekolah, dan Stempel Sekolah.
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
                    <div className="min-w-40">
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

                    {/* Pemilih Desain Kode */}
                    <div>
                        <label className="text-[11px] font-semibold block mb-1 text-muted-foreground">
                            Desain Kode Presensi
                        </label>
                        <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1 gap-1">
                            <button
                                type="button"
                                onClick={() => setCardCodeMode('HYBRID')}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${cardCodeMode === 'HYBRID'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <QrCode size={12} />
                                <span>QR + Barcode</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCardCodeMode('QR_ONLY')}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${cardCodeMode === 'QR_ONLY'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <QrCode size={12} />
                                <span>QR Saja</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCardCodeMode('BARCODE_ONLY')}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${cardCodeMode === 'BARCODE_ONLY'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <Barcode size={12} />
                                <span>Barcode Saja</span>
                            </button>
                        </div>
                    </div>

                    {/* Pemilih Sisi Kartu */}
                    <div>
                        <label className="text-[11px] font-semibold block mb-1 text-muted-foreground">
                            Sisi Cetak
                        </label>
                        <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1 gap-1">
                            <button
                                type="button"
                                onClick={() => setCardSideMode('FRONT_ONLY')}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${cardSideMode === 'FRONT_ONLY'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <span>Depan Saja</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCardSideMode('DOUBLE_SIDED')}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${cardSideMode === 'DOUBLE_SIDED'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                <FlipHorizontal2 size={12} />
                                <span>Depan + Belakang</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Baris Pencarian & Saklar TTD + Stempel Terpisah */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowSignatureOnFront((v) => !v)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${showSignatureOnFront
                                ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-border bg-background text-muted-foreground'
                                }`}
                        >
                            <PenTool size={13} />
                            <span>TTD Kepsek (Depan): {showSignatureOnFront ? 'Aktif' : 'Nonaktif'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowStampOnFront((v) => !v)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${showStampOnFront
                                ? 'border-teal-600/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                                : 'border-border bg-background text-muted-foreground'
                                }`}
                        >
                            <Stamp size={13} />
                            <span>Stempel Sekolah (Depan): {showStampOnFront ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-60 max-w-md">
                        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 focus-within:border-emerald-500">
                            <Search size={15} className="shrink-0 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="Cari nama siswa atau NISN..."
                                className="w-full min-w-0 bg-transparent text-xs focus:outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setCurrentPage(1);
                                    }}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handleSelectAllFiltered}
                            disabled={filteredStudents.length === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-background hover:bg-muted transition cursor-pointer disabled:opacity-50 shrink-0"
                        >
                            <Users size={14} />
                            Pilih / Batal ({filteredStudents.length})
                        </button>
                    </div>
                </div>

                {/* Bilah Ringkasan & Tips Cetak */}
                <div className="pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <Info size={14} className="text-emerald-600 shrink-0" />
                        <span>
                            Logo, TTD Kepala Sekolah & Stempel dapat diatur di menu{' '}
                            <Link
                                to="/academic/master-data"
                                state={{ tab: 'branding' }}
                                className="font-semibold text-emerald-600 hover:underline"
                            >
                                Master Akademik → Logo, TTD & Stempel
                            </Link>
                            .
                        </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                        <FileSpreadsheet size={13} className="text-emerald-600" />
                        <span>
                            {cardsToPrint.length} dari {filteredStudents.length} siswa dipilih ({CARDS_PER_A4_SHEET} sisi kartu/lembar)
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

            {/* Area Pratinjau di Layar + Pagination */}
            {showLoadingState ? (
                <div className="py-16 text-center text-xs opacity-70 flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin text-emerald-600" />
                    Memuat data siswa...
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-10 text-center text-xs opacity-70">
                    Tidak ada data siswa pada kelas/filter ini.
                </div>
            ) : (
                <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden">
                    <div className="p-5 sm:p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 place-items-center">
                            {paginatedPreviewStudents.map((student) => (
                                <div key={student.id} className="flex flex-col items-center gap-2">
                                    <StudentIdCardBox
                                        student={student}
                                        schoolInfo={schoolInfo}
                                        academicYearLabel={activeAcademicYearName}
                                        codeMode={cardCodeMode}
                                        showSignatureOnFront={showSignatureOnFront}
                                        showStampOnFront={showStampOnFront}
                                        isSelected={selectedIds.has(student.id)}
                                        onToggleSelect={toggleStudentSelection}
                                    />
                                    {cardSideMode === 'DOUBLE_SIDED' && (
                                        <StudentIdCardBackBox
                                            student={student}
                                            schoolInfo={schoolInfo}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer Kontrol Pagination Pratinjau */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-t border-border bg-card text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                            <span>
                                Pratinjau <strong>{startItemNumber}</strong>–
                                <strong>{endItemNumber}</strong> dari{' '}
                                <strong>{filteredStudents.length}</strong> kartu
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                aria-label="Jumlah kartu pratinjau per halaman"
                                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:border-emerald-500"
                            >
                                {PREVIEW_PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt === 0
                                            ? 'Tampilkan Semua'
                                            : `${opt} kartu / halaman`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {pageSize !== 0 && totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={safeCurrentPage <= 1}
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                >
                                    <ChevronLeft size={14} />
                                    Sebelumnya
                                </button>

                                <span className="px-2.5 py-1 font-mono font-semibold text-foreground">
                                    Hal {safeCurrentPage} / {totalPages}
                                </span>

                                <button
                                    type="button"
                                    disabled={safeCurrentPage >= totalPages}
                                    onClick={() =>
                                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                >
                                    Berikutnya
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Wadah Cetak Khusus */}
            {typeof document !== 'undefined' &&
                isPrinting &&
                cardsToPrint.length > 0 &&
                createPortal(
                    <div id="print-mount-root">
                        <div id="print-cards-grid">
                            {cardsToPrint.flatMap((student) => {
                                const frontCard = (
                                    <StudentIdCardBox
                                        key={`print-front-${student.id}`}
                                        student={student}
                                        schoolInfo={schoolInfo}
                                        academicYearLabel={activeAcademicYearName}
                                        codeMode={cardCodeMode}
                                        showSignatureOnFront={showSignatureOnFront}
                                        showStampOnFront={showStampOnFront}
                                        isSelected={true}
                                        isPrintMode={true}
                                    />
                                );

                                if (cardSideMode === 'DOUBLE_SIDED') {
                                    return [
                                        frontCard,
                                        <StudentIdCardBackBox
                                            key={`print-back-${student.id}`}
                                            student={student}
                                            schoolInfo={schoolInfo}
                                            isPrintMode={true}
                                        />,
                                    ];
                                }

                                return [frontCard];
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}

export default StudentCardPrintPage;