import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async list(schoolId: string, page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where = {
      schoolId,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { nip: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
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

    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }

  async create(schoolId: string, data: any) {
    return this.prisma.teacher.create({
      data: {
        ...data,
        schoolId,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
      },
    });
  }

  async update(id: string, schoolId: string, data: any) {
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
