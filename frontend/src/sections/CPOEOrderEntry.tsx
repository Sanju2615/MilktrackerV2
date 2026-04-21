import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useEMR } from '@/hooks/useEMR';
import type { EMRPatient, FeedingOrder } from '@/types/emr';
import { 
  FileText, 
  Plus, 
  Clock, 
  AlertCircle, 
  Check,
  X,
  Beaker,
  Baby,
  Milk,
  Droplets
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface CPOEOrderEntryProps {
  patient: EMRPatient;
}

export function CPOEOrderEntry({ patient }: CPOEOrderEntryProps) {
  const { patientOrders, createOrder, cancelOrder, isLoading } = useEMR();
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

  // New order form state
  const [newOrder, setNewOrder] = useState<Partial<FeedingOrder>>({
    feedingType: 'bottle',
    frequency: 'q3h',
    priority: 'routine',
    route: 'oral',
  });

  const handleCreateOrder = async () => {
    if (!newOrder.feedingType || !newOrder.frequency) return;
    
    await createOrder({
      patientId: patient.id,
      feedingType: newOrder.feedingType,
      volume: newOrder.volume,
      frequency: newOrder.frequency,
      route: newOrder.route as FeedingOrder['route'],
      duration: newOrder.duration,
      fortification: newOrder.fortification,
      specialInstructions: newOrder.specialInstructions,
      priority: newOrder.priority as FeedingOrder['priority'],
      status: 'active',
      orderedBy: 'Dr. Current User', // Would come from auth
    });

    setShowNewOrderDialog(false);
    setNewOrder({
      feedingType: 'bottle',
      frequency: 'q3h',
      priority: 'routine',
      route: 'oral',
    });
  };

  const handleCancelOrder = async () => {
    if (orderToCancel && cancelReason) {
      await cancelOrder(orderToCancel, cancelReason);
      setOrderToCancel(null);
      setCancelReason('');
    }
  };

  const getFeedingIcon = (type: FeedingOrder['feedingType']) => {
    switch (type) {
      case 'breast': return <Baby className="w-4 h-4" />;
      case 'bottle': return <Milk className="w-4 h-4" />;
      case 'gavage':
      case 'ng_tube':
      case 'og_tube': return <Droplets className="w-4 h-4" />;
      default: return <Milk className="w-4 h-4" />;
    }
  };

  const activeOrders = patientOrders.filter(o => o.status === 'active');
  const otherOrders = patientOrders.filter(o => o.status !== 'active');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Feeding Orders (CPOE)</h2>
          <p className="text-slate-500">
            {patient.firstName} {patient.lastName} • MRN: {patient.mrn}
          </p>
        </div>
        <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Feeding Order</DialogTitle>
              <DialogDescription>
                Create a new feeding order for {patient.firstName} {patient.lastName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Feeding Type */}
              <div className="space-y-2">
                <Label>Feeding Type</Label>
                <Select
                  value={newOrder.feedingType}
                  onValueChange={(v) => setNewOrder({ ...newOrder, feedingType: v as FeedingOrder['feedingType'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breast">Breastfeeding</SelectItem>
                    <SelectItem value="bottle">Bottle Feeding</SelectItem>
                    <SelectItem value="gavage">Gavage Feeding</SelectItem>
                    <SelectItem value="ng_tube">NG Tube Feeding</SelectItem>
                    <SelectItem value="og_tube">OG Tube Feeding</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Volume */}
              {(newOrder.feedingType === 'bottle' || newOrder.feedingType === 'gavage' || 
                newOrder.feedingType === 'ng_tube' || newOrder.feedingType === 'og_tube') && (
                <div className="space-y-2">
                  <Label>Volume (ml)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 45"
                    value={newOrder.volume || ''}
                    onChange={(e) => setNewOrder({ ...newOrder, volume: parseInt(e.target.value) })}
                  />
                </div>
              )}

              {/* Frequency */}
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={newOrder.frequency}
                  onValueChange={(v) => setNewOrder({ ...newOrder, frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="q2h">Every 2 hours (q2h)</SelectItem>
                    <SelectItem value="q3h">Every 3 hours (q3h)</SelectItem>
                    <SelectItem value="q4h">Every 4 hours (q4h)</SelectItem>
                    <SelectItem value="on demand">On Demand</SelectItem>
                    <SelectItem value="prn">PRN (as needed)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Route */}
              <div className="space-y-2">
                <Label>Route</Label>
                <Select
                  value={newOrder.route}
                  onValueChange={(v) => setNewOrder({ ...newOrder, route: v as FeedingOrder['route'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oral">Oral</SelectItem>
                    <SelectItem value="ng_tube">NG Tube</SelectItem>
                    <SelectItem value="og_tube">OG Tube</SelectItem>
                    <SelectItem value="gastrostomy">Gastrostomy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Duration (for breastfeeding) */}
              {newOrder.feedingType === 'breast' && (
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Input
                    placeholder="e.g., 15-20 min each breast"
                    value={newOrder.duration || ''}
                    onChange={(e) => setNewOrder({ ...newOrder, duration: e.target.value })}
                  />
                </div>
              )}

              {/* Fortification */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Beaker className="w-4 h-4" />
                  Fortification (optional)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Type (e.g., HMF)"
                    value={newOrder.fortification?.type || ''}
                    onChange={(e) => setNewOrder({ 
                      ...newOrder, 
                      fortification: { ...newOrder.fortification, type: e.target.value, amount: newOrder.fortification?.amount || '' }
                    })}
                  />
                  <Input
                    placeholder="Amount (e.g., 4 packets)"
                    value={newOrder.fortification?.amount || ''}
                    onChange={(e) => setNewOrder({ 
                      ...newOrder, 
                      fortification: { ...newOrder.fortification, type: newOrder.fortification?.type || '', amount: e.target.value }
                    })}
                  />
                </div>
              </div>

              {/* Special Instructions */}
              <div className="space-y-2">
                <Label>Special Instructions</Label>
                <Textarea
                  placeholder="Any additional instructions..."
                  value={newOrder.specialInstructions || ''}
                  onChange={(e) => setNewOrder({ ...newOrder, specialInstructions: e.target.value })}
                />
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={newOrder.priority}
                  onValueChange={(v) => setNewOrder({ ...newOrder, priority: v as FeedingOrder['priority'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewOrderDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrder} disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Orders */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          Active Orders ({activeOrders.length})
        </h3>
        {activeOrders.length === 0 ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-6 text-center text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>No active feeding orders</p>
            </CardContent>
          </Card>
        ) : (
          activeOrders.map((order) => (
            <Card key={order.id} className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {getFeedingIcon(order.feedingType)}
                      <span className="font-semibold capitalize">{order.feedingType.replace('_', ' ')}</span>
                      <Badge variant="outline" className="text-xs">
                        {order.orderId}
                      </Badge>
                      {order.priority !== 'routine' && (
                        <Badge variant={order.priority === 'stat' ? 'destructive' : 'default'}>
                          {order.priority.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-slate-600 space-y-1">
                      {order.volume && <p>Volume: {order.volume}ml</p>}
                      <p className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Frequency: {order.frequency}
                      </p>
                      {order.route && <p>Route: {order.route}</p>}
                      {order.duration && <p>Duration: {order.duration}</p>}
                      {order.fortification && (
                        <p className="flex items-center gap-1">
                          <Beaker className="w-3 h-3" />
                          Fortification: {order.fortification.type} - {order.fortification.amount}
                        </p>
                      )}
                      {order.specialInstructions && (
                        <p className="text-slate-500 italic">"{order.specialInstructions}"</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Ordered by {order.orderedBy} on {order.orderedAt.toLocaleString()}
                    </p>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setOrderToCancel(order.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Cancel Order</DialogTitle>
                        <DialogDescription>
                          Please provide a reason for cancelling this order.
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        placeholder="Reason for cancellation..."
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setOrderToCancel(null)}>
                          Keep Order
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={handleCancelOrder}
                          disabled={!cancelReason}
                        >
                          Cancel Order
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Other Orders */}
      {otherOrders.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500" />
            Completed/Cancelled Orders
          </h3>
          {otherOrders.map((order) => (
            <Card key={order.id} className="border-l-4 border-l-slate-300 opacity-75">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  {getFeedingIcon(order.feedingType)}
                  <span className="font-semibold capitalize">{order.feedingType.replace('_', ' ')}</span>
                  <Badge variant="outline">{order.status}</Badge>
                </div>
                {order.specialInstructions && (
                  <p className="text-sm text-slate-500 mt-2">{order.specialInstructions}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
