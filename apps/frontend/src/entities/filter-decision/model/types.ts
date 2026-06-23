import type { Chain } from '@/shared/realtime/events';

export interface FilterDecisionView {
  id: string;
  chain: Chain;
  address: string;
  verdict: 'APPROVED' | 'REJECTED';
  score: number;
  classification: string;
  reasons: ReadonlyArray<string>;
  decidedAt: string;
}
