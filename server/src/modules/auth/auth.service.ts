import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { school: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    // Generate tokens — secrets from env
    const payload = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
    const token = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      expiresIn: 604800, // 7 days in seconds
    });

    // Store refresh token (hashed for security)
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Update last login
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    // Active academic year
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { schoolId: user.schoolId, isActive: true },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: { userId: user.id, schoolId: user.schoolId, action: 'LOGIN', module: 'auth' },
    });

    return {
      user: {
        id: user.id, email: user.email, fullName: user.fullName,
        role: user.role, avatarUrl: user.avatarUrl, schoolId: user.schoolId,
        isActive: user.isActive, lastLogin: user.lastLogin?.toISOString(),
      },
      school: user.school,
      academicYear,
      token,
      refreshToken,
    };
  }

  async refreshTokens(oldRefreshToken: string) {
    try {
      const payload = this.jwtService.verify(oldRefreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

      const newPayload = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
      const token = this.jwtService.sign(newPayload);
      const refreshToken = this.jwtService.sign(newPayload, {
        secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
        expiresIn: 604800, // 7 days in seconds
      });
      return { token, refreshToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, avatarUrl: true, schoolId: true, isActive: true, lastLogin: true },
    });
  }
}
