// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. DOKUMENTASI: CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PERBAIKAN: Tambahkan tipe "Request" pada parameter req
serve(async (req: Request) => {
  // 2. DOKUMENTASI: Menangani Pre-flight Request dari Browser (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. DOKUMENTASI: Menerima data (payload) yang dikirim dari React
    const { targetUserId, newPassword } = await req.json()

    // 4. DOKUMENTASI: Memanggil Supabase dengan KUNCI MASTER
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 5. DOKUMENTASI: Eksekusi perubahan password di sistem Autentikasi Supabase
    const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    )

    if (updateError) throw updateError

    // 6. DOKUMENTASI: Berikan respons sukses kembali ke React
    return new Response(JSON.stringify({ success: true, message: 'Password berhasil direset' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // 7. DOKUMENTASI: Tangkap dan kirimkan error jika proses gagal
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})