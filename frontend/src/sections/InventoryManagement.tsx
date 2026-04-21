import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventory } from '@/hooks/useInventory';
import { useDiscardReasons } from '@/hooks/useDiscardReasons';
import type { MilkInventory, MilkType, StorageLocation } from '@/types/inventory';
import { 
  Package, 
  AlertTriangle, 
  Thermometer, 
  Search, 
  Plus,
  Trash2,
  Snowflake,
  Droplets,
  Milk,
  Baby,
  Clock,
  Barcode,
  Printer,
  History,
  Move,
  Bookmark,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
  Calendar,
  User,
  Settings2,
  Eye,
  RefreshCw,
  Archive,
  Lock,
  XCircle,
  Info
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';

// Shelf positions for transfer
const SHELF_POSITIONS = ['Shelf-1', 'Shelf-2', 'Shelf-3', 'Shelf-4', 'Bin-A', 'Bin-B', 'Bin-C'];

// Icon mapping for discard reasons
const ICON_MAP: Record<string, React.ElementType> = {
  Clock,
  AlertTriangle,
  Package,
  Barcode,
  User,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Info,
};

interface InventoryManagementProps {
  readOnly?: boolean;
  canManage?: boolean;
  canDiscard?: boolean;
}

export function InventoryManagement({ readOnly = false, canManage = true, canDiscard = true }: InventoryManagementProps) {
  const { 
    inventory, 
    alerts, 
    storageUnits, 
    discardMilk,
    acknowledgeAlert,
    transferMilk,
    reserveMilk,
    getMilkHistory
  } = useInventory();

  const { activeReasons, getReasonByValue } = useDiscardReasons();

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'expiring' | 'expired' | 'reserved'>('all');
  const [discardReason, setDiscardReason] = useState('');
  const [discardNotes, setDiscardNotes] = useState('');
  const [milkToDiscard, setMilkToDiscard] = useState<string | null>(null);
  const [milkToPrint, setMilkToPrint] = useState<MilkInventory | null>(null);
  const [milkToTransfer, setMilkToTransfer] = useState<MilkInventory | null>(null);
  const [milkToReserve, setMilkToReserve] = useState<MilkInventory | null>(null);
  const [milkHistory, setMilkHistory] = useState<MilkInventory | null>(null);
  const [targetStorageUnit, setTargetStorageUnit] = useState('');
  const [targetShelfPosition, setTargetShelfPosition] = useState('');
  const [reservePatientId, setReservePatientId] = useState('');
  const barcodeRef = useRef<SVGSVGElement>(null);

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.storageUnit?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filter === 'available') return matchesSearch && item.status === 'available';
    if (filter === 'expiring') return matchesSearch && item.expirationDate > new Date() && item.expirationDate < new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (filter === 'expired') return matchesSearch && item.status === 'expired';
    if (filter === 'reserved') return matchesSearch && item.status === 'reserved';
    return matchesSearch;
  });

  const getMilkIcon = (type: MilkType) => {
    switch (type) {
      case 'breast_milk': return <Baby className="w-5 h-5 text-pink-500" />;
      case 'donor_milk': return <Droplets className="w-5 h-5 text-blue-500" />;
      case 'formula': return <Milk className="w-5 h-5 text-green-500" />;
    }
  };

  const getStatusBadge = (item: MilkInventory) => {
    const hoursToExpiry = (item.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60);
    
    if (item.status === 'expired') return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Expired
      </Badge>
    );
    if (item.status === 'administered') return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Administered
      </Badge>
    );
    if (item.status === 'reserved') return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
        <Bookmark className="w-3 h-3" />
        Reserved
      </Badge>
    );
    if (item.status === 'discarded') return (
      <Badge variant="outline" className="bg-slate-100 text-slate-500 flex items-center gap-1">
        <Trash2 className="w-3 h-3" />
        Discarded
      </Badge>
    );
    
    if (hoursToExpiry < 4) return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Expires Soon
      </Badge>
    );
    if (hoursToExpiry < 24) return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Expires &lt;24h
      </Badge>
    );
    
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" />
        Available
      </Badge>
    );
  };

  const getStorageIcon = (location: StorageLocation) => {
    return location === 'freezer' ? 
      <Snowflake className="w-4 h-4 text-blue-500" /> : 
      <Thermometer className="w-4 h-4 text-green-500" />;
  };

  const handleDiscard = async () => {
    if (milkToDiscard && discardReason) {
      const reason = getReasonByValue(discardReason);
      const fullReason = `${reason?.label}${discardNotes ? ` - ${discardNotes}` : ''}`;
      await discardMilk(milkToDiscard, fullReason);
      setMilkToDiscard(null);
      setDiscardReason('');
      setDiscardNotes('');
      toast.success('Milk discarded', {
        description: `Reason: ${reason?.label}`,
      });
    }
  };

  // Generate and print barcode
  const handlePrintBarcode = (milk: MilkInventory) => {
    setMilkToPrint(milk);
    setTimeout(() => {
      if (barcodeRef.current) {
        JsBarcode(barcodeRef.current, milk.barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 12,
          margin: 10,
        });
      }
    }, 100);
  };

  const executePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && barcodeRef.current) {
      const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Barcode - ${milkToPrint?.barcode}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                display: flex; 
                flex-direction: column;
                align-items: center; 
                justify-content: center;
                font-family: Arial, sans-serif;
              }
              .label {
                border: 1px solid #ccc;
                padding: 15px;
                text-align: center;
                max-width: 300px;
              }
              .patient-name { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
              .milk-info { font-size: 12px; color: #666; margin-bottom: 10px; }
              .barcode { margin: 10px 0; }
              .expiry { font-size: 10px; color: #999; margin-top: 5px; }
              @media print {
                body { padding: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="label">
              <div class="patient-name">${milkToPrint?.patientName || 'Donor/Formula Milk'}</div>
              <div class="milk-info">
                ${milkToPrint?.milkType === 'breast_milk' ? "Mother's Own Milk" : 
                  milkToPrint?.milkType === 'donor_milk' ? 'Donor Milk' : 'Formula'} 
                • ${milkToPrint?.volume}ml
              </div>
              <div class="barcode">${svgData}</div>
              <div class="expiry">Expires: ${milkToPrint?.expirationDate.toLocaleDateString()}</div>
            </div>
            <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px;">Print Label</button>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
    setMilkToPrint(null);
  };

  // Handle milk transfer between storage units
  const handleTransfer = async () => {
    if (milkToTransfer && targetStorageUnit) {
      await transferMilk(milkToTransfer.id, targetStorageUnit, targetShelfPosition);
      setMilkToTransfer(null);
      setTargetStorageUnit('');
      setTargetShelfPosition('');
      toast.success('Milk transferred successfully');
    }
  };

  // Handle reserve milk for patient
  const handleReserve = async () => {
    if (milkToReserve && reservePatientId) {
      await reserveMilk(milkToReserve.id, reservePatientId);
      setMilkToReserve(null);
      setReservePatientId('');
      toast.success('Milk reserved for patient');
    }
  };

  // View milk history
  const handleViewHistory = async (milk: MilkInventory) => {
    const history = await getMilkHistory(milk.id);
    setMilkHistory(history as unknown as MilkInventory);
  };

  // Stats
  const stats = {
    total: inventory.length,
    available: inventory.filter(i => i.status === 'available').length,
    reserved: inventory.filter(i => i.status === 'reserved').length,
    expiringSoon: inventory.filter(i => {
      const hours = (i.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60);
      return i.status === 'available' && hours < 24 && hours > 0;
    }).length,
    expired: inventory.filter(i => i.status === 'expired').length,
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Archive className="w-7 h-7 text-blue-600" />
            Milk Inventory
          </h2>
          <p className="text-slate-500 mt-1">Manage and track milk storage across all units</p>
        </div>
        {!readOnly && canManage && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <Barcode className="w-5 h-5 text-amber-600" />
            <div className="text-sm">
              <span className="font-medium text-amber-800">To add milk:</span>
              <span className="text-amber-700 ml-1">Use the</span>
              <span className="font-semibold text-[#003366] mx-1">Collect</span>
              <span className="text-amber-700">tab for wristband scanning workflow</span>
            </div>
          </div>
        )}
        {readOnly && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Read Only
          </Badge>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
            <div className="text-xs text-blue-600">Total Items</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-emerald-700">{stats.available}</div>
            <div className="text-xs text-emerald-600">Available</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-blue-700">{stats.reserved}</div>
            <div className="text-xs text-blue-600">Reserved</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-amber-700">{stats.expiringSoon}</div>
            <div className="text-xs text-amber-600">Expiring &lt;24h</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-700">{stats.expired}</div>
            <div className="text-xs text-red-600">Expired</div>
          </CardContent>
        </Card>
      </div>

      {/* Storage Units Overview - Collapsible */}
      <Accordion type="single" collapsible defaultValue="storage">
        <AccordionItem value="storage" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 hover:no-underline bg-slate-50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-slate-500" />
              <span className="font-semibold text-slate-700">Storage Units Overview</span>
              <Badge variant="outline" className="ml-2">{storageUnits.length} Units</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {storageUnits.map((unit) => (
                <Card key={unit.id} className={unit.location === 'freezer' ? 'border-blue-200 bg-blue-50/30' : 'border-green-200 bg-green-50/30'}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStorageIcon(unit.location)}
                        <span className="font-medium text-sm">{unit.name}</span>
                      </div>
                      <span className="text-xs font-mono bg-white px-2 py-1 rounded">{unit.temperature}°C</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Capacity</span>
                        <span className="font-medium">{unit.currentCount} / {unit.capacity}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${unit.currentCount / unit.capacity > 0.9 ? 'bg-red-500' : unit.currentCount / unit.capacity > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min((unit.currentCount / unit.capacity) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Alerts Section */}
      {alerts.filter(a => !a.acknowledgedBy).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Active Alerts
              <Badge variant="destructive" className="ml-1">
                {alerts.filter(a => !a.acknowledgedBy).length}
              </Badge>
            </h3>
          </div>
          <div className="space-y-2">
            {alerts.filter(a => !a.acknowledgedBy).map((alert) => (
              <Card 
                key={alert.id} 
                className={alert.severity === 'critical' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${alert.severity === 'critical' ? 'bg-red-100' : 'bg-amber-100'}`}>
                      <AlertTriangle className={`w-4 h-4 ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{alert.message}</p>
                      <p className="text-xs text-slate-500">{alert.createdAt.toLocaleString()}</p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="bg-white"
                  >
                    Acknowledge
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Main Inventory Section */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-slate-500" />
              Inventory Items
            </CardTitle>
            
            {/* Search and Filter */}
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search barcode, patient..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0">
                    <Filter className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setFilter('all')}>
                    <Package className="w-4 h-4 mr-2" />
                    All Items
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('available')}>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />
                    Available
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('reserved')}>
                    <Bookmark className="w-4 h-4 mr-2 text-blue-500" />
                    Reserved
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('expiring')}>
                    <Clock className="w-4 h-4 mr-2 text-amber-500" />
                    Expiring Soon
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('expired')}>
                    <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
                    Expired
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* Filter Tabs */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mt-4">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="all" className="data-[state=active]:bg-white">
                All ({stats.total})
              </TabsTrigger>
              <TabsTrigger value="available" className="data-[state=active]:bg-white data-[state=active]:text-emerald-600">
                Available ({stats.available})
              </TabsTrigger>
              <TabsTrigger value="reserved" className="data-[state=active]:bg-white data-[state=active]:text-blue-600">
                Reserved ({stats.reserved})
              </TabsTrigger>
              <TabsTrigger value="expiring" className="data-[state=active]:bg-white data-[state=active]:text-amber-600">
                Expiring ({stats.expiringSoon})
              </TabsTrigger>
              <TabsTrigger value="expired" className="data-[state=active]:bg-white data-[state=active]:text-red-600">
                Expired ({stats.expired})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          {filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Package className="w-16 h-16 mx-auto mb-4 text-slate-200" />
              <p className="text-lg font-medium">No inventory items found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInventory.map((item) => (
                <Card key={item.id} className="border-slate-200 hover:border-blue-300 hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0">
                        {getMilkIcon(item.milkType)}
                      </div>
                      
                      {/* Main Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">{item.barcode}</span>
                          {getStatusBadge(item)}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-slate-400" />
                            <span className="font-medium">{item.volume}ml</span>
                          </span>
                          {item.patientName && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-slate-400" />
                              {item.patientName}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            {getStorageIcon(item.storageLocation)}
                            <span>{item.storageUnit}</span>
                            {item.shelfPosition && (
                              <span className="text-slate-400">• {item.shelfPosition}</span>
                            )}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Expressed: {item.expressedDate.toLocaleDateString()}</span>
                          <span className="text-slate-300">|</span>
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expires: {item.expirationDate.toLocaleString()}</span>
                        </div>
                      </div>
                      
                      {/* Action Buttons Grouped */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Primary Actions */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => handlePrintBarcode(item)}
                            title="Print Barcode"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          
                          {!readOnly && item.status === 'available' && canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setMilkToReserve(item)}
                              title="Reserve for Patient"
                            >
                              <Bookmark className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {!readOnly && (canManage || canDiscard) && (
                          <>
                            <Separator orientation="vertical" className="h-6 mx-1" />

                            {/* Secondary Actions Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handleViewHistory(item)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewHistory(item)}>
                                  <History className="w-4 h-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                            
                            {item.status === 'available' && canManage && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setMilkToTransfer(item)}>
                                  <Move className="w-4 h-4 mr-2" />
                                  Transfer Location
                                </DropdownMenuItem>
                              </>
                            )}
                            
                            {item.status === 'available' && canDiscard && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => setMilkToDiscard(item.id)}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Discard/Scrap
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barcode Print Dialog */}
      <Dialog open={!!milkToPrint} onOpenChange={() => setMilkToPrint(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              Print Barcode Label
            </DialogTitle>
            <DialogDescription>
              Preview and print the barcode label for this milk container.
            </DialogDescription>
          </DialogHeader>
          
          {milkToPrint && (
            <div className="py-4">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 bg-white text-center">
                <div className="font-bold text-base mb-1">
                  {milkToPrint.patientName || 'Donor/Formula Milk'}
                </div>
                <div className="text-sm text-slate-500 mb-4">
                  {milkToPrint.milkType === 'breast_milk' ? "Mother's Own Milk" : 
                   milkToPrint.milkType === 'donor_milk' ? 'Donor Milk' : 'Formula'} 
                  <span className="mx-2">•</span>
                  {milkToPrint.volume}ml
                </div>
                <svg ref={barcodeRef} className="mx-auto"></svg>
                <div className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" />
                  Expires: {milkToPrint.expirationDate.toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilkToPrint(null)}>
              Cancel
            </Button>
            <Button onClick={executePrint} className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Discard Dialog with Dropdown */}
      <Dialog open={!!milkToDiscard} onOpenChange={() => { setMilkToDiscard(null); setDiscardReason(''); setDiscardNotes(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Discard Milk Container
            </DialogTitle>
            <DialogDescription>
              Select a reason for discarding this milk container. This action will be logged for audit compliance.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Discard Reason <span className="text-red-500">*</span></Label>
              <Select value={discardReason} onValueChange={setDiscardReason}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {activeReasons.length === 0 ? (
                    <SelectItem value="" disabled>
                      No discard reasons configured
                    </SelectItem>
                  ) : (
                    activeReasons.map((reason) => {
                      const Icon = ICON_MAP[reason.iconName] || AlertCircle;
                      return (
                        <SelectItem key={reason.value} value={reason.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-slate-500" />
                            <span>{reason.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              {discardReason && (
                <p className="text-sm text-slate-500">
                  {getReasonByValue(discardReason)?.description}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>
                Additional Notes 
                {discardReason && getReasonByValue(discardReason)?.requiresNotes && (
                  <span className="text-red-500">*</span>
                )}
              </Label>
              <Input
                placeholder={
                  discardReason && getReasonByValue(discardReason)?.requiresNotes
                    ? 'Additional notes are required for this reason...'
                    : 'Enter any additional details...'
                }
                value={discardNotes}
                onChange={(e) => setDiscardNotes(e.target.value)}
              />
              {discardReason && getReasonByValue(discardReason)?.requiresNotes && !discardNotes.trim() && (
                <p className="text-sm text-amber-600">
                  This reason requires additional notes.
                </p>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-700">
                <strong>Audit Notice:</strong> This discard action will be logged with your user ID, timestamp, and reason for HIMSS 6 compliance.
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMilkToDiscard(null); setDiscardReason(''); setDiscardNotes(''); }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDiscard}
              disabled={!discardReason || (getReasonByValue(discardReason)?.requiresNotes === true && !discardNotes.trim())}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Confirm Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!milkToTransfer} onOpenChange={() => { setMilkToTransfer(null); setTargetStorageUnit(''); setTargetShelfPosition(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move className="w-5 h-5 text-blue-600" />
              Transfer Milk Location
            </DialogTitle>
            <DialogDescription>
              Move this milk container to a different storage unit.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {milkToTransfer && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Barcode className="w-4 h-4" />
                  <span className="font-mono">{milkToTransfer.barcode}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-slate-400" />
                    {milkToTransfer.volume}ml
                  </span>
                  <span className="flex items-center gap-1.5">
                    {getStorageIcon(milkToTransfer.storageLocation)}
                    {milkToTransfer.storageUnit} • {milkToTransfer.shelfPosition}
                  </span>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Target Storage Unit <span className="text-red-500">*</span></Label>
              <Select value={targetStorageUnit} onValueChange={setTargetStorageUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select storage unit..." />
                </SelectTrigger>
                <SelectContent>
                  {storageUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.name}>
                      <div className="flex items-center gap-2">
                        {getStorageIcon(unit.location)}
                        {unit.name}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {unit.currentCount}/{unit.capacity}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Shelf Position</Label>
              <Select value={targetShelfPosition} onValueChange={setTargetShelfPosition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shelf position..." />
                </SelectTrigger>
                <SelectContent>
                  {SHELF_POSITIONS.map((pos) => (
                    <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMilkToTransfer(null); setTargetStorageUnit(''); setTargetShelfPosition(''); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleTransfer}
              disabled={!targetStorageUnit}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
            >
              <Move className="w-4 h-4" />
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reserve Dialog */}
      <Dialog open={!!milkToReserve} onOpenChange={() => { setMilkToReserve(null); setReservePatientId(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-emerald-600" />
              Reserve Milk for Patient
            </DialogTitle>
            <DialogDescription>
              Reserve this milk container for a specific patient.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {milkToReserve && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Barcode className="w-4 h-4" />
                  <span className="font-mono">{milkToReserve.barcode}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-slate-400" />
                    {milkToReserve.volume}ml
                  </span>
                  <span className="flex items-center gap-1.5">
                    {getMilkIcon(milkToReserve.milkType)}
                    {milkToReserve.milkType === 'breast_milk' ? "Mother's Own" : milkToReserve.milkType}
                  </span>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Patient ID / MRN <span className="text-red-500">*</span></Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Enter patient ID or MRN"
                  value={reservePatientId}
                  onChange={(e) => setReservePatientId(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMilkToReserve(null); setReservePatientId(''); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleReserve}
              disabled={!reservePatientId}
              className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
            >
              <Bookmark className="w-4 h-4" />
              Reserve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History/Details Dialog */}
      <Dialog open={!!milkHistory} onOpenChange={() => setMilkHistory(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Milk Container Details
            </DialogTitle>
          </DialogHeader>
          
          {milkHistory && (
            <div className="space-y-4 py-4">
              {/* Basic Info Card */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    {getMilkIcon(milkHistory.milkType)}
                  </div>
                  <div>
                    <div className="font-mono text-sm text-slate-600">{milkHistory.barcode}</div>
                    <div className="text-lg font-semibold">
                      {milkHistory.patientName || 'Donor/Formula Milk'}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-slate-500 text-xs mb-1">Volume</div>
                    <div className="font-semibold text-lg">{milkHistory.volume}ml</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-slate-500 text-xs mb-1">Type</div>
                    <div className="font-semibold">
                      {milkHistory.milkType === 'breast_milk' ? "Mother's Own" : 
                       milkHistory.milkType === 'donor_milk' ? 'Donor' : 'Formula'}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-slate-500 text-xs mb-1">Storage</div>
                    <div className="font-semibold">{milkHistory.storageUnit}</div>
                    <div className="text-slate-400 text-xs">{milkHistory.shelfPosition}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-slate-500 text-xs mb-1">Status</div>
                    <div>{getStatusBadge(milkHistory)}</div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-slate-700 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Audit Timeline
                </h4>
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-emerald-700">Created</div>
                      <div className="text-emerald-600 text-xs">{milkHistory.createdAt.toLocaleString()}</div>
                    </div>
                  </div>
                  
                  {milkHistory.status === 'discarded' && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="text-sm">
                        <div className="font-medium text-red-700">Discarded</div>
                        <div className="text-red-600 text-xs">{milkHistory.notes}</div>
                      </div>
                    </div>
                  )}
                  
                  {milkHistory.status === 'administered' && (
                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-sm">
                        <div className="font-medium text-blue-700">Administered</div>
                        <div className="text-blue-600 text-xs">
                          {milkHistory.administeredAt?.toLocaleString()} by {milkHistory.administeredBy}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <RefreshCw className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-slate-700">Last Updated</div>
                      <div className="text-slate-600 text-xs">{milkHistory.updatedAt.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setMilkHistory(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
