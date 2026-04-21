import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useEMR } from '@/hooks/useEMR';
import { useInventory } from '@/hooks/useInventory';
import type { MilkType } from '@/types/inventory';
import type { EMRPatient } from '@/types/emr';
import { 
  Printer, 
  Baby, 
  Milk, 
  Droplets, 
  Plus, 
  Minus,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Save,
  Package,
  Thermometer,
  ArrowRight,
  Scan,
  X
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';

export function MilkCollection() {
  const { patients, loadPatients } = useEMR();
  const { addMilk } = useInventory();
  
  const barcodeRef = useRef<SVGSVGElement>(null);
  const wristbandInputRef = useRef<HTMLInputElement>(null);
  
  // Wristband scanning state
  const [wristbandBarcode, setWristbandBarcode] = useState('');
  const [scannedBaby, setScannedBaby] = useState<EMRPatient | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Form state
  const [milkType, setMilkType] = useState<MilkType>('breast_milk');
  const [volume, setVolume] = useState(60);
  const [serialNumber, setSerialNumber] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [expressedDate, setExpressedDate] = useState(new Date().toISOString().slice(0, 16));
  const [initialStorage, setInitialStorage] = useState<'freezer' | 'refrigerator'>('freezer');
  const [collectionMethod, setCollectionMethod] = useState<'pumping' | 'hand_expression'>('pumping');
  const [notes, setNotes] = useState('');
  
  // Workflow state
  const [generatedBarcodes, setGeneratedBarcodes] = useState<Array<{
    barcode: string;
    patientMRN: string;
    patientName: string;
    volume: number;
    milkType: MilkType;
    expressedDate: string;
    serialNumber: number;
    labelPrinted: boolean;
    addedToInventory: boolean;
  }>>([]);
  
  const [currentStep, setCurrentStep] = useState<'scan' | 'collection' | 'printing' | 'inventory'>('scan');

  // Load patients on mount
  useEffect(() => {
    loadPatients();
    // Focus wristband input on mount
    setTimeout(() => wristbandInputRef.current?.focus(), 100);
  }, [loadPatients]);

  // Parse wristband barcode to extract MRN
  // Wristband barcode format: PT-MRN or just MRN
  const parseWristbandBarcode = (barcode: string): string | null => {
    const trimmed = barcode.trim().toUpperCase();
    if (trimmed.startsWith('PT-')) {
      return trimmed.substring(3);
    }
    if (trimmed.match(/^MRN\d+$/i)) {
      return trimmed;
    }
    // If it's just numbers, assume it's the MRN number part
    if (trimmed.match(/^\d+$/)) {
      return `MRN${trimmed}`;
    }
    return trimmed;
  };

  // Handle wristband scan
  const handleWristbandScan = () => {
    setScanError(null);
    setIsScanning(true);
    
    const mrn = parseWristbandBarcode(wristbandBarcode);
    
    if (!mrn) {
      setScanError('Invalid barcode format. Please scan a valid wristband.');
      setIsScanning(false);
      toast.error('Invalid barcode format');
      return;
    }
    
    // Find baby by MRN
    const baby = patients.find(p => p.mrn.toUpperCase() === mrn && p.isActive);
    
    if (!baby) {
      setScanError(`No active baby found with MRN: ${mrn}`);
      setIsScanning(false);
      toast.error(`Baby not found: ${mrn}`);
      return;
    }
    
    setScannedBaby(baby);
    setIsScanning(false);
    setCurrentStep('collection');
    toast.success(`Baby identified: ${baby.firstName} ${baby.lastName}`);
  };

  // Handle Enter key in wristband input
  const handleWristbandKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleWristbandScan();
    }
  };

  // Clear scanned baby and reset
  const handleClearBaby = () => {
    setScannedBaby(null);
    setWristbandBarcode('');
    setScanError(null);
    setCurrentStep('scan');
    setGeneratedBarcodes([]);
    setTimeout(() => wristbandInputRef.current?.focus(), 100);
  };

  // Generate barcode data - simplified format for better readability
  const generateBarcodeData = () => {
    if (!scannedBaby) return;
    
    const barcodes = [];
    const dateCode = new Date(expressedDate).toISOString().slice(0, 10).replace(/-/g, '');
    
    for (let i = 0; i < quantity; i++) {
      const serial = serialNumber + i;
      // Format: MRN-SERIAL-TYPE-VOLUME-DATE (e.g., MRN12345-001-BM-60-20250402)
      const barcode = `${scannedBaby.mrn}-${String(serial).padStart(3, '0')}-${milkType.substring(0, 2).toUpperCase()}-${volume}-${dateCode}`;
      barcodes.push({
        barcode,
        patientMRN: scannedBaby.mrn,
        patientName: `${scannedBaby.firstName} ${scannedBaby.lastName}`,
        volume,
        milkType,
        expressedDate,
        serialNumber: serial,
        labelPrinted: false,
        addedToInventory: false,
      });
    }
    setGeneratedBarcodes(barcodes);
    setCurrentStep('printing');
  };

  // Render barcode
  useEffect(() => {
    if (generatedBarcodes.length > 0 && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, generatedBarcodes[0].barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 12,
          margin: 10,
        });
      } catch (error) {
        console.error('Barcode generation error:', error);
      }
    }
  }, [generatedBarcodes]);

  // Print label
  const handlePrintLabel = () => {
    if (!scannedBaby) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    const expiryDate = new Date(expressedDate);
    expiryDate.setDate(expiryDate.getDate() + (initialStorage === 'freezer' ? 180 : 3));

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Milk Label - ${scannedBaby.mrn}</title>
        <style>
          @page { size: 60mm 40mm; margin: 2mm; }
          body { 
            margin: 0; 
            padding: 2mm; 
            font-family: Arial, sans-serif; 
            font-size: 8pt;
            width: 56mm;
          }
          .label { 
            border: 1.5px solid #000; 
            padding: 2mm;
            page-break-after: always;
            box-sizing: border-box;
          }
          .header { 
            text-align: center; 
            font-weight: bold; 
            font-size: 8pt;
            border-bottom: 1px solid #000;
            padding-bottom: 1mm;
            margin-bottom: 2mm;
            background: #003366;
            color: white;
            padding: 1mm;
          }
          .baby-info { 
            font-size: 8pt; 
            margin-bottom: 2mm;
            text-align: center;
          }
          .baby-name {
            font-weight: bold;
            font-size: 10pt;
          }
          .mrn {
            font-size: 9pt;
            font-weight: bold;
            color: #003366;
            font-family: monospace;
            background: #f0f0f0;
            padding: 1px 4px;
            border-radius: 2px;
            display: inline-block;
            margin-top: 1mm;
          }
          .details { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 1mm;
            font-size: 7pt;
            margin: 2mm 0;
            border-top: 1px solid #ccc;
            border-bottom: 1px solid #ccc;
            padding: 1mm 0;
          }
          .detail-item {
            display: flex;
            justify-content: space-between;
          }
          .detail-label {
            font-weight: bold;
          }
          .barcode-container { 
            text-align: center; 
            margin-top: 2mm;
            padding: 1mm;
            background: #fafafa;
            border: 1px solid #ddd;
            border-radius: 2px;
          }
          .barcode-text {
            font-family: monospace;
            font-size: 7pt;
            color: #333;
            margin-top: 1mm;
            word-break: break-all;
          }
          .expiry {
            text-align: center;
            font-size: 7pt;
            margin-top: 2mm;
            color: #dc2626;
            font-weight: bold;
            border: 1px solid #dc2626;
            padding: 1mm;
          }
          .warning {
            text-align: center;
            font-size: 6pt;
            margin-top: 1mm;
            color: #dc2626;
          }
        </style>
      </head>
      <body>
        ${generatedBarcodes.map((item, index) => `
          <div class="label">
            <div class="header">KCH JEDDAH - HUMAN MILK</div>
            <div class="baby-info">
              <div class="baby-name">${item.patientName}</div>
              <div class="mrn">${item.patientMRN}</div>
            </div>
            <div class="details">
              <div class="detail-item">
                <span class="detail-label">Vol:</span>
                <span>${item.volume}ml</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Type:</span>
                <span>${item.milkType === 'breast_milk' ? 'BM' : item.milkType === 'donor_milk' ? 'DM' : 'FM'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Expr:</span>
                <span>${new Date(item.expressedDate).toLocaleDateString('en-GB')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Serial:</span>
                <span>#${String(item.serialNumber).padStart(3, '0')}</span>
              </div>
            </div>
            <div class="barcode-container">
              <svg id="barcode-${index}"></svg>
              <div class="barcode-text">${item.barcode}</div>
            </div>
            <div class="expiry">USE BY: ${expiryDate.toLocaleDateString('en-GB')}</div>
            <div class="warning">VERIFY BEFORE ADMINISTRATION</div>
          </div>
        `).join('')}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <script>
          window.onload = function() {
            try {
              ${generatedBarcodes.map((item, index) => `
                JsBarcode("#barcode-${index}", "${item.barcode}", {
                  format: "CODE128",
                  width: 1.2,
                  height: 35,
                  displayValue: false,
                  margin: 3,
                  lineColor: "#000"
                });
              `).join('')}
            } catch(e) {
              console.error('Barcode error:', e);
            }
            setTimeout(() => { window.print(); window.close(); }, 800);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    setGeneratedBarcodes(prev => prev.map(item => ({ ...item, labelPrinted: true })));
    toast.success(`${quantity} label(s) sent to printer`);
  };

  // Add to inventory
  const handleAddToInventory = () => {
    if (!scannedBaby) return;
    
    generatedBarcodes.forEach(item => {
      addMilk({
        patientId: scannedBaby.id,
        patientName: `${scannedBaby.firstName} ${scannedBaby.lastName}`,
        volume: item.volume,
        milkType: item.milkType,
        expressedDate: new Date(item.expressedDate),
        expirationDate: new Date(new Date(item.expressedDate).getTime() + (initialStorage === 'freezer' ? 180 : 3) * 24 * 60 * 60 * 1000),
        barcode: item.barcode,
        storageLocation: initialStorage,
        status: 'available',
        notes,
      });
    });

    setGeneratedBarcodes(prev => prev.map(item => ({ ...item, addedToInventory: true })));
    setCurrentStep('inventory');
    toast.success(`${quantity} container(s) added to inventory`);
  };

  // Reset form for new collection
  const handleNewCollection = () => {
    setScannedBaby(null);
    setWristbandBarcode('');
    setScanError(null);
    setVolume(60);
    setQuantity(1);
    setSerialNumber(prev => prev + quantity);
    setNotes('');
    setGeneratedBarcodes([]);
    setCurrentStep('scan');
    setTimeout(() => wristbandInputRef.current?.focus(), 100);
  };

  // Volume adjustment
  const adjustVolume = (delta: number) => {
    setVolume(prev => Math.max(5, Math.min(500, prev + delta)));
  };

  // Quantity adjustment
  const adjustQuantity = (delta: number) => {
    setQuantity(prev => Math.max(1, Math.min(10, prev + delta)));
  };

  // Get baby age
  const getBabyAge = (baby: EMRPatient) => {
    if (!baby.dateOfBirth) return 'N/A';
    const birth = new Date(baby.dateOfBirth);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - birth.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return `${diffDays} days`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} months`;
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears}y ${diffMonths % 12}m`;
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-6">
        {[
          { key: 'scan', label: 'Scan Wristband', icon: Scan },
          { key: 'collection', label: 'Collection Details', icon: Milk },
          { key: 'printing', label: 'Print Labels', icon: Printer },
          { key: 'inventory', label: 'Inventory', icon: Package },
        ].map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.key;
          const isCompleted = [
            'scan', 'collection', 'printing', 'inventory'
          ].indexOf(currentStep) > [
            'scan', 'collection', 'printing', 'inventory'
          ].indexOf(step.key);
          
          return (
            <div key={step.key} className="flex items-center">
              <div className={`flex flex-col items-center ${index > 0 ? 'ml-4' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isActive 
                    ? 'bg-[#003366] text-white' 
                    : isCompleted
                    ? 'bg-[#C9A227] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-xs mt-1 font-medium ${
                  isActive ? 'text-[#003366]' : isCompleted ? 'text-[#C9A227]' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
              {index < 3 && (
                <div className={`w-12 h-0.5 mx-2 ${
                  isCompleted ? 'bg-[#C9A227]' : 'bg-gray-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Scan Wristband */}
      {currentStep === 'scan' && (
        <Card className="border-2 border-[#003366]">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#003366]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Scan className="w-10 h-10 text-[#003366]" />
              </div>
              <h2 className="text-2xl font-bold text-[#003366] mb-2">
                Scan Baby Wristband
              </h2>
              <p className="text-gray-600">
                Scan the barcode on the baby's wristband to identify the patient
              </p>
            </div>

            <div className="max-w-md mx-auto space-y-4">
              <div className="relative">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  ref={wristbandInputRef}
                  type="text"
                  placeholder="Scan wristband barcode..."
                  value={wristbandBarcode}
                  onChange={(e) => setWristbandBarcode(e.target.value)}
                  onKeyDown={handleWristbandKeyDown}
                  className="pl-10 h-14 text-lg border-2 border-[#003366] focus:border-[#C9A227]"
                  autoFocus
                />
              </div>

              {scanError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                  <span>{scanError}</span>
                </div>
              )}

              <Button
                onClick={handleWristbandScan}
                disabled={!wristbandBarcode.trim() || isScanning}
                className="w-full h-14 bg-[#003366] hover:bg-[#003366]/90 text-white text-lg"
              >
                {isScanning ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⟳</span>
                    Scanning...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Scan className="w-5 h-5" />
                    Scan Wristband
                  </span>
                )}
              </Button>

              <div className="text-center text-sm text-gray-500 mt-4">
                <p>Or press Enter after scanning</p>
                <p className="mt-2 text-xs">
                  Expected format: PT-MRN12345 or MRN12345
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scanned Baby Info Banner */}
      {scannedBaby && (
        <Card className="bg-gradient-to-r from-[#003366] to-[#004080] text-white border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Baby className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">
                      {scannedBaby.firstName} {scannedBaby.lastName}
                    </h3>
                    <Badge className="bg-[#C9A227] text-white">
                      {scannedBaby.gender === 'male' ? 'Male' : 'Female'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-white/80 mt-1">
                    <span className="flex items-center gap-1">
                      <span className="font-mono font-bold">MRN: {scannedBaby.mrn}</span>
                    </span>
                    <span>|</span>
                    <span>Age: {getBabyAge(scannedBaby)}</span>
                    <span>|</span>
                    <span>DOB: {new Date(scannedBaby.dateOfBirth).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearBaby}
                className="text-white hover:bg-white/20"
              >
                <X className="w-4 h-4 mr-1" />
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Collection Details */}
      {currentStep === 'collection' && scannedBaby && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Milk className="w-6 h-6 text-[#003366]" />
              <h2 className="text-xl font-bold text-[#003366]">Collection Details</h2>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Milk Type */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold">Milk Type</Label>
                <Select value={milkType} onValueChange={(v) => setMilkType(v as MilkType)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breast_milk">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-blue-500" />
                        Breast Milk (Mother's Own)
                      </div>
                    </SelectItem>
                    <SelectItem value="donor_milk">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-green-500" />
                        Donor Milk (Pasteurized)
                      </div>
                    </SelectItem>
                    <SelectItem value="formula">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-orange-500" />
                        Formula
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Collection Method */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold">Collection Method</Label>
                <Select value={collectionMethod} onValueChange={(v) => setCollectionMethod(v as 'pumping' | 'hand_expression')}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pumping">Breast Pump</SelectItem>
                    <SelectItem value="hand_expression">Hand Expression</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Volume */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold">Volume (ml)</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustVolume(-5)}
                    className="h-12 w-12"
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                  <Input
                    type="number"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-12 text-center text-xl font-bold flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustVolume(5)}
                    className="h-12 w-12"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold">Number of Containers</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustQuantity(-1)}
                    className="h-12 w-12"
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="h-12 text-center text-xl font-bold flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => adjustQuantity(1)}
                    className="h-12 w-12"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Expressed Date */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date & Time Expressed
                </Label>
                <Input
                  type="datetime-local"
                  value={expressedDate}
                  onChange={(e) => setExpressedDate(e.target.value)}
                  className="h-12"
                />
              </div>

              {/* Storage Location */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold flex items-center gap-2">
                  <Thermometer className="w-4 h-4" />
                  Initial Storage
                </Label>
                <Select value={initialStorage} onValueChange={(v) => setInitialStorage(v as 'freezer' | 'refrigerator')}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freezer">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Freezer (-18°C) - 6 months
                      </span>
                    </SelectItem>
                    <SelectItem value="refrigerator">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        Refrigerator (4°C) - 72 hours
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Serial Number */}
              <div className="space-y-2">
                <Label className="text-[#003366] font-semibold">Starting Serial #</Label>
                <Input
                  type="number"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(Number(e.target.value))}
                  className="h-12"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2 col-span-2">
                <Label className="text-[#003366] font-semibold">Notes (Optional)</Label>
                <Input
                  type="text"
                  placeholder="Any additional information..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-12"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
              <Button
                variant="outline"
                onClick={handleClearBaby}
                className="h-12 px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={generateBarcodeData}
                className="h-12 px-8 bg-[#003366] hover:bg-[#003366]/90"
              >
                Generate Barcodes
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Print Labels */}
      {currentStep === 'printing' && generatedBarcodes.length > 0 && scannedBaby && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Printer className="w-6 h-6 text-[#003366]" />
              <h2 className="text-xl font-bold text-[#003366]">Print Labels</h2>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-700">Label Preview</h3>
                <Badge variant="outline">{generatedBarcodes.length} label(s)</Badge>
              </div>
              
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 max-w-sm mx-auto">
                <div className="text-center border-b-2 border-[#003366] pb-2 mb-3 bg-[#003366] text-white -mx-6 -mt-6 px-6 pt-2">
                  <p className="font-bold text-sm">KCH JEDDAH - HUMAN MILK</p>
                </div>
                <div className="mb-3 text-center">
                  <p className="font-bold text-lg">{scannedBaby.firstName} {scannedBaby.lastName}</p>
                  <p className="text-sm font-mono font-bold text-[#003366] bg-gray-100 inline-block px-2 py-0.5 rounded">{scannedBaby.mrn}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3 border-t border-b border-gray-200 py-2">
                  <div><span className="font-semibold">Vol:</span> {volume}ml</div>
                  <div><span className="font-semibold">Type:</span> {milkType === 'breast_milk' ? 'BM' : milkType === 'donor_milk' ? 'DM' : 'FM'}</div>
                  <div><span className="font-semibold">Expr:</span> {new Date(expressedDate).toLocaleDateString('en-GB')}</div>
                  <div><span className="font-semibold">Serial:</span> #{String(serialNumber).padStart(3, '0')}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-2">
                  <div className="flex justify-center">
                    <svg ref={barcodeRef} className="max-w-full" />
                  </div>
                  <p className="text-center text-xs font-mono text-gray-600 mt-1 break-all">
                    {generatedBarcodes[0]?.barcode}
                  </p>
                </div>
                <p className="text-center text-xs text-red-600 font-bold border border-red-600 py-1">
                  USE BY: {new Date(new Date(expressedDate).getTime() + (initialStorage === 'freezer' ? 180 : 3) * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')}
                </p>
                <p className="text-center text-[10px] text-red-600 mt-1">
                  VERIFY BEFORE ADMINISTRATION
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('collection')}
                className="h-12 px-6"
              >
                Back
              </Button>
              <Button
                onClick={handlePrintLabel}
                className="h-12 px-8 bg-[#003366] hover:bg-[#003366]/90"
              >
                <Printer className="w-5 h-5 mr-2" />
                Print Labels
              </Button>
              <Button
                onClick={handleAddToInventory}
                disabled={generatedBarcodes.some(b => !b.labelPrinted)}
                className="h-12 px-8 bg-[#C9A227] hover:bg-[#C9A227]/90"
              >
                <Save className="w-5 h-5 mr-2" />
                Add to Inventory
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Inventory Confirmation */}
      {currentStep === 'inventory' && generatedBarcodes.length > 0 && scannedBaby && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-green-700 mb-2">
                Collection Complete!
              </h2>
              <p className="text-gray-600 mb-6">
                {quantity} container(s) successfully added to inventory for {scannedBaby.firstName} {scannedBaby.lastName}
              </p>

              <div className="bg-gray-50 rounded-lg p-4 max-w-md mx-auto mb-6">
                <h3 className="font-semibold text-gray-700 mb-3">Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Baby:</span>
                    <span className="font-medium">{scannedBaby.firstName} {scannedBaby.lastName} ({scannedBaby.mrn})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Volume:</span>
                    <span className="font-medium">{volume * quantity} ml</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Containers:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Storage:</span>
                    <span className="font-medium capitalize">{initialStorage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labels Printed:</span>
                    <span className="font-medium text-green-600">Yes</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleNewCollection}
                className="h-12 px-8 bg-[#003366] hover:bg-[#003366]/90"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Collection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
