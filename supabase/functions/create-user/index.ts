// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// DOKUMENTASI: CORS Headers agar React/APK bisa berkomunikasi dengan fungsi ini
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // DOKUMENTASI: Menangani Pre-flight Request dari Browser/APK (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // DOKUMENTASI: Menerima data payload dari antarmuka React
    const { email, password, fullName, role, schoolId, existingUserId } = await req.json()

    // DOKUMENTASI: Memanggil Supabase dengan KUNCI MASTER (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // DOKUMENTASI: Menyiapkan payload untuk mendaftarkan user ke Supabase Auth
    const authPayload: any = {
      email: email,
      password: password,
      email_confirm: true, 
      user_metadata: { full_name: fullName }
    }

    // Jika ini dari tombol "Generate Akun", kita paksa ID Auth sama dengan ID tabel users
    if (existingUserId) {
      authPayload.id = existingUserId;
    }

    // Eksekusi pembuatan akun di sistem Autentikasi
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser(authPayload)
    if (authError) throw authError

    const userId = authData.user.id

    // DOKUMENTASI: Menentukan apakah harus UPDATE (Generate) atau INSERT (Tambah Manual)
    if (existingUserId) {
      // MODE GENERATE: Perbarui status data hasil import Excel menjadi aktif
      const { error: dbError } = await supabaseAdmin.from('users').update({
        email: email,
        isActive: true
      }).eq('id', existingUserId)

      if (dbError) throw dbError
    } else {
      // MODE TAMBAH MANUAL: Buat baris baru di tabel users
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

      // Rollback Auth jika database gagal
      if (dbError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        throw dbError
      }
    }

    // DOKUMENTASI: Berikan respons sukses kembali ke React
    return new Response(JSON.stringify({ success: true, message: 'Operasi berhasil!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // DOKUMENTASI: Tangkap dan kirimkan error jika proses gagal
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})