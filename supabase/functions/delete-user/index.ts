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
    const { targetUserId } = await req.json()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // LENGKAH 1: Hapus data profil dari tabel database 'users'
    // Ini wajib dilakukan pertama untuk memastikan data hasil import Excel terhapus
    const { error: dbError } = await supabaseAdmin.from('users').delete().eq('id', targetUserId)
    if (dbError) throw dbError

    // LANGKAH 2: Coba hapus akun dari sistem Login (Auth)
    try {
      await supabaseAdmin.auth.admin.deleteUser(targetUserId)
    } catch (authError) {
      // Kita membiarkan (mengabaikan) error di sini.
      // Jika error terjadi, artinya pengguna ini adalah hasil import Excel yang belum pernah di-generate akun loginnya.
      console.log('Info: User tidak ada di Auth, tapi sudah berhasil dihapus dari database publik.')
    }

    return new Response(JSON.stringify({ success: true, message: 'Akun berhasil dihapus permanen' }), {
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