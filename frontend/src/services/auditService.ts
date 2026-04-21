// Audit Trail Service - Fetches and logs REAL data via backend API
import { auditApi } from './api';
import type { AuditLogEntry } from '@/types/emr';

function mapApiAuditLogToEntry(log: any): AuditLogEntry {
  return { id: log.id, userId: log.userId, userName: log.userName, action: log.action as AuditLogEntry['action'], patientId: log.patientMrn, orderId: log.orderId, details: log.details, ipAddress: log.ipAddress, timestamp: new Date(log.createdAt) };
}

class AuditService {
  private localBuffer: AuditLogEntry[] = [];

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const newEntry: AuditLogEntry = { ...entry, id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date() };
    this.localBuffer.unshift(newEntry);
    try {
      await auditApi.log({ action: entry.action, entityType: entry.orderId ? 'feeding_order' : entry.patientId ? 'patient' : undefined, entityId: entry.orderId || entry.patientId, patientMrn: entry.patientId, orderId: entry.orderId, details: entry.details });
    } catch (error) { console.warn('Failed to log to backend:', error); }
    if (import.meta.env.DEV) console.log('[AUDIT]', newEntry);
  }

  async getLogs(filters?: { userId?: string; patientId?: string; action?: AuditLogEntry['action']; startDate?: Date; endDate?: Date }): Promise<AuditLogEntry[]> {
    try {
      const response = await auditApi.getLogs({ userId: filters?.userId, action: filters?.action, patientMrn: filters?.patientId, startDate: filters?.startDate?.toISOString(), endDate: filters?.endDate?.toISOString() });
      if (response.success) return response.data.map(mapApiAuditLogToEntry);
      return [];
    } catch (error) { console.error('Failed to fetch audit logs:', error); return this.localBuffer; }
  }

  clear(): void { this.localBuffer = []; }
}

export const auditService = new AuditService();
