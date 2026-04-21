// User Management Service - Fetches REAL data from backend API
import { usersApi, authApi } from './api';
import type { User, UserRole, UserStatus, NurseStation, UserActivity } from '@/types/user';

function mapApiUserToUser(apiUser: any): User {
  return {
    id: apiUser.id, employeeId: apiUser.employeeId, firstName: apiUser.firstName, lastName: apiUser.lastName,
    email: apiUser.email, phone: apiUser.phone, role: apiUser.role as UserRole, status: apiUser.status as UserStatus,
    assignedStations: apiUser.assignedStations?.map((s: any) => s.id) || [], primaryStation: apiUser.primaryStationId,
    credentials: { username: apiUser.username, passwordHash: '', loginAttempts: 0, lastLogin: apiUser.lastLoginAt ? new Date(apiUser.lastLoginAt) : undefined, mfaEnabled: false },
    createdAt: new Date(apiUser.createdAt), updatedAt: new Date(apiUser.updatedAt), createdBy: 'system',
  };
}

class UserService {
  private activities: UserActivity[] = [];
  private currentUser: User | null = null;

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await authApi.getCurrentUser();
      if (response.success && response.data) {
        this.currentUser = mapApiUserToUser(response.data);
        return this.currentUser;
      }
      return null;
    } catch (error) { console.error('Failed to get current user:', error); return null; }
  }

  async login(username: string, password: string, stationId?: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await authApi.login({ username, password, stationId });
      if (response.success && response.data) {
        localStorage.setItem('auth_token', response.data.token);
        const user = mapApiUserToUser(response.data.user);
        this.currentUser = user;
        return { success: true, user };
      }
      return { success: false, error: response.message || 'Login failed' };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Login failed' }; }
  }

  async logout(): Promise<void> {
    try { await authApi.logout(); } catch (error) { console.error('Logout error:', error); }
    finally { localStorage.removeItem('auth_token'); this.currentUser = null; }
  }

  async getUsers(filters?: { role?: UserRole; status?: UserStatus; stationId?: string; searchTerm?: string }): Promise<User[]> {
    const response = await usersApi.getUsers({ role: filters?.role, status: filters?.status, search: filters?.searchTerm });
    if (!response.success) throw new Error('Failed to fetch users');
    return response.data.map(mapApiUserToUser);
  }

  async getUser(userId: string): Promise<User | null> {
    const response = await usersApi.getUser(userId);
    if (!response.success) return null;
    return mapApiUserToUser(response.data);
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'credentials'> & { password: string }, _createdBy: string): Promise<User> {
    const response = await usersApi.createUser({
      employeeId: userData.employeeId, username: userData.credentials.username, password: userData.password,
      firstName: userData.firstName, lastName: userData.lastName, email: userData.email,
      phone: userData.phone, role: userData.role, primaryStationId: userData.primaryStation,
    });
    if (!response.success) throw new Error('Failed to create user');
    const userResponse = await usersApi.getUser(response.data.id);
    if (userResponse.success) return mapApiUserToUser(userResponse.data);
    throw new Error('Failed to retrieve created user');
  }

  async updateUser(userId: string, updates: Partial<User>, _updatedBy: string): Promise<User | null> {
    const apiUpdates: any = {};
    if (updates.firstName) apiUpdates.firstName = updates.firstName;
    if (updates.lastName) apiUpdates.lastName = updates.lastName;
    if (updates.email) apiUpdates.email = updates.email;
    if (updates.phone) apiUpdates.phone = updates.phone;
    if (updates.role) apiUpdates.role = updates.role;
    if (updates.primaryStation) apiUpdates.primaryStationId = updates.primaryStation;

    const response = await usersApi.updateUser(userId, apiUpdates);
    if (!response.success) throw new Error('Failed to update user');
    const userResponse = await usersApi.getUser(userId);
    return userResponse.success ? mapApiUserToUser(userResponse.data) : null;
  }

  async updateUserStatus(userId: string, status: UserStatus, reason: string, _updatedBy: string): Promise<User | null> {
    const response = await usersApi.updateUserStatus(userId, { status, reason });
    if (!response.success) throw new Error('Failed to update user status');
    const userResponse = await usersApi.getUser(userId);
    return userResponse.success ? mapApiUserToUser(userResponse.data) : null;
  }

  async assignStations(userId: string, stationIds: string[], primaryStationId: string | undefined, _assignedBy: string): Promise<User | null> {
    const response = await usersApi.assignStations(userId, { stationIds, primaryStationId });
    if (!response.success) throw new Error('Failed to assign stations');
    const userResponse = await usersApi.getUser(userId);
    return userResponse.success ? mapApiUserToUser(userResponse.data) : null;
  }

  async changePassword(_userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try { await authApi.changePassword({ currentPassword, newPassword }); return true; }
    catch (error) { console.error('Change password error:', error); return false; }
  }

  async resetPassword(userId: string, newPassword: string): Promise<boolean> {
    try { await usersApi.resetPassword(userId, { newPassword }); return true; }
    catch (error) { console.error('Reset password error:', error); return false; }
  }

  async forgotPassword(username: string, email: string): Promise<boolean> {
    try { await authApi.forgotPassword({ username, email }); return true; }
    catch (error) { console.error('Forgot password error:', error); return false; }
  }

  async getNurseStations(): Promise<NurseStation[]> {
    const response = await usersApi.getStations();
    if (!response.success) throw new Error('Failed to fetch nurse stations');
    return response.data.map((s: any) => ({ id: s.id, name: s.name, unit: s.location || 'General', floor: 'Unknown', isActive: s.isActive === 1 || s.isActive === '1' || s.isActive === true }));
  }

  async createNurseStation(station: Omit<NurseStation, 'id'>): Promise<NurseStation> {
    const response = await usersApi.createStation({ name: station.name, code: station.name.toLowerCase().replace(/\s+/g, '-'), location: station.unit });
    if (!response.success) throw new Error('Failed to create nurse station');
    const stationsResponse = await usersApi.getStations();
    const createdStation = stationsResponse.data?.find((s: any) => s.id === response.data.id);
    if (createdStation) return { id: createdStation.id, name: createdStation.name, unit: createdStation.location || 'General', floor: 'Unknown', isActive: createdStation.isActive === 1 || createdStation.isActive === '1' || createdStation.isActive === true };
    throw new Error('Failed to retrieve created station');
  }

  async getUsersByStation(stationId: string): Promise<User[]> {
    const response = await usersApi.getUsers({});
    if (!response.success) throw new Error('Failed to fetch users');
    return response.data.filter((u: any) => u.assignedStations?.some((s: any) => s.id === stationId) && u.status === 'active').map(mapApiUserToUser);
  }

  hasPermission(user: User | null, permission: string): boolean {
    if (!user) return false;
    const rolePermissions: Record<UserRole, string[]> = {
      admin: ['*'], nurse_manager: ['user_view', 'user_create', 'user_edit', 'milk_collect', 'milk_administer', 'milk_discard', 'reports_view'],
      nurse: ['user_view', 'milk_collect', 'milk_administer', 'reports_view'], physician: ['user_view', 'milk_administer', 'reports_view'],
      technician: ['user_view', 'milk_collect', 'milk_transfer'], viewer: ['user_view', 'reports_view'],
    };
    const permissions = rolePermissions[user.role] || [];
    return permissions.includes('*') || permissions.includes(permission);
  }

  isAuthenticated(): boolean { return !!localStorage.getItem('auth_token'); }
}

export const userService = new UserService();
