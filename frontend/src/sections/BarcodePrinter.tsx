import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useInventory } from '@/hooks/useInventory';
import { useEMR } from '@/hooks/useEMR';
import type { MilkType } from '@/types/inventory';
import { 
  Printer, 
  Barcode, 
  Baby, 
  Milk, 
  Droplets, 
  Plus, 
  Minus,
  Calendar,
  CheckCircle2,
  AlertCircle,
  QrCode
} from 'lucide-react';
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';

interface BarcodePrinterProps {
  patientId?: string;
  patientMRN?: string;
  patientName?: string;
}

export function BarcodePrinter({ patientId, patientMRN, patientName }: BarcodePrinterProps) {
  const { selectedPatient } = useEMR();
  const { addMilk } = useInventory();
  
  const barcodeRef = useRef<SVGSVGElement>(null);
  
  // Use provided patient info or selected patient
  const effectivePatientId = patientId || selectedPatient?.id;
  const effectiveMRN = patientMRN || selectedPatient?.mrn;
  const effectiveName = patientName || (selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '');

  // Form state
  const [milkType, setMilkType] = useState<MilkType>('breast_milk');
  const [volume, setVolume] = useState(60);
  const [serialNumber, setSerialNumber] = useState(1);
  const [expressedDate, setExpressedDate] = useState(new Date().toISOString().slice(0, 16));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  
  // Generated barcode data
  const [generatedBarcode, setGeneratedBarcode] = useState<string | null>(null);
  const [generatedBarcodes, setGeneratedBarcodes] = useState<Array<{
    barcode: string;
    patientMRN: string;
    patientName: string;
    volume: number;
    milkType: MilkType;
    expressedDate: string;
    serialNumber: number;
  }>>([]);

  // Generate barcode format: MRN-SERIAL-MILKTYPE-VOLUME-DATE
  // Example: MRN123456-001-BM-060-20250401
  const generateBarcodeData = () => {
    if (!effectiveMRN) return null;
    
    const date = new Date(expressedDate);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const typeCode = milkType === 'breast_milk' ? 'BM' : milkType === 'donor_milk' ? 'DM' : 'FM';
    const volStr = String(volume).padStart(3, '0');
    const serialStr = String(serialNumber).padStart(3, '0');
    
    return `${effectiveMRN}-${serialStr}-${typeCode}-${volStr}-${dateStr}`;
  };

  // Generate barcode
  const handleGenerate = () => {
    if (!effectiveMRN) {
      toast.error('Please select a patient first');
      return;
    }

    const barcodeData = generateBarcodeData();
    if (!barcodeData) return;

    setGeneratedBarcode(barcodeData);
    
    // Generate multiple barcodes if quantity > 1
    const newBarcodes = [];
    for (let i = 0; i < quantity; i++) {
      const serial = serialNumber + i;
      const serialStr = String(serial).padStart(3, '0');
      const date = new Date(expressedDate);
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const typeCode = milkType === 'breast_milk' ? 'BM' : milkType === 'donor_milk' ? 'DM' : 'FM';
      const volStr = String(volume).padStart(3, '0');
      const barcode = `${effectiveMRN}-${serialStr}-${typeCode}-${volStr}-${dateStr}`;
      
      newBarcodes.push({
        barcode,
        patientMRN: effectiveMRN,
        patientName: effectiveName,
        volume,
        milkType,
        expressedDate,
        serialNumber: serial,
      });
    }
    
    setGeneratedBarcodes(newBarcodes);
    toast.success(`${quantity} barcode(s) generated successfully`);
  };

  // Render barcode using JsBarcode
  useEffect(() => {
    if (generatedBarcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, generatedBarcode, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
        });
      } catch (error) {
        console.error('Barcode generation error:', error);
      }
    }
  }, [generatedBarcode]);

  // Print barcodes
  const handlePrint = () => {
    if (generatedBarcodes.length === 0) {
      toast.error('Please generate barcodes first');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print barcodes');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Barcodes - Human Milk Tracker</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
          }
          .barcode-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            padding: 10px;
          }
          .barcode-label {
            border: 2px solid #333;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            page-break-inside: avoid;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .barcode-label.header {
            grid-column: 1 / -1;
            border: none;
            box-shadow: none;
            text-align: left;
            margin-bottom: 10px;
          }
          .patient-info {
            font-size: 12px;
            margin-bottom: 8px;
            color: #333;
          }
          .patient-name {
            font-weight: bold;
            font-size: 14px;
          }
          .milk-info {
            display: flex;
            justify-content: center;
            gap: 15px;
            font-size: 11px;
            margin: 8px 0;
            color: #666;
          }
          .barcode-svg {
            margin: 10px 0;
          }
          .barcode-text {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            letter-spacing: 1px;
            margin-top: 5px;
            color: #333;
          }
          .warning {
            font-size: 9px;
            color: #c00;
            margin-top: 8px;
            font-weight: bold;
          }
          .hospital-logo {
            font-size: 16px;
            font-weight: bold;
            color: #0066cc;
            margin-bottom: 5px;
          }
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="barcode-container">
          <div class="barcode-label header">
            <div class="hospital-logo">🏥 HUMAN MILK TRACKER</div>
            <div style="font-size: 11px; color: #666;">
              Generated: ${new Date().toLocaleString()} | 
              Patient: ${effectiveName} | 
              MRN: ${effectiveMRN}
            </div>
          </div>
          ${generatedBarcodes.map((item) => {
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            try {
              JsBarcode(tempSvg, item.barcode, {
                format: 'CODE128',
                width: 2,
                height: 60,
                displayValue: false,
                margin: 5,
              });
              const svgString = new XMLSerializer().serializeToString(tempSvg);
              const milkTypeLabel = item.milkType === 'breast_milk' ? "Mother's Own Milk" : 
                                   item.milkType === 'donor_milk' ? 'Donor Milk' : 'Formula';
              const expDate = new Date(item.expressedDate);
              expDate.setDate(expDate.getDate() + (item.milkType === 'breast_milk' ? 4 : 2));
              
              return `
                <div class="barcode-label">
                  <div class="patient-info">
                    <div class="patient-name">${item.patientName}</div>
                    <div>MRN: ${item.patientMRN}</div>
                  </div>
                  <div class="milk-info">
                    <span><strong>${item.volume}ml</strong></span>
                    <span>${milkTypeLabel}</span>
                  </div>
                  <div class="barcode-svg">${svgString}</div>
                  <div class="barcode-text">${item.barcode}</div>
                  <div style="font-size: 9px; color: #666; margin-top: 5px;">
                    Expressed: ${new Date(item.expressedDate).toLocaleDateString()} | 
                    Use by: ${expDate.toLocaleDateString()}
                  </div>
                  <div class="warning">
                    ⚠️ VERIFY PATIENT IDENTITY BEFORE ADMINISTRATION
                  </div>
                </div>
              `;
            } catch (e) {
              return '';
            }
          }).join('')}
        </div>
        <div class="no-print" style="text-align: center; padding: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
            🖨️ Print Barcodes
          </button>
          <p style="font-size: 12px; color: #666; margin-top: 10px;">
            Use label paper (Avery 5160 compatible) for best results
          </p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    toast.success('Barcode print window opened');
  };

  // Save to inventory
  const handleSaveToInventory = async () => {
    if (generatedBarcodes.length === 0) {
      toast.error('Please generate barcodes first');
      return;
    }

    if (!effectivePatientId) {
      toast.error('Patient information required');
      return;
    }

    try {
      for (const item of generatedBarcodes) {
        const expDate = new Date(item.expressedDate);
        expDate.setDate(expDate.getDate() + (item.milkType === 'breast_milk' ? 4 : 2));
        
        await addMilk({
          barcode: item.barcode,
          patientId: effectivePatientId,
          patientName: item.patientName,
          milkType: item.milkType,
          volume: item.volume,
          expressedDate: new Date(item.expressedDate),
          expirationDate: expDate,
          storageLocation: 'refrigerator',
          status: 'available',
          notes: notes || undefined,
        });
      }
      
      toast.success(`${generatedBarcodes.length} milk container(s) added to inventory`);
      setGeneratedBarcodes([]);
      setGeneratedBarcode(null);
    } catch (error) {
      toast.error('Failed to add to inventory');
    }
  };

  const getMilkIcon = (type: MilkType) => {
    switch (type) {
      case 'breast_milk': return <Baby className="w-5 h-5 text-pink-500" />;
      case 'donor_milk': return <Droplets className="w-5 h-5 text-blue-500" />;
      case 'formula': return <Milk className="w-5 h-5 text-green-500" />;
    }
  };

  const getMilkLabel = (type: MilkType) => {
    switch (type) {
      case 'breast_milk': return "Mother's Own Milk";
      case 'donor_milk': return 'Donor Milk';
      case 'formula': return 'Formula';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Barcode className="w-6 h-6" />
            Barcode Printer
          </h2>
          <p className="text-slate-500">Generate and print barcodes for milk containers</p>
        </div>
        {effectiveName && (
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            <Baby className="w-4 h-4 mr-1" />
            {effectiveName} (MRN: {effectiveMRN})
          </Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form Section */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Generate Barcode
            </h3>

            {/* Patient Info (if not provided) */}
            {!effectivePatientId && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <p className="text-sm text-amber-700">Please select a patient first</p>
              </div>
            )}

            {/* Milk Type */}
            <div className="space-y-2">
              <Label>Milk Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['breast_milk', 'donor_milk', 'formula'] as MilkType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setMilkType(type)}
                    className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                      milkType === type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-blue-200'
                    }`}
                  >
                    {getMilkIcon(type)}
                    <span className="text-xs font-medium">{getMilkLabel(type)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <Label>Volume (ml)</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setVolume(Math.max(10, volume - 5))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  value={volume}
                  onChange={(e) => setVolume(Math.max(10, parseInt(e.target.value) || 0))}
                  className="text-center font-mono text-lg"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setVolume(volume + 5)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Serial Number */}
            <div className="space-y-2">
              <Label>Starting Serial Number</Label>
              <Input
                type="number"
                min={1}
                value={serialNumber}
                onChange={(e) => setSerialNumber(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-slate-500">
                Sequential numbers will be generated (e.g., 001, 002, 003...)
              </p>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Number of Labels</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="text-center font-mono text-lg"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.min(20, quantity + 1))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Expressed Date */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date/Time Expressed
              </Label>
              <Input
                type="datetime-local"
                value={expressedDate}
                onChange={(e) => setExpressedDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                placeholder="Any special instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={!effectivePatientId}
              className="w-full"
            >
              <Barcode className="w-4 h-4 mr-2" />
              Generate Barcode{quantity > 1 ? 's' : ''}
            </Button>
          </CardContent>
        </Card>

        {/* Preview Section */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Preview & Print
            </h3>

            {generatedBarcode ? (
              <div className="space-y-4">
                {/* Barcode Preview */}
                <div className="border-2 border-slate-300 rounded-lg p-6 bg-white">
                  <div className="text-center space-y-3">
                    <div className="text-sm font-semibold text-slate-700">
                      🏥 HUMAN MILK TRACKER
                    </div>
                    <div className="text-xs text-slate-500">
                      {effectiveName} | MRN: {effectiveMRN}
                    </div>
                    <div className="flex justify-center gap-4 text-sm">
                      <Badge variant="outline">{volume}ml</Badge>
                      <Badge variant="outline">{getMilkLabel(milkType)}</Badge>
                    </div>
                    <svg ref={barcodeRef} className="mx-auto" />
                    <div className="font-mono text-sm tracking-wider">
                      {generatedBarcode}
                    </div>
                    <div className="text-xs text-slate-500">
                      Expressed: {new Date(expressedDate).toLocaleString()}
                    </div>
                    <div className="text-xs text-red-600 font-semibold">
                      ⚠️ VERIFY PATIENT IDENTITY BEFORE ADMINISTRATION
                    </div>
                  </div>
                </div>

                {/* Generated List */}
                {generatedBarcodes.length > 1 && (
                  <div className="space-y-2">
                    <Label>Generated Barcodes ({generatedBarcodes.length})</Label>
                    <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                      {generatedBarcodes.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                          <span className="font-mono">{item.barcode}</span>
                          <Badge variant="outline" className="text-xs">{item.volume}ml</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button onClick={handlePrint} variant="outline" className="w-full">
                    <Printer className="w-4 h-4 mr-2" />
                    Print Barcode{quantity > 1 ? 's' : ''}
                  </Button>
                  <Button onClick={handleSaveToInventory} className="w-full">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Save to Inventory
                  </Button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                  Use Avery 5160 compatible label paper for best results
                </p>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Barcode className="w-16 h-16 mx-auto mb-4" />
                <p>Generate a barcode to see preview</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Barcode Format Info */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-sm mb-2">Barcode Format</h4>
          <div className="font-mono text-sm bg-white p-3 rounded border">
            MRN-SERIAL-TYPE-VOLUME-DATE
          </div>
          <div className="mt-2 text-xs text-slate-600 space-y-1">
            <p><strong>Example:</strong> MRN123456-001-BM-060-20250401</p>
            <ul className="list-disc list-inside ml-2">
              <li><strong>MRN123456</strong> - Patient Medical Record Number</li>
              <li><strong>001</strong> - Serial number (sequential)</li>
              <li><strong>BM</strong> - Milk type (BM=Breast, DM=Donor, FM=Formula)</li>
              <li><strong>060</strong> - Volume in milliliters</li>
              <li><strong>20250401</strong> - Date expressed (YYYYMMDD)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
