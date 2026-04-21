import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useInventory } from '@/hooks/useInventory';
import { useEMR } from '@/hooks/useEMR';
import type { ClosedLoopVerification, MilkInventory } from '@/types/inventory';
import { 
  Scan, 
  ScanLine, 
  CheckCircle2, 
  Baby, 
  Milk, 
  ArrowRight,
  RefreshCw,
  Barcode,
  UserCheck,
  AlertTriangle,
  Clock,
  Package,
  Snowflake,
  Droplets,
  ArrowLeftRight,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface BarcodeScannerProps {
  patientId?: string;
  orderId?: string;
  onVerificationComplete?: (verification: ClosedLoopVerification) => void;
}

export function BarcodeScanner({ orderId, onVerificationComplete }: BarcodeScannerProps) {
  const { scanBarcode, performClosedLoop, checkFIFOCompliance, getFIFOSuggestedMilk, isLoading } = useInventory();
  const { selectedPatient } = useEMR();
  
  const [scanMode, setScanMode] = useState<'baby' | 'milk' | 'complete'>('baby');
  const [babyBarcode, setBabyBarcode] = useState('');
  const [milkBarcode, setMilkBarcode] = useState('');
  const [babyScanned, setBabyScanned] = useState(false);
  const [milkScanned, setMilkScanned] = useState(false);
  const [verification, setVerification] = useState<ClosedLoopVerification | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [secondVerifier, setSecondVerifier] = useState('');
  const [showSecondVerify, setShowSecondVerify] = useState(false);
  
  // FIFO-related states
  const [showFIFOWarning, setShowFIFOWarning] = useState(false);
  const [fifoWarning, setFifoWarning] = useState<{
    isCompliant: boolean;
    earlierItems: MilkInventory[];
    message: string;
  } | null>(null);
  const [fifoOverrideReason, setFifoOverrideReason] = useState('');
  const [suggestedMilk, setSuggestedMilk] = useState<MilkInventory[]>([]);
  
  const babyInputRef = useRef<HTMLInputElement>(null);
  const milkInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when mode changes
  useEffect(() => {
    if (scanMode === 'baby' && babyInputRef.current) {
      babyInputRef.current.focus();
    } else if (scanMode === 'milk' && milkInputRef.current) {
      milkInputRef.current.focus();
    }
  }, [scanMode]);

  const handleScanBaby = async () => {
    if (!babyBarcode) return;
    
    const result = await scanBarcode(babyBarcode, 'baby_wristband');
    
    if (result.success) {
      setBabyScanned(true);
      toast.success('Baby wristband scanned successfully');
      setScanMode('milk');
    } else {
      toast.error(result.error || 'Scan failed');
      setBabyBarcode('');
    }
  };

  const handleScanMilk = async () => {
    if (!milkBarcode) return;
    
    const result = await scanBarcode(milkBarcode, 'milk_container');
    
    if (result.success) {
      setMilkScanned(true);
      toast.success('Milk container scanned successfully');
      
      // Check FIFO compliance
      const patientId = selectedPatient?.id || babyBarcode.replace('PT-', '');
      const fifoResult = await checkFIFOCompliance(milkBarcode, patientId);
      
      if (!fifoResult.isCompliant) {
        // Get suggested milk for FIFO
        const milkType = milkBarcode.startsWith('BM') ? 'breast_milk' : 
                        milkBarcode.startsWith('DM') ? 'donor_milk' : 'formula';
        const suggested = await getFIFOSuggestedMilk(patientId, milkType);
        setSuggestedMilk(suggested);
        setFifoWarning(fifoResult);
        setShowFIFOWarning(true);
      } else {
        setScanMode('complete');
      }
    } else {
      toast.error(result.error || 'Scan failed');
      setMilkBarcode('');
    }
  };

  const handleProceedWithFIFOOverride = () => {
    if (!fifoOverrideReason.trim()) {
      toast.error('Please provide a reason for FIFO override');
      return;
    }
    setShowFIFOWarning(false);
    setScanMode('complete');
    toast.info('FIFO override recorded for audit', {
      description: `Reason: ${fifoOverrideReason}`,
    });
  };

  const handleUseFIFOSuggested = (milk: MilkInventory) => {
    setMilkBarcode(milk.barcode);
    setShowFIFOWarning(false);
    setScanMode('complete');
    toast.success('Using FIFO-compliant container', {
      description: `${milk.barcode} - Expires: ${milk.expirationDate.toLocaleString()}`,
    });
  };

  const handleCompleteVerification = async () => {
    if (!babyBarcode || !milkBarcode || !orderId) {
      toast.error('Missing required information');
      return;
    }

    const skipFIFOWarning = !!fifoOverrideReason;
    const result = await performClosedLoop(
      babyBarcode, 
      milkBarcode, 
      orderId,
      skipFIFOWarning,
      fifoOverrideReason
    );
    
    if (result.success && result.verification) {
      setVerification(result.verification);
      setShowResult(true);
      
      if (onVerificationComplete) {
        onVerificationComplete(result.verification);
      }
    } else if (result.fifoWarning && !skipFIFOWarning) {
      // Show FIFO warning if returned
      setFifoWarning(result.fifoWarning);
      setShowFIFOWarning(true);
    } else {
      toast.error(result.error || 'Verification failed');
    }
  };

  const handleReset = () => {
    setBabyBarcode('');
    setMilkBarcode('');
    setBabyScanned(false);
    setMilkScanned(false);
    setVerification(null);
    setShowResult(false);
    setScanMode('baby');
    setFifoWarning(null);
    setFifoOverrideReason('');
    setSuggestedMilk([]);
  };

  const handleSecondVerification = () => {
    if (secondVerifier) {
      toast.success('Second verification recorded');
      setShowSecondVerify(false);
      handleReset();
    }
  };

  // Simulated barcode scanning for demo
  const simulateBabyScan = () => {
    if (selectedPatient) {
      setBabyBarcode(`PT-${selectedPatient.id}`);
    } else {
      setBabyBarcode('PT-pat-001');
    }
    handleScanBaby();
  };

  const simulateMilkScan = () => {
    // Simulate scanning a non-FIFO compliant milk (expires later than others)
    setMilkBarcode('BM-pat-001-20250401-002');
    handleScanMilk();
  };

  const getMilkIcon = (type: string) => {
    switch (type) {
      case 'breast_milk': return <Baby className="w-4 h-4 text-pink-500" />;
      case 'donor_milk': return <Droplets className="w-4 h-4 text-blue-500" />;
      case 'formula': return <Milk className="w-4 h-4 text-green-500" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getStorageIcon = (location: string) => {
    return location === 'freezer' ? 
      <Snowflake className="w-4 h-4 text-blue-500" /> : 
      <Clock className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Scan className="w-6 h-6" />
            Barcode Scanning
          </h2>
          <p className="text-slate-500">Closed-loop verification with FIFO compliance</p>
        </div>
        <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Reset
        </Button>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${babyScanned ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          <Baby className="w-5 h-5" />
          <span className="font-medium">Baby</span>
          {babyScanned && <CheckCircle2 className="w-4 h-4" />}
        </div>
        <ArrowRight className="w-5 h-5 text-slate-400" />
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${milkScanned ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          <Milk className="w-5 h-5" />
          <span className="font-medium">Milk</span>
          {milkScanned && <CheckCircle2 className="w-4 h-4" />}
        </div>
        <ArrowRight className="w-5 h-5 text-slate-400" />
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${verification ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Verify</span>
        </div>
      </div>

      {/* Scan Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Baby Wristband Scan */}
        <Card className={`border-2 ${scanMode === 'baby' ? 'border-blue-500 ring-2 ring-blue-200' : babyScanned ? 'border-green-500' : 'border-slate-200'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${babyScanned ? 'bg-green-100' : 'bg-blue-100'}`}>
                <Baby className={`w-6 h-6 ${babyScanned ? 'text-green-600' : 'text-blue-600'}`} />
              </div>
              <div>
                <h3 className="font-semibold">Step 1: Scan Baby Wristband</h3>
                <p className="text-sm text-slate-500">Verify patient identity</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={babyInputRef}
                  placeholder="Scan baby wristband barcode..."
                  value={babyBarcode}
                  onChange={(e) => setBabyBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanBaby()}
                  disabled={babyScanned || isLoading}
                  className="pl-10"
                />
              </div>
              
              {!babyScanned && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleScanBaby} 
                    disabled={!babyBarcode || isLoading}
                    className="flex-1"
                  >
                    <ScanLine className="w-4 h-4 mr-2" />
                    Scan
                  </Button>
                  <Button variant="outline" onClick={simulateBabyScan}>
                    Demo
                  </Button>
                </div>
              )}

              {babyScanned && selectedPatient && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-green-800">
                    ✓ Patient Verified: {selectedPatient.firstName} {selectedPatient.lastName}
                  </p>
                  <p className="text-xs text-green-600">MRN: {selectedPatient.mrn}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Milk Container Scan */}
        <Card className={`border-2 ${scanMode === 'milk' ? 'border-blue-500 ring-2 ring-blue-200' : milkScanned ? 'border-green-500' : babyScanned ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${milkScanned ? 'bg-green-100' : 'bg-blue-100'}`}>
                <Milk className={`w-6 h-6 ${milkScanned ? 'text-green-600' : 'text-blue-600'}`} />
              </div>
              <div>
                <h3 className="font-semibold">Step 2: Scan Milk Container</h3>
                <p className="text-sm text-slate-500">Verify milk inventory (FIFO check)</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={milkInputRef}
                  placeholder="Scan milk barcode..."
                  value={milkBarcode}
                  onChange={(e) => setMilkBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScanMilk()}
                  disabled={!babyScanned || milkScanned || isLoading}
                  className="pl-10"
                />
              </div>
              
              {!milkScanned && babyScanned && (
                <div className="flex gap-2">
                  <Button 
                    onClick={handleScanMilk} 
                    disabled={!milkBarcode || isLoading}
                    className="flex-1"
                  >
                    <ScanLine className="w-4 h-4 mr-2" />
                    Scan
                  </Button>
                  <Button variant="outline" onClick={simulateMilkScan}>
                    Demo
                  </Button>
                </div>
              )}

              {milkScanned && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-green-800">
                    ✓ Milk Verified
                  </p>
                  <p className="text-xs text-green-600">Barcode: {milkBarcode}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Complete Verification */}
      {babyScanned && milkScanned && !verification && (
        <Card className="border-2 border-blue-500">
          <CardContent className="p-6 text-center">
            <h3 className="font-semibold text-lg mb-2">Ready for Final Verification</h3>
            <p className="text-slate-500 mb-4">
              {fifoOverrideReason 
                ? 'FIFO override recorded. Complete the closed-loop verification.' 
                : 'FIFO check passed. Complete the closed-loop verification.'}
            </p>
            <Button 
              size="lg" 
              onClick={handleCompleteVerification}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              {isLoading ? 'Verifying...' : 'Complete Verification'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* FIFO Warning Dialog */}
      <Dialog open={showFIFOWarning} onOpenChange={setShowFIFOWarning}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              FIFO Compliance Warning
            </DialogTitle>
            <DialogDescription>
              The scanned container is not the nearest to expiry. Using FIFO prevents waste and ensures patient safety.
            </DialogDescription>
          </DialogHeader>

          {fifoWarning && (
            <div className="space-y-4 py-4">
              {/* Warning Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800">{fifoWarning.message}</p>
                    <p className="text-sm text-amber-600 mt-1">
                      Please use the FIFO-compliant containers listed below to minimize waste.
                    </p>
                  </div>
                </div>
              </div>

              {/* FIFO Suggested Containers */}
              <Accordion type="single" collapsible defaultValue="suggested">
                <AccordionItem value="suggested">
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-emerald-700">
                        Recommended FIFO Containers ({suggestedMilk.length})
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {suggestedMilk.slice(0, 5).map((milk, index) => {
                        const hoursToExpiry = Math.round(
                          (milk.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60)
                        );
                        const isFirst = index === 0;
                        
                        return (
                          <Card 
                            key={milk.id} 
                            className={`border-2 ${isFirst ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200'}`}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center border">
                                    {getMilkIcon(milk.milkType)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-sm">{milk.barcode}</span>
                                      {isFirst && (
                                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                          Use First
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                      <span className="flex items-center gap-1">
                                        <Package className="w-3 h-3" />
                                        {milk.volume}ml
                                      </span>
                                      <span className="flex items-center gap-1">
                                        {getStorageIcon(milk.storageLocation)}
                                        {milk.storageUnit}
                                      </span>
                                      <span className={`flex items-center gap-1 ${hoursToExpiry < 24 ? 'text-amber-600 font-medium' : ''}`}>
                                        <Clock className="w-3 h-3" />
                                        {hoursToExpiry < 0 ? 'Expired' : 
                                         hoursToExpiry < 24 ? `${hoursToExpiry}h left` : 
                                         `${Math.floor(hoursToExpiry / 24)}d left`}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleUseFIFOSuggested(milk)}
                                  className={isFirst ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                >
                                  Use This
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Override Section */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  Or proceed with scanned container (requires override reason):
                </p>
                <div className="space-y-3">
                  <Input
                    placeholder="Enter reason for FIFO override (e.g., container damaged, wrong label...)"
                    value={fifoOverrideReason}
                    onChange={(e) => setFifoOverrideReason(e.target.value)}
                  />
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">
                      <strong>Audit Notice:</strong> FIFO overrides are logged with your user ID and timestamp for compliance review.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowFIFOWarning(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleProceedWithFIFOOverride}
              disabled={!fifoOverrideReason.trim()}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Override & Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              Closed-Loop Verification Complete
            </DialogTitle>
            <DialogDescription>
              All verification checks passed. Feeding can be administered.
            </DialogDescription>
          </DialogHeader>

          {verification && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">Verification Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Baby wristband verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Milk container verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Order matched</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Expiration checked</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Patient matched</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>FIFO compliance checked</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 p-3 rounded text-sm">
                <p><strong>Timestamp:</strong> {new Date(verification.timestamp).toLocaleString()}</p>
                <p><strong>Verified by:</strong> {verification.administeredBy}</p>
                {fifoOverrideReason && (
                  <p className="text-amber-600 mt-1">
                    <strong>FIFO Override:</strong> {fifoOverrideReason}
                  </p>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800">
                  <UserCheck className="w-5 h-5" />
                  <span className="font-medium">Second Nurse Verification Required</span>
                </div>
                <p className="text-sm text-amber-700 mt-1">
                  Per hospital policy, a second nurse must verify before administration.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowResult(false)}>
              Close
            </Button>
            <Button onClick={() => { setShowResult(false); setShowSecondVerify(true); }}>
              <UserCheck className="w-4 h-4 mr-2" />
              Second Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Second Verification Dialog */}
      <Dialog open={showSecondVerify} onOpenChange={setShowSecondVerify}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Second Nurse Verification</DialogTitle>
            <DialogDescription>
              Please enter your credentials to confirm this administration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Verifier Name/ID</Label>
              <Input
                placeholder="Enter your name or ID"
                value={secondVerifier}
                onChange={(e) => setSecondVerifier(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSecondVerify(false)}>Cancel</Button>
            <Button 
              onClick={handleSecondVerification}
              disabled={!secondVerifier}
            >
              Confirm Administration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
