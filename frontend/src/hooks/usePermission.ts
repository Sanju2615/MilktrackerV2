import { useAuth } from '@/contexts/AuthContext';
import type { Permission, UserRole } from '@/types/user';

interface UsePermissionReturn {
  // Single permission check
  can: (permission: Permission) => boolean;
  
  // Multiple permissions - ALL required
  canAll: (...permissions: Permission[]) => boolean;
  
  // Multiple permissions - ANY required
  canAny: (...permissions: Permission[]) => boolean;
  
  // Role check
  isRole: (role: UserRole) => boolean;
  isAnyRole: (...roles: UserRole[]) => boolean;
  
  // Common permission shortcuts
  canViewPatients: boolean;
  canCreatePatients: boolean;
  canEditPatients: boolean;
  canDeletePatients: boolean;
  
  canViewOrders: boolean;
  canCreateOrders: boolean;
  canEditOrders: boolean;
  canCancelOrders: boolean;
  canVerifyOrders: boolean;
  
  canAdministerFeeding: boolean;
  canVerifyAdministration: boolean;
  canOverrideAdministration: boolean;
  
  canViewInventory: boolean;
  canManageInventory: boolean;
  canDiscardInventory: boolean;
  
  canViewUsers: boolean;
  canManageUsers: boolean;
  canAssignStations: boolean;
  
  canViewAudit: boolean;
  canExportAudit: boolean;
  
  canManageSystem: boolean;
  
  // Role-based shortcuts
  isAdmin: boolean;
  isNurseManager: boolean;
  isNurse: boolean;
  isPhysician: boolean;
  isTechnician: boolean;
  isViewer: boolean;
  
  // Read-only check
  isReadOnly: boolean;
}

/**
 * usePermission - Hook for checking user permissions
 * 
 * Usage:
 * const { can, canAdministerFeeding, isNurse } = usePermission();
 * 
 * if (can('administer_feeding')) {
 *   // Show administer button
 * }
 * 
 * if (canAdministerFeeding) {
 *   // Quick boolean check
 * }
 */
export function usePermission(): UsePermissionReturn {
  const { user, checkPermission } = useAuth();
  
  const role = user?.role;
  
  // Single permission check
  const can = (permission: Permission): boolean => checkPermission(permission);
  
  // Multiple permissions - ALL required
  const canAll = (...permissions: Permission[]): boolean => 
    permissions.every(p => checkPermission(p));
  
  // Multiple permissions - ANY required
  const canAny = (...permissions: Permission[]): boolean => 
    permissions.some(p => checkPermission(p));
  
  // Role checks
  const isRole = (r: UserRole): boolean => role === r;
  const isAnyRole = (...roles: UserRole[]): boolean => 
    role ? roles.includes(role as UserRole) : false;
  
  // Patient permissions
  const canViewPatients = checkPermission('patient_view');
  const canCreatePatients = checkPermission('patient_create');
  const canEditPatients = checkPermission('patient_edit');
  const canDeletePatients = checkPermission('patient_delete');
  
  // Order permissions
  const canViewOrders = checkPermission('order_view');
  const canCreateOrders = checkPermission('order_create');
  const canEditOrders = checkPermission('order_edit');
  const canCancelOrders = checkPermission('order_cancel');
  const canVerifyOrders = checkPermission('order_verify');
  
  // Administration permissions
  const canAdministerFeeding = checkPermission('administer_feeding');
  const canVerifyAdministration = checkPermission('administer_verify');
  const canOverrideAdministration = checkPermission('administer_override');
  
  // Inventory permissions
  const canViewInventory = checkPermission('inventory_view');
  const canManageInventory = checkPermission('inventory_manage');
  const canDiscardInventory = checkPermission('inventory_discard');
  
  // User management permissions
  const canViewUsers = checkPermission('user_view');
  const canManageUsers = checkPermission('user_create') || checkPermission('user_edit');
  const canAssignStations = checkPermission('user_assign_station');
  
  // Audit permissions
  const canViewAudit = checkPermission('audit_view');
  const canExportAudit = checkPermission('audit_export');
  
  // System permissions
  const canManageSystem = checkPermission('system_settings');
  
  // Role shortcuts
  const isAdmin = role === 'admin';
  const isNurseManager = role === 'nurse_manager';
  const isNurse = role === 'nurse';
  const isPhysician = role === 'physician';
  const isTechnician = role === 'technician';
  const isViewer = role === 'viewer';
  
  // Read-only check
  const isReadOnly = role === 'viewer';
  
  return {
    can,
    canAll,
    canAny,
    isRole,
    isAnyRole,
    
    canViewPatients,
    canCreatePatients,
    canEditPatients,
    canDeletePatients,
    
    canViewOrders,
    canCreateOrders,
    canEditOrders,
    canCancelOrders,
    canVerifyOrders,
    
    canAdministerFeeding,
    canVerifyAdministration,
    canOverrideAdministration,
    
    canViewInventory,
    canManageInventory,
    canDiscardInventory,
    
    canViewUsers,
    canManageUsers,
    canAssignStations,
    
    canViewAudit,
    canExportAudit,
    
    canManageSystem,
    
    isAdmin,
    isNurseManager,
    isNurse,
    isPhysician,
    isTechnician,
    isViewer,
    
    isReadOnly,
  };
}
