"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = require("bcrypt");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async login(email, password) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: { school: true },
        });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Email atau kata sandi salah');
        }
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Email atau kata sandi salah');
        }
        const payload = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
        const token = this.jwtService.sign(payload);
        const refreshToken = this.jwtService.sign(payload, {
            secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
            expiresIn: 604800,
        });
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: hashedRefreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
        const academicYear = await this.prisma.academicYear.findFirst({
            where: { schoolId: user.schoolId, isActive: true },
        });
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
    async refreshTokens(oldRefreshToken) {
        try {
            const payload = this.jwtService.verify(oldRefreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            });
            const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user || !user.isActive)
                throw new common_1.UnauthorizedException('Invalid refresh token');
            const newPayload = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId };
            const token = this.jwtService.sign(newPayload);
            const refreshToken = this.jwtService.sign(newPayload, {
                secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
                expiresIn: 604800,
            });
            return { token, refreshToken };
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
    }
    async logout(userId) {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    async getProfile(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, fullName: true, role: true, avatarUrl: true, schoolId: true, isActive: true, lastLogin: true },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map