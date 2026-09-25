import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from 'auth/application/api-key.service';
import { satisfiesScope, type ApiKeyScope } from 'auth/domain/api-key-scope';
import {
  GATEWAY_LIMIT_PER_MINUTE,
  GATEWAY_WINDOW_MS,
} from 'gateway/domain/gateway-policy';
import { RateLimiterService } from 'rate-limiter/application/rate-limiter.service';
import { isAuthorized } from 'shared/domain/api-key';
import { ExchangeConnectionManager } from './exchange-connection-manager.service';
import {
  STREAM_MAX_SUBS_PER_CLIENT,
  STREAM_QUEUE_DEPTH,
  buildStreamRateKey,
  parseExchangeAllowlist,
  requiredScopeFor,
} from 'stream/domain/stream-policy';
import {
  streamKey,
  toErrorMessage,
  type StreamClientMessage,
  type StreamErrorInfo,
  type StreamEvent,
  type StreamKind,
  type StreamSubscription,
} from 'stream/domain/stream-types';

export interface BrokerClientView {
  readonly keyId: string;
  readonly keyName: string;
  readonly scopes: ReadonlyArray<ApiKeyScope>;
}

export type StreamEmitter = (message: StreamClientMessage) => void;

export const STREAM_EXCHANGES = 'STREAM_EXCHANGES';

const FULL_SCOPES: ReadonlyArray<ApiKeyScope> = ['read', 'snapshot', 'admin'];

interface ClientState extends BrokerClientView {
  rateClient: string;
  subs: Set<string>;
  queue: Array<StreamClientMessage>;
  dropped: number;
  emitter: StreamEmitter | null;
}

/**
 * Stream broker (Tramo 3, todo 11, P49 — stream application).
 *
 * Thin multiplexing layer over the shared per-exchange connections:
 * auth (P46 scopes, fail-open mirrors the HTTP guard), per-client
 * subscriptions, shared REST rate budget, per-client bounded queues
 * (drop-oldest backpressure with a Drop counter), and full cleanup on
 * disconnect (every manager ref released — no leaks by construction).
 */
@Injectable()
export class StreamBrokerService {
  private readonly clients = new Map<string, ClientState>();

  private readonly keySubs = new Map<string, StreamSubscription>();

  private readonly keyClients = new Map<string, Set<string>>();

  private readonly allowlist: Array<string>;

  public constructor(
    private readonly keys: ApiKeyService,
    private readonly limiter: RateLimiterService,
    private readonly manager: ExchangeConnectionManager,
    @Optional() @Inject(STREAM_EXCHANGES) allowlist?: Array<string>,
  ) {
    this.allowlist = allowlist ?? parseExchangeAllowlist(process.env.MARKET_DATA_STREAM_EXCHANGES);
    this.manager.onTick((event) => this.routeTick(event));
    this.manager.onExchangeError((exchange, info) => this.routeError(exchange, info));
  }

  public async connect(
    clientId: string,
    presentedKey: string | undefined,
    clientIp?: string,
  ): Promise<BrokerClientView> {
    const rateClient = clientIp ?? 'unknown';
    const stored = presentedKey ? this.keys.verify(presentedKey) : null;
    if (stored) {
      return this.register(clientId, {
        keyId: stored.id,
        keyName: stored.name,
        scopes: stored.scopes,
        rateClient,
      });
    }
    const expected = (process.env.MARKET_DATA_API_KEY ?? '').trim();
    if (presentedKey && expected !== '' && isAuthorized(presentedKey, expected)) {
      return this.register(clientId, {
        keyId: 'env',
        keyName: 'MARKET_DATA_API_KEY',
        scopes: FULL_SCOPES,
        rateClient,
      });
    }
    if (expected === '' && this.keys.list().length === 0) {
      return this.register(clientId, {
        keyId: 'fail-open',
        keyName: 'fail-open',
        scopes: FULL_SCOPES,
        rateClient,
      });
    }
    throw new UnauthorizedException('Invalid or missing API key');
  }

