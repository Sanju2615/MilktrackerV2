// Authentication Types for HIMSS 6 Security Compliance

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthUser {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  assignedStations: string[];
  primaryStation?: string;
  permissions: string[];
}

export interface AuthSession {
  id: string;
  startedAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
  stationId?: string;
}

export interface PasswordRequirements {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  passwordHistoryCount: number;
  maxAgeDays: number;
}

export interface SecurityPolicy {
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  requireMfa: boolean;
  passwordRequirements: PasswordRequirements;
}

// Default security policy for HIMSS 6 compliance
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  sessionTimeoutMinutes: 480, // 8 hours
  idleTimeoutMinutes: 15, // 15 minutes
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 30,
  requireMfa: false,
  passwordRequirements: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventCommonPasswords: true,
    passwordHistoryCount: 5,
    maxAgeDays: 90,
  },
};

export const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'abc123',
  'monkey', 'letmein', 'dragon', '111111', 'baseball',
  'iloveyou', 'trustno1', 'sunshine', 'princess', 'admin',
  'welcome', 'shadow', 'ashley', 'football', 'jesus',
  'michael', 'ninja', 'mustang', 'password1', '123456789',
];
