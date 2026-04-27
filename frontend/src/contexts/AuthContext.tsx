import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { authApi } from '@/services/api';
import { auditService } from '@/services/auditService';
import { ROLE_PERMISSIONS } from '@/types/user';
import type { AuthState, AuthUser, LoginCredentials } from '@/types/auth';
import { DEFAULT_SECURITY_POLICY } from '@/types/auth';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkPermission: (permission: string) => boolean;
  refreshSession: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (username: string) => Promise<{ success: boolean; error?: string; token?: string }>;
  resetPassword: (username: string, token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_TIMEOUT = DEFAULT_SECURITY_POLICY.sessionTimeoutMinutes * 60 * 1000;
const IDLE_TIMEOUT = DEFAULT_SECURITY_POLICY.idleTimeoutMinutes * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    session: null,
    isLoading: true,
    error: null,
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef<((reason?: string) => void) | undefined>(undefined);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // Start idle timer
  const startIdleTimer = useCallback(() => {
    clearTimers();
    idleTimerRef.current = setTimeout(() => {
      const logoutFn = logoutRef.current;
      if (logoutFn) {
        logoutFn('Session expired due to inactivity');
      }
    }, IDLE_TIMEOUT);
  }, [clearTimers]);

  // Start session timer
  const startSessionTimer = useCallback(() => {
    sessionTimerRef.current = setTimeout(() => {
      const logoutFn = logoutRef.current;
      if (logoutFn) {
        logoutFn('Session expired');
      }
    }, SESSION_TIMEOUT);
  }, []);

  // Reset idle timer on activity
  const resetIdleTimer = useCallback(() => {
    if (state.isAuthenticated) {
      startIdleTimer();
    }
  }, [state.isAuthenticated, startIdleTimer]);

  // Login - Call backend API directly
  const login = useCallback(async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Call backend login endpoint (returns JSON body for both success & error)
      const response = await authApi.login({
        username: credentials.username,
        password: credentials.password,
        stationId: credentials.stationId
      });

      if (!response.success) {
        const errorMsg = response.error || response.message || 'Invalid username or password';
        setState(prev => ({ ...prev, isLoading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }

      const { token, user } = response.data;

      // Store token
      localStorage.setItem('auth_token', token);

      // Create auth user object
      const authUser: AuthUser = {
        id: user.id,
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        assignedStations: user.assignedStations?.map((s: any) => s.id) || [],
        primaryStation: user.primaryStationId,
        permissions: ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS] || [],
      };

      // Create session
      const now = new Date();
      const session = {
        id: `sess-${Date.now()}`,
        startedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TIMEOUT),
        lastActivityAt: now,
        ipAddress: '127.0.0.1',
        deviceInfo: navigator.userAgent,
      };

      // Update state
      setState({
        isAuthenticated: true,
        user: authUser,
        session,
        isLoading: false,
        error: null,
      });

      // Start timers
      startIdleTimer();
      startSessionTimer();

      // Log audit
      auditService.log({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'login',
        details: `User logged in${credentials.stationId ? ` at station ${credentials.stationId}` : ''}`,
      });

      // Store in localStorage for persistence
      localStorage.setItem('auth_session', JSON.stringify({
        userId: user.id,
        sessionId: session.id,
        startedAt: session.startedAt,
      }));

      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      setState(prev => ({ ...prev, isLoading: false, error: error.message || 'Login failed. Please try again.' }));
      return { success: false, error: error.message || 'Login failed. Please try again.' };
    }
  }, [startIdleTimer, startSessionTimer]);

  // Logout
  const logout = useCallback((reason?: string) => {
    if (state.user) {
      auditService.log({
        userId: state.user.id,
        userName: `${state.user.firstName} ${state.user.lastName}`,
        action: 'logout',
        details: reason || 'User logged out',
      });
    }

    clearTimers();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_session');
    
    setState({
      isAuthenticated: false,
      user: null,
      session: null,
      isLoading: false,
      error: null,
    });
  }, [state.user, clearTimers]);

  // Store logout function in ref for timer callbacks
  logoutRef.current = logout;

  // Check permission
  const checkPermission = useCallback((permission: string): boolean => {
    return state.user?.permissions.includes(permission) || false;
  }, [state.user]);

  // Refresh session
  const refreshSession = useCallback(() => {
    if (state.isAuthenticated && state.session) {
      const now = new Date();
      setState(prev => ({
        ...prev,
        session: prev.session ? {
          ...prev.session,
          lastActivityAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TIMEOUT),
        } : null,
      }));
      startIdleTimer();
    }
  }, [state.isAuthenticated, state.session, startIdleTimer]);

  // Change password
  const changePassword = useCallback(async (
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!state.user) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await authApi.changePassword({ currentPassword, newPassword });
      if (!response.success) {
        return { success: false, error: response.message || 'Failed to change password' };
      }

      auditService.log({
        userId: state.user.id,
        userName: `${state.user.firstName} ${state.user.lastName}`,
        action: 'password_change',
        details: 'Password changed',
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to change password' };
    }
  }, [state.user]);

  // Request password reset
  const requestPasswordReset = useCallback(async (username: string): Promise<{ success: boolean; error?: string; token?: string }> => {
    try {
      const response = await authApi.forgotPassword({ username, email: '' });
      
      if (!response.success) {
        return { success: false, error: response.message || 'Failed to request password reset' };
      }

      // For demo, return a fixed token
      const token = '123456';

      return { success: true, token };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to request password reset' };
    }
  }, []);

  // Reset password with token
  const resetPassword = useCallback(async (
    username: string, 
    token: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // For demo, accept fixed token
      if (token !== '123456') {
        return { success: false, error: 'Invalid reset code' };
      }

      // Note: Backend doesn't have a direct reset endpoint, would need admin to do it
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to reset password' };
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const stored = localStorage.getItem('auth_session');
        
        if (token && stored) {
          try {
            const sessionData = JSON.parse(stored);
            
            // Verify token by calling /auth/me
            const response = await authApi.getCurrentUser();
            
            if (response.success && response.data) {
              const user = response.data;
              const authUser: AuthUser = {
                id: user.id,
                employeeId: user.employeeId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                assignedStations: user.assignedStations?.map((s: any) => s.id) || [],
                primaryStation: user.primaryStationId,
                permissions: ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS] || [],
              };

              const now = new Date();
              setState({
                isAuthenticated: true,
                user: authUser,
                session: {
                  id: sessionData.sessionId,
                  startedAt: new Date(sessionData.startedAt),
                  expiresAt: new Date(now.getTime() + SESSION_TIMEOUT),
                  lastActivityAt: now,
                },
                isLoading: false,
                error: null,
              });

              startIdleTimer();
              startSessionTimer();
            } else {
              // Token invalid
              localStorage.removeItem('auth_token');
              localStorage.removeItem('auth_session');
              setState(prev => ({ ...prev, isLoading: false }));
            }
          } catch (err) {
            console.error('Session check error:', err);
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_session');
            setState(prev => ({ ...prev, isLoading: false }));
          }
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkSession();
  }, [startIdleTimer, startSessionTimer]);

  // Activity listeners for idle timeout
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    const handleActivity = () => {
      resetIdleTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [state.isAuthenticated, resetIdleTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      checkPermission,
      refreshSession,
      changePassword,
      requestPasswordReset,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
