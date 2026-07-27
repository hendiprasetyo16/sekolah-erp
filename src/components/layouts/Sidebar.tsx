import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, GraduationCap, Calendar, Wallet,
  Package, FileText, Award, BarChart3, Settings, ChevronLeft,
  ChevronRight, School, ChevronDown, BookOpen
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/stores/ui.store';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermission } from '@/hooks/usePermission';
import type { Module } from '@/types/permission.types';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
  module?: Module;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { hasAnyPermission } = usePermission();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['main', 'academic', 'management']);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const navGroups: NavGroup[] = [
    {
      title: 'main',
      items: [
        { label: t('sidebar.dashboard'), icon: <LayoutDashboard size={20} />, href: '/dashboard' },
      ],
    },
    {
      title: t('sidebar.academic'),
      items: [
        { label: t('sidebar.students'), icon: <Users size={20} />, href: '/students', module: 'students', badge: undefined },
        { label: t('sidebar.teachers'), icon: <GraduationCap size={20} />, href: '/teachers', module: 'teachers' },
        { label: t('sidebar.schedules'), icon: <Calendar size={20} />, href: '/schedules', module: 'schedules' },
      ],
    },
    {
      title: t('sidebar.management'),
      items: [
        { label: t('sidebar.finance'), icon: <Wallet size={20} />, href: '/finance', module: 'finance', badge: 15 },
        { label: t('sidebar.inventory'), icon: <Package size={20} />, href: '/inventory', module: 'inventory' },
        { label: t('sidebar.administration'), icon: <FileText size={20} />, href: '/admin', module: 'administration', badge: 5 },
        { label: t('sidebar.scholarships'), icon: <Award size={20} />, href: '/scholarships', module: 'scholarships' },
      ],
    },
    {
      title: '',
      items: [
        { label: t('sidebar.reports'), icon: <BarChart3 size={20} />, href: '/reports', module: 'reports' },
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
        'bg-sidebar/80 backdrop-blur-xl',
      )}
    >
      {/* School Logo/Name */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border/50">
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
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-bold text-sm text-foreground">SekolahERP</h1>
              <p className="text-xs text-muted-foreground">SMK Nusantara</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 hide-scrollbar">
        {filteredGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-4">
            {group.title && group.title !== 'main' && !sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex items-center justify-between w-full px-2 mb-1"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.title}
                </span>
                <ChevronDown
                  size={14}
                  className={cn(
                    'text-muted-foreground transition-transform',
                    expandedGroups.includes(group.title) && 'rotate-180'
                  )}
                />
              </button>
            )}

            <AnimatePresence initial={false}>
              {(group.title === 'main' || !group.title || sidebarCollapsed || expandedGroups.includes(group.title)) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1 overflow-hidden"
                >
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                    return (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        className={cn(
                          'sidebar-link group relative',
                          isActive && 'active',
                          sidebarCollapsed && 'justify-center px-0'
                        )}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        <span className={cn(
                          'flex-shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                        )}>
                          {item.icon}
                        </span>
                        <AnimatePresence>
                          {!sidebarCollapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              className="flex-1 truncate"
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
                          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
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

      {/* Collapse toggle */}
      <div className="border-t border-border/50 p-3">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : (
            <>
              <ChevronLeft size={18} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
