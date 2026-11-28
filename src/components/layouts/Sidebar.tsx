// src/components/layouts/Sidebar.tsx
import { useState, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Calendar,
  Wallet,
  Package,
  FileText,
  Award,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  ChevronDown,
  BookOpen,
  Library,
  CreditCard,
  Receipt,
  Building2,
  ShieldCheck,
  ClipboardCheck,
  ClipboardList,
  UserCheck,
  CalendarClock,
  ScanLine,
  Sparkles,
  Barcode,
  FileSpreadsheet,
  LogOut,
  Loader2,
  X,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { Module } from '@/types/permission.types';
import { getEffectiveRoles } from '@/modules/admin/types/user-management.types';
import { Button } from '@/components/ui/button';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  module?: Module;
  allowedRoles?: readonly string[];
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

const CORE_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'OPERATOR'] as const;
const DAILY_QUOTES_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
const ACADEMIC_STAFF_ROLES = [...CORE_ADMIN_ROLES, 'WALI_KELAS', 'GURU', 'STAFF_TU'] as const;
const GRADES_STAFF_ROLES = [...CORE_ADMIN_ROLES, 'WALI_KELAS', 'GURU'] as const;
const STUDENT_ATTENDANCE_ROLES = [...CORE_ADMIN_ROLES, 'WALI_KELAS', 'GURU'] as const;
const FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'BENDAHARA'] as const;
const INVENTORY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'STAFF_SARPRAS'] as const;
const LIBRARY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'STAFF_PERPUS'] as const;
const TU_ROLES = [...CORE_ADMIN_ROLES, 'STAFF_TU'] as const;
const PORTAL_ROLES = ['SISWA', 'ORANG_TUA'] as const;

const ATTENDANCE_STAFF_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'WALI_KELAS',
  'GURU',
  'STAFF_TU',
  'STAFF_SARPRAS',
  'STAFF_PERPUS',
  'BENDAHARA',
] as const;

function resolveMostSpecificActiveHref(pathname: string, groups: NavGroup[]): string | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  let bestMatchHref: string | null = null;

  for (const group of groups) {
    for (const item of group.items) {
      const normalizedHref = item.href.replace(/\/+$/, '') || '/';
      const isExactOrChild =
        normalizedPath === normalizedHref ||
        normalizedPath.startsWith(`${normalizedHref}/`);

      if (isExactOrChild) {
        if (!bestMatchHref || normalizedHref.length > bestMatchHref.length) {
          bestMatchHref = normalizedHref;
        }
      }
    }
  }

  return bestMatchHref;
}

