import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { School, Building2, MapPin, Loader2, ArrowRight, Plus } from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';

export function TenantSelector() {
    const navigate = useNavigate();
    const { locale } = useTranslation();
    const { setSchool, setAcademicYear } = useAuthStore();
    const [isSwitching, setIsSwitching] = useState(false);

    // Kamus Bahasa Sederhana
    const t = {
        title: locale === 'id' ? 'Pilih Institusi / Tenant' : 'Select Institution / Tenant',
        subtitle: locale === 'id' ? 'Anda masuk sebagai SUPER ADMIN. Pilih sekolah yang ingin Anda kelola.' : 'Logged in as SUPER ADMIN. Select a school to manage.',
        newSchool: locale === 'id' ? 'Buat Sekolah Baru' : 'Create New School',
        emptyTitle: locale === 'id' ? 'Belum Ada Institusi' : 'No Institution Yet',
        emptySub: locale === 'id' ? 'Sistem belum memiliki data sekolah. Silakan buat institusi pertama Anda.' : 'System has no school data. Please create your first institution.',
        enterSys: locale === 'id' ? 'Masuk ke Sistem' : 'Enter System',
        loading: locale === 'id' ? 'Menyiapkan workspace sekolah...' : 'Preparing school workspace...',
    };

    const { data: schools, isLoading } = useQuery({
        queryKey: ['super-admin-schools'],
        queryFn: async () => {
            const { data, error } = await supabase.from('schools').select('*').order('name');
            if (error) throw error;
            return data;
        }
    });

    const handleSelectSchool = async (selectedSchool: any) => {
        setIsSwitching(true);
        try {
            const { data: activeYear } = await supabase
                .from('academic_years')
                .select('*')
                .eq('schoolId', selectedSchool.id)
                .eq('isActive', true)
                .maybeSingle();

            setSchool(selectedSchool);
            if (activeYear) {
                setAcademicYear(activeYear);
            } else {
                useAuthStore.setState({ academicYear: null });
            }
            navigate('/dashboard');
        } catch (error) {
            console.error('Gagal memilih sekolah:', error);
        } finally {
            setIsSwitching(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted/20 dark:bg-background p-6 md:p-12">
            <div className="max-w-5xl mx-auto space-y-8">

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    // PERBAIKAN: Menggunakan bg-card text-card-foreground
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card text-card-foreground p-6 rounded-2xl shadow-sm border border-border"
                >
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Building2 className="w-6 h-6 text-emerald-600" />
                            {t.title}
                        </h1>
                        <p className="text-muted-foreground mt-1">{t.subtitle}</p>
                    </div>
                    <Button
                        onClick={() => navigate('/academic/master-data', { state: { tab: 'profil' } })}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    >
                        <Plus className="w-4 h-4 mr-2" /> {t.newSchool}
                    </Button>
                </motion.div>

                {schools && schools.length > 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                        {schools.map((school, index) => (
                            <motion.div
                                key={school.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => !isSwitching && handleSelectSchool(school)}
                                // PERBAIKAN: Menggunakan bg-card text-card-foreground
                                className="group relative bg-card text-card-foreground p-6 rounded-2xl shadow-sm hover:shadow-md border border-border hover:border-emerald-500/50 cursor-pointer transition-all overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <School className="w-24 h-24 text-emerald-600" />
                                </div>
                                <div className="relative z-10">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center mb-4">
                                        <School className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-bold mb-1 line-clamp-1">{school.name}</h3>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                                        <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">NPSN: {school.npsn}</span>
                                        <span>•</span>
                                        <span className="text-xs font-medium">{school.level}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span className="line-clamp-1">{school.city}, {school.province}</span>
                                    </div>
                                    <div className="mt-6 flex items-center text-sm font-medium text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                                        {t.enterSys} <ArrowRight className="w-4 h-4 ml-1" />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        // PERBAIKAN: Menggunakan bg-card text-card-foreground
                        className="flex flex-col items-center justify-center py-20 text-center bg-card text-card-foreground rounded-2xl border border-dashed border-border"
                    >
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Building2 className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">{t.emptyTitle}</h3>
                        <p className="text-muted-foreground max-w-md mb-6">{t.emptySub}</p>
                        <Button onClick={() => navigate('/academic/master-data', { state: { tab: 'profil' } })}>
                            <Plus className="w-4 h-4 mr-2" /> {t.newSchool}
                        </Button>
                    </motion.div>
                )}
            </div>

            {isSwitching && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                    <p className="font-medium animate-pulse">{t.loading}</p>
                </div>
            )}
        </div>
    );
}