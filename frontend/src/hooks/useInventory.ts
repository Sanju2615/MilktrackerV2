import { useState, useEffect, useCallback } from 'react';
import { inventoryService } from '@/services/inventoryService';
import { auditService } from '@/services/auditService';
import type { 
  MilkInventory, 
  ScanEvent, 
  ClosedLoopVerification, 
  InventoryAlert,
  StorageUnit,
  MilkType,
  StorageLocation,
  MilkStatus
} from '@/types/inventory';

const CURRENT_USER = {
  id: 'user-001',
  name: 'Nurse Johnson',
};

export function useInventory() {
  const [inventory, setInventory] = useState<MilkInventory[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastScan, setLastScan] = useState<{ barcode: string; type: string; success: boolean } | null>(null);

  // Load inventory
  const loadInventory = useCallback(async (filters?: {
    patientId?: string;
    milkType?: MilkType;
    status?: MilkStatus;
    storageLocation?: StorageLocation;
  }) => {
    setIsLoading(true);
    try {
      const data = await inventoryService.getInventory(filters);
      setInventory(data);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load alerts
  const loadAlerts = useCallback(async () => {
    try {
      const data = await inventoryService.getAlerts();
      setAlerts(data);
    } catch (error) {
      console.error('Error loading alerts:', error);
    }
  }, []);

  // Load storage units
  const loadStorageUnits = useCallback(async () => {
    try {
      const data = await inventoryService.getStorageUnits();
      setStorageUnits(data);
    } catch (error) {
      console.error('Error loading storage units:', error);
    }
  }, []);

  // Scan barcode
  const scanBarcode = useCallback(async (
    barcode: string, 
    scanType: ScanEvent['scanType']
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const result = await inventoryService.scanBarcode(
        barcode, 
        scanType, 
        CURRENT_USER.name
      );
      
      setLastScan({ barcode, type: scanType, success: result.success });
      
      // Refresh scan history
      const history = await inventoryService.getScanHistory();
      setScanHistory(history);

      auditService.log({
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        action: 'verify_administration',
        details: `Scanned ${scanType}: ${barcode} - ${result.success ? 'Success' : 'Failed'}`,
      });

      return { success: result.success, error: result.error };
    } catch (error) {
      return { success: false, error: 'Scan failed' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check FIFO compliance
  const checkFIFOCompliance = useCallback(async (
    milkBarcode: string,
    patientId?: string
  ): Promise<{ isCompliant: boolean; earlierItems: MilkInventory[]; message: string }> => {
    try {
      return await inventoryService.checkFIFOCompliance(milkBarcode, patientId);
    } catch (error) {
      console.error('Error checking FIFO compliance:', error);
      return { isCompliant: false, earlierItems: [], message: 'FIFO check failed' };
    }
  }, []);

  // Get FIFO-suggested milk
  const getFIFOSuggestedMilk = useCallback(async (
    patientId?: string,
    milkType?: MilkType
  ): Promise<MilkInventory[]> => {
    try {
      return await inventoryService.getFIFOSuggestedMilk(patientId, milkType);
    } catch (error) {
      console.error('Error getting FIFO suggested milk:', error);
      return [];
    }
  }, []);

  // Perform closed-loop verification with FIFO check
  const performClosedLoop = useCallback(async (
    patientBarcode: string,
    milkBarcode: string,
    orderId: string,
    skipFIFOWarning?: boolean,
    fifoOverrideReason?: string
  ): Promise<{ 
    success: boolean; 
    verification?: ClosedLoopVerification; 
    error?: string;
    fifoWarning?: {
      isCompliant: boolean;
      earlierItems: MilkInventory[];
      message: string;
    };
  }> => {
    setIsLoading(true);
    try {
      const result = await inventoryService.performClosedLoopVerification(
        patientBarcode,
        milkBarcode,
        orderId,
        CURRENT_USER.name,
        skipFIFOWarning,
        fifoOverrideReason
      );

      if (result.success && result.verification) {
        // Refresh inventory
        await loadInventory();
        
        auditService.log({
          userId: CURRENT_USER.id,
          userName: CURRENT_USER.name,
          action: 'administer_feeding',
          details: `Closed-loop verification passed: Patient ${patientBarcode}, Milk ${milkBarcode}${skipFIFOWarning ? ' (FIFO override)' : ''}`,
        });
      }

      return result;
    } catch (error) {
      return { success: false, error: 'Verification failed' };
    } finally {
      setIsLoading(false);
    }
  }, [loadInventory]);

  // Add milk to inventory
  const addMilk = useCallback(async (milk: Omit<MilkInventory, 'id' | 'createdAt' | 'updatedAt'>) => {
    setIsLoading(true);
    try {
      const newMilk = await inventoryService.addMilk(milk);
      await loadInventory();
      
      auditService.log({
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        action: 'create_order',
        patientId: milk.patientId,
        details: `Added milk to inventory: ${newMilk.barcode}, ${newMilk.volume}ml`,
      });
      
      return newMilk;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [loadInventory]);

  // Discard milk
  const discardMilk = useCallback(async (milkId: string, reason: string) => {
    setIsLoading(true);
    try {
      await inventoryService.discardMilk(milkId, reason);
      await loadInventory();
      await loadAlerts();
      
      auditService.log({
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        action: 'cancel_order',
        details: `Discarded milk: ${milkId}, Reason: ${reason}`,
      });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [loadInventory, loadAlerts]);

  // Transfer milk between storage units
  const transferMilk = useCallback(async (milkId: string, targetStorageUnit: string, targetShelfPosition?: string) => {
    setIsLoading(true);
    try {
      await inventoryService.transferMilk(milkId, targetStorageUnit, targetShelfPosition);
      await loadInventory();
      await loadStorageUnits();
      
      auditService.log({
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        action: 'modify_order',
        details: `Transferred milk ${milkId} to ${targetStorageUnit}${targetShelfPosition ? ` (${targetShelfPosition})` : ''}`,
      });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [loadInventory, loadStorageUnits]);

  // Reserve milk for patient
  const reserveMilk = useCallback(async (milkId: string, patientId: string) => {
    setIsLoading(true);
    try {
      await inventoryService.reserveMilk(milkId, patientId);
      await loadInventory();
      
      auditService.log({
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        action: 'modify_order',
        details: `Reserved milk ${milkId} for patient ${patientId}`,
      });
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [loadInventory]);

  // Get milk history/audit trail
  const getMilkHistory = useCallback(async (milkId: string): Promise<MilkInventory | null> => {
    try {
      return await inventoryService.getMilkById(milkId);
    } catch (error) {
      console.error('Error getting milk history:', error);
      return null;
    }
  }, []);

  // Acknowledge alert
  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await inventoryService.acknowledgeAlert(alertId, CURRENT_USER.name);
      await loadAlerts();
    } catch (error) {
      throw error;
    }
  }, [loadAlerts]);

  // Generate barcode
  const generateBarcode = useCallback((milkType: MilkType, patientId?: string) => {
    return inventoryService.generateBarcode(milkType, patientId);
  }, []);

  // Initial load
  useEffect(() => {
    loadInventory();
    loadAlerts();
    loadStorageUnits();
  }, [loadInventory, loadAlerts, loadStorageUnits]);

  return {
    inventory,
    alerts,
    storageUnits,
    scanHistory,
    isLoading,
    lastScan,
    loadInventory,
    loadAlerts,
    scanBarcode,
    checkFIFOCompliance,
    getFIFOSuggestedMilk,
    performClosedLoop,
    addMilk,
    discardMilk,
    transferMilk,
    reserveMilk,
    getMilkHistory,
    acknowledgeAlert,
    generateBarcode,
  };
}
