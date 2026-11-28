// src/modules/teacher-leave/types/teacher-leave.types.ts

export type LeaveType =
  | 'CUTI_TAHUNAN'
  | 'CUTI_MELAHIRKAN'
  | 'CUTI_BESAR'
  | 'CUTI_ALASAN_PENTING'
  | 'CUTI_KHUSUS';

export type LeaveStatus =
  | 'SUBMITTED'
  | 'VERIFIED_TU'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type LeaveReviewAction = 'VERIFY_TU' | 'APPROVE' | 'REJECT' | 'CANCEL';

export interface TeacherLeaveQuota {
  id: string;
  schoolId: string;
  teacherId: string;
  year: number;
  baseQuota: number;
  carriedOver: number;
  usedDays: number;
  remainingDays: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherSummaryRef {
  id: string;
  fullName: string;
  nip: string | null;
  nuptk: string | null;
  photoUrl: string | null;
}

export interface UserSummaryRef {
  id: string;
  fullName: string;
  role: string;
}

export interface TeacherLeaveRequest {
  id: string;
  schoolId: string;
  teacherId: string;
  academicYearId: string | null;
  semesterId: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalWorkDays: number;
  reason: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  substituteTeacherId: string | null;
  delegationNotes: string | null;
  status: LeaveStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verifierNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  teacher?: TeacherSummaryRef | null;
  substituteTeacher?: TeacherSummaryRef | null;
  verifier?: UserSummaryRef | null;
  reviewer?: UserSummaryRef | null;
}

export interface TeacherLeaveQuotaWithTeacher extends TeacherLeaveQuota {
  teacher?: TeacherSummaryRef | null;
}

export interface SubmitTeacherLeavePayload {
  schoolId: string;
  teacherId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  substituteTeacherId?: string | null;
  delegationNotes?: string | null;
  academicYearId?: string | null;
  semesterId?: string | null;
}

export interface ReviewTeacherLeavePayload {
  leaveRequestId: string;
  action: LeaveReviewAction;
  notes?: string;
}

export const LEAVE_TYPE_OPTIONS: {
  value: LeaveType;
  label: { id: string; en: string };
  deductsQuota: boolean;
  requiresAttachment: boolean;
}[] = [
  {
    value: 'CUTI_TAHUNAN',
    label: { id: 'Cuti Tahunan', en: 'Annual Leave' },
    deductsQuota: true,
    requiresAttachment: false,
  },
  {
    value: 'CUTI_MELAHIRKAN',
    label: { id: 'Cuti Melahirkan', en: 'Maternity Leave' },
    deductsQuota: false,
    requiresAttachment: true,
  },
  {
    value: 'CUTI_BESAR',
    label: { id: 'Cuti Besar', en: 'Extended / Sabbatical Leave' },
    deductsQuota: false,
    requiresAttachment: false,
  },
  {
    value: 'CUTI_ALASAN_PENTING',
    label: { id: 'Cuti Alasan Penting', en: 'Urgent Personal Leave' },
    deductsQuota: false,
    requiresAttachment: false,
  },
  {
    value: 'CUTI_KHUSUS',
    label: { id: 'Cuti Khusus / Lainnya', en: 'Special Leave' },
    deductsQuota: false,
    requiresAttachment: false,
  },
];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, { id: string; en: string }> = {
  SUBMITTED: { id: 'Menunggu Verifikasi TU', en: 'Awaiting Admin Verification' },
  VERIFIED_TU: { id: 'Terverifikasi TU (Menunggu Kepsek)', en: 'Verified by Admin (Awaiting Principal)' },
  APPROVED: { id: 'Disetujui', en: 'Approved' },
  REJECTED: { id: 'Ditolak', en: 'Rejected' },
  CANCELLED: { id: 'Dibatalkan', en: 'Cancelled' },
};