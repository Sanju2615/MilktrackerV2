import { useState, useEffect, useCallback } from 'react';
import { milkApi, inventoryApi } from '@/services/api';
import type { FeedingSession, BabyInfo } from '@/types';
import type { MilkInventory, MilkType, StorageLocation, MilkStatus, InventoryAlert, StorageUnit } from '@/types/inventory';

const FEEDINGS_KEY = 'milk_tracker_feedings';
const BABY_INFO_KEY = 'milk_tracker_baby';

export function useStorage() {
  const [feedings, setFeedings] = useState<FeedingSession[]>([]);
  const [babyInfo, setBabyInfo] = useState<BabyInfo | null>(null);
  const [inventory, setInventory] = useState<MilkInventory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load local data on mount
  useEffect(() => {
    try {
      const savedFeedings = localStorage.getItem(FEEDINGS_KEY);
      const savedBabyInfo = localStorage.getItem(BABY_INFO_KEY);
      if (savedFeedings) {
        const parsed = JSON.parse(savedFeedings);
        setFeedings(parsed.map((f: FeedingSession) => ({ ...f, startTime: new Date(f.startTime), endTime: f.endTime ? new Date(f.endTime) : undefined })));
      }
      if (savedBabyInfo) {
        const parsed = JSON.parse(savedBabyInfo);
        setBabyInfo({ ...parsed, birthDate: new Date(parsed.birthDate) });
      }
    } catch (error) { console.error('Error loading local data:', error); }
    setIsLoaded(true);
  }, []);

  // Check if authenticated
  const isAuthenticated = () => !!localStorage.getItem('auth_token');

  // Load inventory from API
  const loadInventory = useCallback(async (filters?: { patientId?: string; milkType?: MilkType; status?: MilkStatus; storageLocation?: StorageLocation }) => {
    if (!isAuthenticated()) { setError('Please login first'); return []; }
    setIsLoading(true); setError(null);
    try {
      const response = await milkApi.getInventory({
        patientMrn: filters?.patientId, milkType: filters?.milkType,
        status: filters?.status, storageLocation: filters?.storageLocation,
      });
      if (response.success) {
        const data = response.data.map((item: any) => ({
          id: item.id, barcode: item.barcode, patientId: item.patientMrn, patientName: item.patientName,
          milkType: item.milkType, volume: item.volumeMl, expressedDate: new Date(item.expressedAt),
          expirationDate: new Date(item.expiresAt), storageLocation: item.storageLocation,
          storageUnit: item.storageUnitName || item.storageUnitId, shelfPosition: item.shelfPosition,
          status: item.status, reservedForPatientId: item.reservedForPatientMrn,
          reservedAt: item.reservedAt ? new Date(item.reservedAt) : undefined,
          serialNumber: item.serialNumber, notes: item.notes,
          createdAt: new Date(item.createdAt), updatedAt: new Date(item.createdAt),
        }));
        setInventory(data);
        return data;
      }
      return [];
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
      return [];
    } finally { setIsLoading(false); }
  }, []);

  // Get milk by barcode
  const getMilkByBarcode = useCallback(async (barcode: string): Promise<MilkInventory | null> => {
    if (!isAuthenticated()) return null;
    try {
      const response = await milkApi.getByBarcode(barcode);
      if (!response.success) return null;
      const item = response.data;
      return {
        id: item.id, barcode: item.barcode, patientId: item.patientMrn, patientName: item.patientName,
        milkType: item.milkType, volume: item.volumeMl, expressedDate: new Date(item.expressedAt),
        expirationDate: new Date(item.expiresAt), storageLocation: item.storageLocation,
        storageUnit: item.storageUnitName || item.storageUnitId, shelfPosition: item.shelfPosition,
        status: item.status, reservedForPatientId: item.reservedForPatientMrn,
        reservedAt: item.reservedAt ? new Date(item.reservedAt) : undefined,
        serialNumber: item.serialNumber, notes: item.notes,
        createdAt: new Date(item.createdAt), updatedAt: new Date(item.createdAt),
      };
    } catch (err) { return null; }
  }, []);

  // Collect milk
  const collectMilk = useCallback(async (data: { patientMrn: string; patientName: string; volume: number; milkType: 'breast_milk' | 'donor_milk' | 'formula'; expressedAt: string; storageLocation: 'freezer' | 'refrigerator'; notes?: string }) => {
    if (!isAuthenticated()) throw new Error('Please login first');
    setIsLoading(true);
    try {
      const response = await milkApi.collect(data);
      if (!response.success) throw new Error(response.message || 'Failed to collect milk');
      await loadInventory();
      return response.data;
    } finally { setIsLoading(false); }
  }, [loadInventory]);

  // Discard milk
  const discardMilk = useCallback(async (milkId: string, reason: string) => {
    if (!isAuthenticated()) throw new Error('Please login first');
    setIsLoading(true);
    try {
      const response = await milkApi.discard(milkId, { reason });
      if (response.success) await loadInventory();
    } finally { setIsLoading(false); }
  }, [loadInventory]);

  // Transfer milk
  const transferMilk = useCallback(async (milkId: string, targetStorageUnit: string, targetShelfPosition?: string) => {
    if (!isAuthenticated()) throw new Error('Please login first');
    setIsLoading(true);
    try {
      const unitsResponse = await inventoryApi.getStorageUnits();
      if (!unitsResponse.success) throw new Error('Failed to fetch storage units');
      const targetUnit = unitsResponse.data.find((u: any) => u.name === targetStorageUnit);
      if (!targetUnit) throw new Error(`Storage unit "${targetStorageUnit}" not found`);
      await milkApi.transfer(milkId, { storageUnitId: targetUnit.id, shelfPosition: targetShelfPosition });
      await loadInventory();
    } finally { setIsLoading(false); }
  }, [loadInventory]);

  // Save feedings to localStorage
  const saveFeedings = useCallback((newFeedings: FeedingSession[]) => {
    try { localStorage.setItem(FEEDINGS_KEY, JSON.stringify(newFeedings)); setFeedings(newFeedings); }
    catch (error) { console.error('Error saving feedings:', error); }
  }, []);

  // Save baby info to localStorage
  const saveBabyInfo = useCallback((info: BabyInfo) => {
    try { localStorage.setItem(BABY_INFO_KEY, JSON.stringify(info)); setBabyInfo(info); }
    catch (error) { console.error('Error saving baby info:', error); }
  }, []);

  // Add/update/delete feeding
  const addFeeding = useCallback((feeding: Omit<FeedingSession, 'id'>) => {
    const newFeeding: FeedingSession = { ...feeding, id: Date.now().toString() };
    saveFeedings([...feedings, newFeeding]);
    return newFeeding;
  }, [feedings, saveFeedings]);

  const updateFeeding = useCallback((id: string, updates: Partial<FeedingSession>) => {
    saveFeedings(feedings.map(f => f.id === id ? { ...f, ...updates } : f));
  }, [feedings, saveFeedings]);

  const deleteFeeding = useCallback((id: string) => {
    saveFeedings(feedings.filter(f => f.id !== id));
  }, [feedings, saveFeedings]);

  // Get alerts
  const getAlerts = useCallback(async (): Promise<InventoryAlert[]> => {
    if (!isAuthenticated()) return [];
    try {
      const response = await inventoryApi.getAlerts();
      if (!response.success) return [];
      const alerts: InventoryAlert[] = [];
      response.data.expiringSoon?.forEach((item: any) => alerts.push({
        id: `alert-expiring-${item.id}`, type: 'expiring_soon', severity: item.hours_remaining <= 4 ? 'critical' : 'warning',
        milkInventoryId: item.id, patientId: item.patientMrn, message: `Milk ${item.barcode} expires in ${item.hours_remaining} hours`, createdAt: new Date()
      }));
      response.data.expired?.forEach((item: any) => alerts.push({
        id: `alert-expired-${item.id}`, type: 'expired', severity: 'critical',
        milkInventoryId: item.id, patientId: item.patientMrn, message: `Milk ${item.barcode} has expired (${item.hours_expired} hours ago)`, createdAt: new Date()
      }));
      return alerts;
    } catch (err) { return []; }
  }, []);

  // Get storage units
  const getStorageUnits = useCallback(async (): Promise<StorageUnit[]> => {
    if (!isAuthenticated()) return [];
    try {
      const response = await inventoryApi.getStorageUnits();
      if (!response.success) return [];
      return response.data.map((u: any) => ({ id: u.id, name: u.name, location: u.type, temperature: u.temperatureMin || (u.type === 'freezer' ? -20 : 4), temperatureUnit: 'celsius', capacity: u.capacity || 100, currentCount: u.currentCount, isActive: u.isActive === 1 || u.isActive === '1' || u.isActive === true }));
    } catch (err) { return []; }
  }, []);

  // Get stats
  const getStats = useCallback(async () => {
    if (!isAuthenticated()) return null;
    try {
      const response = await milkApi.getStats();
      return response.success ? response.data : null;
    } catch (err) { return null; }
  }, []);

  return {
    feedings, babyInfo, isLoaded, addFeeding, updateFeeding, deleteFeeding, saveBabyInfo,
    inventory, isLoading, error, loadInventory, getMilkByBarcode, collectMilk, discardMilk, transferMilk, getAlerts, getStorageUnits, getStats,
  };
}
