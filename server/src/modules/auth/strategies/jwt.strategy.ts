// D:\APLIKASI\sekolah-erp\server\src\modules\auth\strategies\jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtUserPayload } from '../types/auth.types';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const FALLBACK_JWT_SECRET = 'fallback-secret-change-me';
const INACTIVE_USER_MESSAGE = 'User tidak aktif';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || FALLBACK_JWT_SECRET,
    });
  }

  async validate(payload: JwtUserPayload): Promise<JwtUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(INACTIVE_USER_MESSAGE);
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      schoolId: payload.schoolId,
    };
  }
}