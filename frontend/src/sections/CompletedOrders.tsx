/**
 * Completed Orders Page
 * Displays feeding_administrations data with incremental numeric IDs
 * Shows all completed feeding administrations with details
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { feedingApi } from '@/services/api';
import {
  CheckCircle2,
  Search,
  RefreshCw,
  Clock,
  Droplets,
  User,
  FileText,
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Baby,
  Barcode,
} from 'lucide-react';
import { toast } from 'sonner';

interface CompletedOrder {
  id: number;
  patientMrn: string;
  patientName: string;
  orderId?: string;
  barcode?: string;
  volumeOrderedMl?: number;
  volumeGivenMl: number;
  feedingType: string;
  route?: string;
  administeredAt: string;
  administeredByName?: string;
  administeredByUserId?: string;
  tolerance?: string;
  residualMl?: number;
  vomit?: boolean;
  stool?: boolean;
  notes?: string;
  verificationMethod: string;
  currentMilkVolume?: number;
  currentMilkStatus?: string;
  milkType?: string;
}

export function CompletedOrders() {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMrn, setSearchMrn] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (searchMrn.trim()) {
        params.patientMrn = searchMrn.trim();
      }
      const response = await feedingApi.getCompletedFeedings(params);
      if (response.success) {
        setOrders(response.data || []);
        if (response.pagination) {
          setTotalPages(response.pagination.totalPages || 1);
          setTotal(response.pagination.total || 0);
        }
      }
    } catch (err: any) {
      toast.error('Failed to load completed orders', { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [page, searchMrn]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = () => {
    setPage(1);
    fetchOrders();
  };

  const getVerificationBadge = (method: string) => {
    if (method === 'manual_override') {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
          <ShieldAlert className="w-3 h-3 mr-1" />
          Override
        </Badge>
      );
    }
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
        <ShieldCheck className="w-3 h-3 mr-1" />
        Barcode
      </Badge>
    );
  };

  const getToleranceBadge = (tolerance: string | undefined) => {
    if (!tolerance) return null;
    const colors: Record<string, string> = {
      'well-tolerated': 'bg-green-100 text-green-700',
      'good': 'bg-green-100 text-green-700',
      'minimal-residue': 'bg-yellow-100 text-yellow-700',
      'fair': 'bg-yellow-100 text-yellow-700',
      'moderate-residue': 'bg-orange-100 text-orange-700',
      'poorly-tolerated': 'bg-red-100 text-red-700',
      'poor': 'bg-red-100 text-red-700',
    };
    return (
      <Badge className={`${colors[tolerance] || 'bg-slate-100 text-slate-700'} text-xs capitalize`}>
        {tolerance.replace(/-/g, ' ')}
      </Badge>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-500" />
            Completed Orders
          </h2>
          <p className="text-slate-500 text-sm">
            Feeding administration records ({total} total)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Filter by MRN..."
            value={searchMrn}
            onChange={(e) => setSearchMrn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>Search</Button>
        {searchMrn && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchMrn(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-8 text-slate-500">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-slate-300" />
          <p>Loading completed orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="p-8 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No completed orders found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchMrn ? `No results for MRN: ${searchMrn}` : 'Feeding administrations will appear here after recording'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const displayId = order.id;
            return (
              <Card key={order.id} className="hover:shadow-md transition-shadow border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-700">#{displayId}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {order.feedingType?.replace(/_/g, ' ') || 'N/A'}
                        </Badge>
                        {getVerificationBadge(order.verificationMethod)}
                        {getToleranceBadge(order.tolerance)}
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        {/* Patient */}
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Baby className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                          <span className="truncate">{order.patientName}</span>
                          <span className="text-xs text-slate-400 font-mono">({order.patientMrn})</span>
                        </div>

                        {/* Volume */}
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Droplets className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>
                            <strong>{order.volumeGivenMl}ml</strong> given
                            {order.volumeOrderedMl ? ` / ${order.volumeOrderedMl}ml ordered` : ''}
                          </span>
                        </div>

                        {/* Nurse */}
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <User className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          <span className="truncate">{order.administeredByName || 'N/A'}</span>
                        </div>

                        {/* Time */}
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{order.administeredAt ? new Date(order.administeredAt).toLocaleString() : 'N/A'}</span>
                        </div>
                      </div>

                      {/* Barcode & extra info */}
                      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-slate-400">
                        {order.barcode && (
                          <span className="flex items-center gap-1">
                            <Barcode className="w-3 h-3" />
                            <span className="font-mono">{order.barcode}</span>
                          </span>
                        )}
                        {order.orderId && (
                          <span>Order: {order.orderId}</span>
                        )}
                        {order.route && (
                          <span className="capitalize">Route: {order.route.replace(/_/g, ' ')}</span>
                        )}
                        {order.vomit && (
                          <Badge className="bg-red-100 text-red-600 text-[10px]">Emesis</Badge>
                        )}
                      </div>

                      {/* Notes */}
                      {order.notes && (
                        <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 line-clamp-2">
                          {order.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
