// src/modules/attendance/utils/holidayApiService.ts
import type { ParsedHolidayRow } from './excelHolidayParser';
import type { HolidayCategoryType } from '../types/attendance.types';

export type HolidayApiProviderId =
  | 'AUTO'
  | 'TANGGAL_MERAH_UPSET'
  | 'API_HARI_LIBUR_VERCEL'
  | 'OPICA_API_LIBUR'
  | 'KRESNASATYA_CLOUDFLARE'
  | 'KRESNASATYA_NETLIFY'
  | 'KRESNASATYA_VERCEL'
  | 'BUILTIN_MUHAMMADIYAH';

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
 * Daftar 6 Server API Kalender Libur Indonesia + Mode Otomatis Bergantian + Cadangan Lokal
 */
export const HOLIDAY_API_PROVIDER_OPTIONS: HolidayApiProviderOption[] = [
  {
    id: 'AUTO',
    label: 'Otomatis (Bergantian 6 Server Aktif)',
  },
  {
    id: 'TANGGAL_MERAH_UPSET',
    label: 'Server 1: Tanggal Merah API (upset.dev)',
  },
  {
    id: 'API_HARI_LIBUR_VERCEL',
    label: 'Server 2: API Hari Libur (api-hari-libur.vercel.app)',
  },
  {
    id: 'OPICA_API_LIBUR',
    label: 'Server 3: API Libur Indonesia (app.opica.id)',
  },
  {
    id: 'KRESNASATYA_CLOUDFLARE',
    label: 'Server 4: Hari Libur Cloudflare (pages.dev)',
  },
  {
    id: 'KRESNASATYA_NETLIFY',
    label: 'Server 5: Hari Libur Netlify (netlify.app)',
  },
  {
    id: 'KRESNASATYA_VERCEL',
    label: 'Server 6: Hari Libur Vercel (api-harilibur.vercel.app)',
  },
  {
    id: 'BUILTIN_MUHAMMADIYAH',
    label: 'Cadangan Lokal (Offline 2026–2028)',
  },
];

// Batas waktu tunggu per server (4 detik) sebelum otomatis berpindah ke server berikutnya
const FETCH_TIMEOUT_MS = 4000;

interface SingleProviderConfig {
  id: Exclude<HolidayApiProviderId, 'AUTO' | 'BUILTIN_MUHAMMADIYAH'>;
  name: string;
  buildUrl: (year: number) => string;
}

const SINGLE_PROVIDERS: SingleProviderConfig[] = [
  {
    id: 'TANGGAL_MERAH_UPSET',
    name: 'Server 1 (Tanggal Merah API)',
    buildUrl: (year) => `https://tanggalmerah.upset.dev/api/holidays?year=${year}`,
  },
  {
    id: 'API_HARI_LIBUR_VERCEL',
    name: 'Server 2 (API Hari Libur)',
    buildUrl: (year) => `https://api-hari-libur.vercel.app/api?year=${year}`,
  },
  {
    id: 'OPICA_API_LIBUR',
    name: 'Server 3 (Opica API Libur)',
    buildUrl: (year) => `https://app.opica.id/api-libur/api?year=${year}`,
  },
  {
    id: 'KRESNASATYA_CLOUDFLARE',
    name: 'Server 4 (Cloudflare Pages)',
    buildUrl: (year) => `https://api-harilibur.pages.dev/api?year=${year}`,
  },
  {
    id: 'KRESNASATYA_NETLIFY',
    name: 'Server 5 (Netlify)',
    buildUrl: (year) => `https://api-harilibur.netlify.app/api?year=${year}`,
  },
  {
    id: 'KRESNASATYA_VERCEL',
    name: 'Server 6 (Vercel)',
    buildUrl: (year) => `https://api-harilibur.vercel.app/api?year=${year}`,
  },
];

/**
 * Data cadangan lokal (2026-2028) sebagai pengaman terakhir jika jaringan sekolah offline
 */