export function Sidebar() {
  const { t, locale } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed, sidebarOpen, setSidebarOpen } = useUIStore();
  const { hasAnyPermission } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);
  const logout = useAuthStore((state) => state.logout);
  const storeEffectiveRoles = useAuthStore((state) => state.getEffectiveRoles);

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    'main',
    'portal',
    'academic',
    'attendance',
    'management',
    'system',
  ]);

  const toggleGroup = (groupId: string): void => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]
    );
  };

  const handleLinkClick = (): void => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleConfirmLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsLogoutModalOpen(false);
      setSidebarOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navGroups: NavGroup[] = [
    {
      id: 'main',
      title: '',
      items: [
        {
          label: t('sidebar.dashboard'),
          icon: <LayoutDashboard size={17} />,
          href: '/dashboard',
        },
      ],
    },
    {
      id: 'portal',
      title: locale === 'id' ? 'Akademik & Keuangan' : 'Academic & Finance',
      items: [
        {
          label: locale === 'id' ? 'Jadwal Pelajaran' : 'Class Schedule',
          icon: <Calendar size={17} />,
          href: '/portal/schedules',
          allowedRoles: PORTAL_ROLES,
        },
        {
          label: locale === 'id' ? 'Riwayat Presensi' : 'Attendance History',
          icon: <ClipboardCheck size={17} />,
          href: '/portal/attendance',
          allowedRoles: PORTAL_ROLES,
        },
        {
          label: locale === 'id' ? 'Nilai & E-Raport' : 'Grades & E-Report',
          icon: <FileSpreadsheet size={17} />,
          href: '/portal/grades',
          allowedRoles: PORTAL_ROLES,
        },
        {
          label: locale === 'id' ? 'Tagihan & Pembayaran' : 'Bills & Payments',
          icon: <Wallet size={17} />,
          href: '/portal/finance',
          allowedRoles: PORTAL_ROLES,
        },
      ],
    },
    {
      id: 'academic',
      title: t('sidebar.academic'),
      items: [
        {
          label: locale === 'id' ? 'Master Akademik' : 'Master Academic',
          icon: <Building2 size={17} />,
          href: '/academic/master-data',
          allowedRoles: CORE_ADMIN_ROLES,
        },
        {
          label: locale === 'id' ? 'Mata Pelajaran' : 'Subjects',
          icon: <BookOpen size={17} />,
          href: '/academic/subjects',
          allowedRoles: GRADES_STAFF_ROLES,
        },
        {
          label: t('sidebar.students'),
          icon: <Users size={17} />,
          href: '/students',
          allowedRoles: ACADEMIC_STAFF_ROLES,
        },
        {
          label: locale === 'id' ? 'Kartu Pelajar' : 'Student Cards',
          icon: <Barcode size={17} />,
          href: '/students/print-cards',
          allowedRoles: TU_ROLES,
        },
        {
          label: t('sidebar.teachers'),
          icon: <GraduationCap size={17} />,
          href: '/teachers',
          allowedRoles: ACADEMIC_STAFF_ROLES,
        },
        {
          label: t('sidebar.schedules'),
          icon: <Calendar size={17} />,
          href: '/schedules',
          allowedRoles: ACADEMIC_STAFF_ROLES,
        },
        {
          label: locale === 'id' ? 'Nilai & Raport' : 'Grades & Reports',
          icon: <FileSpreadsheet size={17} />,
          href: '/grades',
          allowedRoles: GRADES_STAFF_ROLES,
        },
      ],
    },
    {
      id: 'attendance',
      title: locale === 'id' ? 'Presensi' : 'Attendance',
      items: [
        {
          label: locale === 'id' ? 'Rekap Presensi' : 'Attendance Report',
          icon: <ClipboardCheck size={17} />,
          href: '/attendance',
          allowedRoles: STUDENT_ATTENDANCE_ROLES,
        },
        {
          label: locale === 'id' ? 'Absensi Kelas' : 'Class Attendance',
          icon: <ClipboardList size={17} />,
          href: '/attendance/class',
          allowedRoles: STUDENT_ATTENDANCE_ROLES,
        },
        {
          label: locale === 'id' ? 'Presensi GPS' : 'GPS Check-In',
          icon: <UserCheck size={17} />,
          href: '/attendance/teacher',
          allowedRoles: ATTENDANCE_STAFF_ROLES,
        },
        {
          label: locale === 'id' ? 'Pengajuan Cuti' : 'Leave Requests',
          icon: <CalendarClock size={17} />,
          href: '/attendance/leave',
          allowedRoles: ATTENDANCE_STAFF_ROLES,
        },
        {
          label: locale === 'id' ? 'Kata Hari Ini' : 'Daily Quotes',
          icon: <Sparkles size={17} />,
          href: '/attendance/quotes',
          allowedRoles: DAILY_QUOTES_ROLES,
        },
        {
          label: locale === 'id' ? 'Kiosk Siswa' : 'Student Kiosk',
          icon: <ScanLine size={17} />,
          href: '/kiosk',
          allowedRoles: CORE_ADMIN_ROLES,
        },
      ],
    },
    {
      id: 'management',
      title: t('sidebar.management'),
      items: [
        {
          label: t('sidebar.finance'),
          icon: <Wallet size={17} />,
          href: '/finance',
          allowedRoles: FINANCE_ROLES,
        },
        {
          label: t('sidebar.feeMaster'),
          icon: <FileText size={17} />,
          href: '/finance/fee-templates',
          allowedRoles: FINANCE_ROLES,
        },
        {
          label: t('sidebar.studentBills'),
          icon: <CreditCard size={17} />,
          href: '/finance/bills',
          allowedRoles: FINANCE_ROLES,
        },
        {
          label: t('sidebar.payments'),
          icon: <Receipt size={17} />,
          href: '/finance/payments',
          allowedRoles: FINANCE_ROLES,
        },
        {
          label: t('sidebar.inventory'),
          icon: <Package size={17} />,
          href: '/inventory',
          allowedRoles: INVENTORY_ROLES,
        },
        {
          label: locale === 'id' ? 'Perpustakaan' : 'Library',
          icon: <Library size={17} />,
          href: '/library',
          allowedRoles: LIBRARY_ROLES,
        },
        {
          label: t('sidebar.administration'),
          icon: <BookOpen size={17} />,
          href: '/admin',
          allowedRoles: TU_ROLES,
        },
        {
          label: t('sidebar.scholarships'),
          icon: <Award size={17} />,
          href: '/scholarships',
          allowedRoles: TU_ROLES,
        },
      ],
    },
    {
      id: 'system',
      title: locale === 'id' ? 'Sistem' : 'System',
      items: [
        {
          label: t('sidebar.reports'),
          icon: <BarChart3 size={17} />,
          href: '/reports',
          allowedRoles: [...CORE_ADMIN_ROLES, 'BENDAHARA'],
        },
        {
          label: locale === 'id' ? 'Manajemen Akun' : 'User Accounts',
          icon: <ShieldCheck size={17} />,
          href: '/admin/users',
          allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'STAFF_TU'],
        },
        {
          label: t('sidebar.settings'),
          icon: <Settings size={17} />,
          href: '/settings',
          allowedRoles: CORE_ADMIN_ROLES,
        },
      ],
    },
  ];

  const effectiveUserRoles = useMemo(() => {
    const combined = new Set<string>([
      ...getEffectiveRoles(user),
      ...storeEffectiveRoles(),
    ]);
    return Array.from(combined);
  }, [user, storeEffectiveRoles]);

  const filteredGroups: NavGroup[] = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const hasModule = !item.module || hasAnyPermission(item.module);
            const hasRole =
              !item.allowedRoles ||
              effectiveUserRoles.some((userRole) => item.allowedRoles!.includes(userRole));
            return hasModule && hasRole;
          }),
        }))
        .filter((group) => group.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveUserRoles, hasAnyPermission, locale]
  );

  const activeHref = useMemo(
    () => resolveMostSpecificActiveHref(location.pathname, filteredGroups),
    [location.pathname, filteredGroups]
  );

  return (
    <>
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
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
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-border',
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between gap-2.5 px-4'
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {school?.logoUrl ? (
              <img
                src={school.logoUrl}
                alt={school.name}
                className="h-8 w-8 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-emerald-600 to-teal-700 text-white shadow-xs">
                <School size={17} />
              </div>
            )}

            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-bold leading-tight text-foreground"
                  title={school?.name}
                >
                  {school?.name || 'Portal Akademik'}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {school?.npsn ? `NPSN ${school.npsn}` : 'Administrator'}
                </p>
              </div>
            )}
          </div>

          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label={locale === 'id' ? 'Tutup menu' : 'Close menu'}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <nav
          aria-label="Navigasi Utama"
          className={cn('flex-1 overflow-y-auto py-3', sidebarCollapsed ? 'px-2' : 'px-3')}
        >
          {filteredGroups.map((group) => {
            const isExpanded = !group.title || sidebarCollapsed || expandedGroups.includes(group.id);

            return (
              <div key={group.id} className="mb-3">
                {group.title && !sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="mb-1 flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
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
                      const normalizedItemHref = item.href.replace(/\/+$/, '') || '/';
                      const isActive = activeHref === normalizedItemHref;

                      return (
                        <NavLink
                          key={item.href}
                          to={item.href}
                          end
                          onClick={handleLinkClick}
                          title={sidebarCollapsed ? item.label : undefined}
                          className={cn(
                            'flex items-center rounded-lg text-[13px] transition-all',
                            sidebarCollapsed
                              ? 'mx-auto h-9 w-9 justify-center'
                              : 'gap-2.5 px-2.5 py-1.5',
                            isActive
                              ? 'bg-emerald-600 font-medium text-white shadow-xs shadow-emerald-600/20'
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

        <div className="shrink-0 space-y-1 border-t border-border p-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            className={cn(
              'hidden w-full items-center rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex',
              sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-2.5'
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} />
                <span>{t('sidebar.collapse')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            title={sidebarCollapsed ? t('common.logout') : undefined}
            className={cn(
              'flex w-full items-center rounded-lg py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30',
              sidebarCollapsed ? 'justify-center' : 'gap-2.5 px-2.5'
            )}
          >
            <LogOut size={16} className="shrink-0" />
            {!sidebarCollapsed && <span>{t('common.logout')}</span>}
          </button>
        </div>
      </aside>

      {isLogoutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sidebar-logout-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => {
            if (!isLoggingOut) setIsLogoutModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <LogOut size={18} />
              </div>
              <div>
                <h3 id="sidebar-logout-title" className="text-base font-bold text-foreground">
                  {locale === 'id' ? 'Konfirmasi Keluar Sesi' : 'Confirm Sign Out'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {locale === 'id'
                    ? 'Sesi kerja Anda akan diakhiri. Pastikan seluruh perubahan data telah disimpan.'
                    : 'Your current session will end. Make sure all data changes have been saved.'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoggingOut}
                onClick={() => setIsLogoutModalOpen(false)}
              >
                {locale === 'id' ? 'Batal' : 'Cancel'}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isLoggingOut}
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => void handleConfirmLogout()}
              >
                {isLoggingOut && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {locale === 'id' ? 'Ya, Keluar' : 'Yes, Sign Out'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}