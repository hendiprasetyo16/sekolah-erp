// D:\APLIKASI\sekolah-erp\server\src\modules\auth\types\auth.types.ts
import type { Request } from 'express';

/**
 * Struktur data pengguna yang tersimpan di dalam token JWT
 * dan ditempelkan ke `req.user` setelah lolos JwtAuthGuard.
 */
export interface JwtUserPayload {
  sub: string;
  email: string;
  role: string;
  schoolId: string;
}

/**
 * Tipe Express Request yang sudah terjamin memiliki properti `user`.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtUserPayload;
}