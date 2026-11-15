// src/constants/school.constants.ts

export type SchoolLevelCode =
    | 'TK'
    | 'RA'
    | 'SD'
    | 'MI'
    | 'SMP'
    | 'MTS'
    | 'SMA'
    | 'MA'
    | 'SMK'
    | 'SLB'
    | 'PKBM';

export type SchoolLevelFilterGroup =
    | 'ALL'
    | 'TK'
    | 'SD'
    | 'SMP'
    | 'SMA'
    | 'SMK'
    | 'SLB'
    | 'PKBM';

export type SchoolStatusCode = 'NEGERI' | 'SWASTA';

export interface SchoolOptionItem<T extends string> {
    value: T;
    labelId: string;
    labelEn: string;
}

/**
 * Daftar resmi jenjang satuan pendidikan (Single Source of Truth).
 * `value` selalu huruf kapital penuh agar selaras dengan normalisasi `.toUpperCase()` database.
 */
export const SCHOOL_LEVEL_CHOICES: readonly SchoolOptionItem<SchoolLevelCode>[] = [
    { value: 'TK', labelId: 'TK (Taman Kanak-Kanak)', labelEn: 'TK (Kindergarten)' },
    { value: 'RA', labelId: 'RA (Raudhatul Athfal)', labelEn: 'RA (Islamic Kindergarten)' },
    { value: 'SD', labelId: 'SD (Sekolah Dasar)', labelEn: 'SD (Elementary School)' },
    { value: 'MI', labelId: 'MI (Madrasah Ibtidaiyah)', labelEn: 'MI (Islamic Elementary)' },
    { value: 'SMP', labelId: 'SMP (Sekolah Menengah Pertama)', labelEn: 'SMP (Junior High School)' },
    { value: 'MTS', labelId: 'MTs (Madrasah Tsanawiyah)', labelEn: 'MTs (Islamic Junior High)' },
    { value: 'SMA', labelId: 'SMA (Sekolah Menengah Atas)', labelEn: 'SMA (Senior High School)' },
    { value: 'MA', labelId: 'MA (Madrasah Aliyah)', labelEn: 'MA (Islamic Senior High)' },
    { value: 'SMK', labelId: 'SMK (Sekolah Menengah Kejuruan)', labelEn: 'SMK (Vocational High School)' },
    { value: 'SLB', labelId: 'SLB (Sekolah Luar Biasa)', labelEn: 'SLB (Special Needs School)' },
    { value: 'PKBM', labelId: 'PKBM (Pendidikan Kesetaraan)', labelEn: 'PKBM (Community Learning)' },
];

/**
 * Daftar status satuan pendidikan (selaras dengan kolom `type` pada tabel `public.schools`).
 */
export const SCHOOL_STATUS_CHOICES: readonly SchoolOptionItem<SchoolStatusCode>[] = [
    { value: 'NEGERI', labelId: 'Negeri', labelEn: 'Public' },
    { value: 'SWASTA', labelId: 'Swasta', labelEn: 'Private' },
];

/**
 * Opsi tombol filter pada konsol Multi-Sekolah (mengelompokkan sekolah umum & madrasah sederajat).
 */
export const SCHOOL_LEVEL_FILTER_TABS: readonly {
    value: SchoolLevelFilterGroup;
    labelId: string;
    labelEn: string;
}[] = [
    { value: 'ALL', labelId: 'Semua Jenjang', labelEn: 'All Levels' },
    { value: 'TK', labelId: 'TK / RA', labelEn: 'TK / RA' },
    { value: 'SD', labelId: 'SD / MI', labelEn: 'SD / MI' },
    { value: 'SMP', labelId: 'SMP / MTs', labelEn: 'SMP / MTs' },
    { value: 'SMA', labelId: 'SMA / MA', labelEn: 'SMA / MA' },
    { value: 'SMK', labelId: 'SMK', labelEn: 'SMK' },
    { value: 'SLB', labelId: 'SLB', labelEn: 'SLB' },
    { value: 'PKBM', labelId: 'PKBM', labelEn: 'PKBM' },
];

