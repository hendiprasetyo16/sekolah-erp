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
        // Ambil nip dan nuptk untuk dijadikan username
        const { data } = await supabaseAdmin.from('teachers').select('id, email, fullName, nip, nuptk').eq('schoolId', schoolId);
        masterData = (data || []).map(t => {
            // Prioritas Username: NIP -> NUPTK -> Potongan ID
            const username = t.nip || t.nuptk || t.id.substring(0,8);
            return { 
                id: t.id, 
                email: t.email || `${username}@sistem.local`, 
                fullName: t.fullName, 
                role: 'GURU' 
            }
        });
    } else if (targetGroup === 'siswa') {
        // Ambil nisn
        const { data } = await supabaseAdmin.from('students').select('id, email, fullName, nisn').eq('schoolId', schoolId);
        masterData = (data || []).map(s => {
            const username = s.nisn || s.id.substring(0,8);
            return { 
                id: s.id, 
                email: s.email || `${username}@sistem.local`, 
                fullName: s.fullName, 
                role: 'SISWA' 
            }
        });
    } else if (targetGroup === 'orangtua') {
        // Relasi (Join) ke tabel students untuk mengambil NISN anak
        const { data } = await supabaseAdmin.from('student_parents').select(`
            id, email, fullName, 
            students ( nisn )
        `).eq('schoolId', schoolId);
        
        masterData = (data || []).map(p => {
            // Username Wali: W-[NISN Anak]
            const childNisn = p.students?.nisn || p.id.substring(0,8);
            return { 
                id: p.id, 
                email: p.email || `W-${childNisn}@sistem.local`, 
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
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: person.email.toLowerCase(), // Pastikan huruf kecil
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
                    email: person.email.toLowerCase(),
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