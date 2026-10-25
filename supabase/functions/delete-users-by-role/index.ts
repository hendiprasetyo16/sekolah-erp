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

    // 1. Tentukan Role yang akan dihapus berdasarkan Tab aktif
    let targetRoles: string[] = [];
    if (targetGroup === 'staff') {
        targetRoles = ['GURU', 'WALI_KELAS', 'BENDAHARA', 'STAFF_TU', 'STAFF_SARPRAS'];
    } else if (targetGroup === 'siswa') {
        targetRoles = ['SISWA'];
    } else if (targetGroup === 'orangtua') {
        targetRoles = ['ORANG_TUA'];
    } else {
        throw new Error("Target kelompok tidak valid");
    }

    // 2. Ambil ID pengguna yang termasuk dalam role tersebut
    const { data: users, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('schoolId', schoolId)
        .in('role', targetRoles)

    if (fetchError) throw fetchError;

    let deleteCount = 0;

    // 3. Hapus data Auth dan Data Publik satu per satu
    for (const user of users) {
         // Coba hapus akun loginnya (Abaikan jika akun login belum di-generate)
         try { 
             await supabaseAdmin.auth.admin.deleteUser(user.id); 
         } catch(e) {}
         
         // Hapus dari tabel public
         await supabaseAdmin.from('users').delete().eq('id', user.id);
         deleteCount++;
    }

    return new Response(JSON.stringify({ success: true, message: `Berhasil menghapus ${deleteCount} akun secara masal.` }), {
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