import { useMemo } from 'react';
import type { FeedingSession } from '@/types';
import { startOfDay, endOfDay, isSameDay, subDays, format } from 'date-fns';

export function useStats(feedings: FeedingSession[]) {
  const today = new Date();

  // Today's stats
  const todayStats = useMemo(() => {
    const todayFeedings = feedings.filter(f => isSameDay(f.startTime, today));
    
    return {
      totalFeedings: todayFeedings.length,
      totalAmount: todayFeedings.reduce((sum, f) => sum + (f.amount || 0), 0),
      breastFeedings: todayFeedings.filter(f => f.type === 'breast').length,
      bottleFeedings: todayFeedings.filter(f => f.type === 'bottle').length,
      pumpingSessions: todayFeedings.filter(f => f.type === 'pumping').length,
      totalPumped: todayFeedings.filter(f => f.type === 'pumping').reduce((sum, f) => sum + (f.amount || 0), 0),
    };
  }, [feedings, today]);

  // Last 7 days stats
  const weeklyStats = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));
    
    return last7Days.map(date => {
      const dayFeedings = feedings.filter(f => isSameDay(f.startTime, date));
      
      return {
        date: format(date, 'MMM dd'),
        fullDate: date,
        totalFeedings: dayFeedings.length,
        totalAmount: dayFeedings.reduce((sum, f) => sum + (f.amount || 0), 0),
        breastFeedings: dayFeedings.filter(f => f.type === 'breast').length,
        bottleFeedings: dayFeedings.filter(f => f.type === 'bottle').length,
        pumpingAmount: dayFeedings.filter(f => f.type === 'pumping').reduce((sum, f) => sum + (f.amount || 0), 0),
      };
    });
  }, [feedings, today]);

  // All time stats
  const allTimeStats = useMemo(() => {
    return {
      totalFeedings: feedings.length,
      totalAmount: feedings.reduce((sum, f) => sum + (f.amount || 0), 0),
      breastFeedings: feedings.filter(f => f.type === 'breast').length,
      bottleFeedings: feedings.filter(f => f.type === 'bottle').length,
      pumpingSessions: feedings.filter(f => f.type === 'pumping').length,
      totalPumped: feedings.filter(f => f.type === 'pumping').reduce((sum, f) => sum + (f.amount || 0), 0),
    };
  }, [feedings]);

  // Get feedings for a specific date range
  const getFeedingsForRange = (startDate: Date, endDate: Date) => {
    return feedings.filter(f => {
      const feedingDate = f.startTime;
      return feedingDate >= startOfDay(startDate) && feedingDate <= endOfDay(endDate);
    }).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  };

  // Get recent feedings (last 24 hours)
  const recentFeedings = useMemo(() => {
    const yesterday = subDays(today, 1);
    return feedings
      .filter(f => f.startTime >= yesterday)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, [feedings, today]);

  return {
    todayStats,
    weeklyStats,
    allTimeStats,
    recentFeedings,
    getFeedingsForRange,
  };
}
