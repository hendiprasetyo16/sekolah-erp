// src/modules/students/utils/code128Barcode.ts

/**
 * Tabel pola batang & spasi standar internasional Code 128 (Indeks 0 - 106).
 * Setiap digit merepresentasikan ketebalan modul (1 sampai 4 satuan).
 * Urutan genap = batang hitam (bar), urutan ganjil = spasi putih (space).
 */
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_CODE_B = 104;
const STOP_CODE = 106;
// Ruang kosong putih di kiri & kanan barcode agar scanner mudah mendeteksi tepi barcode
const QUIET_ZONE_MODULES = 10;

export interface EncodedBarcodeData {
  value: string;
  totalModules: number;
  bars: Array<{ x: number; width: number }>;
}

/**
 * Mengodekan teks (NISN / NIS) menjadi koordinat batang SVG Code 128B.
 * Mengembalikan `null` jika teks kosong atau mengandung karakter di luar ASCII standar.
 */
export function encodeCode128B(rawText: string): EncodedBarcodeData | null {
  const cleaned = rawText.trim();
  if (!cleaned) return null;

  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < cleaned.length; i++) {
    const charCode = cleaned.charCodeAt(i);
    // Code 128B mendukung karakter ASCII cetak (spasi 32 hingga tilde 126)
    if (charCode < 32 || charCode > 126) {
      return null;
    }
    const symbolValue = charCode - 32;
    codes.push(symbolValue);
    checksum += (i + 1) * symbolValue;
  }

  // Tambahkan karakter check-digit (Modulo 103) dan karakter Stop
  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  const bars: Array<{ x: number; width: number }> = [];
  let cursor = QUIET_ZONE_MODULES;

  for (const codeIndex of codes) {
    const pattern = CODE128_PATTERNS[codeIndex];
    if (!pattern) continue;

    for (let j = 0; j < pattern.length; j++) {
      const moduleWidth = Number(pattern[j]);
      const isBar = j % 2 === 0;
      if (isBar) {
        bars.push({ x: cursor, width: moduleWidth });
      }
      cursor += moduleWidth;
    }
  }

  const totalModules = cursor + QUIET_ZONE_MODULES;

  return {
    value: cleaned,
    totalModules,
    bars,
  };
}