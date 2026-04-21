import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FeedingType, BreastSide, FeedingSession } from '@/types';
import { Baby, Milk, Droplets, ArrowLeft, Play, Square, Timer } from 'lucide-react';

interface FeedingFormProps {
  onSave: (feeding: Omit<FeedingSession, 'id'>) => void;
  onCancel: () => void;
}

export function FeedingForm({ onSave, onCancel }: FeedingFormProps) {
  const [type, setType] = useState<FeedingType>('breast');
  const [side, setSide] = useState<BreastSide>('left');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [customStartTime, setCustomStartTime] = useState('');

  // Timer logic
  const startTimer = () => {
    setIsTimerRunning(true);
    setStartTime(new Date());
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    (window as any).timerInterval = interval;
  };

  const stopTimer = () => {
    setIsTimerRunning(false);
    if ((window as any).timerInterval) {
      clearInterval((window as any).timerInterval);
    }
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const feedingStartTime = customStartTime 
      ? new Date(customStartTime)
      : startTime || new Date();

    const feeding: Omit<FeedingSession, 'id'> = {
      type,
      startTime: feedingStartTime,
      duration: elapsedTime > 0 ? Math.floor(elapsedTime / 60) : undefined,
      notes: notes || undefined,
    };

    if (type === 'breast') {
      feeding.side = side;
    }

    if ((type === 'bottle' || type === 'pumping') && amount) {
      feeding.amount = parseInt(amount, 10);
    }

    onSave(feeding);
    
    // Reset form
    setType('breast');
    setSide('left');
    setAmount('');
    setNotes('');
    setElapsedTime(0);
    setStartTime(null);
    setCustomStartTime('');
    setIsTimerRunning(false);
    if ((window as any).timerInterval) {
      clearInterval((window as any).timerInterval);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <CardTitle>Log Feeding Session</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Feeding Type */}
          <div className="space-y-3">
            <Label>Feeding Type</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setType('breast')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                  type === 'breast'
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : 'border-slate-200 hover:border-pink-200'
                }`}
              >
                <Baby className="w-6 h-6" />
                <span className="text-sm font-medium">Breast</span>
              </button>
              <button
                type="button"
                onClick={() => setType('bottle')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                  type === 'bottle'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-blue-200'
                }`}
              >
                <Milk className="w-6 h-6" />
                <span className="text-sm font-medium">Bottle</span>
              </button>
              <button
                type="button"
                onClick={() => setType('pumping')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                  type === 'pumping'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 hover:border-purple-200'
                }`}
              >
                <Droplets className="w-6 h-6" />
                <span className="text-sm font-medium">Pumping</span>
              </button>
            </div>
          </div>

          {/* Breast Side (only for breast feeding) */}
          {type === 'breast' && (
            <div className="space-y-3">
              <Label>Side</Label>
              <RadioGroup value={side} onValueChange={(v) => setSide(v as BreastSide)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="left" id="left" />
                  <Label htmlFor="left" className="cursor-pointer">Left</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="right" id="right" />
                  <Label htmlFor="right" className="cursor-pointer">Right</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="both" id="both" />
                  <Label htmlFor="both" className="cursor-pointer">Both</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Amount (for bottle and pumping) */}
          {(type === 'bottle' || type === 'pumping') && (
            <div className="space-y-3">
              <Label htmlFor="amount">Amount (ml)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount in ml"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg"
              />
            </div>
          )}

          {/* Timer (for breast feeding) */}
          {type === 'breast' && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Timer className="w-4 h-4" />
                Duration Timer
              </Label>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-mono font-bold text-slate-700 bg-slate-100 px-4 py-2 rounded-lg">
                  {formatElapsedTime(elapsedTime)}
                </div>
                {!isTimerRunning ? (
                  <Button
                    type="button"
                    onClick={startTimer}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={stopTimer}
                    variant="outline"
                    className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Custom Start Time */}
          <div className="space-y-3">
            <Label htmlFor="startTime">Start Time (optional)</Label>
            <Input
              id="startTime"
              type="datetime-local"
              value={customStartTime}
              onChange={(e) => setCustomStartTime(e.target.value)}
            />
            {!customStartTime && (
              <p className="text-sm text-slate-500">Defaults to current time</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any observations or notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-blue-500 hover:bg-blue-600">
              Save Feeding
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
