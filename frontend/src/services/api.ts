// API Service - HTTP Client for Backend Communication
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Filter out undefined/null/empty values from params to prevent
 * sending "undefined" as a string in query parameters.
 */
function cleanParams(params?: Record<string, any>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && String(value) !== 'undefined' && String(value) !== 'null') {
        cleaned[key] = String(value);
      }
    });
  }
  return cleaned;
}

function buildQueryString(params?: Record<string, any>): string {
  const cleaned = cleanParams(params);
  const query = new URLSearchParams(cleaned).toString();
  return query ? `?${query}` : '';
}

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers, cache: 'no-cache' });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Auth API
export const authApi = {
  /**
   * Login - returns the JSON body for BOTH success and error responses
   * so the caller can show inline error messages instead of throwing.
   */
  login: async (data: { username: string; password: string; stationId?: string }): Promise<any> => {
    const url = `${API_BASE_URL}/auth/login`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        cache: 'no-cache',
      });
      const body = await response.json().catch(() => ({ success: false, error: 'Invalid server response' }));
      // For login we always return the parsed body (success or error) — no throw
      return body;
    } catch (err: any) {
      // Network / CORS error — return a structured error so UI can display it
      return { success: false, error: err.message || 'Unable to connect to server. Please try again.' };
    }
  },
  logout: () => fetchWithAuth<any>('/auth/logout', { method: 'POST' }),
  getCurrentUser: () => fetchWithAuth<any>('/auth/me'),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    fetchWithAuth<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (data: { username: string; email: string }) =>
    fetchWithAuth<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
};

// TrakCare API
export const trakcareApi = {
  getBabies: (params?: any) => {
    return fetchWithAuth<any>(`/trakcare/babies${buildQueryString(params)}`);
  },
  getBabyByMrn: (mrn: string) => fetchWithAuth<any>(`/trakcare/babies/${mrn}`),
  getOrders: (params?: any) => {
    return fetchWithAuth<any>(`/trakcare/orders${buildQueryString(params)}`);
  },
  getPatientOrders: (mrn: string, status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchWithAuth<any>(`/trakcare/patients/${mrn}/orders${query}`);
  },
  checkHealth: () => fetchWithAuth<any>('/trakcare/health'),
};

// Milk API
export const milkApi = {
  getInventory: (params?: any) => {
    return fetchWithAuth<any>(`/milk${buildQueryString(params)}`);
  },
  collect: (data: any) => fetchWithAuth<any>('/milk/collect', { method: 'POST', body: JSON.stringify(data) }),
  getById: (id: string) => fetchWithAuth<any>(`/milk/${id}`),
  getByBarcode: (barcode: string) => fetchWithAuth<any>(`/milk/barcode/${barcode}`),
  getPatientMilk: (mrn: string) => fetchWithAuth<any>(`/milk/patient/${encodeURIComponent(mrn)}`),
  getNextSequence: (patientMrn: string) => fetchWithAuth<any>(`/milk/next-sequence/${encodeURIComponent(patientMrn)}`),
  reserve: (id: string, patientMrn: string) =>
    fetchWithAuth<any>(`/milk/${id}/reserve`, { method: 'POST', body: JSON.stringify({ patientMrn }) }),
  prepare: (id: string, data: { patientMrn: string; orderedVolume: number; orderId?: string }) =>
    fetchWithAuth<any>(`/milk/${id}/prepare`, { method: 'POST', body: JSON.stringify(data) }),
  transfer: (id: string, data: any) =>
    fetchWithAuth<any>(`/milk/${id}/transfer`, { method: 'POST', body: JSON.stringify(data) }),
  discard: (id: string, data: any) =>
    fetchWithAuth<any>(`/milk/${id}/discard`, { method: 'POST', body: JSON.stringify(data) }),
  getStats: () => fetchWithAuth<any>('/milk/stats'),
};

// Inventory API
export const inventoryApi = {
  getStorageUnits: () => fetchWithAuth<any>('/inventory/storage-units'),
  createStorageUnit: (data: any) =>
    fetchWithAuth<any>('/inventory/storage-units', { method: 'POST', body: JSON.stringify(data) }),
  getAlerts: () => fetchWithAuth<any>('/inventory/alerts'),
  getStats: () => fetchWithAuth<any>('/inventory/stats'),
};

