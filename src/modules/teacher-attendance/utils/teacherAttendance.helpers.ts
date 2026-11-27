// src/modules/teacher-attendance/utils/teacherAttendance.helpers.ts
import {
  CHECKOUT_TOLERANCE_MINUTES,
  FALLBACK_WORK_END_TIME,
  FALLBACK_WORK_START_TIME,
} from '../constants/teacherAttendance.constants';
import type {
  CheckOutTimingStatus,
  TeacherDbRow,
  TeacherProfile,
} from '../types/teacherAttendance.types';

const PLACEHOLDER_VALUES = new Set([
  '',
  '-',
  '--',
  '---',
  '—',
  'n/a',
  'na',
  'null',
  'undefined',
  'none',
  'tidak ada',
  '0',
  'nan',
]);

export const EXTRA_DUTY_ALIAS_KEYS = [
  'additionalDuties',
  'additionalDuty',
  'additional_duties',
  'additional_duty',
  'tugasTambahan',
  'tugas_tambahan',
  'additionalTask',
  'additionalTasks',
  'additionalPosition',
  'additionalRole',
] as const;

export function sanitizeIdentityValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return null;
    return String(value);
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function extractAdditionalDuties(row: Record<string, unknown>): string[] {
  const duties: string[] = [];

  for (const key of EXTRA_DUTY_ALIAS_KEYS) {
    const raw = row[key];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const cleaned = sanitizeIdentityValue(item);
        if (cleaned) duties.push(cleaned);
      }
    } else if (typeof raw === 'string') {
      for (const part of raw.split(/[,;|]/)) {
        const cleaned = sanitizeIdentityValue(part);
        if (cleaned) duties.push(cleaned);
      }
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const duty of duties) {
    const normalized = duty.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(duty);
    }
  }

  return unique;
}

export function mapTeacherDbRowToProfile(row: TeacherDbRow): TeacherProfile {
  const rawRecord = row as unknown as Record<string, unknown>;

  const rawPhoto =
    typeof row.photoUrl === 'string' && row.photoUrl.trim()
      ? row.photoUrl.trim()
      : typeof row.avatarUrl === 'string' && row.avatarUrl.trim()
        ? row.avatarUrl.trim()
        : sanitizeIdentityValue(rawRecord.photo_url ?? rawRecord.avatar_url);

  return {
    id: row.id,
    schoolId:
      sanitizeIdentityValue(row.schoolId ?? rawRecord.school_id) ?? '',
    userId:
      sanitizeIdentityValue(row.userId ?? rawRecord.user_id) ?? null,
    fullName:
      sanitizeIdentityValue(
        row.fullName ?? rawRecord.full_name ?? rawRecord.name
      ) ?? 'Guru',
    email: sanitizeIdentityValue(row.email),
    nip: sanitizeIdentityValue(row.nip),
    nuptk: sanitizeIdentityValue(row.nuptk),
    nik: sanitizeIdentityValue(row.nik),
    position: sanitizeIdentityValue(row.position ?? rawRecord.jabatan),
    additionalDuties: extractAdditionalDuties(rawRecord),
    photoUrl: rawPhoto,
    allowDesktopAttendance: Boolean(
      row.allowDesktopAttendance ?? rawRecord.allow_desktop_attendance
    ),
  };
}

export function formatTeacherIdentityLabel(
  teacher: TeacherProfile | null,
  fallbackLabel: string
): string {
  if (!teacher) return fallbackLabel;

  const nip = sanitizeIdentityValue(teacher.nip);
  if (nip) return `NIP: ${nip}`;

  const nuptk = sanitizeIdentityValue(teacher.nuptk);
  if (nuptk) return `NUPTK: ${nuptk}`;

  return fallbackLabel;
}

export function sanitizeStorageSegment(input: string): string {
  const cleaned = input
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || 'guru';
}

export function buildTeacherFolderName(teacher: TeacherProfile): string {
  const cleanName = sanitizeStorageSegment(teacher.fullName || 'guru');
  const rawIdentifier =
    sanitizeIdentityValue(teacher.nik) ||
    sanitizeIdentityValue(teacher.nip) ||
    sanitizeIdentityValue(teacher.nuptk);

  const cleanDigits = rawIdentifier ? rawIdentifier.replace(/\D/g, '') : '';
  return cleanDigits ? `${cleanName}_${cleanDigits}` : cleanName;
}

