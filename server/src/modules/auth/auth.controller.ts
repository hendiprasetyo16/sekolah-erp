// D:\APLIKASI\sekolah-erp\server\src\modules\auth\auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './types/auth.types';

class LoginDto {
  email!: string;
  password!: string;
}

class RefreshDto {
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto.email, dto.password);
    return { success: true, data: result, message: 'Login berhasil' };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    const result = await this.authService.refreshTokens(dto.refreshToken);
    return { success: true, data: result };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@Request() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.sub);
    return { success: true, message: 'Logout berhasil' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: AuthenticatedRequest) {
    const user = await this.authService.getProfile(req.user.sub);
    return { success: true, data: user };
  }
}