import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * WebSocket gateway for broadcasting pipeline events to the frontend.
 *
 * Listens to ALL EventEmitter2 events and forwards them to connected WS clients.
 * Maps backend event names to the names the frontend expects.
 */
@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
  namespace: '/',
})
@Injectable()
export class WsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);

  // Maps backend eventName to frontend wsEventName
  private readonly EVENT_MAP: Record<string, string> = {
    'telegram.message.ingested': 'telegram.message.ingested',
    'extraction.candidates.extracted': 'extraction.candidates.extracted',
    'parsing.call.parsed': 'parsing.call.parsed',
    'normalization.call.normalized': 'normalization.call.normalized',
    'enrichment.token.enriched': 'enrichment.token.enriched',
    'classification.token.classified': 'classification.token.classified',
    'scoring.token.scored': 'scoring.token.scored',
    'vip-call.approval.approved': 'vip-call-approval.decision.applied',
    'vip-call.approval.rejected': 'vip-call-approval.decision.applied',
    'publishing.telegram.published': 'publishing.telegram.published',
    'publishing.telegram.failed': 'publishing.telegram.failed',
    'dashboard.kpis.updated': 'dashboard.kpis.updated',
  };

  /** Timestamp of the last event forwarded by this gateway (any event). */
  private lastEventAt: string | null = null;

  public constructor(private readonly eventEmitter: EventEmitter2) {}

  public onModuleInit(): void {
    // Listen to ALL EventEmitter2 events and forward them to WS
    this.eventEmitter.onAny((eventName: string, event: DomainEvent) => {
      this.handlePipelineEvent(eventName, event);
    });
    this.logger.log(
      'WebSocket Gateway initialized, listening to pipeline events',
    );
  }

  public onModuleDestroy(): void {
    this.logger.log('WebSocket Gateway shutting down');
  }

  public handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    client.emit('hello', {
      serverTime: new Date().toISOString(),
      missedSince: this.lastEventAt,
      bufferedCount: 0,
    });
  }

  public handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  public handleJoin(client: Socket, payload: { room: string }): void {
    void client.join(payload.room);
    this.logger.debug(`Client ${client.id} joined room: ${payload.room}`);
  }

  @SubscribeMessage('leave')
  public handleLeave(client: Socket, payload: { room: string }): void {
    void client.leave(payload.room);
    this.logger.debug(`Client ${client.id} left room: ${payload.room}`);
  }

  private handlePipelineEvent(eventName: string, event: DomainEvent): void {
    const wsEvent = this.EVENT_MAP[eventName];
    if (!wsEvent) {
      // Unmapped event, ignore
      return;
    }

    // Get the event payload
    const payload =
      event.toPayload?.() ?? (event as unknown as Record<string, unknown>);

    // Broadcast to all connected clients
    this.server.emit(wsEvent, payload);
    this.lastEventAt = new Date().toISOString();
  }
}
