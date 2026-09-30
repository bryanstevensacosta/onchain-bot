/**
 * Birdeye WS protocol shapes (Tramo 3 — Birdeye WS realtime).
 *
 * Verbatim message formats from the official docs; the app never
 * invents a subscription shape.
 *
 * @see https://docs.birdeye.so/docs/websocket
 * @see https://docs.birdeye.so/docs/subscribe_txs
 * @see https://docs.birdeye.so/docs/subscribe_new_pair
 */

/** Chain-scoped socket URL (key travels as `x-api-key` query param). */
export const BIRDEYE_WS_URL = 'wss://public-api.birdeye.so/socket/solana';

/** Subprotocol the Birdeye gateway requires on every WS handshake. */
export const BIRDEYE_WS_PROTOCOL = 'echo-protocol';

/** Keepalive: client ping cadence so idle NATs never drop the conn. */
export const BIRDEYE_WS_PING_INTERVAL_MS = 25_000;

export type BirdeyeWsSubscribeType = 'SUBSCRIBE_PRICE' | 'SUBSCRIBE_TXS' | 'SUBSCRIBE_NEW_PAIR';

export interface BirdeyeWsSubscribeMessage {
  readonly type: BirdeyeWsSubscribeType;
  readonly data?: {
    readonly queryType?: 'simple' | 'complex';
    readonly query?: string;
    readonly chartType?: '1m';
    readonly address?: string;
    readonly currency?: 'usd';
    readonly txsType?: 'all';
  };
  readonly min_liquidity?: number;
}

/**
 * One SUBSCRIBE_PRICE per connection (the gateway OVERWRITES the
 * previous price sub), so every watched mint rides a single `complex`
 * query — 1m/usd legs OR-ed together, exactly as documented.
 */
export function buildPriceSubscribe(addresses: ReadonlyArray<string>): BirdeyeWsSubscribeMessage {
  const legs = addresses.map((address) => `(address = ${address} AND chartType = 1m AND currency = usd)`);
  return {
    type: 'SUBSCRIBE_PRICE',
    data: { queryType: 'complex', query: legs.join(' OR ') },
  };
}

/** Same overwrite rule as price: one combined txs sub per connection. */
export function buildTxsSubscribe(addresses: ReadonlyArray<string>): BirdeyeWsSubscribeMessage {
  return {
    type: 'SUBSCRIBE_TXS',
    data: { queryType: 'complex', query: addresses.map((address) => `address = ${address}`).join(' OR '), txsType: 'all' },
  };
}

/** Chain-wide new-pair discovery (no address — the gateway pushes all). */
export function buildNewPairSubscribe(): BirdeyeWsSubscribeMessage {
  return { type: 'SUBSCRIBE_NEW_PAIR' };
}

export type BirdeyeWsPushType = 'WELCOME' | 'PRICE_DATA' | 'TXS_DATA' | 'NEW_PAIR_DATA';

export interface BirdeyeWsPricePush {
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  readonly type: string;
  readonly unixTime: number;
  readonly symbol: string;
  readonly address: string;
}

export interface BirdeyeWsPush {
  readonly type: string;
  readonly data?: Record<string, unknown> | null;
}