export function getClockPartsInTimezone(
  date: Date,
  timezone: string
): { hours: string; minutes: string; seconds: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const hours = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minutes = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const seconds = parts.find((p) => p.type === 'second')?.value ?? '00';

    return {
      hours: hours === '24' ? '00' : hours.padStart(2, '0'),
      minutes: minutes.padStart(2, '0'),
      seconds: seconds.padStart(2, '0'),
    };
  } catch {
    return {
      hours: String(date.getHours()).padStart(2, '0'),
      minutes: String(date.getMinutes()).padStart(2, '0'),
      seconds: String(date.getSeconds()).padStart(2, '0'),
    };
  }
}

export function getTimeStampTagInTimezone(
  date: Date,
  timezone: string
): string {
  const { hours, minutes, seconds } = getClockPartsInTimezone(date, timezone);
  return `${hours}${minutes}${seconds}`;
}

function parseTimeToMinutes(timeStr: string, fallbackMinutes: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return fallbackMinutes;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMinutes;
  return h * 60 + m;
}

export function formatDeadlineWithTolerance(
  workStartTime: string,
  toleranceMinutes: number
): string {
  const fallbackStartMinutes = parseTimeToMinutes(
    FALLBACK_WORK_START_TIME,
    7 * 60 + 30
  );
  const startTotal = parseTimeToMinutes(workStartTime, fallbackStartMinutes);
  const deadlineTotal =
    (startTotal + Math.max(0, Math.round(toleranceMinutes))) % (24 * 60);
  const h = String(Math.floor(deadlineTotal / 60)).padStart(2, '0');
  const m = String(deadlineTotal % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function calculateLateMinutes(
  checkDate: Date,
  workStartTime: string,
  toleranceMinutes: number,
  timezone: string
): number {
  const fallbackStartMinutes = parseTimeToMinutes(
    FALLBACK_WORK_START_TIME,
    7 * 60 + 30
  );
  const { hours, minutes } = getClockPartsInTimezone(checkDate, timezone);
  const actualTotal = Number(hours) * 60 + Number(minutes);
  const startTotal = parseTimeToMinutes(workStartTime, fallbackStartMinutes);
  const deadlineTotal = startTotal + Math.max(0, Math.round(toleranceMinutes));

  if (actualTotal <= deadlineTotal) return 0;
  return actualTotal - deadlineTotal;
}

export function evaluateCheckOutTiming(
  checkOutDate: Date,
  workEndTime: string,
  toleranceMinutes: number = CHECKOUT_TOLERANCE_MINUTES,
  timezone: string = 'Asia/Jakarta'
): {
  status: CheckOutTimingStatus;
  isEarly: boolean;
  isOvertime: boolean;
  diffMinutes: number;
} {
  const fallbackEndMinutes = parseTimeToMinutes(
    FALLBACK_WORK_END_TIME,
    14 * 60 + 30
  );
  const { hours, minutes } = getClockPartsInTimezone(checkOutDate, timezone);
  const actualTotal = Number(hours) * 60 + Number(minutes);
  const endTotal = parseTimeToMinutes(workEndTime, fallbackEndMinutes);

  if (actualTotal < endTotal) {
    return {
      status: 'EARLY',
      isEarly: true,
      isOvertime: false,
      diffMinutes: endTotal - actualTotal,
    };
  }

  if (actualTotal > endTotal + Math.max(0, toleranceMinutes)) {
    return {
      status: 'OVERTIME',
      isEarly: false,
      isOvertime: true,
      diffMinutes: actualTotal - endTotal,
    };
  }

  return {
    status: 'ON_TIME',
    isEarly: false,
    isOvertime: false,
    diffMinutes: 0,
  };
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  return R * c;
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}

export function isEarlyDepartureNote(notes?: string | null): boolean {
  if (!notes) return false;
  const lower = notes.toLowerCase();
  return (
    lower.includes('pulang awal') ||
    lower.includes('pulang lebih awal') ||
    lower.includes('pulang cepat') ||
    lower.includes('early check-out') ||
    lower.includes('early checkout') ||
    lower.includes('early departure')
  );
}