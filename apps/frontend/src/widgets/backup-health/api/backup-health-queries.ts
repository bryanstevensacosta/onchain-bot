import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { BackupStatus } from '../model/types';

export const backupHealthKeys = {
  all: ['backup-health'] as const,
};

export function fetchBackupHealth(): Promise<BackupStatus> {
  return httpGet<BackupStatus>(ENDPOINTS.ops.backupStatus);
}
