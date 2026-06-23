import { httpGet } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { TokenScoreView } from '../model/types';

export const scoreKeys = {
  all: ['score'] as const,
  recent: (limit = 30) => [...scoreKeys.all, 'recent', limit] as const,
  top: (limit = 20) => [...scoreKeys.all, 'top', limit] as const,
  byToken: (chain: string, address: string) =>
    [...scoreKeys.all, chain, address] as const,
};

export async function fetchRecentScores(
  limit = 30,
): Promise<ReadonlyArray<TokenScoreView>> {
  return httpGet<ReadonlyArray<TokenScoreView>>(
    `${ENDPOINTS.scoring.recent}?limit=${limit}`,
  );
}

export async function fetchTopScores(
  limit = 20,
): Promise<ReadonlyArray<TokenScoreView>> {
  return httpGet<ReadonlyArray<TokenScoreView>>(
    `${ENDPOINTS.scoring.top}?limit=${limit}`,
  );
}

export async function fetchScoreByToken(
  chain: string,
  address: string,
): Promise<TokenScoreView> {
  return httpGet<TokenScoreView>(ENDPOINTS.scoring.byToken(chain, address));
}
