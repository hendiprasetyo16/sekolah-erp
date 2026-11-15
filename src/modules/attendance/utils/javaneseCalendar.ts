// src/modules/attendance/utils/javaneseCalendar.ts

export interface JavaneseDateInfo {
    /** Nama hari Masehi dalam Bahasa Indonesia (contoh: "Minggu") */
    dayName: string;
    /** Nama pasaran Jawa (contoh: "Pahing") */
    pasaran: string;
    /** Gabungan hari dan pasaran (contoh: "Minggu Pahing") */
    hariPasaran: string;
    /** Tanggal dalam bulan Jawa, angka 1 s.d. 30 (contoh: 21) */
    javaneseDay: number;
    /** Nama bulan Jawa (contoh: "Jumadilawal") */
    javaneseMonth: string;
    /** Tahun Jawa (contoh: 1960) */
    javaneseYear: number;
    /** Nama tahun dalam siklus Windu (contoh: "Alip") */
    winduYearName: string;
    /** Format ringkas tanggal Jawa + pasaran (contoh: "21 Pahing") */
    shortJavaneseDate: string;
    /** Format super singkat untuk layar sangat sempit (contoh: "21 Ph") */
    compactJavaneseDate: string;
    /** Format lengkap (contoh: "Minggu Pahing, 1 November 2026 (21 Jumadilawal 1960 Ja)") */
    fullFormattedDate: string;
}

const HARI_INDONESIA = [
    'Minggu',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu',
] as const;

// Urutan baku 5 hari pasaran Jawa: 0 = Legi, 1 = Pahing, 2 = Pon, 3 = Wage, 4 = Kliwon
const PASARAN_LIST = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'] as const;

const PASARAN_SHORT_MAP: Record<string, string> = {
    Legi: 'Lg',
    Pahing: 'Ph',
    Pon: 'Pn',
    Wage: 'Wg',
    Kliwon: 'Kl',
};

const BULAN_MASEHI = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
] as const;

const BULAN_JAWA = [
    'Sura',
    'Sapar',
    'Mulud',
    'Bakda Mulud',
    'Jumadilawal',
    'Jumadilakir',
    'Rejeb',
    'Ruwah',
    'Pasa',
    'Sawal',
    'Dulkangidah',
    'Besar',
] as const;

// Nama 8 tahun dalam 1 siklus Windu (Kurup Asapon)
const TAHUN_WINDU = [
    'Alip',
    'Ehe',
    'Jimawal',
    'Je',
    'Dal',
    'Be',
    'Wawu',
    'Jimakir',
] as const;

// Jumlah hari per tahun dalam 1 Windu (total = 2.835 hari)
// Tahun Wuntu (355 hari) jatuh pada Ehe (index 1), Je (index 3), dan Jimakir (index 7)
const PANJANG_TAHUN_WINDU = [354, 355, 354, 355, 354, 354, 354, 355] as const;
const TOTAL_HARI_SATU_WINDU = 2835;

// Titik acuan (Epoch): 1 Sura 1936 Ja (Tahun Alip) = Selasa Wage, 4 Maret 2003
const EPOCH_JAWA_YEAR = 1936;
const EPOCH_PASARAN_INDEX = 3; // 3 = Wage (pada PASARAN_LIST)
const EPOCH_UTC_MS = Date.UTC(2003, 2, 4); // Bulan di JS mulai dari 0 (2 = Maret)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Mengubah string tanggal "YYYY-MM-DD" menjadi komponen angka tahun, bulan, tanggal
 */
function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
    const [yStr, mStr, dStr] = isoDate.split('-');
    const year = Number(yStr) || 2026;
    const month = Number(mStr) || 1;
    const day = Number(dStr) || 1;
    return { year, month, day };
}

/**
 * Menghitung informasi lengkap Kalender Jawa dan Pasaran dari tanggal ISO ("YYYY-MM-DD")
 */
