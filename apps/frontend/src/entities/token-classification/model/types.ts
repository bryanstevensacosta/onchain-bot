import type { Chain } from '@/shared/realtime/events';

export type Classification =
  | 'TOKEN'
  | 'POOL'
  | 'ROUTER'
  | 'NFT'
  | 'SCAM'
  | 'UNKNOWN';

export interface TokenClassificationView {
  id: string;
  chain: Chain;
  address: string;
  classification: Classification;
  securityFlag: string;
  confidence: number;
  riskWeight: number;
  signals: ReadonlyArray<string>;
  classifiedAt: string;
}

export function classificationTone(
  c: Classification,
): 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'gray' {
  switch (c) {
    case 'TOKEN':
      return 'green';
    case 'POOL':
    case 'ROUTER':
      return 'yellow';
    case 'NFT':
      return 'blue';
    case 'SCAM':
      return 'red';
    case 'UNKNOWN':
      return 'gray';
    default:
      return 'gray';
  }
}
