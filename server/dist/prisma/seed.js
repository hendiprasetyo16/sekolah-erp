"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    const school = await prisma.school.upsert({
        where: { npsn: '20512345' },
        update: {},
        create: {
            name: 'SMK Nusantara Informatika',
            npsn: '20512345',
            level: 'SMK',
            type: 'SWASTA',
            address: 'Jl. Pendidikan No. 123, Kel. Sukamaju',
            city: 'Bandung',
            province: 'Jawa Barat',
            phone: '022-1234567',
            email: 'info@smknusantara.sch.id',
        },
    });
    console.log('✅ School created:', school.name);
    const academicYear = await prisma.academicYear.upsert({
        where: { id: 'ay-2025-2026' },
        update: {},
        create: {
            id: 'ay-2025-2026',
            schoolId: school.id,
            name: '2025/2026',
            startYear: 2025,
            endYear: 2026,
            isActive: true,
        },
    });
    console.log('✅ Academic year:', academicYear.name);
    const passwordHash = await bcrypt.hash('admin123', 10);
    const users = [
        { email: 'admin@smknusantara.sch.id', fullName: 'Ahmad Suryadi', role: 'SUPER_ADMIN' },
        { email: 'kepsek@smknusantara.sch.id', fullName: 'Dr. Hj. Siti Rahmawati, M.Pd.', role: 'KEPALA_SEKOLAH' },
        { email: 'bendahara@smknusantara.sch.id', fullName: 'Rina Kurniawan', role: 'BENDAHARA' },
        { email: 'operator@smknusantara.sch.id', fullName: 'Budi Santoso', role: 'OPERATOR' },
        { email: 'guru@smknusantara.sch.id', fullName: 'Dewi Anggraeni, S.Pd.', role: 'GURU' },
        { email: 'walikelas@smknusantara.sch.id', fullName: 'Ir. Hendra Wijaya', role: 'WALI_KELAS' },
    ];
    for (const userData of users) {
        await prisma.user.upsert({
            where: { email: userData.email },
            update: {},
            create: {
                schoolId: school.id,
                email: userData.email,
                passwordHash,
                fullName: userData.fullName,
                role: userData.role,
                isActive: true,
            },
        });
        console.log(`✅ User: ${userData.fullName} (${userData.role})`);
    }
    const classesDef = [
        { name: 'X RPL 1', gradeLevel: 10, major: 'RPL' },
        { name: 'X TKJ 1', gradeLevel: 10, major: 'TKJ' },
        { name: 'X MM 1', gradeLevel: 10, major: 'MM' },
        { name: 'XI RPL 1', gradeLevel: 11, major: 'RPL' },
        { name: 'XI TKJ 2', gradeLevel: 11, major: 'TKJ' },
        { name: 'XI AKL 1', gradeLevel: 11, major: 'AKL' },
        { name: 'XII RPL 1', gradeLevel: 12, major: 'RPL' },
        { name: 'XII TKJ 1', gradeLevel: 12, major: 'TKJ' },
        { name: 'XII OTKP 1', gradeLevel: 12, major: 'OTKP' },
    ];
    for (const cls of classesDef) {
        await prisma.class.create({
            data: { schoolId: school.id, academicYearId: academicYear.id, ...cls },
        });
        console.log(`✅ Class: ${cls.name}`);
    }
    console.log('\n🎉 Seeding complete!');
}
main()
    .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map