export function getJavaneseDateInfo(isoDate: string): JavaneseDateInfo {
    const { year, month, day } = parseIsoDateParts(isoDate);
    const targetUtcMs = Date.UTC(year, month - 1, day);
    const utcDate = new Date(targetUtcMs);

    // 1. Hitung Hari Masehi (0 = Minggu s.d. 6 = Sabtu)
    const dayOfWeek = utcDate.getUTCDay();
    const dayName = HARI_INDONESIA[dayOfWeek];

    // 2. Hitung Pasaran (4 Maret 2003 adalah Selasa Wage -> indeks 3)
    const diffDaysFromEpoch = Math.floor((targetUtcMs - EPOCH_UTC_MS) / MS_PER_DAY);
    const pasaranIndex =
        (((diffDaysFromEpoch + EPOCH_PASARAN_INDEX) % 5) + 5) % 5;
    const pasaran = PASARAN_LIST[pasaranIndex];

    // 3. Hitung Tahun Jawa, Bulan Jawa, dan Tanggal Jawa
    let winduCount = Math.floor(diffDaysFromEpoch / TOTAL_HARI_SATU_WINDU);
    let remainingDays = diffDaysFromEpoch - winduCount * TOTAL_HARI_SATU_WINDU;

    if (remainingDays < 0) {
        winduCount -= 1;
        remainingDays += TOTAL_HARI_SATU_WINDU;
    }

    let javaneseYear = EPOCH_JAWA_YEAR + winduCount * 8;
    let winduIndex = 0;

    while (remainingDays >= PANJANG_TAHUN_WINDU[winduIndex]) {
        remainingDays -= PANJANG_TAHUN_WINDU[winduIndex];
        javaneseYear += 1;
        winduIndex += 1;
    }

    const isTahunWuntu = PANJANG_TAHUN_WINDU[winduIndex] === 355;
    const winduYearName = TAHUN_WINDU[winduIndex];

    // Panjang masing-masing bulan Jawa (bulan ganjil = 30 hari, genap = 29 hari, Besar = 30 jika Wuntu)
    const monthLengths = [
        30, // Sura
        29, // Sapar
        30, // Mulud
        29, // Bakda Mulud
        30, // Jumadilawal
        29, // Jumadilakir
        30, // Rejeb
        29, // Ruwah
        30, // Pasa
        29, // Sawal
        30, // Dulkangidah
        isTahunWuntu ? 30 : 29, // Besar
    ];

    let javaneseMonthIndex = 0;
    while (
        javaneseMonthIndex < 11 &&
        remainingDays >= monthLengths[javaneseMonthIndex]
    ) {
        remainingDays -= monthLengths[javaneseMonthIndex];
        javaneseMonthIndex += 1;
    }

    const javaneseDay = remainingDays + 1;
    const javaneseMonth = BULAN_JAWA[javaneseMonthIndex];
    const bulanMasehiName = BULAN_MASEHI[month - 1] ?? '';

    const hariPasaran = `${dayName} ${pasaran}`;
    const shortJavaneseDate = `${javaneseDay} ${pasaran}`;
    const compactJavaneseDate = `${javaneseDay} ${PASARAN_SHORT_MAP[pasaran] ?? pasaran}`;
    const fullFormattedDate = `${hariPasaran}, ${day} ${bulanMasehiName} ${year} (${javaneseDay} ${javaneseMonth} ${javaneseYear} Ja)`;

    return {
        dayName,
        pasaran,
        hariPasaran,
        javaneseDay,
        javaneseMonth,
        javaneseYear,
        winduYearName,
        shortJavaneseDate,
        compactJavaneseDate,
        fullFormattedDate,
    };
}

/**
 * Menghasilkan teks rentang Bulan & Tahun Jawa dalam satu bulan Masehi
 * Contoh hasil: "21 Jumadilawal 1960 Ja - 20 Jumadilakir 1960 Ja"
 */
export function getJavaneseMonthRangeLabel(
    year: number,
    monthIndexZeroBased: number
): string {
    const firstDayIso = `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}-01`;
    const lastDayNumber = new Date(
        Date.UTC(year, monthIndexZeroBased + 1, 0)
    ).getUTCDate();
    const lastDayIso = `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;

    const startInfo = getJavaneseDateInfo(firstDayIso);
    const endInfo = getJavaneseDateInfo(lastDayIso);

    if (
        startInfo.javaneseMonth === endInfo.javaneseMonth &&
        startInfo.javaneseYear === endInfo.javaneseYear
    ) {
        return `${startInfo.javaneseDay} – ${endInfo.javaneseDay} ${startInfo.javaneseMonth} ${startInfo.javaneseYear} Ja`;
    }

    return `${startInfo.javaneseDay} ${startInfo.javaneseMonth} ${startInfo.javaneseYear} Ja - ${endInfo.javaneseDay} ${endInfo.javaneseMonth} ${endInfo.javaneseYear} Ja`;
}