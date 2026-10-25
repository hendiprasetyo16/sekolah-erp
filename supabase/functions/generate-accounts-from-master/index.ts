// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetGroup, schoolId } = await req.json()
    if (!schoolId) throw new Error("School ID tidak dikirim dari aplikasi (Kosong).");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let masterData = [];
    
    // 1. COCOKKAN DENGAN SKEMA V3
    if (targetGroup === 'staff') {
        const { data, error } = await supabaseAdmin.from('teachers').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Guru: ${error.message}`);
        
        masterData = (data || []).map(t => {
            const username = t.nip || t.nuptk || t.nik || t.id.substring(0,8);
            return { id: t.id, email: t.email || `${username}@sistem.local`, fullName: t.fullName, role: 'GURU' }
        });
    } else if (targetGroup === 'siswa') {
        const { data, error } = await supabaseAdmin.from('students').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Siswa: ${error.message}`);
        
        masterData = (data || []).map(s => {
            // PERBAIKAN: Gunakan 'nis', bukan 'nipd'
            const username = s.nisn || s.nis || s.nik || s.id.substring(0,8);
            return { id: s.id, email: s.email || `${username}@sistem.local`, fullName: s.fullName, role: 'SISWA' }
        });
    } else if (targetGroup === 'orangtua') {
        // PERBAIKAN: Jangan join tabel students untuk menghindari error 400 Composite Key
        const { data, error } = await supabaseAdmin.from('student_parents').select('*').eq('schoolId', schoolId);
        if (error) throw new Error(`Gagal mengambil data Orang Tua: ${error.message}`);

        masterData = (data || []).map(p => {
            const username = p.nik || p.id.substring(0,8);
            return { id: p.id, email: p.email || `W-${username}@sistem.local`, fullName: p.fullName, role: 'ORANG_TUA' }
        });
    } else {
        throw new Error(`Target kelompok "${targetGroup}" tidak valid`);
    }

    if (masterData.length === 0) {
        throw new Error(`Tidak ada data ${targetGroup} di database untuk sekolah ini.`);
    }

    // 2. FILTERING (Cari yang benar-benar belum punya akun)
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

    // 3. PENCEGAHAN TIMEOUT ERROR 504
    // Batasi maksimal pemrosesan hanya 100 akun per klik agar fungsi tidak crash
    let isTruncated = false;
    let targetData = accountsToCreate;
    if (accountsToCreate.length > 100) {
        targetData = accountsToCreate.slice(0, 100); // Ubah 50 jadi 100
        isTruncated = true;
    }

    let successCount = 0;
    const defaultPassword = 'Password123!';
    const chunks = chunkArray(targetData, 20); 

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (person) => {
            try {
                if (!person.email) return;
                const cleanEmail = person.email.toLowerCase().replace(/\s+/g, '');

                const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email: cleanEmail,
                    password: defaultPassword,
                    email_confirm: true,
                    user_metadata: { full_name: person.fullName }
                });

                let userId = authData?.user?.id;

                if (authError && authError.message.includes('already exists')) {
                    // Jika nyangkut di Auth tapi tak ada di public.users, abaikan ronde ini
                    return; 
                } else if (authError) {
                    console.error(`Auth Error:`, authError);
                    return;
                }

                if (userId) {
                    const { error: dbError } = await supabaseAdmin.from('users').insert({
                        id: userId,
                        schoolId: schoolId,
                        email: cleanEmail,
                        fullName: person.fullName,
                        role: person.role,
                        isActive: true
                    });
                    
                    if (!dbError) successCount++;
                }
            } catch (e) {
                console.error(`Gagal memproses ${person.fullName}`, e);
            }
        }));
    }

    let finalMessage = `Berhasil men-generate ${successCount} akun baru!`;
    if (isTruncated) {
        // Ubah pesan pengurangannya
        finalMessage = `Berhasil men-generate ${successCount} akun. Masih ada ${accountsToCreate.length - 100} data lagi. Silakan klik "Eksekusi Masal" lagi untuk melanjutkannya!`;
    }

    return new Response(JSON.stringify({ success: true, message: finalMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})