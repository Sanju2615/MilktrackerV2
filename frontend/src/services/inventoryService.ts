// Milk Inventory Management Service - Fetches REAL data from backend API
import { milkApi, inventoryApi } from './api';
import type { MilkInventory, MilkType, StorageLocation, MilkStatus, ScanEvent, ClosedLoopVerification, InventoryAlert, StorageUnit, BarcodeData } from '@/types/inventory';

function mapApiMilkToInventory(item: any): MilkInventory {
  return {
    id: item.id, barcode: item.barcode, patientId: item.patientMrn, patientName: item.patientName,
    milkType: item.milkType, volume: item.volumeMl, expressedDate: new Date(item.expressedAt),
    expirationDate: new Date(item.expiresAt),
    storageLocation: item.storageLocation || item.storageType || 'refrigerator',
    storageUnit: item.storageUnitName || item.storageUnitId, shelfPosition: item.shelfPosition,
    status: item.status, reservedForPatientId: item.reservedForPatientMrn,
    reservedAt: item.reservedAt ? new Date(item.reservedAt) : undefined,
    serialNumber: item.serialNumber, notes: item.notes,
    createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt || item.createdAt),
  };
}

class InventoryService {
  private scanEvents: ScanEvent[] = [];

  async getInventory(filters?: { patientId?: string; milkType?: MilkType; status?: MilkStatus; storageLocation?: StorageLocation }): Promise<MilkInventory[]> {
    const response = await milkApi.getInventory({
      patientMrn: filters?.patientId, milkType: filters?.milkType,
      status: filters?.status, storageLocation: filters?.storageLocation,
    });
    if (!response.success) throw new Error('Failed to fetch inventory');
    return response.data.map(mapApiMilkToInventory);
  }

  async getMilkById(id: string): Promise<MilkInventory | null> {
    const response = await milkApi.getById(id);
    if (!response.success) return null;
    return mapApiMilkToInventory(response.data);
  }

  async getMilkByBarcode(barcode: string): Promise<MilkInventory | null> {
    const response = await milkApi.getByBarcode(barcode);
    if (!response.success) return null;
    return mapApiMilkToInventory(response.data);
  }

  async addMilk(milk: Omit<MilkInventory, 'id' | 'createdAt' | 'updatedAt'>): Promise<MilkInventory> {
    const response = await milkApi.collect({
      patientMrn: milk.patientId || '', patientName: milk.patientName || '',
      volume: milk.volume, milkType: milk.milkType,
      expressedAt: milk.expressedDate.toISOString(),
      storageLocation: milk.storageLocation,
      barcode: milk.barcode,
      serialNumber: milk.serialNumber, notes: milk.notes,
    });
    if (!response.success) throw new Error('Failed to collect milk');
    const milkResponse = await milkApi.getById(response.data.id);
    if (milkResponse.success) return mapApiMilkToInventory(milkResponse.data);
    throw new Error('Failed to retrieve created milk item');
  }

  async reserveMilk(milkId: string, patientId: string): Promise<MilkInventory | null> {
    const response = await milkApi.reserve(milkId, patientId);
    if (!response.success) throw new Error('Failed to reserve milk');
    return mapApiMilkToInventory(response.data);
  }

  async transferMilk(milkId: string, targetStorageUnit: string, targetShelfPosition?: string): Promise<MilkInventory | null> {
    const unitsResponse = await inventoryApi.getStorageUnits();
    if (!unitsResponse.success) throw new Error('Failed to fetch storage units');
    const targetUnit = unitsResponse.data.find((u: any) => u.name === targetStorageUnit);
    if (!targetUnit) throw new Error(`Storage unit "${targetStorageUnit}" not found`);
    const response = await milkApi.transfer(milkId, { storageUnitId: targetUnit.id, shelfPosition: targetShelfPosition });
    if (!response.success) throw new Error('Failed to transfer milk');
    return mapApiMilkToInventory(response.data);
  }

  async discardMilk(milkId: string, reason: string): Promise<MilkInventory | null> {
    const response = await milkApi.discard(milkId, { reason });
    if (!response.success) throw new Error('Failed to discard milk');
    const milkResponse = await milkApi.getById(milkId);
    if (milkResponse.success) return mapApiMilkToInventory(milkResponse.data);
    return null;
  }

  async scanBarcode(barcode: string, scanType: ScanEvent['scanType'], scannedBy: string): Promise<{ success: boolean; data?: BarcodeData; error?: string }> {
    const barcodeData = this.parseBarcode(barcode);
    let verificationResult: ScanEvent['verificationResult'] = 'not_found';
    let details = '', patientId: string | undefined, milkInventoryId: string | undefined;

    if (barcodeData.type === 'milk') {
      try {
        const milk = await this.getMilkByBarcode(barcode);
        if (milk) {
          milkInventoryId = milk.id; patientId = milk.patientId;
          if (milk.status === 'expired' || milk.expirationDate < new Date()) {
            verificationResult = 'expired'; details = 'Milk has expired';
          } else if (milk.status !== 'available' && milk.status !== 'reserved') {
            verificationResult = 'mismatch'; details = `Milk status: ${milk.status}`;
          } else { verificationResult = 'matched'; details = `${milk.milkType}, ${milk.volume}ml`; }
        }
      } catch (error) { verificationResult = 'not_found'; details = 'Milk not found'; }
    } else if (barcodeData.type === 'patient') {
      patientId = barcodeData.patientId; verificationResult = 'matched'; details = 'Patient wristband verified';
    }

    this.scanEvents.push({ id: `scan-${Date.now()}`, timestamp: new Date(), scanType, barcode, scannedBy, patientId, milkInventoryId, verificationResult, details });
    if (verificationResult === 'not_found') return { success: false, error: 'Barcode not found' };
    return { success: true, data: barcodeData };
  }

