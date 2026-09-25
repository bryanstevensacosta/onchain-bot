// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it } from 'vitest';

import {
  FEED_PUBLISHER_PREFIX,
  feedPublisherPath,
} from './feed-publisher-base';

describe('feedPublisherPath', () => {
  it('routes through the same-origin /feed-api proxy by default', () => {
    expect(feedPublisherPath('/api/queue/stats')).toBe(
      '/feed-api/api/queue/stats',
    );
  });

  it('normalises a missing leading slash', () => {
    expect(feedPublisherPath('api/llm/config')).toBe(
      '/feed-api/api/llm/config',
    );
  });

  it('keeps the non-api matching routes behind the same prefix', () => {
    expect(feedPublisherPath('/feed-publisher/matching/config')).toBe(
      '/feed-api/feed-publisher/matching/config',
    );
  });

  it('uses an absolute VITE_FEED_PUBLISHER_URL override without the proxy prefix', () => {
    expect(feedPublisherPath('/api/queue/stats', 'http://localhost:3040')).toBe(
      'http://localhost:3040/api/queue/stats',
    );
  });

  it('strips a trailing slash from the override base', () => {
    expect(feedPublisherPath('/api/llm/flags', 'http://localhost:3040/')).toBe(
      'http://localhost:3040/api/llm/flags',
    );
  });

  it('exposes the proxy prefix for route mocking', () => {
    expect(FEED_PUBLISHER_PREFIX).toBe('/feed-api');
  });
});
