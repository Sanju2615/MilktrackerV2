/**
 * Milk Preparation Screen
 * 
 * Patient-context based: only accessible when a patient is selected.
 * Displays patient milk inventory in FEFO order (First Expired First Out).
 * Expired milk is shown in red and cannot be selected.
 * Selecting a valid batch opens a detail view that:
 *   - Deducts the ordered volume from the milk container
 *   - Updates inventory volume
 *   - Generates a prep barcode
 *   - Prints a prepared-milk label
 *   - Sets milk status to "Reserved"
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { milkApi } from '@/services/api';
import type { EMRPatient, FeedingOrder } from '@/types/emr';
import {
  FlaskConical,
  Droplets,
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  Baby,
  Milk,
  Search,
  Barcode,
  Printer,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Snowflake,
  Thermometer,
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
import JsBarcode from 'jsbarcode';

// Milk item as returned from the backend API
interface MilkInventoryItem {
  id: number | string;
  barcode: string;
  volumeMl: number;
  volume_ml?: number;
  patientMrn: string;
  patient_mrn?: string;
  patientName?: string;
  patient_name?: string;
  milkType: string;
  milk_type?: string;
  status: string;
  expiresAt: string;
  expires_at?: string;
  expressedAt: string;
  expressed_at?: string;
  storageLocation?: string;
  storage_location?: string;
  storageUnitName?: string;
  storage_unit_name?: string;
  shelfPosition?: string;
  shelf_position?: string;
}

interface MilkPreparationProps {
  patient: EMRPatient;
  patientOrders: FeedingOrder[];
}

export function MilkPreparation({ patient, patientOrders }: MilkPreparationProps) {
  const [patientMilk, setPatientMilk] = useState<MilkInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Detail / preparation state
  const [selectedMilk, setSelectedMilk] = useState<MilkInventoryItem | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [prepVolume, setPrepVolume] = useState<string>('');
  const [isPreparing, setIsPreparing] = useState(false);

  // Completed preparation result
  const [prepResult, setPrepResult] = useState<{
    prepBarcode: string;
    originalBarcode: string;
    deductedVolume: number;
    remainingVolume: number;
    patientName: string;
    milkId: number | string;
  } | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  // Prepared items list (local session)
  const [preparedItems, setPreparedItems] = useState<Array<{
    prepBarcode: string;
    originalBarcode: string;
    volume: number;
    patientName: string;
    preparedAt: Date;
  }>>([]);

  // Helpers
  const getMilkVolume = (item: MilkInventoryItem) => item.volumeMl || item.volume_ml || 0;
  const getMilkBarcode = (item: MilkInventoryItem) => item.barcode;
  const getMilkType = (item: MilkInventoryItem) => item.milkType || item.milk_type || 'breast_milk';
  const getMilkExpiry = (item: MilkInventoryItem) => item.expiresAt || item.expires_at || '';
  const getMilkStorage = (item: MilkInventoryItem) => item.storageLocation || item.storage_location || '';
  const getMilkStorageUnit = (item: MilkInventoryItem) => item.storageUnitName || item.storage_unit_name || '';
  const getMilkPatientName = (item: MilkInventoryItem) => item.patientName || item.patient_name || '';

  const isExpired = (item: MilkInventoryItem) => {
    const expiry = getMilkExpiry(item);
    return expiry ? new Date(expiry) < new Date() : false;
  };

  const getHoursToExpiry = (item: MilkInventoryItem) => {
    const expiry = getMilkExpiry(item);
    if (!expiry) return Infinity;
    return (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60);
  };

  // Fetch patient milk sorted FEFO (already sorted by backend: expires_at ASC)
  const fetchPatientMilk = useCallback(async () => {
    setLoading(true);
    try {
      const response = await milkApi.getPatientMilk(patient.mrn);
      if (response.success && Array.isArray(response.data)) {
        // Backend returns available + reserved sorted by expires_at ASC
        // For prep we only show "available" milk (not already reserved)
        const available = response.data.filter((m: MilkInventoryItem) => m.status === 'available');
        setPatientMilk(available);
      }
    } catch (err) {
      console.warn('Failed to fetch patient milk:', err);
      toast.error('Failed to load milk inventory');
    } finally {
      setLoading(false);
    }
  }, [patient.mrn]);

  useEffect(() => {
    fetchPatientMilk();
  }, [fetchPatientMilk]);

  // Filter by search term
  const filteredMilk = patientMilk.filter(m =>
    getMilkBarcode(m).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getMilkType(m).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getMilkStorageUnit(m).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get the active order's volume (auto-fill)
  const activeOrder = patientOrders.find(o => o.status === 'active');

  // Select a milk item for preparation
  const handleSelectMilk = (item: MilkInventoryItem) => {
    if (isExpired(item)) {
      toast.error('This milk has expired and cannot be used for preparation');
      return;
    }
    setSelectedMilk(item);
    // Pre-fill with active order volume if available
    setPrepVolume(activeOrder?.volume ? String(activeOrder.volume) : '');
    setShowDetailDialog(true);
  };

  // Execute preparation
  const handlePrepare = async () => {
    if (!selectedMilk) return;
    const vol = Number(prepVolume);
    if (!vol || vol < 1) {
      toast.error('Please enter a valid volume (minimum 1ml)');
      return;
    }
    if (vol > getMilkVolume(selectedMilk)) {
      toast.error(`Volume (${vol}ml) exceeds available volume (${getMilkVolume(selectedMilk)}ml)`);
      return;
    }

    setIsPreparing(true);
    try {
      const response = await milkApi.prepare(String(selectedMilk.id), {
        patientMrn: patient.mrn,
        orderedVolume: vol,
        orderId: activeOrder?.orderId,
      });

      if (response.success && response.data) {
        const data = response.data;
        const result = {
          prepBarcode: data.prepBarcode,
          originalBarcode: data.originalBarcode,
          deductedVolume: data.deductedVolume,
          remainingVolume: data.remainingVolume,
          patientName: `${patient.firstName} ${patient.lastName}`,
          milkId: data.milkId,
        };
        setPrepResult(result);
        setPreparedItems(prev => [...prev, {
          prepBarcode: data.prepBarcode,
          originalBarcode: data.originalBarcode,
          volume: data.deductedVolume,
          patientName: `${patient.firstName} ${patient.lastName}`,
          preparedAt: new Date(),
        }]);
        setShowDetailDialog(false);
        setShowResultDialog(true);
        toast.success('Milk prepared and reserved successfully');
        // Refresh inventory list
        await fetchPatientMilk();
      } else {
        toast.error(response.error || 'Failed to prepare milk');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to prepare milk');
    } finally {
      setIsPreparing(false);
    }
  };

  // Print the prepared milk label
  const handlePrintLabel = () => {
    if (!prepResult) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(tempSvg, prepResult.prepBarcode, {
      format: 'CODE128',
      width: 1.5,
      height: 50,
      displayValue: false,
      margin: 5,
    });
    const svgString = new XMLSerializer().serializeToString(tempSvg);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prepared Milk Label</title>
        <style>
          @page { size: auto; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; }
          .label {
            border: 3px solid #003366;
            border-radius: 8px;
            padding: 15px;
            max-width: 300px;
            margin: 0 auto;
            text-align: center;
          }
          .header { font-size: 14px; font-weight: bold; color: #003366; margin-bottom: 10px; }
          .patient-name { font-size: 16px; font-weight: bold; margin: 8px 0; }
          .mrn { font-size: 13px; color: #444; }
          .details { font-size: 12px; margin: 8px 0; }
          .barcode { margin: 10px auto; text-align: center; display: flex; justify-content: center; }
          .barcode svg { max-width: 100%; height: auto; }
          .barcode-text { font-family: monospace; font-size: 11px; word-break: break-all; }
          .warning { font-size: 11px; color: #c00; font-weight: bold; margin-top: 10px; }
          .expiry { font-size: 11px; color: #666; margin-top: 8px; }
          .status { display: inline-block; background: #003366; color: white; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-top: 6px; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">PREPARED FEEDING - RESERVED</div>
          <div class="patient-name">${prepResult.patientName}</div>
          <div class="mrn">MRN: ${patient.mrn}</div>
          <div class="details">
            <strong>${prepResult.deductedVolume}ml</strong> prepared from ${prepResult.originalBarcode}
          </div>
          <div class="barcode">${svgString}</div>
          <div class="barcode-text">${prepResult.prepBarcode}</div>
          <div class="status">RESERVED</div>
          <div class="expiry">
            Prepared: ${new Date().toLocaleString()}<br>
            Use within: 24 hours
          </div>
          <div class="warning">
            VERIFY PATIENT IDENTITY BEFORE ADMINISTRATION
          </div>
        </div>
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
            Print Label
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Status badge for milk items
  const getStatusBadge = (item: MilkInventoryItem) => {
    const hrs = getHoursToExpiry(item);
    if (hrs < 0) return <Badge variant="destructive">Expired</Badge>;
    if (hrs < 4) return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Expires Soon</Badge>;
    if (hrs < 24) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Expires &lt;24h</Badge>;
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Available</Badge>;
  };

  const getMilkIcon = (type: string) => {
    switch (type) {
      case 'breast_milk': return <Baby className="w-5 h-5 text-pink-500" />;
      case 'donor_milk': return <Droplets className="w-5 h-5 text-blue-500" />;
      case 'formula': return <Milk className="w-5 h-5 text-green-500" />;
      default: return <Milk className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="w-6 h-6" />
            Milk Preparation
          </h2>
          <p className="text-slate-500">
            {patient.firstName} {patient.lastName} &bull; MRN: {patient.mrn}
            {activeOrder && (
              <span className="ml-2 text-blue-600">
                &bull; Active Order: {activeOrder.volume}ml {activeOrder.feedingType.replace('_', ' ')} ({activeOrder.frequency})
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPatientMilk} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search by barcode, type, or storage unit..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* FEFO Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>FEFO Order (First Expired First Out):</strong> Milk is sorted by expiration date. 
          Use the earliest-expiring milk first. Expired items are shown in red and cannot be selected.
        </span>
      </div>

      {/* Milk Inventory List (FEFO) */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <Package className="w-5 h-5" />
            Available Milk for {patient.firstName} {patient.lastName}
            <Badge variant="outline" className="ml-2">{filteredMilk.length} items</Badge>
          </h3>

          {loading ? (
            <div className="text-center py-8 text-slate-500">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading inventory...
            </div>
          ) : filteredMilk.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No available milk found for this patient</p>
              <p className="text-sm text-slate-400 mt-1">Use the Collect tab under Inventory to add milk first</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMilk.map((item, idx) => {
                const expired = isExpired(item);
                const isFefoFirst = idx === 0 && !expired;
                return (
                  <div
                    key={item.id || idx}
                    onClick={() => handleSelectMilk(item)}
                    className={`relative p-4 border-2 rounded-lg transition-all ${
                      expired
                        ? 'border-red-300 bg-red-50 cursor-not-allowed opacity-70'
                        : isFefoFirst
                        ? 'border-green-400 ring-2 ring-green-200 hover:shadow-md cursor-pointer'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer'
                    }`}
                  >
                    {isFefoFirst && (
                      <Badge className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px]">
                        FEFO - Use First
                      </Badge>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          expired ? 'bg-red-100' : 'bg-slate-100'
                        }`}>
                          {getMilkIcon(getMilkType(item))}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Barcode className="w-3 h-3 text-slate-400" />
                            <span className={`font-mono text-sm ${expired ? 'text-red-600 line-through' : ''}`}>
                              {getMilkBarcode(item)}
                            </span>
                          </div>
                          <p className={`text-lg font-bold ${expired ? 'text-red-600' : 'text-slate-800'}`}>
                            {getMilkVolume(item)} <span className="text-sm font-normal">ml</span>
                          </p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              {getMilkStorage(item) === 'freezer' ? <Snowflake className="w-3 h-3" /> : <Thermometer className="w-3 h-3" />}
                              {getMilkStorage(item) === 'freezer' ? 'Frozen' : 'Refrigerated'}
                            </span>
                            {getMilkStorageUnit(item) && <span>{getMilkStorageUnit(item)}</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Exp: {getMilkExpiry(item) ? new Date(getMilkExpiry(item)).toLocaleDateString('en-GB') : 'N/A'}
                            </span>
                            <span>
                              {getMilkType(item) === 'breast_milk' ? 'Maternal' : getMilkType(item) === 'donor_milk' ? 'Donor' : 'Formula'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {getStatusBadge(item)}
                        {expired && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            CANNOT USE
                          </Badge>
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

      {/* Prepared Items This Session */}
      {preparedItems.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Prepared Feedings This Session
            </h3>
            <div className="space-y-2">
              {preparedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg bg-green-50/50">
                  <div>
                    <p className="font-mono text-sm text-slate-700">{item.prepBarcode}</p>
                    <p className="text-sm text-slate-600">
                      {item.volume}ml from {item.originalBarcode} &bull; {item.patientName}
                    </p>
                    <p className="text-xs text-slate-400">
                      Prepared: {item.preparedAt.toLocaleString()}
                    </p>
                  </div>
                  <Badge className="bg-[#003366] text-white">Reserved</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* DETAIL DIALOG — Select volume and prepare                         */}
      {/* ================================================================= */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-blue-600" />
              Prepare Milk
            </DialogTitle>
            <DialogDescription>
              Deduct the ordered volume from this milk container.
              The milk will be marked as "Reserved" after preparation.
            </DialogDescription>
          </DialogHeader>

          {selectedMilk && (
            <div className="space-y-4 py-2">
              {/* Milk Info */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border">
                    {getMilkIcon(getMilkType(selectedMilk))}
                  </div>
                  <div>
                    <p className="font-mono text-sm">{getMilkBarcode(selectedMilk)}</p>
                    <p className="font-semibold">{getMilkPatientName(selectedMilk)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Available Volume:</span>
                    <span className="ml-1 font-bold text-lg">{getMilkVolume(selectedMilk)}ml</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Expires:</span>
                    <span className="ml-1">
                      {getMilkExpiry(selectedMilk) ? new Date(getMilkExpiry(selectedMilk)).toLocaleDateString('en-GB') : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Type:</span>
                    <span className="ml-1 capitalize">{getMilkType(selectedMilk).replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Storage:</span>
                    <span className="ml-1 capitalize">{getMilkStorage(selectedMilk)}</span>
                  </div>
                </div>
              </div>

              {/* Active Order Info */}
              {activeOrder && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 font-medium">Active Order</p>
                  <p className="text-blue-700">
                    {activeOrder.volume}ml {activeOrder.feedingType.replace('_', ' ')} - {activeOrder.frequency}
                    {activeOrder.route && ` via ${activeOrder.route.replace('_', ' ')}`}
                  </p>
                </div>
              )}

              {/* Volume Input */}
              <div className="space-y-2">
                <Label>Volume to Prepare (ml) *</Label>
                <Input
                  type="number"
                  min="1"
                  max={getMilkVolume(selectedMilk)}
                  placeholder={`Max: ${getMilkVolume(selectedMilk)}ml`}
                  value={prepVolume}
                  onChange={(e) => setPrepVolume(e.target.value)}
                  className="text-lg"
                  autoFocus
                />
                {prepVolume && Number(prepVolume) > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Current Volume:</span>
                      <span className="font-medium">{getMilkVolume(selectedMilk)}ml</span>
                    </div>
                    <div className="flex justify-between text-amber-700">
                      <span>Deduct:</span>
                      <span className="font-medium">-{prepVolume}ml</span>
                    </div>
                    <div className="border-t border-amber-200 pt-1 flex justify-between">
                      <span className="font-semibold text-slate-700">Remaining:</span>
                      <span className={`font-bold ${
                        getMilkVolume(selectedMilk) - Number(prepVolume) > 0 ? 'text-green-600' : 'text-amber-600'
                      }`}>
                        {Math.max(0, getMilkVolume(selectedMilk) - Number(prepVolume))}ml
                      </span>
                    </div>
                  </div>
                )}
                {Number(prepVolume) > getMilkVolume(selectedMilk) && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Volume exceeds available amount
                  </p>
                )}
              </div>

              {/* Info */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                After preparation, this milk will be marked as <strong>"Reserved"</strong> and a prep barcode + label will be generated.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)} disabled={isPreparing}>
              Cancel
            </Button>
            <Button
              onClick={handlePrepare}
              disabled={
                isPreparing ||
                !prepVolume ||
                Number(prepVolume) < 1 ||
                Number(prepVolume) > (selectedMilk ? getMilkVolume(selectedMilk) : 0)
              }
              className="bg-[#003366] hover:bg-[#002244]"
            >
              {isPreparing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Preparing...
                </>
              ) : (
                <>
                  <FlaskConical className="w-4 h-4 mr-2" />
                  Prepare & Reserve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* RESULT DIALOG — Show prep barcode + print label                   */}
      {/* ================================================================= */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              Preparation Complete
            </DialogTitle>
            <DialogDescription>
              Milk has been prepared and reserved. Print the label and apply it to the prepared feeding.
            </DialogDescription>
          </DialogHeader>

          {prepResult && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="bg-green-50 rounded-lg p-4 space-y-2 text-sm">
                <p><strong>Patient:</strong> {prepResult.patientName} (MRN: {patient.mrn})</p>
                <p><strong>Original Container:</strong> {prepResult.originalBarcode}</p>
                <p><strong>Volume Prepared:</strong> {prepResult.deductedVolume}ml</p>
                <p><strong>Remaining in Container:</strong> {prepResult.remainingVolume}ml</p>
                <p><strong>Status:</strong> <Badge className="bg-[#003366] text-white">Reserved</Badge></p>
              </div>

              {/* Generated Barcode — centered & aligned */}
              <div className="border-2 border-slate-300 rounded-lg p-4 bg-white flex flex-col items-center justify-center">
                <p className="text-xs text-slate-500 uppercase font-medium mb-2">Prep Barcode</p>
                <div className="w-full flex justify-center overflow-hidden">
                  <svg
                    ref={(el) => {
                      if (el) {
                        JsBarcode(el, prepResult.prepBarcode, {
                          format: 'CODE128',
                          width: 1.5,
                          height: 50,
                          displayValue: true,
                          fontSize: 10,
                          margin: 5,
                          textMargin: 4,
                        });
                      }
                    }}
                  />
                </div>
                <p className="text-xs font-mono text-slate-500 mt-1 break-all text-center">{prepResult.prepBarcode}</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handlePrintLabel}>
              <Printer className="w-4 h-4 mr-2" />
              Print Label
            </Button>
            <Button onClick={() => setShowResultDialog(false)} className="bg-[#003366] hover:bg-[#002244]">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
