import { supabase } from '@/lib/supabase';
import type { PaginatedResponse, ApiResponse } from '@/types/common.types';
import type { TeacherDetail, TeacherListItem, TeacherListParams, CreateTeacherPayload, UpdateTeacherPayload } from '../types/teacher.types';

class TeacherService {
  async list(params?: TeacherListParams) {
    const { page = 1, limit = 10, search, isActive } = params || {};
    
    let query = supabase.from('teachers').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`fullName.ilike.%${search}%,nip.ilike.%${search}%`);
    }
    if (isActive !== undefined) {
      query = query.eq('isActive', isActive);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    
    const { data, count, error } = await query
      .order('fullName', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    return {
      data: {
        data: data as TeacherListItem[],
        meta: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    };
  }

  async getById(id: string) {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    return { data: data as TeacherDetail };
  }

  async create(payload: CreateTeacherPayload) {
    const { data, error } = await supabase
      .from('teachers')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { data: data as TeacherDetail };
  }

  async update(id: string, payload: UpdateTeacherPayload) {
    const { data, error } = await supabase
      .from('teachers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return { data: data as TeacherDetail };
  }

  async delete(id: string) {
    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    return { data: undefined };
  }
}

export const teacherService = new TeacherService();
