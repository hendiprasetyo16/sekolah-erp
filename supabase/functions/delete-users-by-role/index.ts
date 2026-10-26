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
    throw new Error("Anda tidak memiliki izin menghapus akun massal.");
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

    const { targetGroup, schoolId } = body;

    const roleByGroup: Record<string, string> = {
      staff: "GURU",
      siswa: "SISWA",
      orangtua: "ORANG_TUA",
    };

    if (
      typeof targetGroup !== "string" ||
      !Object.hasOwn(roleByGroup, targetGroup)
    ) {
      return respond(400, {
        error: "targetGroup harus staff, siswa, atau orangtua.",
      });
    }

    if (!isUuid(schoolId)) {
      return respond(400, { error: "schoolId tidak valid." });
    }

    if (caller.role === "ADMIN" && schoolId !== caller.schoolId) {
      return respond(403, {
        error: "ADMIN hanya dapat menghapus akun dari sekolah sendiri.",
      });
    }

    const targetRole = roleByGroup[targetGroup];

    const { data: users, error: queryError } = await supabaseAdmin
      .from("users")
      .select("id, email, role, isActive")
      .eq("schoolId", schoolId)
      .eq("role", targetRole);

    if (queryError) {
      console.error("Bulk query failed:", queryError.message);
      throw new Error("Gagal mengambil daftar akun yang akan dihapus.");
    }

    if (!users || users.length === 0) {
      return respond(200, {
        success: true,
        message: "Tidak ada akun yang cocok untuk dihapus.",
        total: 0,
        deleted: 0,
        failed: [],
      });
    }

    // Batasi jumlah akun per pemanggilan untuk mengurangi risiko operasi massal.
    const MAX_PER_RUN = 500;
    const targets = users.slice(0, MAX_PER_RUN);
    const deleted: string[] = [];
    const failed: Array<{ id: string; email: string | null; error: string }> = [];

    // Jalankan berurutan agar beban Auth API lebih terkendali.
    for (const user of targets) {
      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(user.id);

      if (authDeleteError) {
        // Jangan hapus profil jika penghapusan Auth gagal.
        // Akun tetap dapat diperiksa dan dicoba lagi.
        failed.push({
          id: user.id,
          email: user.email ?? null,
          error: authDeleteError.message,
        });
        continue;
      }

      // public.users memiliki FK ke auth.users ON DELETE CASCADE.
      // Hapus profil sisa hanya bila masih ada, misalnya data tidak konsisten.
      const { error: profileCheckError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileCheckError) {
        failed.push({
          id: user.id,
          email: user.email ?? null,
          error: "Auth terhapus, tetapi pemeriksaan profil gagal: " +
            profileCheckError.message,
        });
        continue;
      }

      deleted.push(user.id);
    }

    const truncated = users.length > targets.length;

    return respond(failed.length > 0 ? 207 : 200, {
      success: failed.length === 0,
      message: failed.length === 0
        ? "Penghapusan akun selesai."
        : "Sebagian akun gagal dihapus. Periksa daftar failed.",
      totalMatched: users.length,
      totalProcessed: targets.length,
      deleted: deleted.length,
      failed,
      truncated,
      note: truncated
        ? `Dibatasi ${MAX_PER_RUN} akun per pemanggilan. Jalankan kembali untuk memproses sisanya.`
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Terjadi kesalahan pada server.";

    const status = /Sesi login|tidak memiliki izin|hanya dapat|tidak aktif|tidak valid|belum terhubung/i
      .test(message) ? 403 : 500;

    return respond(status, { error: message });
  }
});
