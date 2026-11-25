// src/modules/teacher-attendance/utils/teacherAttendance.helpers.ts
import type {
  CheckOutTimingStatus,
  TeacherDbRow,
  TeacherProfile,
} from '../types/teacherAttendance.types';

const PLACEHOLDER_VALUES = new Set([
  '-',
  '--',
  '—',
  'null',
  'undefined',
  'none',
  'tidak ada',
]);

export function sanitizeIdentityValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

export function mapTeacherDbRowToProfile(row: TeacherDbRow): TeacherProfile {
  const duties: string[] = [];

  if (Array.isArray(row.additionalDuties)) {
    for (const item of row.additionalDuties) {
      const cleaned = sanitizeIdentityValue(item);
      if (cleaned) duties.push(cleaned);
    }
  } else if (typeof row.additionalDuties === 'string') {
    for (const part of row.additionalDuties.split(/[,;]/)) {
      const cleaned = sanitizeIdentityValue(part);
      if (cleaned) duties.push(cleaned);
    }
  }

  const rawPhoto =
    typeof row.photoUrl === 'string' && row.photoUrl.trim()
      ? row.photoUrl.trim()
      : typeof row.avatarUrl === 'string' && row.avatarUrl.trim()
        ? row.avatarUrl.trim()
        : null;

  return {
    id: row.id,
    schoolId: row.schoolId ?? '',
    userId: row.userId ?? null,
    fullName: row.fullName?.trim() || 'Guru',
    email: sanitizeIdentityValue(row.email),
    nip: sanitizeIdentityValue(row.nip),
    nuptk: sanitizeIdentityValue(row.nuptk),
    nik: sanitizeIdentityValue(row.nik),
    position: sanitizeIdentityValue(row.position),
    additionalDuties: Array.from(new Set(duties)),
    photoUrl: rawPhoto,
    allowDesktopAttendance: Boolean(row.allowDesktopAttendance),
  };
}

export function formatTeacherIdentityLabel(
  teacher: TeacherProfile | null,
  fallbackLabel: string
): string {
  if (!teacher) return fallbackLabel;
  if (teacher.nip && teacher.nip !== '0') return `NIP. ${teacher.nip}`;
  if (teacher.nuptk && teacher.nuptk !== '0') return `NUPTK. ${teacher.nuptk}`;
  if (teacher.nik && teacher.nik !== '0') return `NIK. ${teacher.nik}`;
  return fallbackLabel;
}

export function sanitizeStorageSegment(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return cleaned || 'unknown';
}

export function buildTeacherFolderName(teacher: TeacherProfile): string {
  const namePart = sanitizeStorageSegment(teacher.fullName);
  const idPart = sanitizeStorageSegment(
    teacher.nip || teacher.nuptk || teacher.id.slice(0, 8)
  );
  return `${namePart}_${idPart}`;
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
  const startTotal = parseTimeToMinutes(workStartTime, 7 * 60);
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
  const { hours, minutes } = getClockPartsInTimezone(checkDate, timezone);
  const actualTotal = Number(hours) * 60 + Number(minutes);
  const startTotal = parseTimeToMinutes(workStartTime, 7 * 60);
  const deadlineTotal = startTotal + Math.max(0, Math.round(toleranceMinutes));

  if (actualTotal <= deadlineTotal) return 0;
  return actualTotal - deadlineTotal;
}

export function evaluateCheckOutTiming(
  checkOutDate: Date,
  workEndTime: string,
  toleranceMinutes: number,
  timezone: string
): {
  status: CheckOutTimingStatus;
  isEarly: boolean;
  isOvertime: boolean;
  diffMinutes: number;
} {
  const { hours, minutes } = getClockPartsInTimezone(checkOutDate, timezone);
  const actualTotal = Number(hours) * 60 + Number(minutes);
  const endTotal = parseTimeToMinutes(workEndTime, 14 * 60);

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
    diffMinutes: Math.max(0, actualTotal - endTotal),
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    lower.includes('early checkout') ||
    lower.includes('early departure')
  );
}