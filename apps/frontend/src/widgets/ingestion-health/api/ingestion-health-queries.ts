import { httpGet } from '@/shared/api';
import type { IngestionHealth } from '../model/types';

export const ingestionHealthKeys = {
  all: ['ingestion-health'] as const,
};

export function fetchIngestionHealth(): Promise<IngestionHealth> {
  return httpGet<IngestionHealth>('/ingestion/health');
}
