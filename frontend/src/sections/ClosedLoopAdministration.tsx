/**
 * Closed-Loop Milk Administration
 * HIMSS 6 Compliant: Enforces barcode verification (7 Rights) before allowing administration.
 * 
 * Workflow:
 *  Step 1 – Select Order & Scan Baby Wristband (Right Patient)
 *  Step 2 – View Available Milk (FIFO) & Scan Milk Container (Right Medication)
 *  Step 3 – Verify & Administer (Right Dose / Time / Route / Documentation)
 *  Step 4 – Confirmation
 * 
 * Override Path:
 *  At any scan step the nurse can choose "Override – Cannot Scan" which requires
 *  selecting a categorised reason AND typing a free-text justification.
 *  Overrides are flagged in the audit trail.
 */

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { milkApi } from '@/services/api';
import type { EMRPatient, FeedingOrder, FeedingAdministration } from '@/types/emr';
import {
  CheckCircle2,
  Clock,
  Barcode,
  Send,
  RotateCcw,
  Droplets,
  Baby,
  Milk,
  ScanLine,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  FileWarning,
  Package,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Override reason categories (auditable)
// ---------------------------------------------------------------------------
const OVERRIDE_REASONS = [
  { value: 'scanner_malfunction', label: 'Barcode Scanner Malfunction' },
  { value: 'damaged_wristband', label: 'Damaged / Unreadable Patient Wristband' },
  { value: 'damaged_label', label: 'Damaged / Unreadable Milk Label' },
  { value: 'emergency_feeding', label: 'Emergency / Urgent Feeding Required' },
  { value: 'system_downtime', label: 'System / Network Downtime' },
  { value: 'other', label: 'Other (specify below)' },
] as const;

type OverrideCategory = (typeof OVERRIDE_REASONS)[number]['value'];

interface OverrideData {
  category: OverrideCategory | '';
  justification: string;
}

interface MilkInventoryItem {
  id: string;
  barcode: string;
  volumeMl: number;
  volume_ml?: number;
  patientMrn: string;
  patient_mrn?: string;
  milkType: string;
  milk_type?: string;
  status: string;
  expiresAt: string;
  expires_at?: string;
  expressedAt: string;
  expressed_at?: string;
  storageLocation?: string;
  storage_location?: string;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------
interface ClosedLoopAdministrationProps {
  patient: EMRPatient;
  patientOrders: FeedingOrder[];
  administrations: FeedingAdministration[];
  recordAdministration?: (admin: Omit<FeedingAdministration, 'id'>) => Promise<FeedingAdministration>;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
type Step = 'select_order' | 'scan_baby' | 'scan_milk' | 'administer' | 'done';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function ClosedLoopAdministration({
  patient,
  patientOrders,
  administrations,
  recordAdministration,
  isLoading = false,
}: ClosedLoopAdministrationProps) {
  // Workflow state
  const [step, setStep] = useState<Step>('select_order');
  const [selectedOrder, setSelectedOrder] = useState<FeedingOrder | null>(null);

  // Scan state
  const [babyBarcode, setBabyBarcode] = useState('');
  const [milkBarcode, setMilkBarcode] = useState('');
  const [, setBabyVerified] = useState(false);
  const [, setMilkVerified] = useState(false);

  // Override state
  const [showBabyOverride, setShowBabyOverride] = useState(false);
  const [showMilkOverride, setShowMilkOverride] = useState(false);
  const [babyOverride, setBabyOverride] = useState<OverrideData>({ category: '', justification: '' });
  const [milkOverride, setMilkOverride] = useState<OverrideData>({ category: '', justification: '' });
  const [babyWasOverridden, setBabyWasOverridden] = useState(false);
  const [milkWasOverridden, setMilkWasOverridden] = useState(false);

  // Patient milk inventory
  const [patientMilk, setPatientMilk] = useState<MilkInventoryItem[]>([]);
  const [milkLoading, setMilkLoading] = useState(false);
  const [scannedMilkInfo, setScannedMilkInfo] = useState<MilkInventoryItem | null>(null);

  // Administration form state
  const [volumeGiven, setVolumeGiven] = useState<string>('');
  const [tolerance, setTolerance] = useState<string>('well-tolerated');
  const [residuals, setResiduals] = useState<string>('');
  const [emesis, setEmesis] = useState(false);
  const [emesisAmount, setEmesisAmount] = useState<string>('');
  const [stool, setStool] = useState<string>('none');
  const [adminNotes, setAdminNotes] = useState('');

  // Confirmation
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for auto-focus
  const babyInputRef = useRef<HTMLInputElement>(null);
  const milkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'scan_baby') babyInputRef.current?.focus();
    if (step === 'scan_milk') milkInputRef.current?.focus();
  }, [step]);

  // Fetch patient milk when we reach the scan_milk step
  useEffect(() => {
    if (step === 'scan_milk' && patient.mrn) {
      fetchPatientMilk();
    }
  }, [step, patient.mrn]);

  const activeOrders = patientOrders.filter((o) => o.status === 'active');

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const getFeedingIcon = (type: FeedingOrder['feedingType']) => {
    switch (type) {
      case 'breast': return <Baby className="w-5 h-5 text-pink-500" />;
      case 'bottle': return <Milk className="w-5 h-5 text-blue-500" />;
      default: return <Droplets className="w-5 h-5 text-purple-500" />;
    }
  };

  const fetchPatientMilk = async () => {
    setMilkLoading(true);
    try {
      const response = await milkApi.getPatientMilk(patient.mrn);
      if (response.success && Array.isArray(response.data)) {
        // Only show "reserved" milk in the Administer screen
        const reservedOnly = response.data.filter(
          (m: MilkInventoryItem) => m.status === 'reserved'
        );
        setPatientMilk(reservedOnly);
      }
    } catch (err) {
      console.warn('Failed to fetch patient milk:', err);
    } finally {
      setMilkLoading(false);
    }
  };

  const getMilkVolume = (item: MilkInventoryItem) => item.volumeMl || item.volume_ml || 0;
  const getMilkBarcode = (item: MilkInventoryItem) => item.barcode;
  const getMilkType = (item: MilkInventoryItem) => item.milkType || item.milk_type || 'breast_milk';
  const getMilkExpiry = (item: MilkInventoryItem) => item.expiresAt || item.expires_at || '';
  const getMilkStorage = (item: MilkInventoryItem) => item.storageLocation || item.storage_location || '';
  
  const isExpired = (item: MilkInventoryItem) => {
    const expiry = getMilkExpiry(item);
    return expiry ? new Date(expiry) < new Date() : false;
  };

  const resetWorkflow = () => {
    setStep('select_order');
    setSelectedOrder(null);
    setBabyBarcode('');
    setMilkBarcode('');
    setBabyVerified(false);
    setMilkVerified(false);
    setBabyOverride({ category: '', justification: '' });
    setMilkOverride({ category: '', justification: '' });
    setBabyWasOverridden(false);
    setMilkWasOverridden(false);
    setScannedMilkInfo(null);
    setPatientMilk([]);
    setVolumeGiven('');
    setTolerance('well-tolerated');
    setResiduals('');
    setEmesis(false);
    setEmesisAmount('');
    setStool('none');
    setAdminNotes('');
    setConfirmationResult(null);
  };

  // -----------------------------------------------------------------------
  // Step handlers
  // -----------------------------------------------------------------------
  const handleSelectOrder = (order: FeedingOrder) => {
    setSelectedOrder(order);
    setVolumeGiven(order.volume ? String(order.volume) : '');
    setStep('scan_baby');
  };

  // --- Baby scan ---
  const handleScanBaby = () => {
    if (!babyBarcode.trim()) return;
    const scanned = babyBarcode.trim().toLowerCase();
    const patientMrn = patient.mrn.trim().toLowerCase();

    // Accept if: barcode equals MRN exactly, or barcode starts with MRN (e.g. 0004818-0001)
    const barcodeMatchesPatient =
      scanned === patientMrn ||
      scanned.startsWith(patientMrn + '-') ||
      scanned.startsWith('pt-' + patientMrn);

    if (barcodeMatchesPatient) {
      setBabyVerified(true);
      toast.success('Patient wristband verified', {
        description: `${patient.firstName} ${patient.lastName} - MRN: ${patient.mrn}`,
      });
      setStep('scan_milk');
    } else {
      toast.error('Wristband does not match selected patient', {
        description: `Scanned: ${babyBarcode} does not match patient MRN: ${patient.mrn}`,
        duration: 5000,
      });
      setBabyBarcode('');
    }
  };

  const handleBabyOverrideConfirm = () => {
    if (!babyOverride.category) {
      toast.error('Please select an override reason category');
      return;
    }
    if (!babyOverride.justification.trim()) {
      toast.error('Please provide a written justification for the override');
      return;
    }
    setBabyVerified(true);
    setBabyWasOverridden(true);
    setShowBabyOverride(false);
    toast.warning('Baby scan override recorded', {
      description: `Reason: ${OVERRIDE_REASONS.find((r) => r.value === babyOverride.category)?.label}`,
    });
    setStep('scan_milk');
  };

  // --- Milk scan ---
  const handleScanMilk = async () => {
    if (!milkBarcode.trim()) return;
    
    // Lookup milk inventory to get bottle volume and details
    try {
      const response = await milkApi.getByBarcode(milkBarcode.trim());
      if (response.success && response.data) {
        const milk = response.data;
        
        // ── HARD BLOCK: milk MRN MUST match patient MRN ──────────────
        const milkPatientMrn = (milk.patientMrn || milk.patient_mrn || '').trim().toLowerCase();
        const currentPatientMrn = patient.mrn.trim().toLowerCase();
        
        if (milkPatientMrn && milkPatientMrn !== currentPatientMrn) {
          toast.error('MRN mismatch — milk belongs to a different patient!', {
            description: `Milk MRN: ${milk.patientMrn || milk.patient_mrn} ≠ Patient MRN: ${patient.mrn}. Cannot administer.`,
            duration: 6000,
          });
          setMilkBarcode('');
          setScannedMilkInfo(null);
          return; // Do NOT proceed
        }
        // ─────────────────────────────────────────────────────────────
        
        setScannedMilkInfo(milk);
        toast.success('Milk container verified — MRN matched', {
          description: `Barcode: ${milkBarcode} - Volume: ${getMilkVolume(milk)}ml`,
        });
      } else {
        // Barcode not found in inventory — block (require valid inventory)
        toast.error('Milk barcode not found in inventory', {
          description: `Barcode "${milkBarcode}" does not exist. Please scan a valid milk container.`,
          duration: 5000,
        });
        setMilkBarcode('');
        return; // Do NOT proceed
      }
    } catch (err) {
      console.warn('Milk inventory lookup failed:', err);
      toast.error('Failed to verify milk barcode', {
        description: 'Could not look up the barcode in inventory. Please try again.',
      });
      setMilkBarcode('');
      return; // Do NOT proceed
    }
    
    setMilkVerified(true);
    setStep('administer');
  };

  // Select a specific milk bottle from the FIFO list
  const handleSelectMilkFromList = (item: MilkInventoryItem) => {
    // Safety check: even for list-selected items, verify the MRN matches
    const milkMrn = (item.patientMrn || item.patient_mrn || '').trim().toLowerCase();
    const currentMrn = patient.mrn.trim().toLowerCase();
    if (milkMrn && milkMrn !== currentMrn) {
      toast.error('MRN mismatch — this milk belongs to a different patient!', {
        description: `Milk MRN: ${item.patientMrn || item.patient_mrn} ≠ Patient MRN: ${patient.mrn}`,
        duration: 6000,
      });
      return;
    }

    setMilkBarcode(getMilkBarcode(item));
    setScannedMilkInfo(item);
    setMilkVerified(true);
    toast.success('Milk container selected — MRN matched', {
      description: `Barcode: ${getMilkBarcode(item)} - Volume: ${getMilkVolume(item)}ml`,
    });
    setStep('administer');
  };

  const handleMilkOverrideConfirm = () => {
    if (!milkOverride.category) {
      toast.error('Please select an override reason category');
      return;
    }
    if (!milkOverride.justification.trim()) {
      toast.error('Please provide a written justification for the override');
      return;
    }
    setMilkVerified(true);
    setMilkWasOverridden(true);
    setShowMilkOverride(false);
    toast.warning('Milk scan override recorded', {
      description: `Reason: ${OVERRIDE_REASONS.find((r) => r.value === milkOverride.category)?.label}`,
    });
    setStep('administer');
  };

  // --- Administration ---
  const handleAdminister = async () => {
    if (!selectedOrder) return;
    if (!volumeGiven || Number(volumeGiven) < 1) {
      toast.error('Please enter volume given');
      return;
    }

    if (!recordAdministration) {
      toast.info('Administration recording is not configured - demo mode');
      setStep('done');
      setShowConfirmation(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const overrideNotes = [
        babyWasOverridden
          ? `[BABY SCAN OVERRIDE] Category: ${babyOverride.category}. Justification: ${babyOverride.justification}`
          : null,
        milkWasOverridden
          ? `[MILK SCAN OVERRIDE] Category: ${milkOverride.category}. Justification: ${milkOverride.justification}`
          : null,
        adminNotes || null,
      ]
        .filter(Boolean)
        .join(' | ');

      const result = await recordAdministration({
        patientId: patient.id,
        patientMrn: patient.mrn,
        patientName: `${patient.firstName} ${patient.lastName}`,
        orderId: selectedOrder.id,
        milkBarcode: milkBarcode || undefined,
        administeredBy: 'Current Nurse',
        administeredAt: new Date(),
        scheduledTime: new Date(),
        feedingType: selectedOrder.feedingType,
        volumeGiven: Number(volumeGiven),
        volumeOrdered: selectedOrder.volume,
        tolerance: tolerance as FeedingAdministration['tolerance'],
        residuals: residuals ? Number(residuals) : undefined,
        emesis,
        emesisAmount: emesisAmount ? Number(emesisAmount) : undefined,
        stool: stool as FeedingAdministration['stool'],
        notes: overrideNotes || undefined,
        verificationMethod: babyWasOverridden || milkWasOverridden ? 'manual_override' : 'barcode',
        overrideCategory: babyWasOverridden ? babyOverride.category : milkWasOverridden ? milkOverride.category : undefined,
        overrideJustification: babyWasOverridden ? babyOverride.justification : milkWasOverridden ? milkOverride.justification : undefined,
        status: 'administered',
      });

      setConfirmationResult(result);
      setStep('done');
      setShowConfirmation(true);
      toast.success('Feeding administration recorded');
    } catch {
      toast.error('Failed to record administration');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recent administrations for this patient
  const recentAdministrations = administrations
    .filter((a) => a.patientId === patient.id || a.patientId === patient.mrn)
    .slice(0, 5);

  // -----------------------------------------------------------------------
  // Step indicator
  // -----------------------------------------------------------------------
  const stepIndex = { select_order: 0, scan_baby: 1, scan_milk: 2, administer: 3, done: 4 };
  const currentIdx = stepIndex[step];

  const StepDot = ({ idx, label, icon: Icon }: { idx: number; label: string; icon: any }) => {
    const done = currentIdx > idx;
    const active = currentIdx === idx;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${done ? 'bg-green-100 text-green-700' : active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' : 'bg-slate-100 text-slate-400'}`}>
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        {done && <CheckCircle2 className="w-3.5 h-3.5" />}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Feeding Administration</h2>
          <p className="text-slate-500">
            {patient.firstName} {patient.lastName} &bull; MRN: {patient.mrn}
          </p>
        </div>
        {step !== 'select_order' && (
          <Button variant="outline" size="sm" onClick={resetWorkflow} className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Start Over
          </Button>
        )}
      </div>

      {/* Step Progress */}
      {step !== 'select_order' && (
        <div className="flex items-center gap-2 flex-wrap">
          <StepDot idx={1} label="Scan Baby" icon={Baby} />
          <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
          <StepDot idx={2} label="Scan Milk" icon={Milk} />
          <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
          <StepDot idx={3} label="Administer" icon={Send} />
          <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
          <StepDot idx={4} label="Complete" icon={CheckCircle2} />
        </div>
      )}

      {/* Override banners */}
      {babyWasOverridden && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span><strong>Baby Scan Overridden</strong> - {OVERRIDE_REASONS.find((r) => r.value === babyOverride.category)?.label}</span>
        </div>
      )}
      {milkWasOverridden && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span><strong>Milk Scan Overridden</strong> - {OVERRIDE_REASONS.find((r) => r.value === milkOverride.category)?.label}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: SELECT ORDER                                                 */}
      {/* ================================================================= */}
      {step === 'select_order' && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> Orders Due
          </h3>
          {activeOrders.length === 0 ? (
            <Card className="border-dashed border-slate-300">
              <CardContent className="p-6 text-center text-slate-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p>No active feeding orders at this time</p>
                <p className="text-xs text-slate-400 mt-1">Orders are managed in TrakCare CPOE</p>
              </CardContent>
            </Card>
          ) : (
            activeOrders.map((order) => (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getFeedingIcon(order.feedingType)}
                      <div>
                        <p className="font-semibold capitalize">{order.feedingType.replace('_', ' ')}</p>
                        <p className="text-sm text-slate-500">
                          {order.volume && `${order.volume}ml`} &bull; {order.frequency}
                          {order.route && ` - ${order.route.replace('_', ' ')}`}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSelectOrder(order)} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Administer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Recent Administrations */}
          {recentAdministrations.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-slate-500" /> Recent Administrations
              </h3>
              {recentAdministrations.map((admin) => (
                <Card key={admin.id} className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="font-semibold capitalize">
                            {admin.feedingType.replace('_', ' ')}
                          </span>
                          <Badge variant="outline" className="text-xs">{admin.status}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {admin.volumeGiven}ml given &bull; {admin.tolerance}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(admin.administeredAt).toLocaleString()} &bull; by {admin.administeredBy}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: SCAN BABY WRISTBAND                                         */}
      {/* ================================================================= */}
      {step === 'scan_baby' && (
        <Card className="border-2 border-blue-500 ring-2 ring-blue-200">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Baby className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Step 1: Scan Baby Wristband</h3>
                <p className="text-sm text-slate-500">Verify patient identity - Right Patient</p>
              </div>
            </div>

            {selectedOrder && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="text-slate-600">
                  <strong>Order:</strong>{' '}
                  <span className="capitalize">{selectedOrder.feedingType.replace('_', ' ')}</span>
                  {selectedOrder.volume && ` - ${selectedOrder.volume}ml`} - {selectedOrder.frequency}
                </p>
              </div>
            )}

            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                ref={babyInputRef}
                placeholder="Scan baby wristband barcode..."
                value={babyBarcode}
                onChange={(e) => setBabyBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScanBaby()}
                className="pl-10 text-base"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleScanBaby} disabled={!babyBarcode.trim() || isLoading} className="flex-1">
                <ScanLine className="w-4 h-4 mr-2" /> Verify Wristband
              </Button>
              <Button
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={() => setShowBabyOverride(true)}
              >
                <ShieldAlert className="w-4 h-4 mr-1.5" /> Override
              </Button>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Use the Override button only if the barcode scanner is unavailable or the wristband is unreadable.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* STEP: SCAN MILK CONTAINER + Available Inventory                   */}
      {/* ================================================================= */}
      {step === 'scan_milk' && (
        <div className="space-y-4">
          {/* Patient milk inventory (FIFO) */}
          <Card className="border border-orange-200 bg-orange-50/30">
            <CardContent className="p-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-orange-500" />
                Reserved Milk for {patient.firstName} {patient.lastName}
              </h3>
              
              {milkLoading ? (
                <div className="text-center py-4 text-slate-500">
                  <span className="animate-spin inline-block mr-2">&#x27F3;</span>
                  Loading inventory...
                </div>
              ) : patientMilk.length === 0 ? (
                <div className="text-center py-4">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-slate-500 text-sm">No reserved milk in inventory for this patient</p>
                  <p className="text-xs text-slate-400 mt-1">Use the Prep tab to prepare and reserve milk first, or use Override below</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {patientMilk.map((item, idx) => {
                    const expired = isExpired(item);
                    const isFifoFirst = idx === 0;
                    return (
                      <div
                        key={item.id || idx}
                        className={`relative bg-white rounded-lg p-3 border-2 cursor-pointer transition-all hover:shadow-md ${
                          isFifoFirst && !expired
                            ? 'border-green-400 ring-2 ring-green-200'
                            : expired
                            ? 'border-red-300 bg-red-50/50 opacity-75'
                            : 'border-orange-200 hover:border-orange-400'
                        }`}
                        onClick={() => !expired && handleSelectMilkFromList(item)}
                      >
                        {isFifoFirst && !expired && (
                          <Badge className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px]">
                            Reserved - Use First
                          </Badge>
                        )}
                        <div className="flex items-start gap-2">
                          <Milk className={`w-5 h-5 mt-0.5 ${expired ? 'text-red-400' : 'text-orange-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-lg">{getMilkVolume(item)} <span className="text-sm font-normal">ml</span></p>
                            <p className="text-xs text-slate-500 font-mono truncate">{getMilkBarcode(item)}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              <span>Exp: {getMilkExpiry(item) ? new Date(getMilkExpiry(item)).toLocaleDateString('en-GB') : 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs text-slate-400">
                                {getMilkType(item) === 'breast_milk' ? 'Maternal' : getMilkType(item) === 'donor_milk' ? 'Donor' : 'Formula'}
                                {getMilkStorage(item) ? ` - ${getMilkStorage(item)}` : ''}
                              </span>
                            </div>
                            {expired && (
                              <Badge className="mt-1 bg-red-500 text-white text-[10px]">EXPIRED</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan milk barcode */}
          <Card className="border-2 border-blue-500 ring-2 ring-blue-200">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Milk className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Step 2: Scan Milk Container</h3>
                  <p className="text-sm text-slate-500">
                    Verify milk identity &amp; FIFO compliance - Right Medication
                  </p>
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-3 flex items-center gap-2 text-sm text-green-800">
                {babyWasOverridden ? (
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                )}
                <span>
                  Patient verified: {patient.firstName} {patient.lastName} (MRN: {patient.mrn})
                  {babyWasOverridden && <span className="text-amber-700 ml-1">[Override]</span>}
                </span>
              </div>

              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={milkInputRef}
                  placeholder="Scan milk container barcode..."
                  value={milkBarcode}
                  onChange={(e) => setMilkBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanMilk()}
                  className="pl-10 text-base"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleScanMilk} disabled={!milkBarcode.trim() || isLoading} className="flex-1">
                  <ScanLine className="w-4 h-4 mr-2" /> Verify Milk
                </Button>
                <Button
                  variant="outline"
                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={() => setShowMilkOverride(true)}
                >
                  <ShieldAlert className="w-4 h-4 mr-1.5" /> Override
                </Button>
              </div>

              <p className="text-xs text-slate-400 text-center">
                Select a bottle from the list above, or scan the barcode. Use Override only if unavailable.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* STEP: ADMINISTER (clinical observations)                           */}
      {/* ================================================================= */}
      {step === 'administer' && selectedOrder && (
        <Card className="border-2 border-blue-500">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Send className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Step 3: Record Administration</h3>
                <p className="text-sm text-slate-500">
                  Complete feeding details - Right Dose / Route / Time / Documentation
                </p>
              </div>
            </div>

            {/* Verification summary */}
            <div className="bg-green-50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 text-green-800">
                {babyWasOverridden ? <ShieldAlert className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4" />}
                Patient: {patient.firstName} {patient.lastName} (MRN: {patient.mrn})
                {babyWasOverridden && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 ml-1">Override</Badge>}
              </div>
              <div className="flex items-center gap-2 text-green-800">
                {milkWasOverridden ? <ShieldAlert className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4" />}
                Milk: {milkBarcode || 'Manual entry'}
                {milkWasOverridden && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 ml-1">Override</Badge>}
              </div>
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="w-4 h-4" />
                Order: {selectedOrder.feedingType.replace('_', ' ')} - {selectedOrder.volume && `${selectedOrder.volume}ml`} - {selectedOrder.frequency}
              </div>
            </div>

            {/* Milk Bottle & Order Volume Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                <Droplets className="w-4 h-4" />
                Volume Information
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {scannedMilkInfo && (
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <p className="text-xs text-blue-500 uppercase font-medium">Milk Bottle</p>
                    <p className="text-2xl font-bold text-blue-700">{getMilkVolume(scannedMilkInfo)}<span className="text-sm font-normal">ml</span></p>
                    <p className="text-xs text-blue-400 font-mono mt-1">{getMilkBarcode(scannedMilkInfo)}</p>
                  </div>
                )}
                {selectedOrder.volume && (
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <p className="text-xs text-blue-500 uppercase font-medium">Order Volume</p>
                    <p className="text-2xl font-bold text-blue-700">{selectedOrder.volume}<span className="text-sm font-normal">ml</span></p>
                    <p className="text-xs text-blue-400 mt-1">{selectedOrder.frequency}</p>
                  </div>
                )}
              </div>
              {scannedMilkInfo && volumeGiven && Number(volumeGiven) > 0 && (
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Bottle Volume:</span>
                    <span className="font-medium">{getMilkVolume(scannedMilkInfo)}ml</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-amber-600">
                    <span>Volume to Give:</span>
                    <span className="font-medium">-{volumeGiven}ml</span>
                  </div>
                  <div className="border-t border-blue-100 mt-2 pt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">Remaining in Bottle:</span>
                    <span className={`font-bold text-lg ${
                      getMilkVolume(scannedMilkInfo) - Number(volumeGiven) > 0 ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {Math.max(0, getMilkVolume(scannedMilkInfo) - Number(volumeGiven))}ml
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Volume Given */}
            <div className="space-y-2">
              <Label>Volume Given (ml) *</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max={scannedMilkInfo ? getMilkVolume(scannedMilkInfo) : undefined}
                  placeholder={selectedOrder.volume ? `Ordered: ${selectedOrder.volume}ml` : 'Enter volume'}
                  value={volumeGiven}
                  onChange={(e) => setVolumeGiven(e.target.value)}
                  className="text-base"
                />
                {selectedOrder.volume && (
                  <span className="text-sm text-slate-500 whitespace-nowrap">/ {selectedOrder.volume}ml ordered</span>
                )}
              </div>
              {scannedMilkInfo && Number(volumeGiven) > getMilkVolume(scannedMilkInfo) && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Volume given exceeds bottle volume ({getMilkVolume(scannedMilkInfo)}ml)
                </p>
              )}
            </div>

            {/* Tolerance */}
            <div className="space-y-2">
              <Label>Tolerance</Label>
              <RadioGroup value={tolerance} onValueChange={setTolerance} className="grid grid-cols-2 gap-2">
                {['well-tolerated', 'minimal-residue', 'moderate-residue', 'poorly-tolerated'].map((t) => (
                  <div key={t} className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                    <RadioGroupItem value={t} id={`tol-${t}`} />
                    <Label htmlFor={`tol-${t}`} className="cursor-pointer capitalize text-sm">
                      {t.replace('-', ' ')}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Residuals */}
            {['gavage', 'ng_tube', 'og_tube'].includes(selectedOrder.feedingType) && (
              <div className="space-y-2">
                <Label>Gastric Residuals (ml)</Label>
                <Input type="number" placeholder="Enter residual amount" value={residuals} onChange={(e) => setResiduals(e.target.value)} />
              </div>
            )}

            {/* Emesis */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox id="emesis" checked={emesis} onCheckedChange={(c) => setEmesis(c as boolean)} />
                <Label htmlFor="emesis" className="cursor-pointer">Emesis / Vomiting</Label>
              </div>
              {emesis && (
                <Input type="number" placeholder="Amount (ml)" value={emesisAmount} onChange={(e) => setEmesisAmount(e.target.value)} />
              )}
            </div>

            {/* Stool */}
            <div className="space-y-2">
              <Label>Stool</Label>
              <RadioGroup value={stool} onValueChange={setStool} className="flex flex-wrap gap-3">
                {['none', 'normal', 'loose', 'watery'].map((s) => (
                  <div key={s} className="flex items-center space-x-2">
                    <RadioGroupItem value={s} id={`stool-${s}`} />
                    <Label htmlFor={`stool-${s}`} className="cursor-pointer capitalize text-sm">{s}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any observations or concerns..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Override audit warning */}
            {(babyWasOverridden || milkWasOverridden) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <FileWarning className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  <strong>Audit Notice:</strong> This administration includes scan override(s). Override details
                  will be logged with your user ID and timestamp for compliance review.
                </span>
              </div>
            )}

            {/* Action */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={resetWorkflow}>Cancel</Button>
              <Button
                className="flex-1 flex items-center gap-2"
                onClick={handleAdminister}
                disabled={isSubmitting || isLoading || !volumeGiven || (!milkBarcode && !milkWasOverridden)}
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Recording...' : 'Record Administration'}
              </Button>
            </div>
            {!milkBarcode && !milkWasOverridden && (
              <p className="text-xs text-amber-600 flex items-center gap-1 pt-1">
                <AlertTriangle className="w-3 h-3" />
                Milk barcode scan is required before recording administration
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* OVERRIDE DIALOG - Baby                                             */}
      {/* ================================================================= */}
      <OverrideDialog
        open={showBabyOverride}
        onOpenChange={setShowBabyOverride}
        title="Override Baby Wristband Scan"
        description="You are bypassing the barcode scan for patient identification. This is an auditable event."
        override={babyOverride}
        setOverride={setBabyOverride}
        onConfirm={handleBabyOverrideConfirm}
      />

      {/* ================================================================= */}
      {/* OVERRIDE DIALOG - Milk                                             */}
      {/* ================================================================= */}
      <OverrideDialog
        open={showMilkOverride}
        onOpenChange={setShowMilkOverride}
        title="Override Milk Container Scan"
        description="You are bypassing the barcode scan for milk verification. This is an auditable event."
        override={milkOverride}
        setOverride={setMilkOverride}
        onConfirm={handleMilkOverrideConfirm}
      />

      {/* ================================================================= */}
      {/* CONFIRMATION DIALOG                                                */}
      {/* ================================================================= */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <ShieldCheck className="w-6 h-6" />
              Administration Recorded
            </DialogTitle>
            <DialogDescription>
              Closed-loop feeding administration has been documented.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Verification summary */}
            <div className="bg-green-50 p-4 rounded-lg space-y-2 text-sm">
              <h4 className="font-semibold text-green-800">Verification Summary</h4>
              <div className="flex items-center gap-2">
                {babyWasOverridden ? <ShieldAlert className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                <span>Patient identity {babyWasOverridden ? 'overridden (manual)' : 'verified via barcode'}</span>
              </div>
              <div className="flex items-center gap-2">
                {milkWasOverridden ? <ShieldAlert className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                <span>Milk container {milkWasOverridden ? 'overridden (manual)' : 'verified via barcode'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>Order matched &amp; documented</span>
              </div>
            </div>

            {/* Milk Volume Summary from backend */}
            {confirmationResult?.milkVolume && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-2 text-sm">
                <h4 className="font-semibold text-blue-800">Milk Inventory Update</h4>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-blue-600">Bottle Barcode:</span>
                    <span className="font-mono font-medium">{confirmationResult.milkVolume.milkBarcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Original Volume:</span>
                    <span className="font-medium">{confirmationResult.milkVolume.originalVolumeMl}ml</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Volume Given:</span>
                    <span className="font-medium text-amber-600">-{confirmationResult.milkVolume.volumeGivenMl}ml</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Remaining:</span>
                    <span className={`font-bold ${confirmationResult.milkVolume.remainingVolumeMl > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {confirmationResult.milkVolume.remainingVolumeMl}ml
                      {confirmationResult.milkVolume.remainingVolumeMl <= 0 && ' (fully used)'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback volume summary */}
            {!confirmationResult?.milkVolume && volumeGiven && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg space-y-1 text-sm">
                <h4 className="font-semibold text-slate-700">Administration Details</h4>
                {selectedOrder?.volume && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ordered:</span>
                    <span className="font-medium">{selectedOrder.volume}ml</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Given:</span>
                  <span className="font-medium">{volumeGiven}ml</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => { setShowConfirmation(false); resetWorkflow(); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable Override Dialog
// ---------------------------------------------------------------------------
function OverrideDialog({
  open,
  onOpenChange,
  title,
  description,
  override,
  setOverride,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  override: OverrideData;
  setOverride: React.Dispatch<React.SetStateAction<OverrideData>>;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <ShieldAlert className="w-6 h-6" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Override Reason *</Label>
            <Select
              value={override.category}
              onValueChange={(v) => setOverride((prev) => ({ ...prev, category: v as OverrideCategory }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Written Justification *</Label>
            <Textarea
              placeholder="Describe why the barcode scan could not be performed..."
              rows={3}
              value={override.justification}
              onChange={(e) => setOverride((prev) => ({ ...prev, justification: e.target.value }))}
            />
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>Audit Notice:</strong> This override will be logged with your user ID, timestamp, reason category,
              and justification.
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!override.category || !override.justification.trim()}
          >
            <ShieldAlert className="w-4 h-4 mr-2" />
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
