import { lastValueFrom, of } from 'rxjs';
import { CacheInterceptor } from './cache.interceptor';

function makeInterceptor(cache: { get: jest.Mock; set: jest.Mock }): {
  interceptor: CacheInterceptor;
  response: { setHeader: jest.Mock; statusCode: number };
} {
  const reflector = { getAllAndOverride: () => 30 };
  const interceptor = new CacheInterceptor(cache as never, reflector as never);
  const response = { setHeader: jest.fn(), statusCode: 200 };
  return { interceptor, response };
}

function contextFor(response: unknown, method = 'GET', url = '/api/x') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => response,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

/**
 * Edge no-negative-cache (plan todo 19a): 2xx bodies with
 * `status: 'pending'` are NEVER written to the edge cache, so a
 * transient miss is recomputed on the next MISS instead of served
 * as a HIT. Ready bodies cache exactly as before.
 */
describe('CacheInterceptor (pending bodies bypass the edge cache)', () => {
  it('caches a ready 2xx object body', async () => {
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const body = { status: 'ready', priceUsd: 1 };
    const out = await lastValueFrom(
      await interceptor.intercept(contextFor(response), {
        handle: () => of(body),
      } as never),
    );
    expect(out).toEqual(body);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('GET:/api/x', body, 30);
    expect(response.setHeader).toHaveBeenCalledWith('x-cache', 'MISS');
  });

  it('serves a ready body through WITHOUT writing when it is pending', async () => {
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const body = { status: 'pending', priceUsd: null };
    const out = await lastValueFrom(
      await interceptor.intercept(contextFor(response), {
        handle: () => of(body),
      } as never),
    );
    expect(out).toEqual(body);
    expect(cache.set).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('x-cache', 'MISS');
  });

  it('serves a stale replay through WITHOUT writing (next request retries providers)', async () => {
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const body = { status: 'ready', stale: true, priceUsd: 1.5 };
    const out = await lastValueFrom(
      await interceptor.intercept(contextFor(response), {
        handle: () => of(body),
      } as never),
    );
    expect(out).toEqual(body);
    expect(cache.set).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('x-cache', 'MISS');
  });

  it('keeps caching fresh ready bodies carrying stale:false', async () => {
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const body = { status: 'ready', stale: false, priceUsd: 1.5 };
    await lastValueFrom(
      await interceptor.intercept(contextFor(response), {
        handle: () => of(body),
      } as never),
    );
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('serves an edge HIT without touching the handler', async () => {
    const cached = { status: 'ready', priceUsd: 9 };
    const cache = {
      get: jest.fn(async () => cached),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const handle = jest.fn(() => of({ status: 'ready' }));
    const out = await lastValueFrom(
      await interceptor.intercept(contextFor(response), { handle } as never),
    );
    expect(out).toEqual(cached);
    expect(handle).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('x-cache', 'HIT');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('passes non-GET requests through untouched', async () => {
    const cache = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { interceptor, response } = makeInterceptor(cache);
    const body = { status: 'pending' };
    const out = await lastValueFrom(
      await interceptor.intercept(contextFor(response, 'POST'), {
        handle: () => of(body),
      } as never),
    );
    expect(out).toEqual(body);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
