// src/modules/teacher-attendance/constants/teacherAttendance.constants.ts
export const MAX_LEAVE_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const DEFAULT_RADIUS_METERS = 100;
export const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Jakarta';

export const FALLBACK_WORK_START_TIME = '07:00';
export const FALLBACK_WORK_END_TIME = '14:00';
export const FALLBACK_REQUIRE_SELFIE_CHECKIN = true;
export const FALLBACK_REQUIRE_SELFIE_CHECKOUT = true;

export const CHECKOUT_TOLERANCE_MINUTES = 15;
export const CONFIRM_EARLY_CHECKOUT = true;
export const CONFIRM_ALL_CHECKOUT = false;

export const MIN_REASON_LENGTH = 10;
export const MIN_EARLY_CHECKOUT_REASON_LENGTH = 10;
export const ALLOW_LEAVE_ON_HOLIDAY = false;

export const FINGERPRINT_GLOW_DURATION_MS = 650;
export const HIDE_HEADER_SCROLL_THRESHOLD = 24;
export const TOP_REVEAL_SWIPE_THRESHOLD = 45;

export const TEACHER_DASHBOARD_ROUTE = '/dashboard';