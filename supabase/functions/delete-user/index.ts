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
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Sesi login tidak ditemukan.");
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(header.slice(7).trim());

  if (authError || !authData.user) {
    throw new Error("Sesi login tidak valid.");
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

  if (!["SUPER_ADMIN", "ADMIN"].includes(caller.role)) {
    throw new Error("Anda tidak memiliki izin menghapus akun.");
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

    const { targetUserId } = body;

    if (!isUuid(targetUserId)) {
      return respond(400, { error: "ID pengguna tidak valid." });
    }

    if (targetUserId === caller.id) {
      return respond(400, {
        error: "Anda tidak dapat menghapus akun yang sedang digunakan.",
      });
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select('id, "schoolId", role, email')
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) throw new Error("Gagal memeriksa akun tujuan.");

    if (target) {
      if (target.role === "SUPER_ADMIN") {
        return respond(403, {
          error: "Akun SUPER_ADMIN tidak dapat dihapus melalui fungsi ini.",
        });
      }

      if (caller.role === "ADMIN") {
        if (target.schoolId !== caller.schoolId) {
          return respond(403, {
            error: "Anda hanya dapat menghapus akun dari sekolah sendiri.",
          });
        }

        if (target.role === "ADMIN") {
          return respond(403, {
            error: "ADMIN tidak diizinkan menghapus akun ADMIN lain.",
          });
        }
      }
    }

    // Hapus Auth terlebih dahulu; foreign key akan menghapus profil terkait.
    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (authDeleteError) {
      // Jangan menghapus profil secara membabi buta jika Auth masih ada.
      // Jika Auth memang tidak ada, coba bersihkan profil yatim di bawah.
      const { data: authLookup, error: lookupError } =
        await supabaseAdmin.auth.admin.getUserById(targetUserId);

      if (lookupError || authLookup.user) {
        console.error("Auth delete failed:", authDeleteError.message);
        return respond(500, {
          error: "Gagal menghapus akun Auth. Profil tidak dihapus.",
        });
      }

      // Auth tidak ditemukan. Jika profil masih ada, bersihkan profil yatim.
      if (target) {
        const { error: profileDeleteError } = await supabaseAdmin
          .from("users")
          .delete()
          .eq("id", targetUserId);

        if (profileDeleteError) {
          console.error("Orphan profile cleanup failed:", profileDeleteError.message);
          return respond(500, {
            error: "Akun Auth tidak ditemukan, tetapi profil gagal dibersihkan.",
          });
        }
      }
    }

    return respond(200, {
      success: true,
      message: "Penghapusan akun selesai.",
      targetUserId,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Terjadi kesalahan pada server.";

    const status = /Sesi login|tidak memiliki izin|tidak diizinkan|hanya dapat|tidak aktif|tidak valid|belum terhubung/i
      .test(message) ? 403 : 500;

    return respond(status, { error: message });
  }
});
