import type { Chain } from '@/shared/realtime/events';

export interface PublishedCallView {
  id: string;
  chain: Chain;
  address: string;
  ticker: string | null;
  tier: 'STRONG' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'FAILED';
  classification: string;
  message: string;
  publishedChannelIds: ReadonlyArray<string>;
  failedChannelIds: ReadonlyArray<string>;
  status: 'PUBLISHED' | 'FAILED';
}
