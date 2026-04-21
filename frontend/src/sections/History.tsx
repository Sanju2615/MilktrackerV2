import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FeedingSession, FeedingType } from '@/types';
import { format, isToday, isYesterday } from 'date-fns';
import { Baby, Milk, Droplets, Trash2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface HistoryProps {
  feedings: FeedingSession[];
  onDelete: (id: string) => void;
}

export function History({ feedings, onDelete }: HistoryProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Group feedings by date
  const groupedFeedings = feedings.reduce((groups, feeding) => {
    const dateKey = format(feeding.startTime, 'yyyy-MM-dd');
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(feeding);
    return groups;
  }, {} as Record<string, FeedingSession[]>);

  // Sort dates in descending order
  const sortedDates = Object.keys(groupedFeedings).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  const getFeedingIcon = (type: FeedingType) => {
    switch (type) {
      case 'breast':
        return <Baby className="w-4 h-4 text-pink-500" />;
      case 'bottle':
        return <Milk className="w-4 h-4 text-blue-500" />;
      case 'pumping':
        return <Droplets className="w-4 h-4 text-purple-500" />;
    }
  };

  const getFeedingLabel = (feeding: FeedingSession) => {
    switch (feeding.type) {
      case 'breast':
        return `Breastfeeding ${feeding.side ? `(${feeding.side})` : ''}`;
      case 'bottle':
        return `Bottle ${feeding.amount ? `• ${feeding.amount}ml` : ''}`;
      case 'pumping':
        return `Pumping ${feeding.amount ? `• ${feeding.amount}ml` : ''}`;
    }
  };

  const getDailyTotal = (dayFeedings: FeedingSession[]) => {
    const bottleAmount = dayFeedings
      .filter(f => f.type === 'bottle')
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    const pumpedAmount = dayFeedings
      .filter(f => f.type === 'pumping')
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    
    return { bottleAmount, pumpedAmount };
  };

  if (feedings.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Milk className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No feedings recorded</h3>
          <p className="text-slate-500">Start logging your baby's feedings to see them here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">Feeding History</h2>
      
      {sortedDates.map((dateKey) => {
        const dayFeedings = groupedFeedings[dateKey].sort(
          (a, b) => b.startTime.getTime() - a.startTime.getTime()
        );
        const isExpanded = expandedDate === dateKey;
        const { bottleAmount, pumpedAmount } = getDailyTotal(dayFeedings);

        return (
          <Card key={dateKey} className="border-slate-200 overflow-hidden">
            <CardHeader 
              className="bg-slate-50 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => setExpandedDate(isExpanded ? null : dateKey)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                  <CardTitle className="text-lg">{getDateLabel(dateKey)}</CardTitle>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-600">
                    {dayFeedings.length} feeding{dayFeedings.length !== 1 ? 's' : ''}
                  </span>
                  {(bottleAmount > 0 || pumpedAmount > 0) && (
                    <span className="text-slate-500">
                      {bottleAmount > 0 && `${bottleAmount}ml bottle`}
                      {bottleAmount > 0 && pumpedAmount > 0 && ' • '}
                      {pumpedAmount > 0 && `${pumpedAmount}ml pumped`}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {dayFeedings.map((feeding) => (
                    <div
                      key={feeding.id}
                      className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                          {getFeedingIcon(feeding.type)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {getFeedingLabel(feeding)}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(feeding.startTime, 'h:mm a')}
                            </span>
                            {feeding.duration && (
                              <span>{feeding.duration} min</span>
                            )}
                          </div>
                          {feeding.notes && (
                            <p className="text-sm text-slate-500 mt-1">{feeding.notes}</p>
                          )}
                        </div>
                      </div>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Feeding</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this feeding record? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDelete(feeding.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
  