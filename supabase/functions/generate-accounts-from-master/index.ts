// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// DOKUMENTASI: Fungsi untuk memecah array besar menjadi potongan kecil (chunk)
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// DOKUMENTASI: Fungsi jeda waktu untuk mencegah server Supabase menolak request karena terlalu cepat (Rate Limit)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// DOKUMENTASI: Fungsi pembantu untuk membersihkan string dari spasi dan tanda hubung
const cleanString = (str) => str ? str.replace(/[\s-]/g, '') : '';

serve(async (req) => {
  // DOKUMENTASI: Menangani Pre-flight CORS dari Browser
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { targetGroup, schoolId } = await req.json()
    if (!schoolId) throw new Error("School ID tidak dikirim dari aplikasi (Kosong).");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let masterData = [];
    
    // =========================================================================
    // LANGKAH 1: PENGAMBILAN & MAPPING DATA (DENGAN SANITASI FORMAT DAPODIK)
    // =========================================================================
    if (targetGroup === 'staff') {
        const { data, error } = await supabaseAdmin.from('teachers').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Guru: ${error.message}`);
        
        masterData = (data || []).map(t => {
            // BEST PRACTICE: Bersihkan spasi/tanda hubung dari data Dapodik
            const cleanNuptk = cleanString(t.nuptk);
            const cleanNip = cleanString(t.nip);
            const cleanNik = cleanString(t.nik);
            
            // Prioritas: NUPTK -> NIP -> NIK -> ID Unik
            const username = cleanNuptk || cleanNip || cleanNik || t.id.substring(0,8);
            
            // Gunakan email asli jika ada, jika tidak buat email sistem (.trim() menghapus spasi tak sengaja)
            const finalEmail = t.email && t.email.trim() !== '' 
                ? t.email.trim().toLowerCase() 
                : `${username}@sistem.local`.toLowerCase();

            return { id: t.id, email: finalEmail, fullName: t.fullName, role: 'GURU' }
        });

    } else if (targetGroup === 'siswa') {
        const { data, error } = await supabaseAdmin.from('students').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Siswa: ${error.message}`);
        
        masterData = (data || []).map(s => {
            const cleanNisn = cleanString(s.nisn);
            const cleanNis = cleanString(s.nis);
            const cleanNik = cleanString(s.nik);
            
            const username = cleanNisn || cleanNis || cleanNik || s.id.substring(0,8);
            const finalEmail = s.email && s.email.trim() !== '' 
                ? s.email.trim().toLowerCase() 
                : `${username}@sistem.local`.toLowerCase();

            return { id: s.id, email: finalEmail, fullName: s.fullName, role: 'SISWA' }
        });

    } else if (targetGroup === 'orangtua') {
        const { data, error } = await supabaseAdmin.from('student_parents').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Orang Tua: ${error.message}`);

        // FILTER: 1 Siswa = 1 Akun Ortu (Prioritas Ayah)
        const uniqueParentsMap = new Map();
        (data || []).forEach(p => {
            if (!uniqueParentsMap.has(p.studentId) || p.relation.toLowerCase() === 'ayah') {
                uniqueParentsMap.set(p.studentId, p);
            }
        });

        masterData = Array.from(uniqueParentsMap.values()).map(p => {
            const cleanNik = cleanString(p.nik);
            const username = cleanNik || `w-${p.studentId.substring(0,6)}`;
            
            const finalEmail = p.email && p.email.trim() !== '' 
                ? p.email.trim().toLowerCase() 
                : `${username}@sistem.local`.toLowerCase();

            return { id: p.id, email: finalEmail, fullName: p.fullName, role: 'ORANG_TUA' }
        });
    } else {
        throw new Error(`Target kelompok "${targetGroup}" tidak valid`);
    }

    if (masterData.length === 0) {
        throw new Error(`Tidak ada data ${targetGroup} di database untuk sekolah ini.`);
    }

    // =========================================================================
    // LANGKAH 2: CEK AKUN YANG SUDAH ADA AGAR TIDAK DUPLIKAT
    // =========================================================================
    const { data: existingUsers } = await supabaseAdmin.from('users').select('email').eq('schoolId', schoolId);
    const existingEmails = new Set((existingUsers || []).map(u => (u.email || '').toLowerCase().replace(/\s+/g, '')));
    
    const accountsToCreate = masterData.filter(person => {
        const cleanEmail = (person.email || '').toLowerCase().replace(/\s+/g, '');
        return !existingEmails.has(cleanEmail);
    });

    if (accountsToCreate.length === 0) {
        return new Response(JSON.stringify({ success: true, message: `Semua data ${targetGroup} sudah memiliki akun login.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
    }

    // =========================================================================
    // LANGKAH 3: EKSEKUSI PEMBUATAN AKUN (BATCHING MAX 50)
    // =========================================================================
    let isTruncated = false;
    let targetData = accountsToCreate;
    if (accountsToCreate.length > 50) {
        targetData = accountsToCreate.slice(0, 50); 
        isTruncated = true;
    }

    let successCount = 0;
    const defaultPassword = 'Password123!';
    
    // Pecah menjadi kelompok kecil (5 akun per proses) agar koneksi database tidak tersumbat
    const chunks = chunkArray(targetData, 5); 

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (person) => {
            try {
                if (!person.email) return;
                
                // Buat Auth (Login Supabase)
                const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email: person.email,
                    password: defaultPassword,
                    email_confirm: true,
                    user_metadata: { full_name: person.fullName }
                });

                if (authError && authError.message.includes('already exists')) return; 
                if (authError) return;

                // Masukkan Hak Akses ke tabel public.users
                let userId = authData?.user?.id;
                if (userId) {
                    const { error: dbError } = await supabaseAdmin.from('users').insert({
                        id: userId,
                        schoolId: schoolId,
                        email: person.email,
                        fullName: person.fullName,
                        role: person.role,
                        isActive: true
                    });
                    if (!dbError) successCount++;
                }
            } catch (e) {
                // Abaikan jika 1 data gagal agar data yang lain tetap diproses
            }
        }));
        
        // Jeda 0.5 detik untuk menghindari rate-limit Supabase
        await delay(500); 
    }

    // =========================================================================
    // LANGKAH 4: KIRIM RESPONS KE FRONTEND
    // =========================================================================
    let finalMessage = `Berhasil men-generate ${successCount} akun baru!`;
    if (isTruncated) {
        finalMessage = `Berhasil men-generate ${successCount} akun. Masih ada sisa ${accountsToCreate.length - targetData.length} antrian. Silakan klik tombol "Generate" lagi.`;
    }

    return new Response(JSON.stringify({ success: true, message: finalMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})