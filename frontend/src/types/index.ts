export type FeedingType = 'breast' | 'bottle' | 'pumping';
export type BreastSide = 'left' | 'right' | 'both';

export interface FeedingSession {
  id: string;
  type: FeedingType;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in minutes
  amount?: number; // in ml (for bottle and pumping)
  side?: BreastSide; // for breast feeding
  notes?: string;
}

export interface DailyStats {
  date: string;
  totalFeedings: number;
  totalAmount: number;
  breastFeedings: number;
  bottleFeedings: number;
  pumpingSessions: number;
  totalPumpedAmount: number;
}

export interface BabyInfo {
  name: string;
  birthDate: Date;
}