/**
 * Mengubah nilai `level` dari database menjadi teks lencana kartu yang rapi (misal: 'MTS' -> 'MTs').
 */
export function formatSchoolLevelBadge(rawLevel: string | null | undefined): string {
    const clean = (rawLevel ?? '').trim().toUpperCase();
    if (!clean || clean === 'BELUM_DIATUR') return 'UMUM';
    if (clean === 'MTS') return 'MTs';
    return clean;
}

/**
 * Memetakan kode jenjang spesifik ke kelompok filter pada TenantSelector.
 */
export function resolveSchoolFilterGroup(rawLevel: string | null | undefined): string {
    const clean = (rawLevel ?? '').trim().toUpperCase();
    if (!clean || clean === 'BELUM_DIATUR') return 'UMUM';
    if (
        clean.includes('SLB') ||
        clean.includes('TKLB') ||
        clean.includes('SDLB') ||
        clean.includes('SMPLB') ||
        clean.includes('SMALB')
    ) {
        return 'SLB';
    }
    if (clean.includes('PKBM') || clean.includes('SKB') || clean.includes('PAKET')) {
        return 'PKBM';
    }
    if (clean.startsWith('TK') || clean === 'RA' || clean.includes('RAUDHATUL') || clean.includes('PAUD')) {
        return 'TK';
    }
    if (clean.startsWith('SD') || clean === 'MI') return 'SD';
    if (clean.startsWith('SMP') || clean === 'MTS') return 'SMP';
    if (clean.startsWith('SMK')) return 'SMK';
    if (clean.startsWith('SMA') || clean === 'MA') return 'SMA';
    return clean;
}

// Tambahkan di bagian bawah src/constants/school.constants.ts

export const ALL_GRADE_LEVELS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Menentukan tingkat kelas bawaan (default) saat membuat rombel baru
 * berdasarkan jenjang satuan pendidikan aktif.
 */
export function getDefaultGradeForSchoolLevel(rawLevel: string | null | undefined): number {
    const clean = (rawLevel ?? '').trim().toUpperCase();
    if (clean === 'TK' || clean === 'RA') return 0;
    if (clean === 'SMP' || clean === 'MTS') return 7;
    if (clean === 'SMA' || clean === 'MA' || clean === 'SMK') return 10;
    return 1; // Default untuk SD, MI, SLB, PKBM, atau BELUM_DIATUR
}

/**
 * Mengembalikan daftar tingkat kelas (0..12) yang relevan dengan jenjang sekolah.
 * Untuk SLB, PKBM, atau jenjang yang belum diatur, seluruh tingkat (0..12) ditampilkan.
 */
export function getAllowedGradesForSchoolLevel(
    rawLevel: string | null | undefined,
    includeGrade?: number | null,
): number[] {
    const clean = (rawLevel ?? '').trim().toUpperCase();
    let allowed: number[];

    switch (clean) {
        case 'TK':
        case 'RA':
            allowed = [0];
            break;
        case 'SD':
        case 'MI':
            allowed = [1, 2, 3, 4, 5, 6];
            break;
        case 'SMP':
        case 'MTS':
            allowed = [7, 8, 9];
            break;
        case 'SMA':
        case 'MA':
        case 'SMK':
            allowed = [10, 11, 12];
            break;
        case 'SLB':
        case 'PKBM':
        default:
            allowed = [...ALL_GRADE_LEVELS];
            break;
    }

    // Pengaman: jika sedang mengedit data lama yang tingkatnya di luar daftar,
    // tetap sertakan tingkat tersebut agar dropdown tidak kosong.
    if (
        typeof includeGrade === 'number' &&
        Number.isInteger(includeGrade) &&
        includeGrade >= 0 &&
        includeGrade <= 12 &&
        !allowed.includes(includeGrade)
    ) {
        return [...allowed, includeGrade].sort((a, b) => a - b);
    }

    return allowed;
}