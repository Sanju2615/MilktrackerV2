import { useAuth } from '@/contexts/AuthContext';
import type { Permission } from '@/types/user';
import { Lock } from 'lucide-react';

interface PermissionGuardProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * PermissionGuard - Conditionally renders children based on user permission
 * 
 * Usage:
 * <PermissionGuard permission="administer_feeding">
 *   <Button>Administer Feeding</Button>
 * </PermissionGuard>
 * 
 * With fallback:
 * <PermissionGuard 
 *   permission="user_create" 
 *   fallback={<p>You don't have permission to create users</p>}
 * >
 *   <CreateUserForm />
 * </PermissionGuard>
 */
export function PermissionGuard({ permission, children, fallback }: PermissionGuardProps) {
  const { checkPermission } = useAuth();
  
  if (checkPermission(permission)) {
    return <>{children}</>;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  return null;
}

interface PermissionGateProps {
  permissions: Permission[];
  requireAll?: boolean; // If true, requires ALL permissions. If false, requires ANY permission
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * PermissionGate - Conditionally renders based on multiple permissions
 * 
 * Usage - Require ALL permissions:
 * <PermissionGate permissions={['administer_feeding', 'administer_verify']} requireAll>
 *   <AdministerButton />
 * </PermissionGate>
 * 
 * Usage - Require ANY permission:
 * <PermissionGate permissions={['user_create', 'user_edit']}>
 *   <UserManagementButton />
 * </PermissionGate>
 */
export function PermissionGate({ 
  permissions, 
  requireAll = false, 
  children, 
  fallback 
}: PermissionGateProps) {
  const { checkPermission } = useAuth();
  
  const hasPermissions = requireAll
    ? permissions.every(p => checkPermission(p))
    : permissions.some(p => checkPermission(p));
  
  if (hasPermissions) {
    return <>{children}</>;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  return null;
}

interface RoleGuardProps {
  roles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * RoleGuard - Conditionally renders based on user role
 * 
 * Usage:
 * <RoleGuard roles={['admin', 'nurse_manager']}>
 *   <AdminPanel />
 * </RoleGuard>
 */
export function RoleGuard({ roles, children, fallback }: RoleGuardProps) {
  const { user } = useAuth();
  
  if (user && roles.includes(user.role)) {
    return <>{children}</>;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  return null;
}

interface RestrictedActionProps {
  permission: Permission;
  children: React.ReactNode;
  disabledMessage?: string;
}

/**
 * RestrictedAction - Shows children with a disabled overlay when no permission
 * 
 * Usage:
 * <RestrictedAction permission="inventory_discard" disabledMessage="Only nurses can discard milk">
 *   <Button>Discard Milk</Button>
 * </RestrictedAction>
 */
export function RestrictedAction({ 
  permission, 
  children, 
  disabledMessage = 'Action restricted' 
}: RestrictedActionProps) {
  const { checkPermission } = useAuth();
  const hasPermission = checkPermission(permission);
  
  if (hasPermission) {
    return <>{children}</>;
  }
  
  return (
    <div className="relative group">
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100/80 rounded">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Lock className="w-4 h-4" />
          <span>{disabledMessage}</span>
        </div>
      </div>
    </div>
  );
}

interface ReadOnlyGuardProps {
  children: React.ReactNode;
}

/**
 * ReadOnlyGuard - Wraps content to indicate read-only mode for viewers
 */
export function ReadOnlyGuard({ children }: ReadOnlyGuardProps) {
  const { user } = useAuth();
  const isReadOnly = user?.role === 'viewer';
  
  return (
    <div className="relative">
      {isReadOnly && (
        <div className="absolute top-0 right-0 z-10">
          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded border">
            Read Only
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
