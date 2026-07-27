import { useCallback } from 'react';
import { useAuthStore } from '../modules/auth/store/auth.store';
import { ROLE_PERMISSIONS } from '../types/permission.types';
import type { Module, Action } from '../types/permission.types';

export function usePermission() {
  const user = useAuthStore((state) => state.user);

  const hasPermission = useCallback(
    (module: Module, action: Action): boolean => {
      if (!user) return false;
      
      const permissions = ROLE_PERMISSIONS[user.role];
      if (!permissions) return false;

      const modulePermission = permissions.find((p) => p.module === module);
      if (!modulePermission) return false;

      return modulePermission.actions.includes(action);
    },
    [user]
  );

  const hasAnyPermission = useCallback(
    (module: Module): boolean => {
      if (!user) return false;
      const permissions = ROLE_PERMISSIONS[user.role];
      return permissions?.some((p) => p.module === module) ?? false;
    },
    [user]
  );

  const hasRole = useCallback(
    (...roles: string[]): boolean => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return { hasPermission, hasAnyPermission, hasRole, user };
}
