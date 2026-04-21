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

function mapTrakCareBabyToPatient(baby: any): EMRPatient {
  return {
    id: baby.patientId || baby.mrn || baby.id,
    mrn: baby.mrn,
    firstName: baby.firstName || '',
    lastName: baby.lastName || '',
    dateOfBirth: new Date(baby.dateOfBirth),
    gender: normalizeGender(baby.gender),
    roomNumber: baby.room || baby.roomNumber,
    bedNumber: baby.bed || baby.bedNumber,
    admissionDate: baby.admissionDate ? new Date(baby.admissionDate) : undefined,
    attendingPhysician: baby.attendingPhysician,
    motherName: baby.motherName || baby.motherMrn,
    gestationalAgeAtBirth: baby.gestationalAgeAtBirth,
    birthWeight: baby.birthWeight,
    currentWeight: baby.currentWeight,
    isActive: baby.isActive === 1 || baby.isActive === '1' || baby.isActive === true,
  };
}

function mapTrakCareOrderToFeedingOrder(order: any): FeedingOrder {
  return {
    id: order.id, patientId: order.patientMrn, orderId: order.orderId, orderedBy: order.orderedBy,
    orderedAt: new Date(order.orderedAt), feedingType: order.feedingType, volume: order.volume,
    frequency: order.frequency, route: order.route, fortification: order.fortification,
    status: order.status, priority: order.priority, specialInstructions: order.specialInstructions,
  };
}

function mapApiAdministrationToFeedingAdministration(admin: any): FeedingAdministration {
  return {
    id: admin.id, patientId: admin.patientMrn, patientName: admin.patientName,
    orderId: admin.orderId, milkInventoryId: admin.milkInventoryId, milkBarcode: admin.milkBarcode,
    feedingType: admin.feedingType, volumeGiven: admin.volumeGiven,
    administeredAt: new Date(admin.administeredAt),
    administeredBy: admin.administeredByName || admin.administeredBy,
    verifiedBy: admin.verifiedByName || admin.verifiedBy,
    verifiedAt: admin.verifiedAt ? new Date(admin.verifiedAt) : undefined,
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
    try {
      const [ordersResponse, adminResponse] = await Promise.all([
        trakcareApi.getPatientOrders(patient.mrn, 'active'),
        feedingApi.getAdministrations({ patientMrn: patient.mrn }),
      ]);
      setSelectedPatient(patient);
      if (ordersResponse.success) setPatientOrders(ordersResponse.data.map(mapTrakCareOrderToFeedingOrder));
      if (adminResponse.success) setAdministrations(adminResponse.data.map(mapApiAdministrationToFeedingAdministration));
    } catch (err: any) {
      setError(err.message || 'Failed to load patient data');
    } finally { setIsLoading(false); }
  }, []);

  const recordAdministration = useCallback(async (admin: Omit<FeedingAdministration, 'id'>): Promise<FeedingAdministration> => {
    if (!isAuthenticated()) throw new Error('Please login first');
    setIsLoading(true);
    try {
      const response = await feedingApi.administer({
        patientMrn: admin.patientId, patientName: admin.patientName || '',
        milkInventoryId: admin.milkInventoryId, milkBarcode: admin.milkBarcode,
        orderId: admin.orderId, volumeGiven: admin.volumeGiven,
        feedingType: admin.feedingType, notes: admin.notes,
      });
      if (!response.success) throw new Error(response.message || 'Failed to record administration');
      const adminResponse = await feedingApi.getAdministrations({ patientMrn: admin.patientId });
      if (adminResponse.success && adminResponse.data.length > 0) {
        const newAdmin = mapApiAdministrationToFeedingAdministration(adminResponse.data[0]);
        setAdministrations(prev => [newAdmin, ...prev]);
        return newAdmin;
      }
      throw new Error('Failed to retrieve recorded administration');
    } finally { setIsLoading(false); }
  }, []);

  const verifyAdministration = useCallback(async (administrationId: string) => {
    if (!isAuthenticated()) throw new Error('Please login first');
    try {
      await feedingApi.verify(administrationId);
      if (selectedPatient) {
        const response = await feedingApi.getAdministrations({ patientMrn: selectedPatient.mrn });
        if (response.success) setAdministrations(response.data.map(mapApiAdministrationToFeedingAdministration));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify administration');
    }
  }, [selectedPatient]);

  const clearSelectedPatient = useCallback(() => {
    setSelectedPatient(null);
    setPatientOrders([]);
    setAdministrations([]);
  }, []);

  return {
    patients, selectedPatient, patientOrders, administrations, isLoading, error, emrConnected,
    loadPatients, searchPatients, getPatientByMrn, selectPatient, clearSelectedPatient,
    recordAdministration, verifyAdministration, checkConnectivity,
  };
}
