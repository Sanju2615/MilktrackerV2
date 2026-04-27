import { useState, useEffect, useCallback } from 'react';
import { usersApi, authApi } from '@/services/api';
import type { User, UserRole, UserStatus, NurseStation } from '@/types/user';

function mapApiUserToUser(apiUser: any): User {
  return {
    id: apiUser.id, 
    employeeId: apiUser.employee_id || apiUser.employeeId, 
    firstName: apiUser.first_name || apiUser.firstName, 
    lastName: apiUser.last_name || apiUser.lastName,
    email: apiUser.email, 
    phone: apiUser.phone, 
    role: (apiUser.role as UserRole) || 'nurse', 
    status: (apiUser.status as UserStatus) || 'active',
    assignedStations: apiUser.assignedStations?.map((s: any) => s.id) || [], 
    primaryStation: apiUser.primary_station_id || apiUser.primaryStationId,
    credentials: { 
      username: apiUser.username, 
      passwordHash: '', 
      loginAttempts: 0, 
      lastLogin: apiUser.last_login_at ? new Date(apiUser.last_login_at) : undefined, 
      mfaEnabled: false 
    },
    createdAt: new Date(apiUser.created_at || apiUser.createdAt), 
    updatedAt: new Date(apiUser.updated_at || apiUser.updatedAt), 
    createdBy: 'system',
  };
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [stations, setStations] = useState<NurseStation[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is already logged in (on mount)
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
      loadCurrentUser();
    }
  }, []);

  // Load data only when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadUsers();
      loadStations();
    }
  }, [isAuthenticated]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        setCurrentUser(mapApiUserToUser(response.data));
      } else {
        // Token invalid, clear it
        localStorage.removeItem('auth_token');
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
      localStorage.removeItem('auth_token');
      setIsAuthenticated(false);
    }
  }, []);

  const loadUsers = useCallback(async (filters?: { role?: UserRole; status?: UserStatus; searchTerm?: string }) => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await usersApi.getUsers({ role: filters?.role, status: filters?.status, search: filters?.searchTerm });
      if (response.success) {
        setUsers(response.data.map(mapApiUserToUser));
      }
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const loadStations = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await usersApi.getStations();
      if (response.success) {
        setStations(response.data.map((s: any) => ({ id: s.id, name: s.name, unit: s.location || 'General', floor: 'Unknown', isActive: s.isActive === 1 || s.isActive === '1' || s.isActive === true })));
      }
    } catch (err) {
      console.error('Failed to load stations:', err);
    }
  }, [isAuthenticated]);

  const login = useCallback(async (username: string, password: string, stationId?: string): Promise<{ success: boolean; user?: User; error?: string }> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.login({ username, password, stationId });
      if (response.success && response.data) {
        localStorage.setItem('auth_token', response.data.token);
        const user = mapApiUserToUser(response.data.user);
        setCurrentUser(user);
        setIsAuthenticated(true);
        return { success: true, user };
      }
      return { success: false, error: response.message || 'Login failed' };
    } catch (err: any) {
      setError(err.message || 'Login failed');
      return { success: false, error: err.message || 'Login failed' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try { await authApi.logout(); } catch (error) { console.error('Logout error:', error); }
    finally {
      localStorage.removeItem('auth_token');
      setCurrentUser(null);
      setIsAuthenticated(false);
      setUsers([]);
      setStations([]);
    }
  }, []);

  const createUser = useCallback(async (userData: any) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    setIsLoading(true);
    try {
      const response = await usersApi.createUser({
        employeeId: userData.employeeId, username: userData.credentials?.username || userData.username, password: userData.password,
        firstName: userData.firstName, lastName: userData.lastName, email: userData.email,
        phone: userData.phone, role: userData.role, primaryStationId: userData.primaryStation,
      });
      if (!response.success) throw new Error(response.message || 'Failed to create user');
      await loadUsers();
      return response.data;
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadUsers]);

  const updateUser = useCallback(async (userId: string, updates: Partial<User>) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const apiUpdates: any = {};
    if (updates.firstName) apiUpdates.firstName = updates.firstName;
    if (updates.lastName) apiUpdates.lastName = updates.lastName;
    if (updates.email) apiUpdates.email = updates.email;
    if (updates.phone) apiUpdates.phone = updates.phone;
    if (updates.role) apiUpdates.role = updates.role;
    if (updates.primaryStation) apiUpdates.primaryStationId = updates.primaryStation;

    const response = await usersApi.updateUser(userId, apiUpdates);
    if (!response.success) throw new Error('Failed to update user');
    await loadUsers();
  }, [isAuthenticated, loadUsers]);

  const updateUserStatus = useCallback(async (userId: string, status: UserStatus, reason?: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const response = await usersApi.updateUserStatus(userId, { status, reason: reason || '' });
    if (!response.success) throw new Error(response.message || 'Failed to update status');
    await loadUsers();
    return response;
  }, [isAuthenticated, loadUsers]);

  const assignStations = useCallback(async (userId: string, stationIds: string[], primaryStationId?: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const response = await usersApi.assignStations(userId, { stationIds, primaryStationId });
    if (!response.success) throw new Error(response.message || 'Failed to assign stations');
    await loadUsers();
    return response;
  }, [isAuthenticated, loadUsers]);

  const createStation = useCallback(async (stationData: any) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const response = await usersApi.createStation({
      name: stationData.name,
      code: stationData.name.toLowerCase().replace(/\s+/g, '-'),
      location: stationData.unit || stationData.location,
    });
    if (!response.success) throw new Error(response.message || 'Failed to create station');
    await loadStations();
    return response;
  }, [isAuthenticated, loadStations]);

  const getStationName = useCallback((stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    return station?.name || stationId;
  }, [stations]);

  const resetPassword = useCallback(async (userId: string, newPassword: string) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    const response = await usersApi.resetPassword(userId, { newPassword });
    if (!response.success) throw new Error(response.message || 'Failed to reset password');
    return response.success;
  }, [isAuthenticated]);

  const forgotPassword = useCallback(async (username: string, email: string) => {
    try {
      const response = await authApi.forgotPassword({ username, email });
      return response.success;
    } catch (error) {
      return false;
    }
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!currentUser) return false;
    const rolePermissions: Record<UserRole, string[]> = {
      admin: ['*'], nurse_manager: ['user_view', 'user_create', 'user_edit', 'milk_collect', 'milk_administer', 'milk_discard', 'reports_view'],
      nurse: ['user_view', 'milk_collect', 'milk_administer', 'reports_view'], physician: ['user_view', 'milk_administer', 'reports_view'],
      technician: ['user_view', 'milk_collect', 'milk_transfer'], viewer: ['user_view', 'reports_view'],
    };
    const permissions = rolePermissions[currentUser.role] || [];
    return permissions.includes('*') || permissions.includes(permission);
  }, [currentUser]);

  return {
    users, stations, currentUser, isLoading, error, isAuthenticated,
    login, logout, loadUsers, createUser, updateUser, updateUserStatus,
    assignStations, createStation, getStationName, resetPassword, forgotPassword, hasPermission
  };
}
