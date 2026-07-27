import { motion } from 'framer-motion';
import {
  Users, GraduationCap, Wallet, Calendar,
  Package, FileText, Award, BarChart3, Settings,
  Construction
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

function PlaceholderPage({
  icon: Icon,
  titleKey,
  color,
}: {
  icon: any;
  titleKey: string;
  color: string;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center"
    >
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${color}`}>
        <Icon size={36} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">{t(titleKey as any)}</h1>
      <div className="flex items-center gap-2 text-muted-foreground mb-6">
        <Construction size={18} />
        <p className="text-sm">Modul ini sedang dalam pengembangan (Phase 2-4)</p>
      </div>
      <div className="glass-card p-6 max-w-md">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Fitur ini akan tersedia pada fase pengembangan berikutnya. Saat ini Anda dapat
          mengeksplorasi Dashboard dan navigasi sidebar untuk melihat desain dan layout aplikasi.
        </p>
      </div>
    </motion.div>
  );
}

export function StudentsPlaceholder() {
  return <PlaceholderPage icon={Users} titleKey="students.title" color="stat-gradient-indigo" />;
}

export function TeachersPlaceholder() {
  return <PlaceholderPage icon={GraduationCap} titleKey="teachers.title" color="stat-gradient-emerald" />;
}

export function FinancePlaceholder() {
  return <PlaceholderPage icon={Wallet} titleKey="finance.title" color="stat-gradient-violet" />;
}

export function SchedulesPlaceholder() {
  return <PlaceholderPage icon={Calendar} titleKey="schedules.title" color="stat-gradient-cyan" />;
}

export function InventoryPlaceholder() {
  return <PlaceholderPage icon={Package} titleKey="inventory.title" color="stat-gradient-amber" />;
}

export function AdminPlaceholder() {
  return <PlaceholderPage icon={FileText} titleKey="administration.title" color="stat-gradient-rose" />;
}

export function ScholarshipsPlaceholder() {
  return <PlaceholderPage icon={Award} titleKey="sidebar.scholarships" color="stat-gradient-indigo" />;
}

export function ReportsPlaceholder() {
  return <PlaceholderPage icon={BarChart3} titleKey="sidebar.reports" color="stat-gradient-emerald" />;
}

export function SettingsPlaceholder() {
  return <PlaceholderPage icon={Settings} titleKey="sidebar.settings" color="stat-gradient-violet" />;
}
