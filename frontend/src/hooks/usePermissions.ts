import { useAuth } from '../context/AuthContext';

export type UserRole = 'viewer' | 'staff' | 'manager' | 'admin';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  staff: 2,
  manager: 3,
  admin: 4
};

export function usePermissions() {
  const { user } = useAuth();
  const userRole = (user?.role || 'viewer') as UserRole;

  const hasMinimumRole = (minRole: UserRole): boolean => {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
  };

  const isAdmin = (): boolean => {
    return userRole === 'admin';
  };

  const isManager = (): boolean => {
    return userRole === 'manager' || userRole === 'admin';
  };

  const isStaff = (): boolean => {
    return userRole === 'staff' || userRole === 'manager' || userRole === 'admin';
  };

  const isViewer = (): boolean => {
    return userRole === 'viewer';
  };

  const canCreate = (): boolean => {
    return hasMinimumRole('staff'); // Staff+ can create
  };

  const canEdit = (): boolean => {
    return hasMinimumRole('staff'); // Staff+ can edit
  };

  const canDelete = (): boolean => {
    return hasMinimumRole('manager'); // Manager+ can delete
  };

  const canManageUsers = (): boolean => {
    return isAdmin(); // Only admin can manage users
  };

  const canAccessSettings = (): boolean => {
    return true; // All users can access their own settings
  };

  const canManageSystemSettings = (): boolean => {
    return isAdmin(); // Only admin can manage system settings
  };

  return {
    userRole,
    hasMinimumRole,
    isAdmin,
    isManager,
    isStaff,
    isViewer,
    canCreate,
    canEdit,
    canDelete,
    canManageUsers,
    canAccessSettings,
    canManageSystemSettings
  };
}
