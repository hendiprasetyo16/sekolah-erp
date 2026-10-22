import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldAlert, KeyRound, Loader2, LogOut, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Validasi Password Baru
const changePasswordSchema = z.object({
    newPassword: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export function ForceChangePasswordPage() {
    const navigate = useNavigate();
    const { user, setUser, logout } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const form = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: { newPassword: '', confirmPassword: '' }
    });

    const onSubmit = async (data: ChangePasswordFormValues) => {
        setIsLoading(true);
        try {
            // 1. Update password di Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({
                password: data.newPassword
            });

            if (authError) throw new Error(authError.message);

            // 2. Ubah status isFirstLogin di tabel public.users menjadi false
            const { error: dbError } = await supabase
                .from('users')
                .update({ isFirstLogin: false })
                .eq('id', user?.id);

            if (dbError) throw new Error('Gagal memperbarui status akun.');

            // 3. Update state di Zustand agar aplikasi tahu dia sudah ganti password
            if (user) {
                setUser({ ...user, isFirstLogin: false });
            }

            toast.success('Password berhasil diperbarui! Mengalihkan ke Dashboard...');

            // 4. Arahkan ke dashboard
            setTimeout(() => navigate('/dashboard'), 1500);

        } catch (error: any) {
            toast.error(error.message || 'Terjadi kesalahan saat mengganti password.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8"
            >
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500 rounded-full flex items-center justify-center mb-4">
                        <ShieldAlert className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Keamanan Akun</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        Demi keamanan, Anda diwajibkan untuk mengganti kata sandi bawaan (default) dengan kata sandi rahasia Anda sendiri.
                    </p>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField control={form.control} name="newPassword" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Kata Sandi Baru</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Konfirmasi Kata Sandi Baru</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Input type={showConfirm ? "text" : "password"} placeholder="••••••••" {...field} />
                                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <div className="pt-4 space-y-3">
                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isLoading}>
                                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                                Simpan & Lanjutkan
                            </Button>
                            <Button type="button" variant="ghost" className="w-full text-slate-500 hover:text-slate-700" onClick={handleLogout} disabled={isLoading}>
                                <LogOut className="w-4 h-4 mr-2" />
                                Keluar (Batal)
                            </Button>
                        </div>
                    </form>
                </Form>
            </motion.div>
        </div>
    );
}