import { StudentsService } from './students.service';
export declare class StudentsController {
    private readonly studentsService;
    constructor(studentsService: StudentsService);
    findAll(req: any, page?: number, limit?: number, search?: string, status?: string, classId?: string, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<{
        success: boolean;
        data: {
            data: {
                id: string;
                nisn: string;
                nik: string;
                fullName: string;
                gender: string;
                className: string;
                classId: string;
                gradeLevel: number;
                status: string;
                photoUrl: string | null;
                phone: string | null;
                entryDate: string;
            }[];
            meta: {
                total: number;
                page: number;
                limit: number;
                totalPages: number;
                hasNext: boolean;
                hasPrev: boolean;
            };
        };
    }>;
    findById(req: any, id: string): Promise<{
        success: boolean;
        data: {
            class: {
                id: string;
                name: string;
                schoolId: string;
                gradeLevel: number;
                major: string | null;
                capacity: number;
                academicYearId: string;
                homeroomTeacherId: string | null;
            } | null;
            parents: {
                id: string;
                address: string | null;
                phone: string | null;
                email: string | null;
                fullName: string;
                nik: string | null;
                studentId: string;
                relation: string;
                education: string | null;
                occupation: string | null;
                monthlyIncome: number | null;
                isAlive: boolean;
            }[];
            economic: {
                id: string;
                studentId: string;
                hasKip: boolean;
                kipNumber: string | null;
                hasKks: boolean;
                kksNumber: string | null;
                hasPkh: boolean;
                isDtks: boolean;
                houseOwnership: string | null;
                houseCondition: string | null;
                dependentsCount: number | null;
                isOrphan: boolean;
                orphanType: string | null;
                pipScore: number | null;
                economicCategory: string | null;
                scoringDetails: string | null;
                scoredAt: Date | null;
            } | null;
        } & {
            id: string;
            address: string;
            city: string;
            province: string;
            phone: string | null;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            schoolId: string;
            fullName: string;
            status: string;
            classId: string | null;
            nik: string;
            nisn: string;
            noKk: string | null;
            nickname: string | null;
            gender: string;
            birthDate: Date;
            birthPlace: string;
            religion: string | null;
            rt: string | null;
            rw: string | null;
            kelurahan: string | null;
            kecamatan: string | null;
            postalCode: string | null;
            photoUrl: string | null;
            distanceToSchool: number | null;
            transport: string | null;
            previousSchool: string | null;
            entryDate: Date;
        };
    }>;
    create(req: any, body: any): Promise<{
        success: boolean;
        data: {
            class: {
                id: string;
                name: string;
                schoolId: string;
                gradeLevel: number;
                major: string | null;
                capacity: number;
                academicYearId: string;
                homeroomTeacherId: string | null;
            } | null;
        } & {
            id: string;
            address: string;
            city: string;
            province: string;
            phone: string | null;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            schoolId: string;
            fullName: string;
            status: string;
            classId: string | null;
            nik: string;
            nisn: string;
            noKk: string | null;
            nickname: string | null;
            gender: string;
            birthDate: Date;
            birthPlace: string;
            religion: string | null;
            rt: string | null;
            rw: string | null;
            kelurahan: string | null;
            kecamatan: string | null;
            postalCode: string | null;
            photoUrl: string | null;
            distanceToSchool: number | null;
            transport: string | null;
            previousSchool: string | null;
            entryDate: Date;
        };
        message: string;
    }>;
    update(req: any, id: string, body: any): Promise<{
        success: boolean;
        data: {
            class: {
                id: string;
                name: string;
                schoolId: string;
                gradeLevel: number;
                major: string | null;
                capacity: number;
                academicYearId: string;
                homeroomTeacherId: string | null;
            } | null;
        } & {
            id: string;
            address: string;
            city: string;
            province: string;
            phone: string | null;
            email: string | null;
            createdAt: Date;
            updatedAt: Date;
            schoolId: string;
            fullName: string;
            status: string;
            classId: string | null;
            nik: string;
            nisn: string;
            noKk: string | null;
            nickname: string | null;
            gender: string;
            birthDate: Date;
            birthPlace: string;
            religion: string | null;
            rt: string | null;
            rw: string | null;
            kelurahan: string | null;
            kecamatan: string | null;
            postalCode: string | null;
            photoUrl: string | null;
            distanceToSchool: number | null;
            transport: string | null;
            previousSchool: string | null;
            entryDate: Date;
        };
        message: string;
    }>;
    delete(req: any, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
