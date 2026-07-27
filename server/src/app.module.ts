import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { TeachersModule } from './modules/teachers/teachers.module';

@Module({
  imports: [
    // Load .env file — all config from env vars
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Rate limiting — values from env
    ThrottlerModule.forRoot([{
      ttl: parseInt(process.env.THROTTLE_TTL || '60000'),
      limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
    }]),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    StudentsModule,
    TeachersModule,
  ],
})
export class AppModule {}
