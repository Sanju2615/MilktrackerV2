import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useInventory } from '@/hooks/useInventory';
import type { MilkInventory } from '@/types/inventory';
import { 
  FlaskConical, 
  Thermometer, 
  Snowflake, 
  Droplets, 
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  Package,
  Baby,
  Milk,
  Search,
  Barcode,
  Printer,
  UserCheck,
  RotateCcw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';

// Fortification recipes
const FORTIFICATION_RECIPES = [
  { id: 'none', name: 'No Fortification', description: 'Plain breast milk', calories: 20 },
  { id: '22_kcal', name: '22 kcal/oz', description: '50ml + 1 packet HMF (5ml)', calories: 22 },
  { id: '24_kcal', name: '24 kcal/oz', description: '25ml + 1 packet HMF (5ml)', calories: 24 },
  { id: 'neosure_22', name: 'Neosure 22 kcal/oz', description: '3oz + 0.5 tsp powder', calories: 22 },
  { id: 'neosure_24', name: 'Neosure 24 kcal/oz', description: '3oz + 1 tsp powder', calories: 24 },
];

interface PreparationState {
  milkId: string | null;
  step: 'selection' | 'retrieval' | 'thaw' | 'warm' | 'fortify' | 'label' | 'verify' | 'complete';
  retrieval: { completed: boolean; by: string; at?: Date };
  thaw: { completed: boolean; by: string; method: 'refrigerator' | 'water_bath' | 'warmer'; startedAt?: Date; completedAt?: Date };
  warm: { completed: boolean; by: string; method: 'waterless_warmer' | 'water_bath'; temp: number; completedAt?: Date };
  fortify: { completed: boolean; by: string; recipe: string; verifiedBy?: string; completedAt?: Date };
  label: { completed: boolean; by: string; newBarcode: string; completedAt?: Date };
  verify: { completed: boolean; by: string; secondVerifier?: string; completedAt?: Date };
}

export function MilkPreparation() {
  const { inventory } = useInventory();
  
  const [availableMilk, setAvailableMilk] = useState<MilkInventory[]>([]);
  const [selectedMilk, setSelectedMilk] = useState<MilkInventory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [prepState, setPrepState] = useState<PreparationState>({
    milkId: null,
    step: 'selection',
    retrieval: { completed: false, by: '' },
    thaw: { completed: false, by: '', method: 'refrigerator' },
    warm: { completed: false, by: '', method: 'waterless_warmer', temp: 37 },
    fortify: { completed: false, by: '', recipe: 'none' },
    label: { completed: false, by: '', newBarcode: '' },
    verify: { completed: false, by: '' },
  });
  
  const [showSecondVerifyDialog, setShowSecondVerifyDialog] = useState(false);
  const [secondVerifierName, setSecondVerifierName] = useState('');
  const [preparedFeedings, setPreparedFeedings] = useState<Array<{
    id: string;
    originalBarcode: string;
    newBarcode: string;
    preparedAt: Date;
    expiresAt: Date;
    volume: number;
    recipe: string;
    patientName: string;
  }>>([]);

  // Filter available milk for preparation
  useEffect(() => {
    const filtered = inventory.filter(m => 
      m.status === 'available' && 
      (m.storageLocation === 'refrigerator' || m.storageLocation === 'freezer')
    );
    setAvailableMilk(filtered);
  }, [inventory]);

  const filteredMilk = availableMilk.filter(m => 
    m.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.storageUnit?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMilkIcon = (type: string) => {
    switch (type) {
      case 'breast_milk': return <Baby className="w-4 h-4 text-pink-500" />;
      case 'donor_milk': return <Droplets className="w-4 h-4 text-blue-500" />;
      case 'formula': return <Milk className="w-4 h-4 text-green-500" />;
      default: return <Milk className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (milk: MilkInventory) => {
    const hoursToExpiry = (milk.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursToExpiry < 0) return <Badge variant="destructive">Expired</Badge>;
    if (hoursToExpiry < 4) return <Badge variant="outline" className="bg-red-50 text-red-700">Expires Soon</Badge>;
    if (hoursToExpiry < 24) return <Badge variant="outline" className="bg-amber-50 text-amber-700">Expires &lt;24h</Badge>;
    return <Badge variant="outline" className="bg-green-50 text-green-700">Available</Badge>;
  };

  const selectMilkForPrep = (milk: MilkInventory) => {
    setSelectedMilk(milk);
    setPrepState({
      milkId: milk.id,
      step: 'retrieval',
      retrieval: { completed: false, by: '' },
      thaw: { completed: false, by: '', method: milk.storageLocation === 'freezer' ? 'refrigerator' : 'water_bath' },
      warm: { completed: false, by: '', method: 'waterless_warmer', temp: 37 },
      fortify: { completed: false, by: '', recipe: 'none' },
      label: { completed: false, by: '', newBarcode: '' },
      verify: { completed: false, by: '' },
    });
  };

  const completeRetrieval = () => {
    setPrepState(prev => ({
      ...prev,
      step: selectedMilk?.storageLocation === 'freezer' ? 'thaw' : 'warm',
      retrieval: { completed: true, by: 'Current User', at: new Date() }
    }));
    toast.success('Milk retrieved from storage');
  };

  const completeThaw = () => {
    setPrepState(prev => ({
      ...prev,
      step: 'warm',
      thaw: { ...prev.thaw, completed: true, completedAt: new Date() }
    }));
    toast.success('Milk thawed successfully');
  };

  const completeWarm = () => {
    setPrepState(prev => ({
      ...prev,
      step: 'fortify',
      warm: { ...prev.warm, completed: true, completedAt: new Date() }
    }));
    toast.success(`Milk warmed to ${prepState.warm.temp}°C`);
  };

  const completeFortify = () => {
    setPrepState(prev => ({
      ...prev,
      step: 'label',
      fortify: { ...prev.fortify, completed: true, completedAt: new Date() }
    }));
    toast.success('Fortification added');
  };

  const generatePrepBarcode = () => {
    if (!selectedMilk) return;
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
    const newBarcode = `${selectedMilk.barcode}-PREP-${dateStr}-${timeStr}`;
    
    setPrepState(prev => ({
      ...prev,
      label: { ...prev.label, newBarcode, completed: true, completedAt: new Date() }
    }));
    
    return newBarcode;
  };

  const completeLabel = () => {
    const newBarcode = generatePrepBarcode();
    if (!newBarcode) return;
    
    setPrepState(prev => ({
      ...prev,
      step: 'verify'
    }));
    toast.success('Label generated. Print and apply to prepared feeding.');
  };

  const completeVerification = () => {
    setShowSecondVerifyDialog(true);
  };

  const finalizePreparation = () => {
    if (!selectedMilk || !prepState.label.newBarcode) return;
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours for prepared feeding
    
    const newFeeding = {
      id: `prep-${Date.now()}`,
      originalBarcode: selectedMilk.barcode,
      newBarcode: prepState.label.newBarcode,
      preparedAt: now,
      expiresAt,
      volume: selectedMilk.volume,
      recipe: prepState.fortify.recipe,
      patientName: selectedMilk.patientName || 'Unknown',
    };
    
    setPreparedFeedings(prev => [...prev, newFeeding]);
    setPrepState(prev => ({
      ...prev,
      step: 'complete',
      verify: { ...prev.verify, completed: true, secondVerifier: secondVerifierName, completedAt: new Date() }
    }));
    
    setShowSecondVerifyDialog(false);
    setSecondVerifierName('');
    toast.success('Preparation complete! Feeding ready for administration.');
  };

  const resetPreparation = () => {
    setSelectedMilk(null);
    setPrepState({
      milkId: null,
      step: 'selection',
      retrieval: { completed: false, by: '' },
      thaw: { completed: false, by: '', method: 'refrigerator' },
      warm: { completed: false, by: '', method: 'waterless_warmer', temp: 37 },
      fortify: { completed: false, by: '', recipe: 'none' },
      label: { completed: false, by: '', newBarcode: '' },
      verify: { completed: false, by: '' },
    });
  };

  const printPrepLabel = () => {
    if (!prepState.label.newBarcode || !selectedMilk) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(tempSvg, prepState.label.newBarcode, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
      margin: 5,
    });
    const svgString = new XMLSerializer().serializeToString(tempSvg);
    
    const recipe = FORTIFICATION_RECIPES.find(r => r.id === prepState.fortify.recipe);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prepared Feeding Label</title>
        <style>
          @page { size: auto; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; }
          .label {
            border: 3px solid #0066cc;
            border-radius: 8px;
            padding: 15px;
            max-width: 300px;
            margin: 0 auto;
            text-align: center;
          }
          .header { font-size: 14px; font-weight: bold; color: #0066cc; margin-bottom: 10px; }
          .patient-name { font-size: 16px; font-weight: bold; margin: 8px 0; }
          .details { font-size: 12px; margin: 8px 0; }
          .barcode { margin: 10px 0; }
          .warning { font-size: 11px; color: #c00; font-weight: bold; margin-top: 10px; }
          .expiry { font-size: 11px; color: #666; margin-top: 8px; }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="header">🏥 PREPARED FEEDING</div>
          <div class="patient-name">${selectedMilk.patientName}</div>
          <div class="details">MRN: ${selectedMilk.patientId || 'N/A'}</div>
          <div class="details">
            <strong>${selectedMilk.volume}ml</strong> | ${recipe?.name || 'Plain'}
          </div>
          <div class="barcode">${svgString}</div>
          <div style="font-family: monospace; font-size: 11px;">${prepState.label.newBarcode}</div>
          <div class="expiry">
            Prepared: ${new Date().toLocaleString()}<br>
            Use within: 24 hours
          </div>
          <div class="warning">
            ⚠️ WARMED - USE IMMEDIATELY<br>
            VERIFY PATIENT IDENTITY
          </div>
        </div>
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">
            🖨️ Print Label
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Progress indicator
  const steps = [
    { id: 'selection', label: 'Select', icon: Package },
    { id: 'retrieval', label: 'Retrieve', icon: Package },
    { id: 'thaw', label: 'Thaw', icon: Snowflake },
    { id: 'warm', label: 'Warm', icon: Thermometer },
    { id: 'fortify', label: 'Fortify', icon: FlaskConical },
    { id: 'label', label: 'Label', icon: Barcode },
    { id: 'verify', label: 'Verify', icon: UserCheck },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === prepState.step);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="w-6 h-6" />
            Milk Preparation
          </h2>
          <p className="text-slate-500">Step 2: Retrieve, thaw, warm, fortify, and prepare feeding</p>
        </div>
      </div>

      {/* Progress Steps */}
      {prepState.step !== 'selection' && prepState.step !== 'complete' && (
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = step.id === prepState.step;
            const isCompleted = idx < currentStepIndex;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  isActive ? 'bg-blue-100 text-blue-700' : 
                  isCompleted ? 'bg-green-100 text-green-700' : 
                  'bg-slate-100 text-slate-400'
                }`}>
                  <Icon className="w-3 h-3" />
                  <span>{step.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-slate-300 mx-1" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selection Step */}
      {prepState.step === 'selection' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Package className="w-5 h-5" />
              Select Milk for Preparation
            </h3>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by barcode, patient, or storage location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredMilk.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No available milk found</p>
                  <p className="text-sm text-slate-400">Add milk to inventory first</p>
                </div>
              ) : (
                filteredMilk.map((milk) => (
                  <div
                    key={milk.id}
                    onClick={() => selectMilkForPrep(milk)}
                    className="p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          {getMilkIcon(milk.milkType)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Barcode className="w-3 h-3 text-slate-400" />
                            <span className="font-mono text-sm">{milk.barcode}</span>
                          </div>
                          <p className="text-sm text-slate-600">{milk.patientName}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span>{milk.volume}ml</span>
                            <span className="flex items-center gap-1">
                              {milk.storageLocation === 'freezer' ? <Snowflake className="w-3 h-3" /> : <Thermometer className="w-3 h-3" />}
                              {milk.storageLocation === 'freezer' ? 'Frozen' : 'Refrigerated'}
                            </span>
                            <span>{milk.storageUnit}</span>
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(milk)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preparation Workflow */}
      {selectedMilk && prepState.step !== 'selection' && prepState.step !== 'complete' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Milk Info Card */}
          <Card className="bg-slate-50">
            <CardContent className="p-4">
              <h4 className="font-semibold mb-3">Selected Milk</h4>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                  {getMilkIcon(selectedMilk.milkType)}
                </div>
                <div>
                  <p className="font-mono text-sm">{selectedMilk.barcode}</p>
                  <p className="text-sm font-medium">{selectedMilk.patientName}</p>
                  <p className="text-xs text-slate-500">{selectedMilk.volume}ml | {selectedMilk.storageLocation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Step Action */}
          <Card>
            <CardContent className="p-6 space-y-4">
              {/* Retrieval */}
              {prepState.step === 'retrieval' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Step 1: Retrieve from Storage
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Retrieve the milk container from <strong>{selectedMilk.storageUnit}</strong> at position <strong>{selectedMilk.shelfPosition}</strong>
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Retrieved By</Label>
                    <Input
                      placeholder="Enter your name"
                      value={prepState.retrieval.by}
                      onChange={(e) => setPrepState(prev => ({ ...prev, retrieval: { ...prev.retrieval, by: e.target.value } }))}
                    />
                  </div>
                  <Button 
                    onClick={completeRetrieval}
                    disabled={!prepState.retrieval.by}
                    className="w-full"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirm Retrieval
                  </Button>
                </>
              )}

              {/* Thaw */}
              {prepState.step === 'thaw' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Snowflake className="w-5 h-5" />
                    Step 2: Thaw Frozen Milk
                  </h3>
                  <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="text-sm text-amber-800">
                      This milk is frozen. Select thawing method and wait for complete thawing.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Thawing Method</Label>
                    <Select 
                      value={prepState.thaw.method} 
                      onValueChange={(v: 'refrigerator' | 'water_bath' | 'warmer') => setPrepState(prev => ({ ...prev, thaw: { ...prev.thaw, method: v } }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="refrigerator">Refrigerator (12-24 hours)</SelectItem>
                        <SelectItem value="water_bath">Warm Water Bath (30 min)</SelectItem>
                        <SelectItem value="warmer">Waterless Warmer (20 min)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-slate-500">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Estimated time: {prepState.thaw.method === 'refrigerator' ? '12-24 hours' : prepState.thaw.method === 'water_bath' ? '30 minutes' : '20 minutes'}
                  </div>
                  <Button onClick={completeThaw} className="w-full">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Thawing Complete
                  </Button>
                </>
              )}

              {/* Warm */}
              {prepState.step === 'warm' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Thermometer className="w-5 h-5" />
                    Step {selectedMilk.storageLocation === 'freezer' ? '3' : '2'}: Warm to Body Temperature
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Warm milk to body temperature (37°C / 98.6°F). Do not microwave!
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Warming Method</Label>
                    <Select 
                      value={prepState.warm.method} 
                      onValueChange={(v: 'waterless_warmer' | 'water_bath') => setPrepState(prev => ({ ...prev, warm: { ...prev.warm, method: v } }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waterless_warmer">Waterless Warmer (Recommended)</SelectItem>
                        <SelectItem value="water_bath">Warm Water Bath</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target Temperature (°C)</Label>
                    <Input
                      type="number"
                      value={prepState.warm.temp}
                      onChange={(e) => setPrepState(prev => ({ ...prev, warm: { ...prev.warm, temp: parseInt(e.target.value) || 37 } }))}
                    />
                    <p className="text-xs text-slate-500">Recommended: 37°C (body temperature)</p>
                  </div>
                  <Button onClick={completeWarm} className="w-full">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Warming Complete
                  </Button>
                </>
              )}

              {/* Fortify */}
              {prepState.step === 'fortify' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <FlaskConical className="w-5 h-5" />
                    Step {selectedMilk.storageLocation === 'freezer' ? '4' : '3'}: Fortification (Optional)
                  </h3>
                  <div className="space-y-2">
                    <Label>Select Fortification</Label>
                    <Select 
                      value={prepState.fortify.recipe} 
                      onValueChange={(v) => setPrepState(prev => ({ ...prev, fortify: { ...prev.fortify, recipe: v } }))}
                    >
                      <SelectContent>
                        {FORTIFICATION_RECIPES.map(recipe => (
                          <SelectItem key={recipe.id} value={recipe.id}>
                            {recipe.name} - {recipe.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {prepState.fortify.recipe !== 'none' && (
                    <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      <strong>Two-person verification required</strong> for fortification
                    </div>
                  )}
                  <Button onClick={completeFortify} className="w-full">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {prepState.fortify.recipe === 'none' ? 'Skip Fortification' : 'Fortification Complete'}
                  </Button>
                </>
              )}

              {/* Label */}
              {prepState.step === 'label' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Barcode className="w-5 h-5" />
                    Step {selectedMilk.storageLocation === 'freezer' ? '5' : '4'}: Generate Label
                  </h3>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Generate a new barcode label for the prepared feeding.
                    </p>
                  </div>
                  {prepState.label.newBarcode && (
                    <div className="border-2 border-slate-300 rounded-lg p-4 bg-white text-center">
                      <svg ref={(el) => { if (el) JsBarcode(el, prepState.label.newBarcode, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 12, margin: 5 }); }} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {!prepState.label.newBarcode ? (
                      <Button onClick={completeLabel} className="flex-1">
                        <Barcode className="w-4 h-4 mr-2" />
                        Generate Label
                      </Button>
                    ) : (
                      <>
                        <Button onClick={printPrepLabel} variant="outline" className="flex-1">
                          <Printer className="w-4 h-4 mr-2" />
                          Print Label
                        </Button>
                        <Button onClick={() => setPrepState(prev => ({ ...prev, step: 'verify' }))} className="flex-1">
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Continue
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Verify */}
              {prepState.step === 'verify' && (
                <>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <UserCheck className="w-5 h-5" />
                    Step {selectedMilk.storageLocation === 'freezer' ? '6' : '5'}: Final Verification
                  </h3>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>Preparation Summary:</strong>
                    </p>
                    <ul className="text-sm text-green-700 mt-2 space-y-1">
                      <li>✓ Retrieved from {selectedMilk.storageUnit}</li>
                      {selectedMilk.storageLocation === 'freezer' && <li>✓ Thawed</li>}
                      <li>✓ Warmed to {prepState.warm.temp}°C</li>
                      <li>✓ {prepState.fortify.recipe === 'none' ? 'No fortification' : FORTIFICATION_RECIPES.find(r => r.id === prepState.fortify.recipe)?.name}</li>
                      <li>✓ Labeled: {prepState.label.newBarcode}</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    <strong>Two-person verification required</strong> before administration
                  </div>
                  <Button onClick={completeVerification} className="w-full">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Request Second Verification
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Complete - Prepared Feedings List */}
      {prepState.step === 'complete' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-800">Preparation Complete!</h3>
              <p className="text-slate-600">The feeding is ready for administration.</p>
            </div>

            {preparedFeedings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Prepared Feedings</h4>
                <div className="space-y-2">
                  {preparedFeedings.map((feeding) => (
                    <div key={feeding.id} className="p-3 border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm">{feeding.newBarcode}</p>
                        <p className="text-sm">{feeding.patientName} | {feeding.volume}ml</p>
                        <p className="text-xs text-slate-500">
                          Use by: {feeding.expiresAt.toLocaleString()}
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">Ready</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={resetPreparation} variant="outline" className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              Prepare Another Feeding
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Second Verification Dialog */}
      <Dialog open={showSecondVerifyDialog} onOpenChange={setShowSecondVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Second Person Verification</DialogTitle>
            <DialogDescription>
              Hospital policy requires a second person to verify the prepared feeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <p><strong>Patient:</strong> {selectedMilk?.patientName}</p>
              <p><strong>Volume:</strong> {selectedMilk?.volume}ml</p>
              <p><strong>Fortification:</strong> {FORTIFICATION_RECIPES.find(r => r.id === prepState.fortify.recipe)?.name || 'None'}</p>
              <p><strong>New Barcode:</strong> {prepState.label.newBarcode}</p>
            </div>
            <div className="space-y-2">
              <Label>Second Verifier Name</Label>
              <Input
                placeholder="Enter verifier's name"
                value={secondVerifierName}
                onChange={(e) => setSecondVerifierName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSecondVerifyDialog(false)}>Cancel</Button>
            <Button onClick={finalizePreparation} disabled={!secondVerifierName}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Verify & Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
