// src/modules/subjects/services/subject.service.ts
import { supabase } from '@/services/supabase.client';
import type { SubjectItem, SubjectPayload } from '../types/subject.types';

/**
 * Mengambil seluruh daftar mata pelajaran milik sekolah tertentu,
 * diurutkan berdasarkan sortOrder (urutan raport) lalu nama mapel.
 */
export async function getSubjectsBySchool(schoolId: string): Promise<SubjectItem[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('schoolId', schoolId)
    .order('sortOrder', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat data mata pelajaran: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...(row as SubjectItem),
    category: (row as Partial<SubjectItem>).category ?? 'UMUM',
    sortOrder: (row as Partial<SubjectItem>).sortOrder ?? 100,
    description: (row as Partial<SubjectItem>).description ?? null,
  }));
}

/**
 * Menambahkan satu mata pelajaran baru ke database.
 */
export async function createSubject(payload: SubjectPayload): Promise<SubjectItem> {
  const cleanCode = payload.code?.trim().toUpperCase() || null;

  const { data, error } = await supabase
    .from('subjects')
    .insert({
      schoolId: payload.schoolId,
      code: cleanCode,
      name: payload.name.trim(),
      category: payload.category || 'UMUM',
      sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 100,
      description: payload.description?.trim() || null,
      isActive: payload.isActive,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Kode mata pelajaran "${cleanCode}" sudah digunakan di sekolah ini.`);
    }
    throw new Error(`Gagal menambahkan mata pelajaran: ${error.message}`);
  }

  return data as SubjectItem;
}

/**
 * Memperbarui data mata pelajaran yang sudah ada.
 */
export async function updateSubject(
  id: string,
  schoolId: string,
  payload: Omit<SubjectPayload, 'schoolId'>
): Promise<SubjectItem> {
  const cleanCode = payload.code?.trim().toUpperCase() || null;

  const { data, error } = await supabase
    .from('subjects')
    .update({
      code: cleanCode,
      name: payload.name.trim(),
      category: payload.category || 'UMUM',
      sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 100,
      description: payload.description?.trim() || null,
      isActive: payload.isActive,
    })
    .eq('id', id)
    .eq('schoolId', schoolId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Kode mata pelajaran "${cleanCode}" sudah digunakan oleh mapel lain.`);
    }
    throw new Error(`Gagal memperbarui mata pelajaran: ${error.message}`);
  }

  return data as SubjectItem;
}

/**
 * Menghapus mata pelajaran (jika belum terikat pada nilai/jadwal).
 */
export async function deleteSubject(id: string, schoolId: string): Promise<void> {
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id)
    .eq('schoolId', schoolId);

  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'Mata pelajaran ini sudah dipakai pada data Nilai atau Jadwal. Nonaktifkan statusnya saja tanpa menghapus.'
      );
    }
    throw new Error(`Gagal menghapus mata pelajaran: ${error.message}`);
  }
}

/**
 * Mengisi paket awal mata pelajaran Kurikulum Merdeka agar siap dipakai
 * untuk Jadwal Pelajaran maupun Input Nilai & Cetak Raport.
 */
export async function seedDefaultMerdekaSubjects(
  schoolId: string,
  existingCodes: string[]
): Promise<number> {
  const normalizedExisting = new Set(
    existingCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  );

  const templates = [
    { code: 'PABP', name: 'Pendidikan Agama dan Budi Pekerti', category: 'UMUM', sortOrder: 10 },
    { code: 'PPKN', name: 'Pendidikan Pancasila', category: 'UMUM', sortOrder: 20 },
    { code: 'BIN', name: 'Bahasa Indonesia', category: 'UMUM', sortOrder: 30 },
    { code: 'MTK', name: 'Matematika', category: 'UMUM', sortOrder: 40 },
    { code: 'SEJ', name: 'Sejarah', category: 'UMUM', sortOrder: 50 },
    { code: 'BING', name: 'Bahasa Inggris', category: 'UMUM', sortOrder: 60 },
    { code: 'PJOK', name: 'Pendidikan Jasmani, Olahraga, dan Kesehatan', category: 'UMUM', sortOrder: 70 },
    { code: 'SENI', name: 'Seni dan Budaya', category: 'UMUM', sortOrder: 80 },
    { code: 'INF', name: 'Informatika', category: 'UMUM', sortOrder: 90 },
    { code: 'KKA', name: 'Koding dan Kecerdasan Artifisial', category: 'PILIHAN', sortOrder: 100 },
    { code: 'BJW', name: 'Bahasa Jawa', category: 'MUATAN_LOKAL', sortOrder: 110 },
  ];

  const rowsToInsert = templates
    .filter((item) => !normalizedExisting.has(item.code))
    .map((item) => ({
      schoolId,
      code: item.code,
      name: item.name,
      category: item.category,
      sortOrder: item.sortOrder,
      description: 'Kurikulum Merdeka',
      isActive: true,
    }));

  if (rowsToInsert.length === 0) {
    return 0;
  }

  const { error } = await supabase.from('subjects').insert(rowsToInsert);
  if (error) {
    throw new Error(`Gagal mengisi paket mata pelajaran: ${error.message}`);
  }

  return rowsToInsert.length;
}