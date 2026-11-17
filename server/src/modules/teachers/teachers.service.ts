// D:\APLIKASI\sekolah-erp\server\src\modules\teachers\teachers.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const TEACHER_NOT_FOUND_MESSAGE = 'Data guru tidak ditemukan';

// ============================================================================
// DEFINISI TIPE INPUT GURU (BERDASARKAN SKEMA PRISMA — TANPA ANY)
// ============================================================================
export type CreateTeacherInput = Omit<
  Prisma.TeacherUncheckedCreateInput,
  'id' | 'schoolId' | 'birthDate' | 'joinDate'
> & {
  birthDate?: string | Date | null;
  joinDate?: string | Date | null;
};

export type UpdateTeacherInput = Partial<CreateTeacherInput>;

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    schoolId: string,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const trimmedSearch = search?.trim();

    const where: Prisma.TeacherWhereInput = {
      schoolId,
      ...(trimmedSearch
        ? {
            OR: [
              { fullName: { contains: trimmedSearch } },
              { nip: { contains: trimmedSearch } },
            ],
          }
        : {}),
    };

    const [data, totalItems] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return {
      data,
      meta: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getById(id: string, schoolId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id, schoolId },
    });

    if (!teacher) {
      throw new NotFoundException(TEACHER_NOT_FOUND_MESSAGE);
    }
    return teacher;
  }

  async create(schoolId: string, data: CreateTeacherInput) {
    return this.prisma.teacher.create({
      data: {
        ...data,
        schoolId,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
      },
    });
  }

  async update(id: string, schoolId: string, data: UpdateTeacherInput) {
    await this.getById(id, schoolId);

    return this.prisma.teacher.update({
      where: { id, schoolId },
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
      },
    });
  }

  async delete(id: string, schoolId: string) {
    await this.getById(id, schoolId);
    return this.prisma.teacher.delete({
      where: { id, schoolId },
    });
  }
}