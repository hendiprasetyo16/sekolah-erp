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

const VALID_ROLES = [
  "ADMIN",
  "KEPALA_SEKOLAH",
  "OPERATOR",
  "BENDAHARA",
  "WALI_KELAS",
  "GURU",
  "STAFF_TU",
  "STAFF_SARPRAS",
  "ORANG_TUA",
  "SISWA",
] as const;

type AllowedRole = typeof VALID_ROLES[number];

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
    throw new Error("Anda tidak memiliki izin membuat akun.");
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

  let createdAuthId: string | null = null;

  try {
    const caller = await authorize(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond(400, { error: "Body JSON tidak valid." });
    }

    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
    const password = body.password;
    const fullName = typeof body.fullName === "string"
      ? body.fullName.trim()
      : "";
    const role = body.role;
    const schoolId = body.schoolId;
    const existingUserId = body.existingUserId;

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { error: "Alamat email tidak valid." });
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    ) {
      return respond(400, {
        error: "Kata sandi harus terdiri dari 8–72 karakter.",
      });
    }

    if (!fullName || fullName.length > 150) {
      return respond(400, {
        error: "Nama lengkap wajib diisi dan maksimal 150 karakter.",
      });
    }

    if (
      typeof role !== "string" ||
      !VALID_ROLES.includes(role as AllowedRole)
    ) {
      return respond(400, { error: "Role yang diminta tidak diizinkan." });
    }

    if (!isUuid(schoolId)) {
      return respond(400, {
        error: "schoolId wajib diisi dengan ID sekolah yang valid.",
      });
    }

    // Admin sekolah hanya boleh membuat akun operasional, bukan ADMIN.
    if (caller.role === "ADMIN" && role === "ADMIN") {
      return respond(403, {
        error: "ADMIN tidak diizinkan membuat akun ADMIN lain.",
      });
    }

    if (caller.role === "ADMIN" && schoolId !== caller.schoolId) {
      return respond(403, {
        error: "Anda hanya dapat membuat akun untuk sekolah sendiri.",
      });
    }

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();

    if (schoolError) throw new Error("Gagal memeriksa sekolah.");
    if (!school) {
      return respond(400, { error: "Sekolah tidak ditemukan." });
    }

    let userId: string;
    let existingProfile: {
      id: string;
      schoolId: string | null;
      role: string;
    } | null = null;

    if (existingUserId !== undefined && existingUserId !== null) {
      if (!isUuid(existingUserId)) {
        return respond(400, { error: "existingUserId tidak valid." });
      }

      if (existingUserId === caller.id) {
        return respond(400, {
          error: "Anda tidak dapat mengganti kredensial akun sendiri melalui fungsi ini.",
        });
      }

      const { data: authLookup, error: authLookupError } =
        await supabaseAdmin.auth.admin.getUserById(existingUserId);

      if (authLookupError || !authLookup.user) {
        return respond(404, {
          error: "Akun Auth yang akan dihubungkan tidak ditemukan.",
        });
      }

      userId = authLookup.user.id;

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("users")
        .select('id, "schoolId", role')
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw new Error("Gagal memeriksa profil akun.");

      existingProfile = profile;

      if (existingProfile?.role === "SUPER_ADMIN") {
        return respond(403, {
          error: "Akun SUPER_ADMIN tidak dapat diubah melalui fungsi ini.",
        });
      }

      if (
        caller.role === "ADMIN" &&
        existingProfile &&
        (
          existingProfile.schoolId !== caller.schoolId ||
          existingProfile.role === "ADMIN"
        )
      ) {
        return respond(403, {
          error: "Anda tidak berwenang mengubah akun tersebut.",
        });
      }

      // Jangan memindahkan profil yang sudah terdaftar di sekolah lain.
      if (
        existingProfile &&
        existingProfile.schoolId !== schoolId
      ) {
        return respond(409, {
          error: "Akun sudah terhubung ke sekolah lain. Pemindahan sekolah harus dilakukan melalui alur khusus.",
        });
      }

      // Update kredensial Auth pada ID yang benar-benar sudah diverifikasi.
      const { error: updateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

      if (updateAuthError) {
        console.error("Existing Auth update failed:", updateAuthError.message);
        throw new Error("Gagal memperbarui kredensial akun yang sudah ada.");
      }

      const profilePayload = {
        email,
        fullName,
        role,
        schoolId,
        isActive: true,
        isFirstLogin: true,
      };

      if (existingProfile) {
        const { data: updatedProfile, error: updateProfileError } =
          await supabaseAdmin
            .from("users")
            .update(profilePayload)
            .eq("id", userId)
            .select("id")
            .maybeSingle();

        if (updateProfileError) {
          console.error("Existing profile update failed:", updateProfileError.message);
          return respond(500, {
            error: "Kredensial Auth telah diperbarui, tetapi profil gagal diperbarui. Periksa akun sebelum mencoba lagi.",
            authUpdated: true,
            userId,
          });
        }

        if (!updatedProfile) {
          return respond(500, {
            error: "Kredensial Auth telah diperbarui, tetapi profil tidak ditemukan saat pembaruan.",
            authUpdated: true,
            userId,
          });
        }
      } else {
        const { error: insertProfileError } = await supabaseAdmin
          .from("users")
          .insert({ id: userId, ...profilePayload });

        if (insertProfileError) {
          console.error("Profile insert failed:", insertProfileError.message);
          return respond(500, {
            error: "Kredensial Auth telah diperbarui, tetapi pembuatan profil gagal. Periksa akun sebelum mencoba lagi.",
            authUpdated: true,
            userId,
          });
        }
      }

      return respond(200, {
        success: true,
        message: "Profil akun yang sudah ada berhasil diperbarui.",
        userId,
      });
    }

    // Pembuatan akun baru: buat Auth dahulu, lalu profil.
    const { data: authData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createAuthError || !authData.user) {
      console.error("Auth create failed:", createAuthError?.message);
      throw new Error("Gagal membuat akun Auth. Periksa email dan kata sandi.");
    }

    userId = authData.user.id;
    createdAuthId = userId;

    const { error: insertProfileError } = await supabaseAdmin
      .from("users")
      .insert({
        id: userId,
        email,
        fullName,
        role,
        schoolId,
        isActive: true,
        isFirstLogin: true,
      });

    if (insertProfileError) {
      console.error("Profile insert failed:", insertProfileError.message);

      // Rollback akun Auth yang baru dibuat jika profil gagal dibuat.
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);

      if (rollbackError) {
        console.error("Auth rollback failed:", rollbackError.message);
      }

      createdAuthId = null;
      throw new Error(
        rollbackError
          ? "Profil gagal dibuat dan pembersihan akun Auth juga gagal. Periksa akun secara manual."
          : "Profil gagal dibuat. Akun Auth yang baru dibuat telah dibersihkan.",
      );
    }

    createdAuthId = null;

    return respond(200, {
      success: true,
      message: "Akun berhasil dibuat.",
      userId,
    });
  } catch (error) {
    // Pengaman tambahan jika suatu error terjadi setelah Auth dibuat.
    if (createdAuthId) {
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(createdAuthId);

      if (rollbackError) {
        console.error("Auth rollback failed:", rollbackError.message);
      }
    }

    const message = error instanceof Error
      ? error.message
      : "Terjadi kesalahan pada server.";

    const status = /Sesi login|tidak memiliki izin|tidak diizinkan|hanya dapat|tidak aktif|tidak valid|belum terhubung/i
      .test(message) ? 403 : 500;

    return respond(status, { error: message });
  }
});
