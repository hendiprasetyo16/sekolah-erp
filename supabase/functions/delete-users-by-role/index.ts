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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { targetGroup, schoolId } = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Tentukan Role apa yang mau dihapus berdasarkan targetGroup
    let roleTarget = '';
    if (targetGroup === 'staff') roleTarget = 'GURU'; // Atau array ['GURU', 'STAFF_TU', dll]
    else if (targetGroup === 'siswa') roleTarget = 'SISWA';
    else if (targetGroup === 'orangtua') roleTarget = 'ORANG_TUA';

    // Cari semua user dengan role tersebut di database
    const { data: usersToDelete } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('schoolId', schoolId)
        .eq('role', roleTarget);

    if (!usersToDelete || usersToDelete.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'Tidak ada data yang dihapus' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // BATCHING HAPUS DATA: Hapus 50 akun sekaligus (Paralel)
    const chunks = chunkArray(usersToDelete, 50);
    
    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (user) => {
            // Hapus dari Supabase Auth (Otomatis terhapus dari tabel public.users jika Anda pakai relasi CASCADE)
            await supabaseAdmin.auth.admin.deleteUser(user.id);
        }));
    }

    return new Response(JSON.stringify({ success: true, message: `Berhasil membersihkan masal!` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
})