// src/hooks/usePermission.ts
import { useCallback, useMemo } from 'react';
import { useAuthStore } from '../modules/auth/store/auth.store';
import { ROLE_PERMISSIONS } from '../types/permission.types';
import type { Module, Action } from '../types/permission.types';
import type { UserRole } from '../types/common.types';
import { getEffectiveRoles } from '../modules/admin/types/user-management.types';

export function usePermission() {
  const user = useAuthStore((state) => state.user);

  const effectiveRoles = useMemo(
    () => getEffectiveRoles(user) as UserRole[],
    [user]
  );

  const hasPermission = useCallback(
    (module: Module, action: Action): boolean => {
      if (!user || effectiveRoles.length === 0) return false;

      return effectiveRoles.some((role) => {
        const permissions = ROLE_PERMISSIONS[role];
        if (!permissions) return false;

        const modulePermission = permissions.find((p) => p.module === module);
        return modulePermission?.actions.includes(action) ?? false;
      });
    },
    [user, effectiveRoles]
  );

  const hasAnyPermission = useCallback(
    (module: Module): boolean => {
      if (!user || effectiveRoles.length === 0) return false;

      return effectiveRoles.some((role) => {
        const permissions = ROLE_PERMISSIONS[role];
        return permissions?.some((p) => p.module === module) ?? false;
      });
    },
    [user, effectiveRoles]
  );

  const hasRole = useCallback(
    (...roles: string[]): boolean => {
      if (!user || effectiveRoles.length === 0) return false;
      return effectiveRoles.some((role) => roles.includes(role));
    },
    [user, effectiveRoles]
  );

  return {
    hasPermission,
    hasAnyPermission,
    hasRole,
    effectiveRoles,
    user,
  };
}