import { useState, useCallback } from 'react';
import { trakcareApi, feedingApi } from '@/services/api';
import type { EMRPatient, FeedingOrder, FeedingAdministration, ClosedLoopConfirmation } from '@/types/emr';

function normalizeGender(g: any): 'male' | 'female' | 'other' | 'unknown' {
  if (!g) return 'unknown';
  const lower = String(g).toLowerCase();
  if (lower === 'male' || lower === 'm') return 'male';
  if (lower === 'female' || lower === 'f') return 'female';
  if (lower === 'other' || lower === 'indeterminate') return 'other';
  return 'unknown';
}

function safeDate(val: any, fallback?: Date): Date {
  if (!val) return fallback || new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? (fallback || new Date()) : d;
}

function mapTrakCareBabyToPatient(baby: any): EMRPatient {
  return {
    id: baby.patientId || baby.mrn || baby.id,
    mrn: baby.mrn,
    firstName: baby.firstName || '',
    lastName: baby.lastName || '',
    dateOfBirth: safeDate(baby.dateOfBirth),
    gender: normalizeGender(baby.gender),
    roomNumber: baby.room || baby.roomNumber,
    bedNumber: baby.bed || baby.bedNumber,
    admissionDate: baby.admissionDate ? safeDate(baby.admissionDate) : undefined,
    attendingPhysician: baby.attendingPhysician,
    motherName: baby.motherName || baby.motherMrn,
    gestationalAgeAtBirth: baby.gestationalAgeAtBirth,
    birthWeight: baby.birthWeight,
    currentWeight: baby.currentWeight,
    isActive: baby.isActive === 1 || baby.isActive === '1' || baby.isActive === true,
  };
}

function normalizeFeedingType(ft: any): string {
  if (!ft) return 'bottle';
  const lower = String(ft).toLowerCase().trim();
  if (lower.includes('breast')) return 'breast';
  if (lower.includes('bottle')) return 'bottle';
  if (lower.includes('gavage')) return 'gavage';
  if (lower.includes('ng') || lower.includes('nasogastric')) return 'ng_tube';
  if (lower.includes('og') || lower.includes('orogastric')) return 'og_tube';
  return ft; // pass through as-is for display
}

function normalizeRoute(r: any): string | undefined {
  if (!r) return undefined;
  const lower = String(r).toLowerCase().trim();
  if (lower === 'oral' || lower === 'po') return 'oral';
  if (lower.includes('ng')) return 'ng_tube';
  if (lower.includes('og')) return 'og_tube';
  if (lower.includes('gastrostomy') || lower.includes('g-tube')) return 'gastrostomy';
  return r;
}

function normalizeOrderStatus(s: any): 'active' | 'on-hold' | 'cancelled' | 'completed' {
  if (!s) return 'active';
  const lower = String(s).toLowerCase().trim();
  if (lower === 'active') return 'active';
  if (lower === 'on-hold' || lower === 'on hold') return 'on-hold';
  if (lower === 'cancelled' || lower === 'canceled') return 'cancelled';
  if (lower === 'completed' || lower === 'complete') return 'completed';
  return 'active';
}

function mapTrakCareOrderToFeedingOrder(order: any): FeedingOrder {
  return {
    id: order.orderId || order.id,
    patientId: order.patientMrn,
    orderId: String(order.orderId || order.id),
    orderedBy: order.orderedBy || '',
    orderedAt: safeDate(order.orderedAt),
    feedingType: normalizeFeedingType(order.feedingType),
    volume: order.volume ? Number(order.volume) : undefined,
    frequency: order.frequency || '',
    route: normalizeRoute(order.route),
    fortification: order.fortification,
    status: normalizeOrderStatus(order.status),
    priority: order.priority || 'routine',
    specialInstructions: order.notes || order.specialInstructions,
  };
}

function mapApiAdministrationToFeedingAdministration(admin: any): FeedingAdministration {
  return {
    id: String(admin.id),
    patientId: admin.patientMrn, patientName: admin.patientName,
    orderId: admin.orderId, milkInventoryId: admin.milkInventoryId, milkBarcode: admin.barcode,
    feedingType: admin.feedingType, volumeGiven: admin.volumeGivenMl || admin.volumeGiven,
    administeredAt: safeDate(admin.administeredAt),
    scheduledTime: safeDate(admin.administeredAt),
    administeredBy: admin.administeredByName || admin.administeredBy,
    verificationMethod: admin.verificationMethod === 'manual_override' ? 'manual_override' : 'barcode',
    tolerance: admin.tolerance || 'well-tolerated',
    status: admin.status || 'administered',
    notes: admin.notes,
  };
}

