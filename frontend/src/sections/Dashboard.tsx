import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Baby, Droplets, Clock, Activity, Milk, TrendingUp } from 'lucide-react';
import type { FeedingSession } from '@/types';
import { useStats } from '@/hooks/useStats';
import { format } from 'date-fns';

interface DashboardProps {
  feedings: FeedingSession[];
  onLogFeeding: () => void;
}

export function Dashboard({ feedings, onLogFeeding }: DashboardProps) {
  const { todayStats, recentFeedings } = useStats(feedings);

  const getLastFeedingText = () => {
    if (recentFeedings.length === 0) return 'No feedings yet';
    const last = recentFeedings[0];
    const timeStr = format(last.startTime, 'h:mm a');
    
    if (last.type === 'breast') {
      return `Breastfeeding • ${timeStr} ${last.side ? `(${last.side})` : ''}`;
    } else if (last.type === 'bottle') {
      return `Bottle • ${timeStr} ${last.amount ? `• ${last.amount}ml` : ''}`;
    } else {
      return `Pumping • ${timeStr} ${last.amount ? `• ${last.amount}ml` : ''}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Milk Tracker</h1>
          <p className="text-slate-500 mt-1">Monitor your baby's feeding journey</p>
        </div>
        <button
          onClick={onLogFeeding}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-blue-200"
        >
          <Milk className="w-5 h-5" />
          Log Feeding
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Today's Feedings</p>
                <p className="text-2xl font-bold text-slate-800">{todayStats.totalFeedings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Volume</p>
                <p className="text-2xl font-bold text-slate-800">{todayStats.totalAmount}ml</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center">
                <Baby className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Breastfeeding</p>
                <p className="text-2xl font-bold text-slate-800">{todayStats.breastFeedings}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Pumped Today</p>
                <p className="text-2xl font-bold text-slate-800">{todayStats.totalPumped}ml</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Feeding & Quick Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-500" />
              Last Feeding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700">{getLastFeedingText()}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Milk className="w-5 h-5 text-slate-500" />
              Quick Tip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 text-sm">
              Newborns typically feed 8-12 times per day. Track each session to identify patterns and ensure your baby is getting enough nutrition.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
