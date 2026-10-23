// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. DOKUMENTASI: CORS Headers agar React bisa berkomunikasi dengan fungsi ini
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // 2. DOKUMENTASI: Menangani Pre-flight Request dari Browser (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. DOKUMENTASI: Menerima data payload dari antarmuka React
    const { email, password, fullName, role, schoolId } = await req.json()

    // 4. DOKUMENTASI: Memanggil Supabase dengan KUNCI MASTER (Service Role)
    // Kunci ini diperlukan karena membuat user baru di sistem Auth membutuhkan hak akses tinggi
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 5. DOKUMENTASI: Mendaftarkan user ke Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Otomatis menganggap email sudah terverifikasi
      user_metadata: {
        full_name: fullName,
      }
    })

    if (authError) throw authError

    // 6. DOKUMENTASI: Menyimpan detail profil ke tabel public.users
    const userId = authData.user.id
    const { error: dbError } = await supabaseAdmin.from('users').insert([
      {
        id: userId,
        email: email,
        fullName: fullName,
        role: role,
        schoolId: schoolId,
        isActive: true
      }
    ])

    if (dbError) {
      // (Opsional) Jika gagal masuk ke tabel users, hapus kembali user di Auth agar tidak ada data "menggantung"
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw dbError
    }

    // 7. DOKUMENTASI: Berikan respons sukses kembali ke React
    return new Response(JSON.stringify({ success: true, message: 'Pengguna berhasil ditambahkan!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // 8. DOKUMENTASI: Tangkap dan kirimkan error jika proses gagal
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})