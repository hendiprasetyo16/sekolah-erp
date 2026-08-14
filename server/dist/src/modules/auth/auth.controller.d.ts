import { AuthService } from './auth.service';
declare class LoginDto {
    email: string;
    password: string;
}
declare class RefreshDto {
    refreshToken: string;
}
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<{
        success: boolean;
        data: {
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
        };
        message: string;
    }>;
    refresh(dto: RefreshDto): Promise<{
        success: boolean;
        data: {
            token: string;
            refreshToken: string;
        };
    }>;
    logout(req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    getProfile(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            email: string;
            schoolId: string;
            fullName: string;
            role: string;
            isActive: boolean;
            avatarUrl: string | null;
            lastLogin: Date | null;
        } | null;
    }>;
}
export {};
