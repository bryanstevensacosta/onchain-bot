import { HttpException, HttpStatus } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { StreamBrokerService } from 'stream/application/stream-broker.service';
import type {
  StreamErrorCode,
  StreamSubscription,
} from 'stream/domain/stream-types';

/**
 * Market-data WS gateway (Tramo 3, todo 11, P49 — gateway infrastructure).
 *
 * Transport decision (P49): Socket.IO via @nestjs/websockets —
 * zero new deps (already hoisted for the backend WsGateway), the
 * stack the dashboard already speaks, and per-client rooms map 1:1
 * to broker subscriptions. Native `ws` would force a second
 * protocol on clients for no gain. HTTP edge is untouched.
 *
 * Protocol (namespace `/market-data`):
 * - auth: `auth: { token }` or `x-api-key` header (P46, required —
 *   keyless handshakes get `stream-error` UNAUTHORIZED + disconnect).
 * - `subscribe { exchange, symbol, kind, timeframe? }` -> ack
 *   `{ subscribed }`; `unsubscribe` -> ack `{ unsubscribed }`.
 * - server pushes `tick` (ticker|ohlcv) + `stream-error`
 *   (EXCHANGE_DOWN with `retryAfterMs`, RATE_LIMITED, ...).
 * - socket disconnect releases every broker subscription (no leaks).
 */
@WebSocketGateway({ namespace: '/market-data', cors: false })
export class MarketDataWsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  public constructor(private readonly broker: StreamBrokerService) {}

  public async handleConnection(client: Socket): Promise<void> {
    const token = MarketDataWsGateway.readToken(client);
    const ip = typeof client.handshake?.address === 'string' ? client.handshake.address : undefined;
    try {
      await this.broker.connect(client.id, token, ip);
    } catch {
      client.emit('stream-error', {
        kind: 'error',
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing API key',
      });
      client.disconnect(true);
      return;
    }
    this.broker.registerEmitter(client.id, (message) => {
      client.emit(message.kind === 'error' ? 'stream-error' : 'tick', message);
    });
  }

  public handleDisconnect(client: Socket): void {
    void this.broker.disconnect(client.id);
  }

  @SubscribeMessage('subscribe')
  public async onSubscribe(
    client: Socket,
    payload: StreamSubscription,
  ): Promise<{ subscribed: string }> {
    try {
      return await this.broker.subscribe(client.id, payload);
    } catch (err: unknown) {
      throw new WsException(MarketDataWsGateway.toErrorPayload(err));
    }
  }

  @SubscribeMessage('unsubscribe')
  public async onUnsubscribe(
    client: Socket,
    payload: StreamSubscription,
  ): Promise<{ unsubscribed: string }> {
    try {
      return await this.broker.unsubscribe(client.id, payload);
    } catch (err: unknown) {
      throw new WsException(MarketDataWsGateway.toErrorPayload(err));
    }
  }

  private static readToken(client: Socket): string | undefined {
    const viaAuth = (client.handshake?.auth as { token?: unknown } | undefined)?.token;
    if (typeof viaAuth === 'string' && viaAuth !== '') {
      return viaAuth;
    }
    const viaHeader = client.handshake?.headers?.['x-api-key'];
    if (typeof viaHeader === 'string' && viaHeader !== '') {
      return viaHeader;
    }
    return undefined;
  }

  private static toErrorPayload(err: unknown): {
    kind: 'error';
    code: StreamErrorCode;
    message: string;
  } {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const message = typeof err.message === 'string' ? err.message : 'Stream request failed';
      if (status === HttpStatus.UNAUTHORIZED) {
        return { kind: 'error', code: 'UNAUTHORIZED', message };
      }
      if (status === HttpStatus.FORBIDDEN) {
        return { kind: 'error', code: 'FORBIDDEN', message };
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        const code: StreamErrorCode = message.includes('Too many subscriptions')
          ? 'TOO_MANY_SUBS'
          : 'RATE_LIMITED';
        return { kind: 'error', code, message };
      }
      return { kind: 'error', code: 'BAD_REQUEST', message };
    }
    return { kind: 'error', code: 'BAD_REQUEST', message: 'Invalid stream request' };
  }
}
