// EMR/TrakCare Integration Service - Fetches REAL data from backend API
import { trakcareApi, feedingApi } from './api';
import type { EMRPatient, FeedingOrder, FeedingAdministration, ClosedLoopConfirmation } from '@/types/emr';

function mapTrakCareBabyToPatient(baby: any): EMRPatient {
  return {
    id: baby.mrn, mrn: baby.mrn, firstName: baby.firstName, lastName: baby.lastName,
    dateOfBirth: new Date(baby.dateOfBirth), gender: baby.gender,
    roomNumber: baby.roomNumber, bedNumber: baby.bedNumber,
    admissionDate: baby.admissionDate ? new Date(baby.admissionDate) : undefined,
    attendingPhysician: baby.attendingPhysician, motherName: baby.motherName,
    gestationalAgeAtBirth: baby.gestationalAgeAtBirth, birthWeight: baby.birthWeight,
    currentWeight: baby.currentWeight, isActive: baby.isActive === 1 || baby.isActive === '1' || baby.isActive === true,
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

class EMRService {
  async getPatients(): Promise<EMRPatient[]> {
    const response = await trakcareApi.getBabies({ isActive: true });
    if (!response.success) throw new Error('Failed to fetch patients from TrakCare');
    return response.data.map(mapTrakCareBabyToPatient);
  }

  async getPatient(mrn: string): Promise<EMRPatient | null> {
    const response = await trakcareApi.getBabyByMrn(mrn);
    if (!response.success) return response.message?.includes('not found') ? null : null;
    return mapTrakCareBabyToPatient(response.data);
  }

  async searchPatients(searchTerm: string): Promise<EMRPatient[]> {
    const response = await trakcareApi.getBabies({ search: searchTerm });
    if (!response.success) throw new Error('Failed to search patients');
    return response.data.map(mapTrakCareBabyToPatient);
  }

  async getFeedingOrders(patientMrn: string): Promise<FeedingOrder[]> {
    const response = await trakcareApi.getPatientOrders(patientMrn, 'active');
    if (!response.success) throw new Error('Failed to fetch feeding orders');
    return response.data.map(mapTrakCareOrderToFeedingOrder);
  }

  async recordAdministration(admin: Omit<FeedingAdministration, 'id'>): Promise<FeedingAdministration> {
    const response = await feedingApi.administer({
      patientMrn: admin.patientId, patientName: admin.patientName || '',
      milkInventoryId: admin.milkInventoryId, milkBarcode: admin.milkBarcode,
      orderId: admin.orderId, volumeGiven: admin.volumeGiven,
      feedingType: admin.feedingType, notes: admin.notes,
    });
    if (!response.success) throw new Error('Failed to record feeding administration');
    const adminResponse = await feedingApi.getAdministrations({ patientMrn: admin.patientId });
    if (adminResponse.success && adminResponse.data.length > 0) {
      return mapApiAdministrationToFeedingAdministration(adminResponse.data[0]);
    }
    throw new Error('Failed to retrieve recorded administration');
  }

  async getAdministrationHistory(patientId: string): Promise<FeedingAdministration[]> {
    const response = await feedingApi.getAdministrations({ patientMrn: patientId });
    if (!response.success) throw new Error('Failed to fetch administration history');
    return response.data.map(mapApiAdministrationToFeedingAdministration);
  }

  async verifyAdministration(administrationId: string): Promise<void> {
    const response = await feedingApi.verify(administrationId);
    if (!response.success) throw new Error('Failed to verify administration');
  }

  async checkConnectivity(): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await trakcareApi.checkHealth();
      return { connected: response.success, message: response.success ? 'Connected to TrakCare' : 'TrakCare connection failed' };
    } catch (error) {
      return { connected: false, message: error instanceof Error ? error.message : 'TrakCare connection failed' };
    }
  }
}

export const emrService = new EMRService();
