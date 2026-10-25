// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetGroup, schoolId } = await req.json()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let masterData = [];
    
    if (targetGroup === 'staff') {
        // PERBAIKAN: Ambil juga nik sebagai cadangan
        const { data } = await supabaseAdmin.from('teachers').select('id, email, fullName, nip, nuptk, nik').eq('schoolId', schoolId);
        masterData = (data || []).map(t => {
            // LOGIKA WATERFALL GURU: NIP -> NUPTK -> NIK
            const username = t.nip || t.nuptk || t.nik || t.id.substring(0,8);
            return { 
                id: t.id, 
                email: t.email || `${username}@sistem.local`, 
                fullName: t.fullName, 
                role: 'GURU' 
            }
        });
    } else if (targetGroup === 'siswa') {
        // PERBAIKAN: Ambil nisn, nipd, dan nik dari tabel students
        const { data } = await supabaseAdmin.from('students').select('id, email, fullName, nisn, nipd, nik').eq('schoolId', schoolId);
        masterData = (data || []).map(s => {
            // LOGIKA WATERFALL SISWA: NISN -> NIPD -> NIK
            const username = s.nisn || s.nipd || s.nik || s.id.substring(0,8);
            return { 
                id: s.id, 
                email: s.email || `${username}@sistem.local`, 
                fullName: s.fullName, 
                role: 'SISWA' 
            }
        });
    } else if (targetGroup === 'orangtua') {
        // PERBAIKAN: Relasi mengambil nisn, nipd, dan nik anak
        const { data } = await supabaseAdmin.from('student_parents').select(`
            id, email, fullName, 
            students ( nisn, nipd, nik )
        `).eq('schoolId', schoolId);
        
        masterData = (data || []).map(p => {
            // LOGIKA WATERFALL ORANG TUA: NISN Anak -> NIPD Anak -> NIK Anak
            const childId = p.students?.nisn || p.students?.nipd || p.students?.nik || p.id.substring(0,8);
            return { 
                id: p.id, 
                email: p.email || `W-${childId}@sistem.local`, 
                fullName: p.fullName, 
                role: 'ORANG_TUA' 
            }
        });
    } else {
        throw new Error("Target kelompok tidak valid");
    }

    let successCount = 0;
    const defaultPassword = 'Password123!';

    for (const person of masterData) {
        try {
            // AMAN DARI SPASI: Hilangkan spasi berlebih pada Username/Email 
            // (Mencegah error login jika admin Excel mengetik "1234 5678")
            const cleanEmail = person.email.toLowerCase().replace(/\s+/g, '');

            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: cleanEmail,
                password: defaultPassword,
                email_confirm: true,
                user_metadata: { full_name: person.fullName }
            });

            let userId = null;

            if (authData?.user) {
                userId = authData.user.id;
            } else if (authError && authError.message.includes('already exists')) {
                continue;
            }

            if (userId) {
                await supabaseAdmin.from('users').insert({
                    id: userId,
                    schoolId: schoolId,
                    email: cleanEmail,
                    fullName: person.fullName,
                    role: person.role,
                    isActive: true
                });
                successCount++;
            }
        } catch (e) {
            console.log(`Gagal memproses ${person.fullName}`, e);
        }
    }

    return new Response(JSON.stringify({ success: true, message: `Berhasil men-generate ${successCount} akun baru!` }), {
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