  public async subscribe(
    clientId: string,
    raw: StreamSubscription,
  ): Promise<{ subscribed: string }> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new UnauthorizedException('Unknown stream client');
    }
    const sub = StreamBrokerService.normalize(raw);
    if (!this.allowlist.includes(sub.exchange)) {
      throw new BadRequestException(`Exchange not allowed: ${sub.exchange}`);
    }
    if (!satisfiesScope(client.scopes, requiredScopeFor(sub.kind))) {
      throw new ForbiddenException('Insufficient scope for this stream');
    }
    const allowed = this.limiter.tryAcquire(
      buildStreamRateKey(client.rateClient),
      GATEWAY_LIMIT_PER_MINUTE,
      GATEWAY_WINDOW_MS,
    );
    if (!allowed) {
      throw new HttpException('Rate limit exceeded for stream subscribes', HttpStatus.TOO_MANY_REQUESTS);
    }
    const key = streamKey(sub);
    if (client.subs.has(key)) {
      return { subscribed: key };
    }
    if (client.subs.size >= STREAM_MAX_SUBS_PER_CLIENT) {
      throw new HttpException('Too many subscriptions for this client', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.manager.subscribe(sub);
    client.subs.add(key);
    this.keySubs.set(key, sub);
    let holders = this.keyClients.get(key);
    if (!holders) {
      holders = new Set();
      this.keyClients.set(key, holders);
    }
    holders.add(clientId);
    return { subscribed: key };
  }

  public async unsubscribe(
    clientId: string,
    raw: StreamSubscription,
  ): Promise<{ unsubscribed: string }> {
    const client = this.clients.get(clientId);
    const sub = StreamBrokerService.normalize(raw);
    const key = streamKey(sub);
    if (!client || !client.subs.has(key)) {
      return { unsubscribed: key };
    }
    client.subs.delete(key);
    await this.release(key, clientId);
    return { unsubscribed: key };
  }

  /** Release every subscription + emitter + queue (socket disconnect). */
  public async disconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }
    const keys = [...client.subs];
    client.subs.clear();
    for (const key of keys) {
      const holders = this.keyClients.get(key);
      holders?.delete(clientId);
      if (holders !== undefined && holders.size === 0) {
        this.keyClients.delete(key);
        const sub = this.keySubs.get(key);
        this.keySubs.delete(key);
        if (sub) {
          await this.manager.unsubscribe(sub);
        }
      }
    }
    this.clients.delete(clientId);
  }

  public registerEmitter(clientId: string, emit: StreamEmitter): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.emitter = emit;
      this.flush(clientId);
    }
  }

  /** Drain the queued messages (tests + slow-consumer catch-up). */
  public pending(clientId: string): Array<StreamClientMessage> {
    const client = this.clients.get(clientId);
    if (!client) {
      return [];
    }
    const drained = [...client.queue];
    client.queue.length = 0;
    return drained;
  }

  public droppedCount(clientId: string): number {
    return this.clients.get(clientId)?.dropped ?? 0;
  }

  public subscriptionCount(clientId?: string): number {
    if (clientId !== undefined) {
      return this.clients.get(clientId)?.subs.size ?? 0;
    }
    let total = 0;
    for (const client of this.clients.values()) {
      total += client.subs.size;
    }
    return total;
  }

  public isConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  private static normalize(raw: StreamSubscription): StreamSubscription {
    const exchange = (raw.exchange ?? '').trim().toLowerCase();
    const symbol = (raw.symbol ?? '').trim().toUpperCase();
    const kind: StreamKind = raw.kind;
    if (exchange === '' || symbol === '') {
      throw new BadRequestException('Stream subscription needs exchange + symbol');
    }
    if (kind !== 'ticker' && kind !== 'ohlcv') {
      throw new BadRequestException('Stream kind must be ticker|ohlcv');
    }
    if (kind === 'ohlcv') {
      return { exchange, symbol, kind, timeframe: (raw.timeframe ?? '1m').trim().toLowerCase() };
    }
    return { exchange, symbol, kind };
  }

  private register(
    clientId: string,
    view: BrokerClientView & { rateClient: string },
  ): BrokerClientView {
    const existing = this.clients.get(clientId);
    if (existing) {
      existing.emitter = null;
    }
    this.clients.set(clientId, {
      keyId: view.keyId,
      keyName: view.keyName,
      scopes: view.scopes,
      rateClient: view.rateClient,
      subs: existing?.subs ?? new Set(),
      queue: [],
      dropped: 0,
      emitter: null,
    });
    return { keyId: view.keyId, keyName: view.keyName, scopes: view.scopes };
  }

  private routeTick(event: StreamEvent): void {
    const key = streamKey({
      exchange: event.exchange,
      symbol: event.symbol,
      kind: event.kind,
      timeframe: event.kind === 'ohlcv' ? event.timeframe : undefined,
    });
    const holders = this.keyClients.get(key);
    if (!holders) {
      return;
    }
    for (const clientId of holders) {
      this.enqueue(clientId, event);
    }
  }

  private routeError(exchange: string, info: StreamErrorInfo): void {
    const prefix = `${exchange.toLowerCase()}:`;
    for (const [key, holders] of this.keyClients) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      for (const clientId of holders) {
        this.enqueue(clientId, toErrorMessage({ ...info, exchange: exchange.toLowerCase() }));
      }
    }
  }

  private enqueue(clientId: string, message: StreamClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }
    if (client.queue.length >= STREAM_QUEUE_DEPTH) {
      client.queue.shift();
      client.dropped += 1;
    }
    client.queue.push(message);
    this.flush(clientId);
  }

  private flush(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.emitter) {
      return;
    }
    while (client.queue.length > 0) {
      const next = client.queue.shift();
      if (next) {
        client.emitter(next);
      }
    }
  }

  private async release(key: string, clientId: string): Promise<void> {
    const holders = this.keyClients.get(key);
    holders?.delete(clientId);
    if (holders !== undefined && holders.size > 0) {
      return;
    }
    this.keyClients.delete(key);
    const sub = this.keySubs.get(key);
    this.keySubs.delete(key);
    if (sub) {
      await this.manager.unsubscribe(sub);
    }
  }
}
