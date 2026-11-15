// src/modules/attendance/utils/holidayApiService.ts
import {
  normalizeHolidayDate,
  type ParsedHolidayRow,
} from './excelHolidayParser';

export type HolidayApiProviderId =
  | 'AUTO'
  | 'DAYOFF_API'
  | 'HARILIBUR_API'
  | 'LIBUR_DENO';

export type CalendarReferenceMode = 'MUHAMMADIYAH' | 'PEMERINTAH';

export interface HolidayApiProviderOption {
  id: HolidayApiProviderId;
  label: string;
}

export interface FetchHolidayServerResult {
  rows: ParsedHolidayRow[];
  usedProviderLabel: string;
}

/**
 * Daftar 3 Server API Kalender Libur Indonesia + Mode Otomatis Bergantian
 */
export const HOLIDAY_API_PROVIDER_OPTIONS: HolidayApiProviderOption[] = [
  {
    id: 'AUTO',
    label: 'Otomatis (Bergantian 3 Server)',
  },
  {
    id: 'DAYOFF_API',
    label: 'Server 1: Dayoff API (Nasional + Cuti)',
  },
  {
    id: 'HARILIBUR_API',
    label: 'Server 2: API Hari Libur (Vercel)',
  },
  {
    id: 'LIBUR_DENO',
    label: 'Server 3: Libur API (Deno)',
  },
];

// Batas waktu tunggu cepat per server (5 detik) agar segera pindah jika server lambat
const FETCH_TIMEOUT_MS = 5000;

interface SingleProviderConfig {
  id: Exclude<HolidayApiProviderId, 'AUTO'>;
  name: string;
  buildUrl: (year: number) => string;
}

const SINGLE_PROVIDERS: SingleProviderConfig[] = [
  {
    id: 'DAYOFF_API',
    name: 'Server 1 (Dayoff API)',
    buildUrl: (year) => `https://dayoffapi.vercel.app/api?year=${year}`,
  },
  {
    id: 'HARILIBUR_API',
    name: 'Server 2 (API Hari Libur)',
    buildUrl: (year) => `https://api-harilibur.vercel.app/api?year=${year}`,
  },
  {
    id: 'LIBUR_DENO',
    name: 'Server 3 (Libur Deno)',
    buildUrl: (year) => `https://libur.deno.dev/api?year=${year}`,
  },
];

/**
 * Referensi tanggal penting Kalender Muhammadiyah (KHGT / Hisab)
 * Digunakan untuk menambah Awal Puasa (1 Ramadan) & menyesuaikan Idul Fitri jika berbeda dari SKB Pemerintah
 */
const MUHAMMADIYAH_CALENDAR_NOTES: Record<
  number,
  {
    awalRamadan?: { date: string; name: string };
    idulFitriDates?: Array<{ date: string; name: string }>;
  }
> = {
  2026: {
    awalRamadan: {
      date: '2026-02-18',
      name: 'Awal Puasa 1 Ramadan 1447 H (Muhammadiyah)',
    },
    idulFitriDates: [
      {
        date: '2026-03-20',
        name: 'Hari Raya Idul Fitri 1 Syawal 1447 H (Muhammadiyah)',
      },
      {
        date: '2026-03-21',
        name: 'Hari Raya Idul Fitri 1447 H (Hari Kedua)',
      },
    ],
  },
  2027: {
    awalRamadan: {
      date: '2027-02-08',
      name: 'Awal Puasa 1 Ramadan 1448 H (Muhammadiyah)',
    },
  },
  2028: {
    awalRamadan: {
      date: '2028-01-28',
      name: 'Awal Puasa 1 Ramadan 1449 H (Muhammadiyah)',
    },
  },
};

interface RawHolidayApiItem {
  tanggal?: string;
  holiday_date?: string;
  date?: string;
  keterangan?: string;
  holiday_name?: string;
  localName?: string;
  name?: string;
  is_cuti?: boolean;
  is_national_holiday?: boolean;
}

