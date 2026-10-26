// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authorize(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
  }

  const token = authorization.slice(7).trim();
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    throw new Error("Sesi login tidak valid atau sudah kedaluwarsa.");
  }

  const { data: caller, error } = await supabaseAdmin
    .from("users")
    .select('id, "schoolId", role, "isActive"')
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error) throw new Error("Gagal memverifikasi profil pemanggil.");
  if (!caller || !caller.isActive) {
    throw new Error("Akun Anda tidak aktif atau profil tidak ditemukan.");
  }

  if (
    caller.role !== "SUPER_ADMIN" &&
    caller.role !== "ADMIN"
  ) {
    throw new Error("Anda tidak memiliki izin untuk mereset kata sandi.");
  }

  if (caller.role === "SUPER_ADMIN" && caller.schoolId !== null) {
    throw new Error("Konfigurasi akun SUPER_ADMIN tidak valid.");
  }

  if (caller.role === "ADMIN" && !caller.schoolId) {
    throw new Error("Akun ADMIN belum terhubung ke sekolah.");
  }

  return caller;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Metode tidak diizinkan." });
  }

  try {
    const caller = await authorize(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond(400, { error: "Body JSON tidak valid." });
    }

    const { targetUserId, newPassword } = body;

    if (!isUuid(targetUserId)) {
      return respond(400, { error: "ID pengguna tidak valid." });
    }

    if (
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      newPassword.length > 72
    ) {
      return respond(400, {
        error: "Kata sandi baru harus terdiri dari 8–72 karakter.",
      });
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select('id, "schoolId", role, "isActive"')
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) throw new Error("Gagal memeriksa akun tujuan.");
    if (!target) {
      return respond(404, {
        error: "Profil pengguna tidak ditemukan. Pastikan akun sudah dibuat.",
      });
    }

    if (target.role === "SUPER_ADMIN") {
      return respond(403, {
        error: "Kata sandi SUPER_ADMIN tidak dapat diubah melalui fungsi ini.",
      });
    }

    if (caller.role === "ADMIN") {
      if (target.schoolId !== caller.schoolId) {
        return respond(403, {
          error: "Anda hanya dapat mengelola pengguna dari sekolah sendiri.",
        });
      }

      if (target.role === "ADMIN") {
        return respond(403, {
          error: "ADMIN tidak diizinkan mereset kata sandi akun ADMIN lain.",
        });
      }
    }

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

    if (updateError) {
      console.error("Reset password failed:", updateError.message);
      throw new Error("Gagal memperbarui kata sandi akun.");
    }

    return respond(200, {
      success: true,
      message: "Kata sandi berhasil direset.",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Terjadi kesalahan pada server.";

    const status = /Sesi login|login kembali|tidak memiliki izin|tidak diizinkan|hanya dapat|tidak aktif|tidak valid/i
      .test(message) ? 403 : 500;

    return respond(status, { error: message });
  }
});
