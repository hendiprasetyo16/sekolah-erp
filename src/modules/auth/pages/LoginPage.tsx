import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, School, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { authService } from '@/modules/auth/services/auth.service';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, setSchool, setAcademicYear, setTokens } = useAuthStore();

  const [email, setEmail] = useState('admin@smknusantara.sch.id');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState('admin');

  const demoAccounts = [
    { key: 'admin', label: 'Super Admin', email: 'admin@smknusantara.sch.id' },
    { key: 'kepsek', label: 'Kepala Sekolah', email: 'kepsek@smknusantara.sch.id' },
    { key: 'bendahara', label: 'Bendahara', email: 'bendahara@smknusantara.sch.id' },
    { key: 'operator', label: 'Operator', email: 'operator@smknusantara.sch.id' },
    { key: 'guru', label: 'Guru', email: 'guru@smknusantara.sch.id' },
    { key: 'walikelas', label: 'Wali Kelas', email: 'walikelas@smknusantara.sch.id' },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authService.login({ email, password });

      if (response.success) {
        setUser(response.data.user);
        setSchool(response.data.school);
        setAcademicYear(response.data.academicYear);
        setTokens(response.data.token, response.data.refreshToken);
        navigate('/dashboard');
      } else {
        setError(response.message || t('auth.loginError'));
      }
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const selectDemoAccount = (key: string) => {
    const account = demoAccounts.find(a => a.key === key);
    if (account) {
      setSelectedRole(key);
      setEmail(account.email);
      setPassword('admin123');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700" />

        {/* Animated background patterns */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-300/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-300/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center gap-3 mb-16"
            >
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <School size={28} />
              </div>
              <div>
                <h2 className="text-xl font-bold">SekolahERP</h2>
                <p className="text-sm text-white/70">v1.0.0</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
                Sistem Manajemen<br />
                Sekolah <span className="text-purple-200">Modern</span>
              </h1>
              <p className="text-lg text-white/70 max-w-md leading-relaxed">
                Platform ERP lengkap untuk mengelola seluruh operasional sekolah Indonesia — dari akademik hingga keuangan.
              </p>
            </motion.div>
          </div>

          {/* Feature highlights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-3 gap-4 mt-12"
          >
            {[
              { icon: '📚', title: 'Akademik', desc: 'Siswa, Guru, Jadwal' },
              { icon: '💰', title: 'Keuangan', desc: 'SPP, Kas, Laporan' },
              { icon: '🏫', title: 'Operasional', desc: 'Sarpras, Surat, Inventaris' },
            ].map((feature, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <span className="text-2xl mb-2 block">{feature.icon}</span>
                <h3 className="font-semibold text-sm">{feature.title}</h3>
                <p className="text-xs text-white/60 mt-1">{feature.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 lg:p-12 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <School size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">SekolahERP</h2>
              <p className="text-xs text-muted-foreground">Sistem Manajemen Sekolah</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">{t('auth.loginTitle')}</h2>
            <p className="text-muted-foreground">{t('auth.loginSubtitle')}</p>
          </div>

          {/* Demo Account Selector */}
          <div className="mb-6">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Demo Account
            </label>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.key}
                  onClick={() => selectDemoAccount(account.key)}
                  className={cn(
                    'p-2 rounded-lg text-xs font-medium transition-all border',
                    selectedRole === account.key
                      ? 'bg-primary/10 border-primary/50 text-primary'
                      : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.email')}</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-4 py-2.5 rounded-lg border bg-muted/30 text-foreground text-sm',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
                    'transition-all'
                  )}
                  placeholder="email@sekolah.sch.id"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.password')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-12 py-2.5 rounded-lg border bg-muted/30 text-foreground text-sm',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
                    'transition-all'
                  )}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-border bg-muted accent-primary" />
                <span className="text-sm text-muted-foreground">{t('auth.rememberMe')}</span>
              </label>
              <button type="button" className="text-sm text-primary hover:text-primary/80 transition-colors">
                {t('auth.forgotPassword')}
              </button>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-sm transition-all',
                'bg-gradient-to-r from-indigo-500 to-purple-600 text-white',
                'hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg hover:shadow-indigo-500/25',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'active:scale-[0.98]'
              )}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t('auth.loginButton')}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border/50 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles size={14} className="text-primary" />
              <span>SekolahERP v1.0.0 — Sistem Manajemen Sekolah Indonesia</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
