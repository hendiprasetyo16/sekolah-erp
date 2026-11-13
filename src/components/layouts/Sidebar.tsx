import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, Calendar, Wallet,
  Package, FileText, Award, BarChart3, Settings, PanelLeftClose,
  PanelLeftOpen, School, ChevronDown, BookOpen, CreditCard, Receipt,
  Building2, ShieldCheck, ClipboardCheck, UserCheck
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
  allowedRoles?: string[];
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export function Sidebar() {
  const { t, locale } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed, sidebarOpen, setSidebarOpen } = useUIStore();
  const { hasAnyPermission } = usePermission();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    'main',
    'academic',
    'attendance',
    'management',
    'system',
  ]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]
    );
  };

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const coreAdmin = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'];
  const academicStaff = [...coreAdmin, 'WALI_KELAS', 'GURU', 'STAFF_TU'];
  const financeRoles = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'BENDAHARA'];
  const inventoryRoles = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'STAFF_SARPRAS'];
  const tuRoles = [...coreAdmin, 'STAFF_TU'];

  const navGroups: NavGroup[] = [
    {
      id: 'main',
      title: '',
      items: [
        { label: t('sidebar.dashboard'), icon: <LayoutDashboard size={17} />, href: '/dashboard' },
      ],
    },
    {
      id: 'academic',
      title: t('sidebar.academic'),
      items: [
        { label: t('sidebar.masterData'), icon: <Building2 size={17} />, href: '/academic/master-data', allowedRoles: coreAdmin },
        { label: t('sidebar.students'), icon: <Users size={17} />, href: '/students', allowedRoles: academicStaff },
        { label: t('sidebar.teachers'), icon: <GraduationCap size={17} />, href: '/teachers', allowedRoles: academicStaff },
        { label: t('sidebar.schedules'), icon: <Calendar size={17} />, href: '/schedules', allowedRoles: academicStaff },
      ],
    },
    {
      id: 'attendance',
      title: locale === 'id' ? 'Presensi' : 'Attendance',
      items: [
        { label: locale === 'id' ? 'Rekap Presensi' : 'Attendance Report', icon: <ClipboardCheck size={17} />, href: '/attendance', allowedRoles: [...coreAdmin, 'WALI_KELAS'] },
        { label: locale === 'id' ? 'Presensi GPS' : 'GPS Check-In', icon: <UserCheck size={17} />, href: '/attendance/teacher', allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR', 'WALI_KELAS', 'GURU', 'STAFF_TU', 'STAFF_SARPRAS', 'BENDAHARA'] },
      ],
    },
    {
      id: 'management',
      title: t('sidebar.management'),
      items: [
        { label: t('sidebar.finance'), icon: <Wallet size={17} />, href: '/finance', allowedRoles: financeRoles },
        { label: t('sidebar.feeMaster'), icon: <FileText size={17} />, href: '/finance/fee-templates', allowedRoles: financeRoles },
        { label: t('sidebar.studentBills'), icon: <CreditCard size={17} />, href: '/finance/bills', allowedRoles: financeRoles },
        { label: t('sidebar.payments'), icon: <Receipt size={17} />, href: '/finance/payments', allowedRoles: financeRoles },
        { label: t('sidebar.inventory'), icon: <Package size={17} />, href: '/inventory', allowedRoles: inventoryRoles },
        { label: t('sidebar.administration'), icon: <BookOpen size={17} />, href: '/admin', allowedRoles: tuRoles },
        { label: t('sidebar.scholarships'), icon: <Award size={17} />, href: '/scholarships', allowedRoles: tuRoles },
      ],
    },
    {
      id: 'system',
      title: locale === 'id' ? 'Sistem' : 'System',
      items: [
        { label: t('sidebar.reports'), icon: <BarChart3 size={17} />, href: '/reports', allowedRoles: [...coreAdmin, 'BENDAHARA'] },
        { label: locale === 'id' ? 'Manajemen Akun' : 'User Accounts', icon: <ShieldCheck size={17} />, href: '/admin/users', allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU'] },
        { label: t('sidebar.settings'), icon: <Settings size={17} />, href: '/settings', allowedRoles: coreAdmin },
      ],
    },
  ];

  const filteredGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const hasModule = !item.module || hasAnyPermission(item.module);
        const hasRole = !item.allowedRoles || (user?.role && item.allowedRoles.includes(user.role));
        return hasModule && hasRole;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card',
          'transition-[width,transform] duration-200 ease-out lg:translate-x-0',
          sidebarCollapsed ? 'w-16' : 'w-60',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Identitas Institusi */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-border',
            sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
          )}
        >
          {school?.logoUrl ? (
            <img
              src={school.logoUrl}
              alt={school.name}
              className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <School size={17} />
            </div>
          )}

          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-foreground" title={school?.name}>
                {school?.name || 'Portal Akademik'}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {school?.npsn ? `NPSN ${school.npsn}` : 'Administrator'}
              </p>
            </div>
          )}
        </div>

        {/* Navigasi */}
        <nav className={cn('flex-1 overflow-y-auto py-3', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {filteredGroups.map((group) => {
            const isExpanded = !group.title || sidebarCollapsed || expandedGroups.includes(group.id);

            return (
              <div key={group.id} className="mb-3">
                {group.title && !sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="mb-1 flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    <span>{group.title}</span>
                    <ChevronDown
                      size={13}
                      className={cn('transition-transform duration-150', isExpanded && 'rotate-180')}
                    />
                  </button>
                )}

                {isExpanded && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive =
                        location.pathname === item.href ||
                        (item.href !== '/admin' && location.pathname.startsWith(item.href + '/'));

                      return (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          onClick={handleLinkClick}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={cn(
                            'flex items-center rounded-md text-[13px] transition-colors',
                            sidebarCollapsed ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 px-2.5 py-1.5',
                            isActive
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Toggle Collapse */}
        <div className="hidden border-t border-border p-2 lg:block">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'flex w-full items-center rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              sidebarCollapsed ? 'justify-center' : 'gap-2 px-2.5'
            )}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : (
              <>
                <PanelLeftClose size={16} />
                <span>{t('sidebar.collapse')}</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}