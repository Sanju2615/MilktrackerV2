import { useState, useEffect, useCallback } from 'react';
import { discardReasonService, type DiscardReason } from '@/services/discardReasonService';

export function useDiscardReasons() {
  const [reasons, setReasons] = useState<DiscardReason[]>([]);
  const [activeReasons, setActiveReasons] = useState<DiscardReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = discardReasonService.subscribe((allReasons) => {
      setReasons(allReasons);
      setActiveReasons(allReasons.filter(r => r.isActive));
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const addReason = useCallback((reason: Omit<DiscardReason, 'id' | 'createdAt' | 'updatedAt'>) => {
    return discardReasonService.addReason(reason);
  }, []);

  const updateReason = useCallback((id: string, updates: Partial<Omit<DiscardReason, 'id' | 'createdAt'>>) => {
    return discardReasonService.updateReason(id, updates);
  }, []);

  const toggleReasonActive = useCallback((id: string) => {
    return discardReasonService.toggleReasonActive(id);
  }, []);

  const deleteReason = useCallback((id: string) => {
    return discardReasonService.deleteReason(id);
  }, []);

  const resetToDefaults = useCallback(() => {
    discardReasonService.resetToDefaults();
  }, []);

  const valueExists = useCallback((value: string, excludeId?: string) => {
    return discardReasonService.valueExists(value, excludeId);
  }, []);

  const getReasonByValue = useCallback((value: string) => {
    return discardReasonService.getReasonByValue(value);
  }, []);

  const exportReasons = useCallback(() => {
    return discardReasonService.exportToJSON();
  }, []);

  const importReasons = useCallback((json: string) => {
    return discardReasonService.importFromJSON(json);
  }, []);

  return {
    reasons,
    activeReasons,
    isLoading,
    addReason,
    updateReason,
    toggleReasonActive,
    deleteReason,
    resetToDefaults,
    valueExists,
    getReasonByValue,
    exportReasons,
    importReasons,
  };
}
