// src/modules/teacher-leave/services/teacher-leave.service.ts
import { supabase } from '@/services/supabase.client';
import type {
  LeaveStatus,
  ReviewTeacherLeavePayload,
  SubmitTeacherLeavePayload,
  TeacherLeaveQuota,
  TeacherLeaveQuotaWithTeacher,
  TeacherLeaveRequest,
  TeacherSummaryRef,
} from '../types/teacher-leave.types';

const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB sesuai batas bucket v22.3

export const teacherLeaveService = {
  async getCurrentTeacherProfile(
    userId: string,
    schoolId: string
  ): Promise<TeacherSummaryRef | null> {
    const { data, error } = await supabase
      .from('teachers')
      .select('id, fullName, nip, nuptk, photoUrl')
      .eq('userId', userId)
      .eq('schoolId', schoolId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as TeacherSummaryRef | null) ?? null;
  },

  async getActiveSchoolTeachers(
    schoolId: string,
    excludeTeacherId?: string
  ): Promise<TeacherSummaryRef[]> {
    let query = supabase
      .from('teachers')
      .select('id, fullName, nip, nuptk, photoUrl')
      .eq('schoolId', schoolId)
      .eq('isActive', true)
      .order('fullName', { ascending: true });

    if (excludeTeacherId) {
      query = query.neq('id', excludeTeacherId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as TeacherSummaryRef[]) ?? [];
  },

  async calculateWorkDays(
    schoolId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    const { data, error } = await supabase.rpc('calculate_school_work_days', {
      p_school_id: schoolId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : Number(data ?? 0);
  },

  async ensureTeacherQuota(
    schoolId: string,
    teacherId: string,
    year: number
  ): Promise<TeacherLeaveQuota> {
    const { data, error } = await supabase.rpc('ensure_teacher_leave_quota', {
      p_school_id: schoolId,
      p_teacher_id: teacherId,
      p_year: year,
    });

    if (error) throw new Error(error.message);
    return data as TeacherLeaveQuota;
  },

  async initializeSchoolQuotasForYear(
    schoolId: string,
    year: number
  ): Promise<number> {
    const activeTeachers = await this.getActiveSchoolTeachers(schoolId);
    if (activeTeachers.length === 0) return 0;

    await Promise.all(
      activeTeachers.map((teacher) =>
        this.ensureTeacherQuota(schoolId, teacher.id, year)
      )
    );

    return activeTeachers.length;
  },

  async updateTeacherQuota(params: {
    quotaId: string;
    schoolId: string;
    baseQuota: number;
    carriedOver: number;
    notes: string | null;
  }): Promise<TeacherLeaveQuota> {
    const { data, error } = await supabase
      .from('teacher_leave_quotas')
      .update({
        baseQuota: params.baseQuota,
        carriedOver: params.carriedOver,
        notes: params.notes,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', params.quotaId)
      .eq('schoolId', params.schoolId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return data as TeacherLeaveQuota;
  },

  async getSchoolQuotas(
    schoolId: string,
    year: number
  ): Promise<TeacherLeaveQuotaWithTeacher[]> {
    const { data, error } = await supabase
      .from('teacher_leave_quotas')
      .select(
        `
        *,
        teacher:teachers!teacher_leave_quotas_teacherId_fkey (
          id, fullName, nip, nuptk, photoUrl
        )
      `
      )
      .eq('schoolId', schoolId)
      .eq('year', year)
      .order('updatedAt', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as TeacherLeaveQuotaWithTeacher[]) ?? [];
  },

  async getLeaveRequests(params: {
    schoolId: string;
    teacherId?: string;
    status?: LeaveStatus | 'ALL';
    year?: number;
  }): Promise<TeacherLeaveRequest[]> {
    let query = supabase
      .from('teacher_leave_requests')
      .select(
        `
        *,
        teacher:teachers!teacher_leave_requests_teacherId_fkey (
          id, fullName, nip, nuptk, photoUrl
        ),
        substituteTeacher:teachers!teacher_leave_requests_substituteTeacherId_fkey (
          id, fullName, nip, nuptk, photoUrl
        ),
        verifier:users!teacher_leave_requests_verifiedBy_fkey (
          id, fullName, role
        ),
        reviewer:users!teacher_leave_requests_reviewedBy_fkey (
          id, fullName, role
        )
      `
      )
      .eq('schoolId', params.schoolId)
      .order('createdAt', { ascending: false });

    if (params.teacherId) {
      query = query.eq('teacherId', params.teacherId);
    }
    if (params.status && params.status !== 'ALL') {
      query = query.eq('status', params.status);
    }
    if (params.year) {
      query = query
        .gte('startDate', `${params.year}-01-01`)
        .lte('startDate', `${params.year}-12-31`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as unknown as TeacherLeaveRequest[]) ?? [];
  },

  async uploadLeaveAttachment(
    schoolId: string,
    teacherId: string,
    file: File
  ): Promise<{ storagePath: string; fileName: string }> {
    if (!ALLOWED_ATTACHMENT_MIME.has(file.type)) {
      throw new Error('Format file harus PDF, JPG, PNG, atau WEBP.');
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error('Ukuran lampiran maksimal 2 MB.');
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${schoolId}/leaves/${teacherId}/${Date.now()}_${sanitizedName}`;

    const { error } = await supabase.storage
      .from('attendance-attachments')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (error) throw new Error(error.message);
    return { storagePath, fileName: file.name };
  },

  async getAttachmentSignedUrl(storagePath: string): Promise<string> {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    const { data, error } = await supabase.storage
      .from('attendance-attachments')
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Gagal membuka pratinjau lampiran.');
    }
    return data.signedUrl;
  },

  async submitLeaveRequest(payload: SubmitTeacherLeavePayload): Promise<TeacherLeaveRequest> {
    const { data, error } = await supabase.rpc('submit_teacher_leave_request', {
      p_school_id: payload.schoolId,
      p_teacher_id: payload.teacherId,
      p_leave_type: payload.leaveType,
      p_start_date: payload.startDate,
      p_end_date: payload.endDate,
      p_reason: payload.reason,
      p_attachment_url: payload.attachmentUrl ?? null,
      p_attachment_name: payload.attachmentName ?? null,
      p_substitute_teacher_id: payload.substituteTeacherId ?? null,
      p_delegation_notes: payload.delegationNotes ?? null,
      p_academic_year_id: payload.academicYearId ?? null,
      p_semester_id: payload.semesterId ?? null,
    });

    if (error) throw new Error(error.message);
    return data as TeacherLeaveRequest;
  },

  async reviewLeaveRequest(payload: ReviewTeacherLeavePayload): Promise<TeacherLeaveRequest> {
    const { data, error } = await supabase.rpc('review_teacher_leave_request', {
      p_leave_request_id: payload.leaveRequestId,
      p_action: payload.action,
      p_notes: payload.notes ?? null,
    });

    if (error) throw new Error(error.message);
    return data as TeacherLeaveRequest;
  },
};