import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(email: string, password: string): Promise<{
        user: {
            id: string;
            email: string;
            fullName: string;
            role: string;
            avatarUrl: string | null;
            schoolId: string;
            isActive: true;
            lastLogin: string | undefined;
        };
        school: {
            id: string;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            npsn: string;
            level: string;
            type: string;
            address: string;
            city: string;
            province: string;
            phone: string | null;
            logoUrl: string | null;
            settings: string | null;
        };
        academicYear: {
            id: string;
            schoolId: string;
            isActive: boolean;
            createdAt: Date;
            name: string;
            startYear: number;
            endYear: number;
        } | null;
        token: string;
        refreshToken: string;
    }>;
    refreshTokens(oldRefreshToken: string): Promise<{
        token: string;
        refreshToken: string;
    }>;
    logout(userId: string): Promise<void>;
    getProfile(userId: string): Promise<{
        id: string;
        email: string;
        schoolId: string;
        fullName: string;
        role: string;
        isActive: boolean;
        avatarUrl: string | null;
        lastLogin: Date | null;
    } | null>;
}
