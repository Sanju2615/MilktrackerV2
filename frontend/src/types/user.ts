// User Management Types for HIMSS 6 Compliance

export type UserRole = 'admin' | 'nurse_manager' | 'nurse' | 'physician' | 'technician' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked';

export interface NurseStation {
  id: string;
  name: string;
  unit: string; // e.g., "NICU", "Pediatrics"
  floor?: string;
  roomRange?: string; // e.g., "101-110"
  isActive: boolean;
}

export interface User {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  assignedStations: string[]; // Nurse Station IDs
  primaryStation?: string;
  credentials: {
    username: string;
    passwordHash?: string;
    lastLogin?: Date;
    loginAttempts: number;
    passwordChangedAt?: Date;
    mfaEnabled: boolean;
  };
  license?: {
    number: string;
    type: string;
    state: string;
    expiresAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  notes?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  ipAddress: string;
  deviceInfo: string;
  stationId?: string;
  isActive: boolean;
}

export interface RolePermission {
  role: UserRole;
  permissions: Permission[];
}

export type Permission = 
  // Patient permissions
  | 'patient_view' | 'patient_create' | 'patient_edit' | 'patient_delete'
  // Order permissions
  | 'order_view' | 'order_create' | 'order_edit' | 'order_cancel' | 'order_verify'
  // Administration permissions
  | 'administer_feeding' | 'administer_verify' | 'administer_override'
  // Inventory permissions
  | 'inventory_view' | 'inventory_manage' | 'inventory_discard'
  // User management permissions
  | 'user_view' | 'user_create' | 'user_edit' | 'user_delete' | 'user_assign_station'
  // Station management permissions
  | 'station_view' | 'station_manage'
  // Audit permissions
  | 'audit_view' | 'audit_export'
  // System permissions
  | 'system_settings' | 'system_backup';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'patient_view', 'patient_create', 'patient_edit', 'patient_delete',
    'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
    'administer_feeding', 'administer_verify', 'administer_override',
    'inventory_view', 'inventory_manage', 'inventory_discard',
    'user_view', 'user_create', 'user_edit', 'user_delete', 'user_assign_station',
    'station_view', 'station_manage',
    'audit_view', 'audit_export',
    'system_settings', 'system_backup'
  ],
  nurse_manager: [
    'patient_view', 'patient_create', 'patient_edit',
    'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
    'administer_feeding', 'administer_verify', 'administer_override',
    'inventory_view', 'inventory_manage', 'inventory_discard',
    'user_view', 'user_create', 'user_edit', 'user_assign_station',
    'station_view', 'station_manage',
    'audit_view', 'audit_export'
  ],
  nurse: [
    'patient_view', 'patient_create', 'patient_edit',
    'order_view', 'order_create', 'order_edit',
    'administer_feeding', 'administer_verify',
    'inventory_view', 'inventory_discard',
    'station_view'
  ],
  physician: [
    'patient_view', 'patient_create', 'patient_edit',
    'order_view', 'order_create', 'order_edit', 'order_cancel', 'order_verify',
    'administer_feeding',
    'inventory_view',
    'station_view'
  ],
  technician: [
    'patient_view',
    'order_view',
    'inventory_view', 'inventory_manage',
    'station_view'
  ],
  viewer: [
    'patient_view',
    'order_view',
    'inventory_view',
    'station_view'
  ]
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'System Administrator',
  nurse_manager: 'Nurse Manager',
  nurse: 'Nurse',
  physician: 'Physician',
  technician: 'Technician',
  viewer: 'Read-Only Viewer'
};

export interface UserActivity {
  id: string;
  userId: string;
  action: 'login' | 'logout' | 'password_change' | 'failed_login' | 'account_locked' | 'role_changed' | 'station_assigned';
  timestamp: Date;
  details?: string;
  ipAddress?: string;
}
