// Discard Reasons Management Service - Fetches REAL data from backend API
import { discardReasonsApi } from './api';

export interface DiscardReason { id: string; value: string; label: string; description: string; iconName: string; isActive: boolean; requiresNotes: boolean; createdAt: Date; updatedAt: Date; }

function mapApiReasonToDiscardReason(apiReason: any): DiscardReason {
  return { id: apiReason.id, value: apiReason.reasonValue, label: apiReason.reasonLabel, description: apiReason.description, iconName: apiReason.iconName || 'FileText', isActive: apiReason.isActive === 1 || apiReason.isActive === '1' || apiReason.isActive === true, requiresNotes: apiReason.requiresNotes === 1 || apiReason.requiresNotes === '1' || apiReason.requiresNotes === true, createdAt: new Date(), updatedAt: new Date() };
}

class DiscardReasonService {
  private listeners: ((reasons: DiscardReason[]) => void)[] = [];
  private cache: DiscardReason[] | null = null;

  subscribe(listener: (reasons: DiscardReason[]) => void): () => void {
    this.listeners.push(listener);
    this.getAllReasons().then(reasons => listener(reasons));
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notifyListeners(reasons: DiscardReason[]) { this.listeners.forEach(listener => listener([...reasons])); }

  async getAllReasons(): Promise<DiscardReason[]> {
    try {
      const response = await discardReasonsApi.getAll(true);
      if (response.success) { const reasons = response.data.map(mapApiReasonToDiscardReason); this.cache = reasons; this.notifyListeners(reasons); return reasons; }
      return this.cache || [];
    } catch (error) { console.error('Failed to fetch discard reasons:', error); return this.cache || []; }
  }

  async getActiveReasons(): Promise<DiscardReason[]> {
    try { const response = await discardReasonsApi.getAll(false); return response.success ? response.data.map(mapApiReasonToDiscardReason) : []; }
    catch (error) { console.error('Failed to fetch active discard reasons:', error); return []; }
  }

  async getReasonByValue(value: string): Promise<DiscardReason | undefined> { const reasons = await this.getAllReasons(); return reasons.find(r => r.value === value); }

  async addReason(reason: Omit<DiscardReason, 'id' | 'createdAt' | 'updatedAt'>): Promise<DiscardReason> {
    const response = await discardReasonsApi.create({ value: reason.value, label: reason.label, description: reason.description, iconName: reason.iconName, requiresNotes: reason.requiresNotes });
    if (!response.success) throw new Error('Failed to create discard reason');
    await this.getAllReasons();
    const reasons = await this.getAllReasons();
    return reasons.find(r => r.value === reason.value) || { ...reason, id: response.data.id, createdAt: new Date(), updatedAt: new Date() };
  }

  async updateReason(id: string, updates: Partial<Omit<DiscardReason, 'id' | 'createdAt'>>): Promise<DiscardReason | null> {
    const response = await discardReasonsApi.update(id, { label: updates.label, description: updates.description, iconName: updates.iconName, requiresNotes: updates.requiresNotes, isActive: updates.isActive });
    if (!response.success) throw new Error('Failed to update discard reason');
    await this.getAllReasons();
    return this.getReasonById(id);
  }

  async getReasonById(id: string): Promise<DiscardReason | undefined> {
    try { const response = await discardReasonsApi.getById(id); return response.success ? mapApiReasonToDiscardReason(response.data) : undefined; }
    catch (error) { console.error('Failed to fetch discard reason:', error); return undefined; }
  }

  async toggleReasonActive(id: string): Promise<boolean> {
    try {
      const response = await discardReasonsApi.toggle(id);
      if (response.success) { await this.getAllReasons(); return true; }
      return false;
    } catch (error) {
      console.error('Failed to toggle discard reason:', error);
      return false;
    }
  }

  async deleteReason(id: string): Promise<boolean> {
    const response = await discardReasonsApi.delete(id);
    if (response.success) { await this.getAllReasons(); return true; }
    return false;
  }

  async valueExists(value: string, excludeId?: string): Promise<boolean> { const reasons = await this.getAllReasons(); return reasons.some(r => r.value === value && r.id !== excludeId); }

  async resetToDefaults(): Promise<void> {
    // Re-fetch all reasons from backend (which has system defaults)
    await this.getAllReasons();
  }

  exportToJSON(): string {
    return JSON.stringify(this.cache || [], null, 2);
  }

  async importFromJSON(json: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return false;
      // Import each reason
      for (const reason of parsed) {
        if (reason.value && reason.label && reason.description) {
          try {
            await this.addReason({
              value: reason.value,
              label: reason.label,
              description: reason.description,
              iconName: reason.iconName || 'FileText',
              isActive: reason.isActive !== false,
              requiresNotes: reason.requiresNotes || false,
            });
          } catch {
            // Skip duplicates
          }
        }
      }
      await this.getAllReasons();
      return true;
    } catch {
      return false;
    }
  }
}

export const discardReasonService = new DiscardReasonService();
