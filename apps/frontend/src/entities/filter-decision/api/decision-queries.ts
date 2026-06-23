import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { FilterDecisionView } from '../model/types';

export const decisionKeys = {
  all: ['decision'] as const,
  recent: (limit = 30) => [...decisionKeys.all, 'recent', limit] as const,
  approved: (limit = 30) => [...decisionKeys.all, 'approved', limit] as const,
  rejected: (limit = 30) => [...decisionKeys.all, 'rejected', limit] as const,
  byToken: (chain: string, address: string) =>
    [...decisionKeys.all, chain, address] as const,
};

export async function fetchRecentDecisions(
  limit = 30,
): Promise<ReadonlyArray<FilterDecisionView>> {
  return httpGet<ReadonlyArray<FilterDecisionView>>(
    `${ENDPOINTS.filters.recent}?limit=${limit}`,
  );
}

export async function fetchApproved(
  limit = 30,
): Promise<ReadonlyArray<FilterDecisionView>> {
  return httpGet<ReadonlyArray<FilterDecisionView>>(
    `${ENDPOINTS.filters.approved}?limit=${limit}`,
  );
}

export async function fetchRejected(
  limit = 30,
): Promise<ReadonlyArray<FilterDecisionView>> {
  return httpGet<ReadonlyArray<FilterDecisionView>>(
    `${ENDPOINTS.filters.rejected}?limit=${limit}`,
  );
}

export async function fetchDecisionByToken(
  chain: string,
  address: string,
): Promise<FilterDecisionView> {
  return httpGet<FilterDecisionView>(ENDPOINTS.filters.byToken(chain, address));
}
