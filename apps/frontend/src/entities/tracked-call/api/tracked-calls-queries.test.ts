import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/shared/api', () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));

vi.mock('@/shared/api/endpoints', () => ({
  ENDPOINTS: {
    trackedCalls: {
      list: '/call-tracking/tracked',
      detail: (chain: string, address: string) =>
        `/call-tracking/tracked/${chain}/${address}`,
      gateAllow: '/call-tracking/gate-allow',
    },
  },
}));

import { httpGet, httpPost } from '@/shared/api';
import {
  buildQuery as exportedBuildQuery,
  fetchTrackedCalls,
  fetchTrackedCall,
  postGateAllow,
  trackedCallKeys,
} from './tracked-calls-queries';

const buildQuery = exportedBuildQuery as unknown as { __b: unknown } as never;
void buildQuery;

describe('tracked-calls-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchTrackedCalls', () => {
    it('calls httpGet with empty query when no filters', async () => {
      (httpGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await fetchTrackedCalls();
      expect(httpGet).toHaveBeenCalledWith('/call-tracking/tracked');
    });

    it('appends query params for min_milestone, max_price_drop, has_milestones, limit', async () => {
      (httpGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await fetchTrackedCalls({
        minMilestone: 2,
        maxPriceDrop: 90,
        hasMilestones: true,
        limit: 25,
      });
      expect(httpGet).toHaveBeenCalledWith(
        '/call-tracking/tracked?min_milestone=2&max_price_drop=90&has_milestones=true&limit=25',
      );
    });

    it('skips undefined filters', async () => {
      (httpGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await fetchTrackedCalls({ minMilestone: 5 });
      expect(httpGet).toHaveBeenCalledWith(
        '/call-tracking/tracked?min_milestone=5',
      );
    });
  });

  describe('fetchTrackedCall', () => {
    it('builds detail path', async () => {
      (httpGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
      await fetchTrackedCall('solana', 'ABC');
      expect(httpGet).toHaveBeenCalledWith('/call-tracking/tracked/solana/ABC');
    });
  });

  describe('postGateAllow', () => {
    it('POSTs body and returns result', async () => {
      (httpPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: true,
        reasons: [],
      });
      const out = await postGateAllow({ chain: 'solana', address: 'ABC' });
      expect(httpPost).toHaveBeenCalledWith('/call-tracking/gate-allow', {
        chain: 'solana',
        address: 'ABC',
      });
      expect(out.allowed).toBe(true);
    });
  });

  describe('trackedCallKeys', () => {
    it('builds list key with filters', () => {
      const k = trackedCallKeys.list({ minMilestone: 2 });
      expect(k[0]).toBe('tracked-calls');
      expect(k[1]).toBe('list');
    });

    it('builds detail key', () => {
      const k = trackedCallKeys.detail('solana', 'ABC');
      expect(k).toContain('solana');
      expect(k).toContain('ABC');
    });
  });
});
