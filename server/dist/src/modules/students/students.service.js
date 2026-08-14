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
exports.StudentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let StudentsService = class StudentsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(params) {
        const { schoolId, page = 1, limit = 10, search, status, classId, sortBy = 'fullName', sortOrder = 'asc' } = params;
        const where = {
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
    async findById(id, schoolId) {
        const student = await this.prisma.student.findFirst({
            where: { id, schoolId },
            include: { class: true, parents: true, economic: true },
        });
        if (!student)
            throw new common_1.NotFoundException('Siswa tidak ditemukan');
        return student;
    }
    async create(data) {
        return this.prisma.student.create({ data, include: { class: true } });
    }
    async update(id, schoolId, data) {
        await this.findById(id, schoolId);
        return this.prisma.student.update({ where: { id }, data, include: { class: true } });
    }
    async delete(id, schoolId) {
        await this.findById(id, schoolId);
        return this.prisma.student.update({ where: { id }, data: { status: 'DO' } });
    }
};
exports.StudentsService = StudentsService;
exports.StudentsService = StudentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StudentsService);
//# sourceMappingURL=students.service.js.map