export function useEMR() {
  const [patients, setPatients] = useState<EMRPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<EMRPatient | null>(null);
  const [patientOrders, setPatientOrders] = useState<FeedingOrder[]>([]);
  const [administrations, setAdministrations] = useState<FeedingAdministration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emrConnected, setEmrConnected] = useState<boolean>(false);

  // Check if authenticated
  const isAuthenticated = () => !!localStorage.getItem('auth_token');

  const checkConnectivity = useCallback(async () => {
    try {
      const response = await trakcareApi.checkHealth();
      setEmrConnected(response.success);
      return { connected: response.success, message: response.success ? 'Connected to TrakCare' : 'TrakCare connection failed' };
    } catch (error: any) {
      setEmrConnected(false);
      return { connected: false, message: error.message || 'TrakCare connection failed' };
    }
  }, []);

  const loadPatients = useCallback(async () => {
    if (!isAuthenticated()) { setError('Please login first'); return; }
    setIsLoading(true); setError(null);
    try {
      const response = await trakcareApi.getBabies();
      if (response.success && Array.isArray(response.data)) {
        setPatients(response.data.map(mapTrakCareBabyToPatient));
        setEmrConnected(true);
      } else {
        setError(response.message || 'Failed to fetch patients');
        setEmrConnected(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load patients');
      setEmrConnected(false);
    } finally { setIsLoading(false); }
  }, []);

  const searchPatients = useCallback(async (searchTerm: string) => {
    if (!isAuthenticated()) { setError('Please login first'); return; }
    setIsLoading(true); setError(null);
    try {
      const response = await trakcareApi.getBabies({ search: searchTerm });
      if (response.success) setPatients(response.data.map(mapTrakCareBabyToPatient));
    } catch (err: any) {
      setError(err.message || 'Failed to search patients');
    } finally { setIsLoading(false); }
  }, []);

  const getPatientByMrn = useCallback(async (mrn: string): Promise<EMRPatient | null> => {
    if (!isAuthenticated()) return null;
    try {
      const response = await trakcareApi.getBabyByMrn(mrn);
      return response.success ? mapTrakCareBabyToPatient(response.data) : null;
    } catch (err) { return null; }
  }, []);

  const selectPatient = useCallback(async (patient: EMRPatient) => {
    if (!isAuthenticated()) { setError('Please login first'); return; }
    setIsLoading(true); setError(null);
    setSelectedPatient(patient);
    
    // Fetch orders and administrations independently so one failure doesn't block the other
    try {
      const ordersResponse = await trakcareApi.getPatientOrders(patient.mrn, 'active');
      if (ordersResponse.success && Array.isArray(ordersResponse.data)) {
        setPatientOrders(ordersResponse.data.map(mapTrakCareOrderToFeedingOrder));
      }
    } catch (err: any) {
      console.warn('Failed to load patient orders:', err.message);
      // Don't block UI — orders just stay empty
    }

    try {
      const adminResponse = await feedingApi.getAdministrations({ patientMrn: patient.mrn });
      if (adminResponse.success && Array.isArray(adminResponse.data)) {
        setAdministrations(adminResponse.data.map(mapApiAdministrationToFeedingAdministration));
      }
    } catch (err: any) {
      console.warn('Failed to load administrations:', err.message);
      // Don't block UI — administrations just stay empty
    }

    setIsLoading(false);
  }, []);

  const recordAdministration = useCallback(async (admin: Omit<FeedingAdministration, 'id'>): Promise<FeedingAdministration & { milkVolume?: any }> => {
    if (!isAuthenticated()) throw new Error('Please login first');
    setIsLoading(true);
    try {
      // CRITICAL: Always use the actual MRN (patient.mrn), NOT the TrakCare patientId.
      // ClosedLoopAdministration must send patientMrn explicitly.
      const mrn = (admin as any).patientMrn || admin.patientId;
      const response = await feedingApi.administer({
        patientMrn: mrn,
        patientName: admin.patientName || '',
        milkInventoryId: admin.milkInventoryId,
        barcode: admin.milkBarcode,
        orderId: admin.orderId,
        volumeGiven: admin.volumeGiven,
        volumeOrdered: (admin as any).volumeOrdered,
        feedingType: admin.feedingType,
        route: 'oral',
        administeredAt: new Date().toISOString(),
        tolerance: admin.tolerance || 'good',
        notes: admin.notes,
        verificationMethod: admin.verificationMethod || 'barcode',
        overrideCategory: admin.overrideCategory,
        overrideJustification: admin.overrideJustification,
      });
      if (!response.success) throw new Error(response.message || 'Failed to record administration');
      
      // Extract milkVolume info from response
      const milkVolume = response.data?.milkVolume || null;
      
      const adminResponse = await feedingApi.getAdministrations({ patientMrn: mrn });
      if (adminResponse.success && adminResponse.data.length > 0) {
        const newAdmin = mapApiAdministrationToFeedingAdministration(adminResponse.data[0]);
        setAdministrations(prev => [newAdmin, ...prev]);
        return { ...newAdmin, milkVolume };
      }
      throw new Error('Failed to retrieve recorded administration');
    } finally { setIsLoading(false); }
  }, []);

  const clearSelectedPatient = useCallback(() => {
    setSelectedPatient(null);
    setPatientOrders([]);
    setAdministrations([]);
  }, []);

  return {
    patients, selectedPatient, patientOrders, administrations, isLoading, error, emrConnected,
    loadPatients, searchPatients, getPatientByMrn, selectPatient, clearSelectedPatient,
    recordAdministration, checkConnectivity,
  };
}