// Users API
export const usersApi = {
  getUsers: (params?: any) => {
    return fetchWithAuth<any>(`/users${buildQueryString(params)}`);
  },
  getUser: (id: string) => fetchWithAuth<any>(`/users/${id}`),
  createUser: (data: any) => fetchWithAuth<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) =>
    fetchWithAuth<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateUserStatus: (id: string, data: any) =>
    fetchWithAuth<any>(`/users/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),
  assignStations: (id: string, data: any) =>
    fetchWithAuth<any>(`/users/${id}/stations`, { method: 'PUT', body: JSON.stringify(data) }),
  resetPassword: (id: string, data: any) =>
    fetchWithAuth<any>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(data) }),
  getStations: () => fetchWithAuth<any>('/users/stations/all'),
  createStation: (data: any) =>
    fetchWithAuth<any>('/users/stations', { method: 'POST', body: JSON.stringify(data) }),
};

// Discard Reasons API
export const discardReasonsApi = {
  getAll: (includeInactive?: boolean) =>
    fetchWithAuth<any>(`/discard-reasons${includeInactive ? '?includeInactive=true' : ''}`),
  getById: (id: string) => fetchWithAuth<any>(`/discard-reasons/${id}`),
  create: (data: any) => fetchWithAuth<any>('/discard-reasons', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    fetchWithAuth<any>(`/discard-reasons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggle: (id: string) =>
    fetchWithAuth<any>(`/discard-reasons/${id}/toggle`, { method: 'PUT' }),
  delete: (id: string) => fetchWithAuth<any>(`/discard-reasons/${id}`, { method: 'DELETE' }),
};

// Audit API
export const auditApi = {
  getLogs: (params?: any) => {
    return fetchWithAuth<any>(`/audit/logs${buildQueryString(params)}`);
  },
  log: (data: any) => fetchWithAuth<any>('/audit/log', { method: 'POST', body: JSON.stringify(data) }),
  getStats: (params?: any) => {
    return fetchWithAuth<any>(`/audit/stats${buildQueryString(params)}`);
  },
};

// Feeding API
export const feedingApi = {
  getAdministrations: (params?: any) => {
    return fetchWithAuth<any>(`/feeding${buildQueryString(params)}`);
  },
  administer: (data: any) =>
    fetchWithAuth<any>('/feeding/administer', { method: 'POST', body: JSON.stringify(data) }),
  verify: (id: string) => fetchWithAuth<any>(`/feeding/${id}/verify`, { method: 'POST' }),
  getPatientFeedings: (mrn: string) => fetchWithAuth<any>(`/feeding/patient/${mrn}`),
  getCompletedFeedings: (params?: any) => fetchWithAuth<any>(`/feeding/completed${buildQueryString(params)}`),
};

// Reports API
export const reportsApi = {
  getDailySummary: (params?: any) => {
    return fetchWithAuth<any>(`/reports/daily-summary${buildQueryString(params)}`);
  },
  getPatientUsage: (params?: any) => {
    return fetchWithAuth<any>(`/reports/patient-usage${buildQueryString(params)}`);
  },
  getInventoryStatus: () => fetchWithAuth<any>('/reports/inventory-status'),
  getExpiry: () => fetchWithAuth<any>('/reports/expiry'),
};

// Config API
export const configApi = {
  getAll: () => fetchWithAuth<any>('/config'),
  get: (key: string) => fetchWithAuth<any>(`/config/${key}`),
  update: (key: string, value: string) =>
    fetchWithAuth<any>(`/config/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};

// Stations API
export const stationsApi = {
  getAll: (params?: any) => {
    return fetchWithAuth<any>(`/stations${buildQueryString(params)}`);
  },
  getById: (id: string) => fetchWithAuth<any>(`/stations/${id}`),
  create: (data: any) => fetchWithAuth<any>('/stations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    fetchWithAuth<any>(`/stations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export default {
  auth: authApi,
  trakcare: trakcareApi,
  milk: milkApi,
  inventory: inventoryApi,
  users: usersApi,
  discardReasons: discardReasonsApi,
  audit: auditApi,
  feeding: feedingApi,
  reports: reportsApi,
  config: configApi,
  stations: stationsApi,
};
