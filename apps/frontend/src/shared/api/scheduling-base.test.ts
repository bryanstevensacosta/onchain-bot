// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it } from 'vitest';

import { SCHEDULING_PREFIX, schedulingPath } from './scheduling-base';

describe('schedulingPath', () => {
  it('routes through the same-origin /scheduling-api proxy by default', () => {
    expect(schedulingPath('/api/scheduling/ads')).toBe(
      '/scheduling-api/api/scheduling/ads',
    );
  });

  it('normalises a missing leading slash', () => {
    expect(schedulingPath('api/scheduling/rotation-config')).toBe(
      '/scheduling-api/api/scheduling/rotation-config',
    );
  });

  it('keeps the media library routes behind the same prefix', () => {
    expect(schedulingPath('/api/scheduling/media/library')).toBe(
      '/scheduling-api/api/scheduling/media/library',
    );
  });

  it('uses an absolute VITE_PUBLISHING_QUEUE_URL override without the proxy prefix', () => {
    expect(schedulingPath('/api/scheduling/ads', 'http://localhost:4080')).toBe(
      'http://localhost:4080/api/scheduling/ads',
    );
  });

  it('strips a trailing slash from the override base', () => {
    expect(
      schedulingPath(
        '/api/scheduling/rotation-config',
        'http://localhost:4080/',
      ),
    ).toBe('http://localhost:4080/api/scheduling/rotation-config');
  });

  it('exposes the proxy prefix for route mocking', () => {
    expect(SCHEDULING_PREFIX).toBe('/scheduling-api');
  });
});
