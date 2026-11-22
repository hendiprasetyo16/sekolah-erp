// src/modules/academic/pages/MasterSettingsPage.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

import { SchoolProfileSection } from './SchoolProfilePage';
import { SchoolBrandingTab } from '../components/SchoolBrandingTab';
import { AcademicYearPage } from './AcademicYearPage';
import { ClassListPage } from './ClassListPage';
import { AttendanceSettingsTab } from '@/modules/attendance/components/AttendanceSettingsTab';

const TAB_TRIGGER_CLASS =
    'flex-1 whitespace-nowrap rounded-md px-5 py-2.5 text-muted-foreground transition-all hover:text-foreground ' +
    'data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white ' +
    'disabled:opacity-50';

export function MasterSettingsPage() {
    const { locale } = useTranslation();
    const location = useLocation();
    const { school: authSchool, user } = useAuthStore();
    const isId = locale === 'id';

    const role = user?.role;
    const canAccessSchoolProfile = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const hasSchool = Boolean(authSchool?.id);

    const requestedTab = location.state?.tab as string | undefined;
    const defaultTab = (() => {
        if (!hasSchool && canAccessSchoolProfile) {
            return requestedTab === 'presensi' ? 'presensi' : 'sekolah';
        }
        if (requestedTab === 'kelas') return 'kelas';
        if (requestedTab === 'tahun-ajaran') return 'tahun-ajaran';
        if (requestedTab === 'branding' && canAccessSchoolProfile) return 'branding';
        if (requestedTab === 'presensi' && canAccessSchoolProfile) return 'presensi';
        if (requestedTab === 'sekolah' && canAccessSchoolProfile) return 'sekolah';
        return canAccessSchoolProfile ? 'sekolah' : 'tahun-ajaran';
    })();

    const [activeTab, setActiveTab] = useState<string>(defaultTab);

    const resolvedActiveTab = (() => {
        if (!hasSchool && canAccessSchoolProfile) {
            return activeTab === 'presensi' ? 'presensi' : 'sekolah';
        }
        if (
            !canAccessSchoolProfile &&
            (activeTab === 'sekolah' || activeTab === 'branding' || activeTab === 'presensi')
        ) {
            return 'tahun-ajaran';
        }
        return activeTab;
    })();

    const t = {
        title: isId ? 'Master Akademik' : 'Master Academic',
        desc: canAccessSchoolProfile
            ? isId
                ? 'Pengaturan Profil Sekolah, Logo, TTD & Stempel, Presensi GPS, Tahun Ajaran, dan Data Kelas.'
                : 'Configure School Profile, Logo, Signature & Stamp, Attendance GPS, Academic Years, and Classes.'
            : isId
                ? 'Pengaturan Tahun Ajaran, Periode Semester, dan Rombongan Belajar (Kelas).'
                : 'Configure Academic Years, Semester Periods, and Classes.',
        tabSchool: isId ? 'Profil Sekolah' : 'School Profile',
        tabBranding: isId ? 'Logo, TTD & Stempel' : 'Logo, Signature & Stamp',
        tabAttendance: isId ? 'Pengaturan Presensi' : 'Attendance Settings',
        tabAy: isId ? 'Tahun Ajaran & Semester' : 'Academic Year & Semester',
        tabClass: isId ? 'Data Kelas' : 'Class Data',
        noSchoolNonAdmin: isId
            ? 'Data sekolah belum diatur. Silakan hubungi Super Admin atau Admin Sekolah untuk melengkapi Profil Sekolah terlebih dahulu.'
            : 'School data has not been configured yet. Please contact a Super Admin or School Admin first.',
    };

    if (!hasSchool && !canAccessSchoolProfile) {
        return (
            <Card className="max-w-2xl border-amber-300/60 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10">
                <CardContent className="flex items-start gap-3 p-6 text-amber-900 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm">{t.noSchoolNonAdmin}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
            </div>

            <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="w-full">
                <div className="w-full overflow-x-auto pb-1">
                    <TabsList className="flex h-auto w-max min-w-full gap-1 bg-muted/50 p-1 sm:min-w-0">
                        {canAccessSchoolProfile && (
                            <TabsTrigger value="sekolah" className={TAB_TRIGGER_CLASS}>
                                {t.tabSchool}
                            </TabsTrigger>
                        )}
                        {canAccessSchoolProfile && (
                            <TabsTrigger
                                value="branding"
                                disabled={!hasSchool}
                                className={TAB_TRIGGER_CLASS}
                            >
                                {t.tabBranding}
                            </TabsTrigger>
                        )}
                        {canAccessSchoolProfile && (
                            <TabsTrigger value="presensi" className={TAB_TRIGGER_CLASS}>
                                {t.tabAttendance}
                            </TabsTrigger>
                        )}
                        <TabsTrigger
                            value="tahun-ajaran"
                            disabled={!hasSchool}
                            className={TAB_TRIGGER_CLASS}
                        >
                            {t.tabAy}
                        </TabsTrigger>
                        <TabsTrigger
                            value="kelas"
                            disabled={!hasSchool}
                            className={TAB_TRIGGER_CLASS}
                        >
                            {t.tabClass}
                        </TabsTrigger>
                    </TabsList>
                </div>

                {canAccessSchoolProfile && (
                    <>
                        <TabsContent value="sekolah" className="mt-6">
                            <SchoolProfileSection />
                        </TabsContent>

                        <TabsContent value="branding" className="mt-6">
                            <SchoolBrandingTab />
                        </TabsContent>

                        <TabsContent value="presensi" className="mt-6">
                            <AttendanceSettingsTab />
                        </TabsContent>
                    </>
                )}

                {hasSchool && (
                    <>
                        <TabsContent value="tahun-ajaran" className="mt-6">
                            <AcademicYearPage />
                        </TabsContent>

                        <TabsContent value="kelas" className="mt-6">
                            <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
                                <ClassListPage />
                            </div>
                        </TabsContent>
                    </>
                )}
            </Tabs>
        </motion.div>
    );
}