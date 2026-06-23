import type { Chain, ScoreTier } from '@/shared/realtime/events';

export interface TokenScoreView {
  id: string;
  chain: Chain;
  address: string;
  ticker?: string | null;
  score: number;
  tier: ScoreTier;
  classification: string;
  sourceCount: number;
  mentionCount: number;
  avgKolReputation: number;
  breakdown: ReadonlyArray<{ factor: string; delta: number; note: string }>;
  scoredAt: string;
  // Legacy fields for backward compatibility
  classifiedAt?: string;
}
