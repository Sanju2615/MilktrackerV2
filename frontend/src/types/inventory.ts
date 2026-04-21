// Milk Inventory Management Types for HIMSS 6 Compliance

export type MilkType = 'breast_milk' | 'donor_milk' | 'formula';
export type StorageLocation = 'freezer' | 'refrigerator' | 'room_temp';
export type MilkStatus = 'available' | 'reserved' | 'administered' | 'expired' | 'discarded';

export interface MilkInventory {
  id: string;
  barcode: string; // Unique barcode for scanning
  patientId?: string; // If mother's own milk
  patientName?: string; // Mother's name
  milkType: MilkType;
  volume: number; // in ml
  expressedDate: Date;
  expirationDate: Date;
  storageLocation: StorageLocation;
  storageUnit?: string; // e.g., "Freezer-A", "Fridge-2"
  shelfPosition?: string; // e.g., "Shelf-3", "Bin-B"
  fortification?: {
    type: string;
    amount: string;
  };
  status: MilkStatus;
  reservedForPatientId?: string;
  administeredAt?: Date;
  administeredBy?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanEvent {
  id: string;
  timestamp: Date;
  scanType: 'baby_wristband' | 'milk_container' | 'order_verification';
  barcode: string;
  scannedBy: string;
  patientId?: string;
  milkInventoryId?: string;
  orderId?: string;
  verificationResult: 'matched' | 'mismatch' | 'expired' | 'not_found';
  details?: string;
}

export interface ClosedLoopVerification {
  id: string;
  timestamp: Date;
  patientId: string;
  patientBarcode: string;
  milkInventoryId: string;
  milkBarcode: string;
  orderId: string;
  administeredBy: string;
  verificationSteps: {
    babyScanned: boolean;
    milkScanned: boolean;
    orderMatched: boolean;
    expirationChecked: boolean;
    patientMatched: boolean;
  };
  status: 'verified' | 'failed' | 'pending_second_verification';
  secondVerifier?: string;
  notes?: string;
}

export interface InventoryAlert {
  id: string;
  type: 'expiring_soon' | 'expired' | 'low_inventory' | 'storage_full' | 'temperature_alert';
  severity: 'info' | 'warning' | 'critical';
  milkInventoryId?: string;
  patientId?: string;
  message: string;
  createdAt: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface StorageUnit {
  id: string;
  name: string;
  location: StorageLocation;
  temperature?: number;
  temperatureUnit: 'celsius' | 'fahrenheit';
  capacity: number;
  currentCount: number;
  isActive: boolean;
  lastCheckedAt?: Date;
  lastCheckedBy?: string;
}

// Barcode format: TYPE-PATIENTID-DATE-SEQUENCE
// Example: BM-123456-20250401-001 (Breast Milk, Patient 123456, April 1 2025, sequence 001)
export interface BarcodeData {
  type: 'milk' | 'patient';
  milkType?: MilkType;
  patientId?: string;
  sequence?: string;
  date?: string;
  rawBarcode: string;
}

// FIFO Check Result for HIMSS 6 Compliance
export interface FIFOCheckResult {
  isFIFOCompliant: boolean;
  selectedMilk: MilkInventory;
  earlierExpiryItems: MilkInventory[];
  message: string;
  recommendedMilk?: MilkInventory;
}

// Administration with FIFO validation
export interface AdministrationRequest {
  patientBarcode: string;
  milkBarcode: string;
  orderId: string;
  administeredBy: string;
  skipFIFOWarning?: boolean; // For override scenarios
  overrideReason?: string;
}