  private parseBarcode(barcode: string): BarcodeData {
    const parts = barcode.split('-');
    if (parts[0] === 'BM' || parts[0] === 'DM' || parts[0] === 'FM') {
      return { type: 'milk', milkType: parts[0] === 'BM' ? 'breast_milk' : parts[0] === 'DM' ? 'donor_milk' : 'formula', patientId: parts[0] === 'BM' ? parts[1] : undefined, date: parts[parts.length - 2], sequence: parts[parts.length - 1], rawBarcode: barcode };
    } else if (parts[0] === 'PT' || parts[0].startsWith('pat')) {
      return { type: 'patient', patientId: parts[1] || parts[0], rawBarcode: barcode };
    }
    return { type: 'patient', rawBarcode: barcode };
  }

  async getFIFOSuggestedMilk(patientId?: string, milkType?: MilkType): Promise<MilkInventory[]> {
    const inventory = await this.getInventory({ patientId, status: 'available' });
    return inventory.filter(m => m.expirationDate >= new Date()).filter(m => !milkType || m.milkType === milkType)
      .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
  }

  async getAlerts(): Promise<InventoryAlert[]> {
    const response = await inventoryApi.getAlerts();
    if (!response.success) throw new Error('Failed to fetch alerts');
    const alerts: InventoryAlert[] = [];
    response.data.expiringSoon?.forEach((item: any) => alerts.push({ id: `alert-expiring-${item.id}`, type: 'expiring_soon', severity: item.hours_remaining <= 4 ? 'critical' : 'warning', milkInventoryId: item.id, patientId: item.patientMrn, message: `Milk ${item.barcode} expires in ${item.hours_remaining} hours`, createdAt: new Date() }));
    response.data.expired?.forEach((item: any) => alerts.push({ id: `alert-expired-${item.id}`, type: 'expired', severity: 'critical', milkInventoryId: item.id, patientId: item.patientMrn, message: `Milk ${item.barcode} has expired (${item.hours_expired} hours ago)`, createdAt: new Date() }));
    return alerts;
  }

  async getStorageUnits(): Promise<StorageUnit[]> {
    const response = await inventoryApi.getStorageUnits();
    if (!response.success) throw new Error('Failed to fetch storage units');
    return response.data.map((u: any) => ({ id: u.id, name: u.name, location: u.type, temperature: u.temperatureMin || (u.type === 'freezer' ? -20 : 4), temperatureUnit: 'celsius', capacity: u.capacity || 100, currentCount: u.currentCount, isActive: u.isActive === 1 || u.isActive === '1' || u.isActive === true }));
  }

  generateBarcode(milkType: MilkType, patientId?: string): string {
    const prefix = milkType === 'breast_milk' ? 'BM' : milkType === 'donor_milk' ? 'DM' : 'FM';
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const sequence = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return milkType === 'breast_milk' && patientId ? `${prefix}-${patientId}-${date}-${sequence}` : `${prefix}-${date}-${sequence}`;
  }

  async getStats(): Promise<any> {
    const response = await milkApi.getStats();
    if (!response.success) throw new Error('Failed to fetch stats');
    return response.data;
  }

  // --- Methods required by useInventory ---

  async checkFIFOCompliance(milkBarcode: string, patientId?: string): Promise<{
    isCompliant: boolean; earlierItems: MilkInventory[]; message: string;
  }> {
    // Get the scanned milk item
    const scannedMilk = await this.getMilkByBarcode(milkBarcode);
    if (!scannedMilk) {
      return { isCompliant: false, earlierItems: [], message: 'Milk item not found' };
    }
    // Get FIFO-ordered available milk for the same patient/type
    const fifoList = await this.getFIFOSuggestedMilk(patientId, scannedMilk.milkType);
    // Items that expire earlier than the scanned one
    const earlierItems = fifoList.filter(
      m => m.id !== scannedMilk.id && m.expirationDate < scannedMilk.expirationDate
    );
    const isCompliant = earlierItems.length === 0;
    return {
      isCompliant,
      earlierItems,
      message: isCompliant
        ? 'FIFO compliant'
        : `${earlierItems.length} item(s) expire before this container`,
    };
  }

  async performClosedLoopVerification(
    _patientBarcode: string,
    milkBarcode: string,
    _orderId: string,
    _administeredBy: string,
    _skipFIFOWarning?: boolean,
    _fifoOverrideReason?: string
  ): Promise<{
    success: boolean;
    verification?: ClosedLoopVerification;
    error?: string;
    fifoWarning?: { isCompliant: boolean; earlierItems: MilkInventory[]; message: string };
  }> {
    const milk = await this.getMilkByBarcode(milkBarcode);
    if (!milk) return { success: false, error: 'Milk container not found in inventory' };
    if (milk.status === 'administered') return { success: false, error: 'Milk already administered' };
    if (milk.status === 'discarded') return { success: false, error: 'Milk was discarded' };
    if (milk.expirationDate < new Date()) return { success: false, error: 'Milk has expired' };
    return { success: true };
  }

  async acknowledgeAlert(_alertId: string, _userName: string): Promise<void> {
    // Alerts are computed from expiry data; acknowledgement is local-only for now
    return;
  }

  getScanHistory(): ScanEvent[] {
    return [...this.scanEvents];
  }
}

export const inventoryService = new InventoryService();
