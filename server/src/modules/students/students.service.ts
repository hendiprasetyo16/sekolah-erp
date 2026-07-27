import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    schoolId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    classId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { schoolId, page = 1, limit = 10, search, status, classId, sortBy = 'fullName', sortOrder = 'asc' } = params;

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(classId ? { classId } : {}),
      ...(search ? {
        OR: [
          { fullName: { contains: search } },
          { nisn: { contains: search } },
          { nik: { contains: search } },
        ],
      } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: { class: { select: { name: true, id: true, gradeLevel: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.student.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: data.map(s => ({
        id: s.id, nisn: s.nisn, nik: s.nik, fullName: s.fullName,
        gender: s.gender, className: s.class?.name || '', classId: s.classId || '',
        gradeLevel: s.class?.gradeLevel || 0, status: s.status,
        photoUrl: s.photoUrl, phone: s.phone, entryDate: s.entryDate.toISOString(),
      })),
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async findById(id: string, schoolId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: { class: true, parents: true, economic: true },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    return student;
  }

  async create(data: Prisma.StudentCreateInput) {
    return this.prisma.student.create({ data, include: { class: true } });
  }

  async update(id: string, schoolId: string, data: Prisma.StudentUpdateInput) {
    await this.findById(id, schoolId);
    return this.prisma.student.update({ where: { id }, data, include: { class: true } });
  }

  async delete(id: string, schoolId: string) {
    await this.findById(id, schoolId);
    // Soft delete — change status instead of removing
    return this.prisma.student.update({ where: { id }, data: { status: 'DO' } });
  }
}
