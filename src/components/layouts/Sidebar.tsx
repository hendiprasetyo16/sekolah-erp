import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, GraduationCap, Calendar, Wallet,
  Package, FileText, Award, BarChart3, Settings, ChevronLeft,
  ChevronRight, School, ChevronDown, BookOpen, CreditCard, Receipt,
  Building2, CalendarDays, ShieldCheck // <-- 1. TAMBAHKAN ShieldCheck DI SINI
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { Module } from '@/types/permission.types';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  module?: Module;
  badge?: number;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export function Sidebar() {
  // 2. TAMBAHKAN `locale` UNTUK TRANSLASI MANUAL JIKA DIBUTUHKAN
  const { t, locale } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { hasAnyPermission } = usePermission();
  const location = useLocation();

  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);

  const schoolName = school?.name;

  const [expandedGroups, setExpandedGroups] = useState<string[]>(['main', 'academic', 'management']);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  };

  const navGroups: NavGroup[] = [
    {
      id: 'main',
      title: 'main',
      items: [
        { label: t('sidebar.dashboard'), icon: <LayoutDashboard size={20} />, href: '/dashboard' },
      ],
    },
    {
      id: 'academic',
      title: t('sidebar.academic'),
      items: [
        { label: t('sidebar.masterData'), icon: <Building2 size={20} />, href: '/academic/master-data', module: 'academic' },
        { label: t('sidebar.students'), icon: <Users size={20} />, href: '/students', module: 'students' },
        { label: t('sidebar.teachers'), icon: <GraduationCap size={20} />, href: '/teachers', module: 'teachers' },
        { label: t('sidebar.schedules'), icon: <Calendar size={20} />, href: '/schedules', module: 'schedules' },
      ],
    },
    {
      id: 'management',
      title: t('sidebar.management'),
      items: [
        { label: t('sidebar.finance'), icon: <Wallet size={20} />, href: '/finance', module: 'finance' },
        { label: t('sidebar.feeMaster'), icon: <FileText size={20} />, href: '/finance/fee-templates', module: 'finance' },
        { label: t('sidebar.studentBills'), icon: <CreditCard size={20} />, href: '/finance/bills', module: 'finance', badge: 15 },
        { label: t('sidebar.payments'), icon: <Receipt size={20} />, href: '/finance/payments', module: 'finance' },
        { label: t('sidebar.inventory'), icon: <Package size={20} />, href: '/inventory', module: 'inventory' },
        { label: t('sidebar.administration'), icon: <BookOpen size={20} />, href: '/admin', module: 'administration', badge: 5 },
        { label: t('sidebar.scholarships'), icon: <Award size={20} />, href: '/scholarships', module: 'scholarships' },
      ],
    },
    {
      id: 'reports',
      title: '', // Tanpa judul grup
      items: [
        { label: t('sidebar.reports'), icon: <BarChart3 size={20} />, href: '/reports', module: 'reports' },

        // PERUBAHAN: Mengubah href menjadi '/admin/users' agar sesuai dengan router baru
        {
          label: locale === 'id' ? 'Akses Pengguna' : 'User Access',
          icon: <ShieldCheck size={20} />,
          href: '/admin/users',
          module: 'administration' // Opsional: Diubah ke 'administration' agar izin aksesnya lebih masuk akal
        },

        // Menu Settings berdiri sendiri dengan href '/settings'
        { label: t('sidebar.settings'), icon: <Settings size={20} />, href: '/settings', module: 'settings' },
      ],
    },
  ];

  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.module || hasAnyPermission(item.module)),
  })).filter(group => group.items.length > 0);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-border/50',
        'bg-sidebar/95 backdrop-blur-xl',
      )}
    >
      <div className={cn("flex items-center h-16 border-b border-border/50 transition-all", sidebarCollapsed ? "justify-center px-0" : "px-4 gap-3")}>
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <School size={20} className="text-white" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-hidden"
            >
              <h1 className="font-bold text-sm text-foreground">SekolahERP</h1>
              <p className="text-xs text-muted-foreground truncate w-full" title={schoolName || 'Belum ada data'}>
                {schoolName || '-'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-4 hide-scrollbar", sidebarCollapsed ? "px-2" : "px-4")}>
        {filteredGroups.map((group) => (
          <div key={group.id} className={cn("mb-4", sidebarCollapsed && "mb-2")}>
            {group.title && group.title !== 'main' && !sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex items-center justify-between w-full px-2 mb-1"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.title}
                </span>
                <ChevronDown
                  size={14}
                  className={cn(
                    'text-muted-foreground transition-transform',
                    expandedGroups.includes(group.id) && 'rotate-180'
                  )}
                />
              </button>
            )}

            <AnimatePresence initial={false}>
              {(group.title === 'main' || !group.title || sidebarCollapsed || expandedGroups.includes(group.id)) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn("space-y-1 overflow-hidden", sidebarCollapsed && "flex flex-col items-center")}
                >
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');

                    return (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center rounded-lg transition-all duration-200 group relative',
                          sidebarCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2.5 gap-3 w-full',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        <span className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                        )}>
                          {item.icon}
                        </span>

                        <AnimatePresence>
                          {!sidebarCollapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              className="flex-1 truncate text-sm"
                            >
                              {item.label}
                            </motion.span>
                          )}
                        </AnimatePresence>

                        {!sidebarCollapsed && item.badge && (
                          <span className="flex-shrink-0 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                            {item.badge}
                          </span>
                        )}
                        {sidebarCollapsed && item.badge && (
                          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-background" />
                        )}
                      </NavLink>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      <div className="border-t border-border/50 p-3">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            "flex items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-sm py-2",
            sidebarCollapsed ? "justify-center w-full" : "w-full justify-center gap-2"
          )}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : (
            <>
              <ChevronLeft size={18} />
              <span className="font-medium">{t('sidebar.collapse')}</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}