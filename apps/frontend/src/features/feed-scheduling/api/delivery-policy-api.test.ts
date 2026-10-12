// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deliveryPolicyFromRotationConfig,
  deliveryPolicyPath,
  fetchDeliveryPolicy,
  updateDeliveryPolicy,
  type DeliveryPolicy,
} from './delivery-policy-api';
import type { RotationConfigView } from './scheduling-api';
import { HttpError } from '@/shared/api/http-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePolicy(overrides: Partial<DeliveryPolicy> = {}): DeliveryPolicy {
  return {
    delayMinMs: 60_000,
    delayMaxMs: 120_000,
    dailyCap: 20,
    resetHour: 0,
    ...overrides,
  };
}

function makeRotationConfig(
  overrides: Partial<RotationConfigView> = {},
): RotationConfigView {
  return {
    enabled: true,
    everyNPosts: 6,
    minMinutesBetweenAds: 45,
    telegram: { publishDelayMs: 60_000, dailyCap: 20 },
    threads: { publishDelayMs: 90_000, dailyCap: 10 },
    ...overrides,
  };
}

describe('deliveryPolicyPath', () => {
  it('builds the per-target delivery-policy URL', () => {
    expect(deliveryPolicyPath('telegram')).toBe(
      '/scheduling-api/api/scheduling/delivery-policies/telegram',
    );
    expect(deliveryPolicyPath('threads')).toBe(
      '/scheduling-api/api/scheduling/delivery-policies/threads',
    );
  });
});

describe('deliveryPolicyFromRotationConfig', () => {
  it('maps the legacy scalar delay to a pinned window (A4 split)', () => {
    expect(
      deliveryPolicyFromRotationConfig(makeRotationConfig(), 'telegram'),
    ).toEqual({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      dailyCap: 20,
      resetHour: 0,
    });
  });

  it('picks the requested target section', () => {
    expect(
      deliveryPolicyFromRotationConfig(makeRotationConfig(), 'threads'),
    ).toEqual({
      delayMinMs: 90_000,
      delayMaxMs: 90_000,
      dailyCap: 10,
      resetHour: 0,
    });
  });
});

describe('fetchDeliveryPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs the new route and resolves with the view', async () => {
    const policy = makePolicy();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(policy));

    const result = await fetchDeliveryPolicy('telegram');

    expect(result).toEqual(policy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling-api/api/scheduling/delivery-policies/telegram',
    );
  });

  it('falls back to rotation-config on 404 and maps the A4 split', async () => {
    const legacy = makeRotationConfig();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ message: 'nope' }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(legacy));

    const result = await fetchDeliveryPolicy('telegram');

    expect(result).toEqual({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      dailyCap: 20,
      resetHour: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/scheduling-api/api/scheduling/rotation-config',
    );
  });

  it('rethrows non-404 errors without touching the legacy route', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ message: 'boom' }, { status: 500 }));

    await expect(fetchDeliveryPolicy('telegram')).rejects.toThrow(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('updateDeliveryPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PATCHes the new route with the patch and resolves with the view', async () => {
    const policy = makePolicy({ dailyCap: 5 });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(policy));

    const result = await updateDeliveryPolicy('threads', { dailyCap: 5 });

    expect(result).toEqual(policy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/scheduling-api/api/scheduling/delivery-policies/threads',
    );
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ dailyCap: 5 }));
  });
});
