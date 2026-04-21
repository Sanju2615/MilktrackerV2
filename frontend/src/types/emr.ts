// FHIR/EMR Integration Types for HIMSS 6 Compliance

export interface EMRPatient {
  id: string;
  mrn: string; // Medical Record Number
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other' | 'unknown';
  roomNumber?: string;
  bedNumber?: string;
  admissionDate?: Date;
  attendingPhysician?: string;
  motherName?: string;
  gestationalAgeAtBirth?: number; // in weeks
  birthWeight?: number; // in grams
  currentWeight?: number; // in grams
  allergies?: string[];
  isActive: boolean;
}

export interface FeedingOrder {
  id: string;
  patientId: string;
  orderId: string; // EMR Order ID
  orderedBy: string; // Physician ID/Name
  orderedAt: Date;
  feedingType: 'breast' | 'bottle' | 'gavage' | 'ng_tube' | 'og_tube';
  route?: 'oral' | 'ng_tube' | 'og_tube' | 'gastrostomy';
  volume?: number; // in ml
  frequency: string; // e.g., "q3h", "on demand", "prn"
  duration?: string; // e.g., "15 min each breast"
  fortification?: {
    type: string;
    amount: string;
  };
  specialInstructions?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  status: 'active' | 'on-hold' | 'cancelled' | 'completed';
  priority: 'routine' | 'urgent' | 'stat';
}

export interface FeedingAdministration {
  id: string;
  orderId: string;
  patientId: string;
  administeredBy: string; // Nurse/Provider ID
  administeredAt: Date;
  scheduledTime: Date;
  feedingType: string;
  volumeGiven?: number;
  volumeOrdered?: number;
  tolerance: 'well-tolerated' | 'minimal-residue' | 'moderate-residue' | 'poorly-tolerated';
  residuals?: number; // in ml
  emesis?: boolean;
  emesisAmount?: number;
  stool?: 'none' | 'normal' | 'loose' | 'watery';
  weight?: number;
  notes?: string;
  verificationMethod: 'barcode' | 'manual';
  verifiedBy?: string; // Second nurse verification for HIMSS 6
  status: 'administered' | 'refused' | 'held' | 'missed';
}

export interface ClosedLoopConfirmation {
  patientId: string;
  orderId: string;
  administrationId: string;
  timestamp: Date;
  status: 'confirmed' | 'rejected' | 'pending';
  message: string;
  hl7Message?: string; // Raw HL7 message sent to EMR
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: 'login' | 'logout' | 'view_patient' | 'create_order' | 'modify_order' | 'cancel_order' | 'administer_feeding' | 'verify_administration' | 'export_data';
  patientId?: string;
  orderId?: string;
  details: string;
  ipAddress?: string;
  sessionId?: string;
}

export interface ClinicalAlert {
  id: string;
  patientId: string;
  type: 'weight_gain' | 'feeding_tolerance' | 'volume_exceeded' | 'frequency_alert' | 'allergy';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  triggeredAt: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  relatedOrderId?: string;
}

// HL7 FHIR Resource Types
export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  identifier: Array<{
    system: string;
    value: string;
  }>;
  name: Array<{
    given: string[];
    family: string;
  }>;
  gender: string;
  birthDate: string;
  extension?: Array<{
    url: string;
    valueString?: string;
    valueInteger?: number;
  }>;
}

export interface FHIROrder {
  resourceType: 'ServiceRequest';
  id: string;
  status: string;
  intent: string;
  subject: {
    reference: string;
  };
  authoredOn: string;
  requester: {
    reference: string;
    display: string;
  };
  code: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
    text: string;
  };
  occurrenceTiming?: {
    repeat: {
      frequency: number;
      period: number;
      periodUnit: string;
    };
  };
  dosageInstruction?: Array<{
    text: string;
    route?: {
      coding: Array<{
        display: string;
      }>;
    };
  }>;
}
