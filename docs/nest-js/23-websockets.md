# WebSockets (Gateways)

Gateways are classes annotated with `@WebSocketGateway()`. Supports Socket.io and ws platforms.

## Installation

```bash
npm i --save @nestjs/websockets @nestjs/platform-socket.io
```

## Basic Gateway

```typescript
import { SubscribeMessage, MessageBody, WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway()
export class EventsGateway {
  @SubscribeMessage('events')
  handleEvent(@MessageBody() data: string): string {
    return data;
  }
}
```

> Gateways must be registered as providers in a module:
> ```typescript
> @Module({ providers: [EventsGateway] })
> export class EventsModule {}
> ```

## Configuration

### Port and namespace

```typescript
@WebSocketGateway(80, { namespace: 'events' })
export class EventsGateway {}
```

### Transport options

```typescript
@WebSocketGateway(81, { transports: ['websocket'] })
export class EventsGateway {}
```

## Decorators

| Decorator | Description |
|-----------|-------------|
| `@WebSocketGateway(port?, options?)` | Marks class as a gateway |
| `@SubscribeMessage(event)` | Subscribes to a message event |
| `@MessageBody()` | Extracts message payload |
| `@ConnectedSocket()` | Injects connected socket instance |
| `@WebSocketServer()` | Injects server/namespace instance |
| `@Ack()` | Injects acknowledgment callback |

### Extracting specific properties

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody('id') id: number): number {
  return id;
}
```

## Acknowledgments

### Return value (implicit ack)

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data; // auto-acknowledged to client
}
```

### Explicit ack

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string, @Ack() ack: (response: any) => void) {
  ack({ status: 'received', data });
}
```

## Multiple Responses (WsResponse)

```typescript
import { WsResponse } from '@nestjs/websockets';

@SubscribeMessage('events')
handleEvent(@MessageBody() data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}
```

Client listens:

```typescript
socket.on('events', (data) => console.log(data));
```

## Async Responses

```typescript
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@SubscribeMessage('events')
onEvent(@MessageBody() data: unknown): Observable<WsResponse<number>> {
  return from([1, 2, 3]).pipe(
    map(data => ({ event: 'events', data })),
  );
}
// Responds 3 times: 1, 2, 3
```

## Lifecycle Hooks

| Interface | Method | When |
|-----------|--------|------|
| `OnGatewayInit` | `afterInit(server)` | After gateway initialized |
| `OnGatewayConnection` | `handleConnection(client)` | Client connects |
| `OnGatewayDisconnect` | `handleDisconnect(client)` | Client disconnects |

```typescript
import { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';

@WebSocketGateway()
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  afterInit(server: Server) { console.log('Init'); }
  handleConnection(client: Socket) { console.log('Connected'); }
  handleDisconnect(client: Socket) { console.log('Disconnected'); }
}
```

## Server & Namespace

```typescript
import { WebSocketServer } from '@nestjs/websockets';
import { Server, Namespace } from 'socket.io';

@WebSocketGateway({ namespace: 'my-namespace' })
export class EventsGateway {
  @WebSocketServer()
  server: Server;       // or Namespace if namespace set

  emitToAll(data: any) {
    this.server.emit('events', data);
  }
}
```

## Lifecycle sequence

```
Gateway Init → afterInit() → handleConnection() → message handlers → handleDisconnect()
```
