// D:\APLIKASI\sekolah-erp\server\src\modules\auth\guards\jwt-auth.guard.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtUserPayload } from '../types/auth.types';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const DEFAULT_UNAUTHORIZED_MESSAGE = 'Token tidak valid atau sudah kadaluarsa';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtUserPayload>(
    err: unknown,
    user: TUser | false | null
  ): TUser {
    if (err || !user) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException(DEFAULT_UNAUTHORIZED_MESSAGE);
    }
    return user;
  }
}