function ensurePaddedIsoDate(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  const simpleYmd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (simpleYmd) {
    const [, y, m, d] = simpleYmd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return normalizeHolidayDate(trimmed);
}

/**
 * Menyesuaikan hasil API dengan Kalender Muhammadiyah (Awal Ramadan & Idul Fitri)
 */
function applyMuhammadiyahCalendar(
  rows: ParsedHolidayRow[],
  year: number,
  includeAwalRamadan: boolean
): ParsedHolidayRow[] {
  const ref = MUHAMMADIYAH_CALENDAR_NOTES[year];
  let adjusted = [...rows];

  if (ref?.idulFitriDates && ref.idulFitriDates.length > 0) {
    // Ganti entri utama Idul Fitri dari pemerintah dengan tanggal Idul Fitri Muhammadiyah
    adjusted = adjusted.filter(
      (r) =>
        !(
          r.name.toLowerCase().includes('idul fitri') &&
          !r.name.toLowerCase().includes('cuti bersama')
        )
    );
    adjusted.push(...ref.idulFitriDates);
  }

  if (includeAwalRamadan && ref?.awalRamadan) {
    const exists = adjusted.some((r) => r.date === ref.awalRamadan!.date);
    if (!exists) {
      adjusted.push(ref.awalRamadan);
    }
  }

  // Hapus duplikat tanggal jika ada, pertahankan yang paling spesifik
  const dedupMap = new Map<string, ParsedHolidayRow>();
  for (const item of adjusted) {
    dedupMap.set(item.date, item);
  }

  return Array.from(dedupMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Mengambil data dari satu server spesifik dengan batas waktu cepat
 */
async function fetchFromSingleProvider(
  provider: SingleProviderConfig,
  year: number,
  includeCutiBersama: boolean
): Promise<ParsedHolidayRow[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(provider.buildUrl(year), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${provider.name} merespons status ${response.status}`);
    }

    const payload: unknown = await response.json();
    const rawList: RawHolidayApiItem[] = Array.isArray(payload)
      ? (payload as RawHolidayApiItem[])
      : typeof payload === 'object' &&
          payload !== null &&
          Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: RawHolidayApiItem[] }).data
        : [];

    const results: ParsedHolidayRow[] = [];

    for (const item of rawList) {
      const rawDate = item.tanggal ?? item.holiday_date ?? item.date ?? '';
      const rawName = (
        item.keterangan ??
        item.holiday_name ??
        item.localName ??
        item.name ??
        ''
      ).trim();

      const normalizedDate = ensurePaddedIsoDate(rawDate);
      if (!normalizedDate || !rawName) continue;
      if (!normalizedDate.startsWith(`${year}-`)) continue;

      const isCuti =
        Boolean(item.is_cuti) ||
        rawName.toLowerCase().includes('cuti bersama') ||
        item.is_national_holiday === false;

      if (!includeCutiBersama && isCuti) continue;

      const formattedName =
        isCuti && !rawName.toLowerCase().includes('cuti bersama')
          ? `Cuti Bersama ${rawName}`
          : rawName;

      results.push({
        date: normalizedDate,
        name: formattedName,
      });
    }

    if (results.length === 0) {
      throw new Error(
        `${provider.name} tidak mengembalikan data untuk tahun ${year}`
      );
    }

    results.sort((a, b) => a.date.localeCompare(b.date));
    return results;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Fungsi utama: sinkronisasi 3 server API + opsi penyesuaian Kalender Muhammadiyah
 */
export async function fetchHolidaysFromServer(options: {
  year: number;
  includeCutiBersama: boolean;
  providerId: HolidayApiProviderId;
  calendarMode: CalendarReferenceMode;
  includeAwalRamadan: boolean;
}): Promise<FetchHolidayServerResult> {
  const {
    year,
    includeCutiBersama,
    providerId,
    calendarMode,
    includeAwalRamadan,
  } = options;

  const targetProviders =
    providerId === 'AUTO'
      ? SINGLE_PROVIDERS
      : SINGLE_PROVIDERS.filter((p) => p.id === providerId);

  const errorMessages: string[] = [];

  for (const provider of targetProviders) {
    try {
      const rawRows = await fetchFromSingleProvider(
        provider,
        year,
        includeCutiBersama
      );

      const finalRows =
        calendarMode === 'MUHAMMADIYAH'
          ? applyMuhammadiyahCalendar(rawRows, year, includeAwalRamadan)
          : rawRows;

      return {
        rows: finalRows,
        usedProviderLabel:
          calendarMode === 'MUHAMMADIYAH'
            ? `${provider.name} + Penyesuaian Muhammadiyah`
            : provider.name,
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? `${provider.name} timeout (${FETCH_TIMEOUT_MS / 1000}d)`
          : err instanceof Error
            ? err.message
            : String(err);
      errorMessages.push(msg);
    }
  }

  throw new Error(
    providerId === 'AUTO'
      ? `Ketiga server gagal dihubungi (${errorMessages.join(' | ')}).`
      : errorMessages[0] ?? 'Gagal terhubung ke server hari libur.'
  );
}