const BUILTIN_FALLBACK_HOLIDAYS: Record<number, ParsedHolidayRow[]> = {
  2026: [
    { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', type: 'NASIONAL' },
    { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'NASIONAL' },
    { date: '2026-02-16', name: 'Cuti Bersama Tahun Baru Imlek 2577', type: 'CUTI_BERSAMA' },
    { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', type: 'NASIONAL' },
    { date: '2026-03-18', name: 'Cuti Bersama Hari Suci Nyepi', type: 'CUTI_BERSAMA' },
    { date: '2026-03-19', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', type: 'NASIONAL' },
    { date: '2026-03-20', name: 'Cuti Bersama Idul Fitri 1447 H', type: 'CUTI_BERSAMA' },
    { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H', type: 'NASIONAL' },
    { date: '2026-03-22', name: 'Hari Raya Idul Fitri 1447 H (Hari Kedua)', type: 'NASIONAL' },
    { date: '2026-03-23', name: 'Cuti Bersama Idul Fitri 1447 H', type: 'CUTI_BERSAMA' },
    { date: '2026-03-24', name: 'Cuti Bersama Idul Fitri 1447 H', type: 'CUTI_BERSAMA' },
    { date: '2026-04-03', name: 'Wafat Yesus Kristus', type: 'NASIONAL' },
    { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'NASIONAL' },
    { date: '2026-05-01', name: 'Hari Buruh Internasional', type: 'NASIONAL' },
    { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', type: 'NASIONAL' },
    { date: '2026-05-15', name: 'Cuti Bersama Kenaikan Yesus Kristus', type: 'CUTI_BERSAMA' },
    { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H', type: 'NASIONAL' },
    { date: '2026-05-28', name: 'Cuti Bersama Idul Adha 1447 H', type: 'CUTI_BERSAMA' },
    { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', type: 'NASIONAL' },
    { date: '2026-06-01', name: 'Hari Lahir Pancasila', type: 'NASIONAL' },
    { date: '2026-06-16', name: 'Tahun Baru Islam 1448 H', type: 'NASIONAL' },
    { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'NASIONAL' },
    { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', type: 'NASIONAL' },
    { date: '2026-12-24', name: 'Cuti Bersama Kelahiran Yesus Kristus', type: 'CUTI_BERSAMA' },
    { date: '2026-12-25', name: 'Kelahiran Yesus Kristus (Natal)', type: 'NASIONAL' },
  ],
  2027: [
    { date: '2027-01-01', name: 'Tahun Baru 2027 Masehi', type: 'NASIONAL' },
    { date: '2027-01-05', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'NASIONAL' },
    { date: '2027-02-06', name: 'Tahun Baru Imlek 2578 Kongzili', type: 'NASIONAL' },
    { date: '2027-03-09', name: 'Hari Suci Nyepi Tahun Baru Saka 1949', type: 'NASIONAL' },
    { date: '2027-03-10', name: 'Hari Raya Idul Fitri 1448 H', type: 'NASIONAL' },
    { date: '2027-03-11', name: 'Hari Raya Idul Fitri 1448 H (Hari Kedua)', type: 'NASIONAL' },
    { date: '2027-03-26', name: 'Wafat Yesus Kristus', type: 'NASIONAL' },
    { date: '2027-03-28', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'NASIONAL' },
    { date: '2027-05-01', name: 'Hari Buruh Internasional', type: 'NASIONAL' },
    { date: '2027-05-06', name: 'Kenaikan Yesus Kristus', type: 'NASIONAL' },
    { date: '2027-05-17', name: 'Hari Raya Idul Adha 1448 H', type: 'NASIONAL' },
    { date: '2027-05-20', name: 'Hari Raya Waisak 2571 BE', type: 'NASIONAL' },
    { date: '2027-06-01', name: 'Hari Lahir Pancasila', type: 'NASIONAL' },
    { date: '2027-06-06', name: 'Tahun Baru Islam 1449 H', type: 'NASIONAL' },
    { date: '2027-08-14', name: 'Maulid Nabi Muhammad SAW', type: 'NASIONAL' },
    { date: '2027-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'NASIONAL' },
    { date: '2027-12-25', name: 'Kelahiran Yesus Kristus (Natal)', type: 'NASIONAL' },
  ],
  2028: [
    { date: '2028-01-01', name: 'Tahun Baru 2028 Masehi', type: 'NASIONAL' },
    { date: '2028-01-26', name: 'Tahun Baru Imlek 2579 Kongzili', type: 'NASIONAL' },
    { date: '2028-02-27', name: 'Hari Raya Idul Fitri 1449 H', type: 'NASIONAL' },
    { date: '2028-02-28', name: 'Hari Raya Idul Fitri 1449 H (Hari Kedua)', type: 'NASIONAL' },
    { date: '2028-03-27', name: 'Hari Suci Nyepi Tahun Baru Saka 1950', type: 'NASIONAL' },
    { date: '2028-04-14', name: 'Wafat Yesus Kristus', type: 'NASIONAL' },
    { date: '2028-05-01', name: 'Hari Buruh Internasional', type: 'NASIONAL' },
    { date: '2028-05-05', name: 'Hari Raya Idul Adha 1449 H', type: 'NASIONAL' },
    { date: '2028-05-25', name: 'Kenaikan Yesus Kristus', type: 'NASIONAL' },
    { date: '2028-06-01', name: 'Hari Lahir Pancasila', type: 'NASIONAL' },
    { date: '2028-08-17', name: 'Hari Kemerdekaan Republik Indonesia', type: 'NASIONAL' },
    { date: '2028-12-25', name: 'Kelahiran Yesus Kristus (Natal)', type: 'NASIONAL' },
  ],
};

/**
 * Penyesuaian khusus Kalender Muhammadiyah (KHGT / Hisab)
 */
const MUHAMMADIYAH_CALENDAR_NOTES: Record<
  number,
  {
    awalRamadan?: ParsedHolidayRow;
    idulFitriDates?: ParsedHolidayRow[];
  }
> = {
  2026: {
    awalRamadan: {
      date: '2026-02-18',
      name: 'Awal Puasa 1 Ramadan 1447 H (Muhammadiyah)',
      type: 'SEKOLAH',
    },
    idulFitriDates: [
      {
        date: '2026-03-20',
        name: 'Hari Raya Idul Fitri 1 Syawal 1447 H (Muhammadiyah)',
        type: 'NASIONAL',
      },
      {
        date: '2026-03-21',
        name: 'Hari Raya Idul Fitri 1447 H (Hari Kedua)',
        type: 'NASIONAL',
      },
    ],
  },
  2027: {
    awalRamadan: {
      date: '2027-02-08',
      name: 'Awal Puasa 1 Ramadan 1448 H (Muhammadiyah)',
      type: 'SEKOLAH',
    },
  },
  2028: {
    awalRamadan: {
      date: '2028-01-28',
      name: 'Awal Puasa 1 Ramadan 1449 H (Muhammadiyah)',
      type: 'SEKOLAH',
    },
  },
};

interface RawHolidayApiItem {
  tanggal?: string;
  holiday_date?: string;
  date?: string;
  keterangan?: string;
  description?: string;
  holiday_name?: string;
  localName?: string;
  name?: string;
  type?: string;
  holiday_type?: string;
  is_cuti?: boolean;
  is_national_holiday?: boolean;
}

function extractRawHolidayList(payload: unknown): RawHolidayApiItem[] {
  if (Array.isArray(payload)) {
    return payload as RawHolidayApiItem[];
  }
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as RawHolidayApiItem[];
    if (Array.isArray(obj.holidays)) return obj.holidays as RawHolidayApiItem[];
    if (Array.isArray(obj.result)) return obj.result as RawHolidayApiItem[];
  }
  return [];
}

function normalizeIsoDateString(rawDate: string): string | null {
  const trimmed = String(rawDate || '').trim();
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function applyMuhammadiyahCalendar(
  rows: ParsedHolidayRow[],
  year: number,
  includeAwalRamadan: boolean
): ParsedHolidayRow[] {
  const ref = MUHAMMADIYAH_CALENDAR_NOTES[year];
  let adjusted = [...rows];

  if (ref?.idulFitriDates && ref.idulFitriDates.length > 0) {
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

  const dedupMap = new Map<string, ParsedHolidayRow>();
  for (const item of adjusted) {
    dedupMap.set(item.date, item);
  }

  return Array.from(dedupMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

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
      throw new Error(`${provider.name} status ${response.status}`);
    }

    const payload: unknown = await response.json();
    const rawList = extractRawHolidayList(payload);

    const results: ParsedHolidayRow[] = [];

    for (const item of rawList) {
      const rawDate = item.tanggal ?? item.holiday_date ?? item.date ?? '';
      const rawName = (
        item.keterangan ??
        item.description ??
        item.holiday_name ??
        item.localName ??
        item.name ??
        ''
      ).trim();

      const normalizedDate = normalizeIsoDateString(rawDate);
      if (!normalizedDate || !rawName) continue;
      if (!normalizedDate.startsWith(`${year}-`)) continue;

      const rawType = String(
        item.type ?? item.holiday_type ?? ''
      ).toLowerCase();

      const isCuti =
        Boolean(item.is_cuti) ||
        rawType.includes('cuti') ||
        rawType.includes('collective') ||
        rawName.toLowerCase().includes('cuti bersama') ||
        item.is_national_holiday === false;

      if (!includeCutiBersama && isCuti) continue;

      const formattedName =
        isCuti && !rawName.toLowerCase().includes('cuti bersama')
          ? `Cuti Bersama ${rawName}`
          : rawName;

      const categoryType: HolidayCategoryType = isCuti
        ? 'CUTI_BERSAMA'
        : 'NASIONAL';

      results.push({
        date: normalizedDate,
        name: formattedName,
        type: categoryType,
      });
    }

    if (results.length === 0) {
      throw new Error(`${provider.name} data tahun ${year} kosong`);
    }

    results.sort((a, b) => a.date.localeCompare(b.date));
    return results;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchHolidaysFromServer(options: {
  year: number;
  includeCutiBersama: boolean;
  providerId: HolidayApiProviderId;
  calendarMode: CalendarReferenceMode;
  includeAwalRamadan: boolean;
  onProgress?: (statusText: string) => void;
}): Promise<FetchHolidayServerResult> {
  const {
    year,
    includeCutiBersama,
    providerId,
    calendarMode,
    includeAwalRamadan,
    onProgress,
  } = options;

  const finalizeRows = (
    baseRows: ParsedHolidayRow[],
    sourceName: string
  ): FetchHolidayServerResult => {
    const finalRows =
      calendarMode === 'MUHAMMADIYAH'
        ? applyMuhammadiyahCalendar(baseRows, year, includeAwalRamadan)
        : baseRows;

    return {
      rows: finalRows,
      usedProviderLabel:
        calendarMode === 'MUHAMMADIYAH'
          ? `${sourceName} + Kalender Muhammadiyah`
          : sourceName,
    };
  };

  if (providerId === 'BUILTIN_MUHAMMADIYAH') {
    const localRows = (BUILTIN_FALLBACK_HOLIDAYS[year] ?? []).filter((r) =>
      includeCutiBersama ? true : r.type !== 'CUTI_BERSAMA'
    );
    if (localRows.length === 0) {
      throw new Error(
        `Cadangan lokal belum tersedia untuk tahun ${year}. Pilih Server 1–6 atau Import Excel.`
      );
    }
    return finalizeRows(localRows, 'Cadangan Lokal');
  }

  const targetProviders =
    providerId === 'AUTO'
      ? SINGLE_PROVIDERS
      : SINGLE_PROVIDERS.filter((p) => p.id === providerId);

  const errorMessages: string[] = [];

  for (let i = 0; i < targetProviders.length; i++) {
    const provider = targetProviders[i];
    onProgress?.(
      `Menghubungkan ${provider.name} (${i + 1}/${targetProviders.length})...`
    );

    try {
      const rawRows = await fetchFromSingleProvider(
        provider,
        year,
        includeCutiBersama
      );
      return finalizeRows(rawRows, provider.name);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? `${provider.name} timeout`
          : err instanceof Error
            ? err.message
            : String(err);
      errorMessages.push(msg);
    }
  }

  if (providerId === 'AUTO' && BUILTIN_FALLBACK_HOLIDAYS[year]) {
    onProgress?.('Semua server luar sibuk, memuat dari Cadangan Lokal...');
    const localRows = BUILTIN_FALLBACK_HOLIDAYS[year].filter((r) =>
      includeCutiBersama ? true : r.type !== 'CUTI_BERSAMA'
    );
    return finalizeRows(localRows, 'Cadangan Lokal (Auto-Fallback)');
  }

  throw new Error(
    `Gagal terhubung ke server (${errorMessages.join(' | ')}). Coba pilih server lain atau gunakan Cadangan Lokal.`
  );
}