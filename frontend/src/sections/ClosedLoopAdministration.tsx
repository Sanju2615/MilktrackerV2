import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useEMR } from '@/hooks/useEMR';
import type { EMRPatient, FeedingOrder, FeedingAdministration } from '@/types/emr';
import { 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  Barcode,
  Send,
  RotateCcw,
  Droplets,
  Baby,
  Milk
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

interface ClosedLoopAdministrationProps {
  patient: EMRPatient;
}

export function ClosedLoopAdministration({ patient }: ClosedLoopAdministrationProps) {
  const { patientOrders, administrations, recordAdministration, isLoading } = useEMR();
  const [selectedOrder, setSelectedOrder] = useState<FeedingOrder | null>(null);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  // Administration form state
  const [adminData, setAdminData] = useState<Partial<FeedingAdministration>>({
    tolerance: 'well-tolerated',
    status: 'administered',
    verificationMethod: 'barcode',
  });

  const activeOrders = patientOrders.filter(o => o.status === 'active');

  const handleAdminister = async () => {
    if (!selectedOrder) return;

    try {
      const result = await recordAdministration({
        patientId: patient.id,
        orderId: selectedOrder.id,
        administeredBy: 'Nurse Current User', // Would come from auth
        administeredAt: new Date(),
        scheduledTime: new Date(),
        feedingType: selectedOrder.feedingType,
        volumeGiven: adminData.volumeGiven,
        volumeOrdered: selectedOrder.volume,
        tolerance: adminData.tolerance as FeedingAdministration['tolerance'],
        residuals: adminData.residuals,
        emesis: adminData.emesis,
        emesisAmount: adminData.emesisAmount,
        stool: adminData.stool as FeedingAdministration['stool'],
        notes: adminData.notes,
        verificationMethod: adminData.verificationMethod as FeedingAdministration['verificationMethod'],
        status: adminData.status as FeedingAdministration['status'],
      });

      setConfirmationResult(result.confirmation);
      setShowAdminDialog(false);
      setShowConfirmation(true);

      toast.success('Feeding administered successfully', {
        description: 'Closed-loop confirmation sent to EMR',
      });

      // Reset form
      setAdminData({
        tolerance: 'well-tolerated',
        status: 'administered',
        verificationMethod: 'barcode',
      });
      setSelectedOrder(null);
    } catch (error) {
      toast.error('Failed to record administration');
    }
  };

  const getFeedingIcon = (type: FeedingOrder['feedingType']) => {
    switch (type) {
      case 'breast': return <Baby className="w-5 h-5 text-pink-500" />;
      case 'bottle': return <Milk className="w-5 h-5 text-blue-500" />;
      default: return <Droplets className="w-5 h-5 text-purple-500" />;
    }
  };

  const recentAdministrations = administrations
    .filter(a => a.patientId === patient.id)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Feeding Administration</h2>
        <p className="text-slate-500">
          {patient.firstName} {patient.lastName} • MRN: {patient.mrn}
        </p>
      </div>

      {/* Active Orders to Administer */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          Orders Due
        </h3>
        
        {activeOrders.length === 0 ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-6 text-center text-slate-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p>No orders due at this time</p>
            </CardContent>
          </Card>
        ) : (
          activeOrders.map((order) => (
            <Card 
              key={order.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedOrder(order);
                setShowAdminDialog(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getFeedingIcon(order.feedingType)}
                    <div>
                      <p className="font-semibold capitalize">{order.feedingType.replace('_', ' ')}</p>
                      <p className="text-sm text-slate-500">
                        {order.volume && `${order.volume}ml`} • {order.frequency}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Administer
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Recent Administrations */}
      {recentAdministrations.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-slate-500" />
            Recent Administrations
          </h3>
          {recentAdministrations.map((admin) => (
            <Card key={admin.id} className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="font-semibold capitalize">{admin.feedingType.replace('_', ' ')}</span>
                      <Badge variant="outline" className="text-xs">
                        {admin.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {admin.volumeGiven}ml given • {admin.tolerance}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(admin.administeredAt).toLocaleString()}
                    </p>
                  </div>
                  {admin.verifiedBy && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      Verified
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Administration Dialog */}
      <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedOrder && getFeedingIcon(selectedOrder.feedingType)}
              Record Feeding Administration
            </DialogTitle>
            <DialogDescription>
              {selectedOrder && (
                <>
                  Order: {selectedOrder.feedingType.replace('_', ' ')} • 
                  {selectedOrder.volume && ` ${selectedOrder.volume}ml`} • 
                  {selectedOrder.frequency}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Volume Given */}
            {selectedOrder?.volume && (
              <div className="space-y-2">
                <Label>Volume Given (ml)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder={`Ordered: ${selectedOrder.volume}ml`}
                    value={adminData.volumeGiven || ''}
                    onChange={(e) => setAdminData({ ...adminData, volumeGiven: parseInt(e.target.value) })}
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">
                    / {selectedOrder.volume}ml ordered
                  </span>
                </div>
              </div>
            )}

            {/* Tolerance */}
            <div className="space-y-2">
              <Label>Tolerance</Label>
              <RadioGroup
                value={adminData.tolerance}
                onValueChange={(v) => setAdminData({ ...adminData, tolerance: v as FeedingAdministration['tolerance'] })}
                className="grid grid-cols-2 gap-2"
              >
                <div className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                  <RadioGroupItem value="well-tolerated" id="well" />
                  <Label htmlFor="well" className="cursor-pointer">Well Tolerated</Label>
                </div>
                <div className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                  <RadioGroupItem value="minimal-residue" id="minimal" />
                  <Label htmlFor="minimal" className="cursor-pointer">Minimal Residue</Label>
                </div>
                <div className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                  <RadioGroupItem value="moderate-residue" id="moderate" />
                  <Label htmlFor="moderate" className="cursor-pointer">Moderate Residue</Label>
                </div>
                <div className="flex items-center space-x-2 p-2 border rounded hover:bg-slate-50">
                  <RadioGroupItem value="poorly-tolerated" id="poor" />
                  <Label htmlFor="poor" className="cursor-pointer">Poorly Tolerated</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Residuals (for tube feeds) */}
            {(selectedOrder?.feedingType === 'gavage' || 
              selectedOrder?.feedingType === 'ng_tube' || 
              selectedOrder?.feedingType === 'og_tube') && (
              <div className="space-y-2">
                <Label>Gastric Residuals (ml)</Label>
                <Input
                  type="number"
                  placeholder="Enter residual amount"
                  value={adminData.residuals || ''}
                  onChange={(e) => setAdminData({ ...adminData, residuals: parseInt(e.target.value) })}
                />
              </div>
            )}

            {/* Emesis */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="emesis"
                  checked={adminData.emesis}
                  onCheckedChange={(checked) => setAdminData({ ...adminData, emesis: checked as boolean })}
                />
                <Label htmlFor="emesis" className="cursor-pointer">Emesis/Vomiting</Label>
              </div>
              {adminData.emesis && (
                <Input
                  type="number"
                  placeholder="Amount (ml)"
                  value={adminData.emesisAmount || ''}
                  onChange={(e) => setAdminData({ ...adminData, emesisAmount: parseInt(e.target.value) })}
                />
              )}
            </div>

            {/* Stool */}
            <div className="space-y-2">
              <Label>Stool</Label>
              <RadioGroup
                value={adminData.stool}
                onValueChange={(v) => setAdminData({ ...adminData, stool: v as FeedingAdministration['stool'] })}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="stool-none" />
                  <Label htmlFor="stool-none" className="cursor-pointer">None</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="normal" id="stool-normal" />
                  <Label htmlFor="stool-normal" className="cursor-pointer">Normal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="loose" id="stool-loose" />
                  <Label htmlFor="stool-loose" className="cursor-pointer">Loose</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="watery" id="stool-watery" />
                  <Label htmlFor="stool-watery" className="cursor-pointer">Watery</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Verification Method */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Barcode className="w-4 h-4" />
                Verification Method
              </Label>
              <RadioGroup
                value={adminData.verificationMethod}
                onValueChange={(v) => setAdminData({ ...adminData, verificationMethod: v as FeedingAdministration['verificationMethod'] })}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="barcode" id="verify-barcode" />
                  <Label htmlFor="verify-barcode" className="cursor-pointer">Barcode Scan</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="verify-manual" />
                  <Label htmlFor="verify-manual" className="cursor-pointer">Manual Verify</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any observations or concerns..."
                value={adminData.notes || ''}
                onChange={(e) => setAdminData({ ...adminData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdminDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAdminister} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {isLoading ? 'Recording...' : 'Record & Send to EMR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-6 h-6" />
              Closed-Loop Confirmation Sent
            </DialogTitle>
            <DialogDescription>
              The feeding administration has been recorded and confirmed in the EMR.
            </DialogDescription>
          </DialogHeader>

          {confirmationResult && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
              <p><strong>Status:</strong> {confirmationResult.status}</p>
              <p><strong>Timestamp:</strong> {new Date(confirmationResult.timestamp).toLocaleString()}</p>
              <p><strong>Message:</strong> {confirmationResult.message}</p>
              {confirmationResult.hl7Message && (
                <div className="mt-3">
                  <p className="font-semibold text-slate-600 mb-1">HL7 Message:</p>
                  <pre className="bg-slate-800 text-green-400 p-3 rounded text-xs overflow-x-auto">
                    {confirmationResult.hl7Message}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowConfirmation(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
