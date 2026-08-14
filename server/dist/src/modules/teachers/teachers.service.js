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
exports.TeachersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let TeachersService = class TeachersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(schoolId, page = 1, limit = 10, search) {
        const skip = (page - 1) * limit;
        const where = {
            schoolId,
            ...(search && {
                OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { nip: { contains: search, mode: 'insensitive' } },
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
    async getById(id, schoolId) {
        const teacher = await this.prisma.teacher.findUnique({
            where: { id, schoolId },
        });
        if (!teacher)
            throw new common_1.NotFoundException('Teacher not found');
        return teacher;
    }
    async create(schoolId, data) {
        return this.prisma.teacher.create({
            data: {
                ...data,
                schoolId,
                birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
                joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
            },
        });
    }
    async update(id, schoolId, data) {
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
    async delete(id, schoolId) {
        await this.getById(id, schoolId);
        return this.prisma.teacher.delete({
            where: { id, schoolId },
        });
    }
};
exports.TeachersService = TeachersService;
exports.TeachersService = TeachersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TeachersService);
//# sourceMappingURL=teachers.service.js.map