import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EMRPatient, FeedingOrder } from '@/types/emr';
import { 
  FileText, 
  Clock, 
  AlertCircle, 
  Check,
  Beaker,
  Baby,
  Milk,
  Droplets,
  Database
} from 'lucide-react';

interface CPOEOrderEntryProps {
  patient: EMRPatient;
  patientOrders: FeedingOrder[];
  isLoading?: boolean;
}

export function CPOEOrderEntry({ patient, patientOrders, isLoading = false }: CPOEOrderEntryProps) {
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
            {patient.firstName} {patient.lastName} &bull; MRN: {patient.mrn}
          </p>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 flex items-center gap-1.5 py-1.5 px-3">
          <Database className="w-3.5 h-3.5" />
          Orders from TrakCare
        </Badge>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-center py-6">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading orders from TrakCare...</p>
        </div>
      )}

      {/* Active Orders */}
      {!isLoading && (
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
                <p className="text-xs text-slate-400 mt-1">Orders are managed in TrakCare CPOE</p>
              </CardContent>
            </Card>
          ) : (
            activeOrders.map((order) => (
              <Card key={order.id} className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
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
                      Ordered by {order.orderedBy} on {order.orderedAt instanceof Date ? order.orderedAt.toLocaleString() : String(order.orderedAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Other Orders */}
      {!isLoading && otherOrders.length > 0 && (
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

      {/* TrakCare info footer */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> All feeding orders are sourced from TrakCare CPOE. 
          To create or modify orders, please use the TrakCare clinical system directly.
        </p>
      </div>
    </div>
  );
}
