// D:\APLIKASI\sekolah-erp\server\src\modules\students\students.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/auth.types';

export type CreateStudentBody = Omit<Prisma.StudentCreateInput, 'school'>;
export type UpdateStudentBody = Prisma.StudentUpdateInput;

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @Roles(
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'OPERATOR',
    'WALI_KELAS',
    'GURU',
    'STAFF_TU'
  )
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc'
  ) {
    const result = await this.studentsService.findAll({
      schoolId: req.user.schoolId,
      page,
      limit,
      search,
      status,
      classId,
      sortBy,
      sortOrder,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'OPERATOR',
    'WALI_KELAS',
    'GURU',
    'STAFF_TU',
    'ORANG_TUA'
  )
  async findById(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string
  ) {
    const result = await this.studentsService.findById(id, req.user.schoolId);
    return { success: true, data: result };
  }

  @Post()
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR')
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateStudentBody
  ) {
    const result = await this.studentsService.create({
      ...body,
      school: { connect: { id: req.user.schoolId } },
    });
    return { success: true, data: result, message: 'Siswa berhasil ditambahkan' };
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateStudentBody
  ) {
    const result = await this.studentsService.update(id, req.user.schoolId, body);
    return { success: true, data: result, message: 'Data siswa berhasil diperbarui' };
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')
  async delete(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string
  ) {
    await this.studentsService.delete(id, req.user.schoolId);
    return { success: true, message: 'Siswa berhasil dihapus' };
  }
}