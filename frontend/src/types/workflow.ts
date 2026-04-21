// Human Milk Closed Loop Workflow Types
// Based on HIMSS 6 and best practices from NICU research

export type WorkflowStage = 
  | 'collection'      // Milk received from mother/donor
  | 'storage'         // In freezer/refrigerator
  | 'preparation'     // Thawing, warming, fortifying
  | 'ready'           // Prepared and ready for administration
  | 'administered'    // Given to baby
  | 'discarded';      // Expired or contaminated

export type PreparationStep = 
  | 'retrieval'       // Retrieved from storage
  | 'thaw'            // Thawing frozen milk
  | 'warm'            // Warming to body temperature
  | 'fortify'         // Adding fortifiers
  | 'label'           // Labeling prepared feeding
  | 'verify';         // Final verification before admin

export type MilkTemperature = 
  | 'frozen'          // -20°C freezer
  | 'refrigerated'    // 4°C refrigerator
  | 'room_temp'       // 20-25°C
  | 'body_temp';      // 37°C warmed

export interface MilkPreparation {
  id: string;
  milkInventoryId: string;
  barcode: string;
  patientId: string;
  patientName: string;
  
  // Original milk info
  originalVolume: number;
  milkType: string;
  
  // Preparation steps
  steps: {
    retrieval: {
      completed: boolean;
      completedAt?: Date;
      completedBy?: string;
      storageLocation: string;
    };
    thaw?: {
      completed: boolean;
      completedAt?: Date;
      completedBy?: string;
      method: 'refrigerator' | 'water_bath' | 'warmer';
      startedAt?: Date;
      thawTimeMinutes?: number;
    };
    warm?: {
      completed: boolean;
      completedAt?: Date;
      completedBy?: string;
      method: 'waterless_warmer' | 'water_bath';
      targetTemp: number;
      actualTemp?: number;
    };
    fortify?: {
      completed: boolean;
      completedAt?: Date;
      completedBy?: string;
      fortifierType: string;
      fortifierAmount: string;
      targetCaloricDensity: string;
      verifiedBy?: string; // Two-person verification
    };
    label: {
      completed: boolean;
      completedAt?: Date;
      completedBy?: string;
      labelBarcode: string;
    };
    verify: {
      completed: boolean;
      completedAt?: Date;
      verifiedBy: string;
      secondVerifier?: string;
    };
  };
  
  // Final prepared feeding
  preparedVolume: number;
  caloricDensity?: string;
  route: 'oral' | 'ng_tube' | 'og_tube' | 'gavage';
  
  // Timing
  preparedAt?: Date;
  expiresAt?: Date;
  administeredAt?: Date;
  
  // Status
  status: 'in_progress' | 'completed' | 'discarded';
  notes?: string;
}

export interface MilkCollection {
  id: string;
  barcode: string;
  patientId: string;
  patientName: string;
  patientMRN: string;
  
  // Collection info
  collectedAt: Date;
  collectedBy?: string; // Mother or staff
  collectionMethod: 'pumping' | 'hand_expression' | 'donor';
  
  // Milk details
  milkType: 'breast_milk' | 'donor_milk' | 'formula';
  volume: number;
  
  // Storage info at collection
  initialStorage: 'freezer' | 'refrigerator';
  
  // Labeling
  labelPrinted: boolean;
  labelPrintedAt?: Date;
  labelPrintedBy?: string;
  
  // Inventory
  addedToInventory: boolean;
  inventoryId?: string;
  
  // Metadata
  expressedDate: Date;
  notes?: string;
  createdAt: Date;
}

// Fortification recipes based on research
export const FORTIFICATION_RECIPES = {
  '22_kcal_oz': {
    name: '22 kcal/oz',
    description: 'Standard fortification',
    recipe: '50ml breast milk + 1 packet (5ml) Human Milk Fortifier',
    calories: 22,
  },
  '24_kcal_oz': {
    name: '24 kcal/oz',
    description: 'High fortification',
    recipe: '25ml breast milk + 1 packet (5ml) Human Milk Fortifier',
    calories: 24,
  },
  'neosure_22': {
    name: 'Neosure 22 kcal/oz',
    description: 'Formula powder fortification',
    recipe: '3 oz breast milk + 0.5 tsp Neosure powder',
    calories: 22,
  },
  'neosure_24': {
    name: 'Neosure 24 kcal/oz',
    description: 'High formula fortification',
    recipe: '3 oz breast milk + 1 tsp Neosure powder',
    calories: 24,
  },
} as const;

// Storage time limits based on research
export const STORAGE_LIMITS = {
  breast_milk: {
    frozen: { days: 90, description: '3 months in freezer' },
    refrigerated: { days: 5, description: '5 days in refrigerator' },
    room_temp: { hours: 4, description: '4 hours at room temperature' },
    thawed_refrigerated: { hours: 24, description: '24 hours after thawing' },
    fortified: { hours: 24, description: '24 hours after fortification' },
    warmed: { hours: 1, description: '1 hour after warming' },
  },
  donor_milk: {
    frozen: { days: 90, description: '3 months in freezer' },
    refrigerated: { days: 4, description: '4 days in refrigerator' },
    thawed_refrigerated: { hours: 24, description: '24 hours after thawing' },
  },
  formula: {
    refrigerated: { hours: 24, description: '24 hours after preparation' },
    room_temp: { hours: 2, description: '2 hours at room temperature' },
  },
} as const;

// Workflow validation rules
export interface WorkflowValidation {
  canPrepare: boolean;
  canAdminister: boolean;
  warnings: string[];
  errors: string[];
}
