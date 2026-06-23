# Events (@nestjs/event-emitter)

Simple observer implementation using `eventemitter2`.

## Installation

```bash
npm i --save @nestjs/event-emitter
```

## Setup

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot()],
})
export class AppModule {}
```

### Configuration

```typescript
EventEmitterModule.forRoot({
  wildcard: false,     // enable namespaces/wildcards
  delimiter: '.',      // namespace delimiter
  maxListeners: 10,    // max listeners per event
  ignoreErrors: false, // throw on error event with no listeners
});
```

## Dispatching Events

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrderService {
  constructor(private eventEmitter: EventEmitter2) {}

  createOrder() {
    this.eventEmitter.emit('order.created', { orderId: 1 });
  }
}
```

## Listening to Events

```typescript
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class OrderListener {
  @OnEvent('order.created')
  handleOrderCreated(payload: { orderId: number }) {
    console.log('Order created:', payload.orderId);
  }
}
```

### Wildcards (with wildcard: true)

```typescript
@OnEvent('order.*')
handleAnyOrderEvent(payload: any) {
  // matches order.created, order.shipped, etc.
}

@OnEvent('**')
handleEverything(payload: any) {
  // catches ALL events
}
```

### Listener Options

```typescript
@OnEvent('order.created', { async: true, prependListener: true })
handle(payload: any) {}
```

## Preventing Event Loss

For events emitted before `onApplicationBootstrap` completes:

```typescript
import { EventEmitterReadinessWatcher } from '@nestjs/event-emitter';

@Injectable()
export class OrderService {
  constructor(
    private eventEmitter: EventEmitter2,
    private readinessWatcher: EventEmitterReadinessWatcher,
  ) {}

  async onApplicationBootstrap() {
    await this.readinessWatcher.waitUntilReady();
    this.eventEmitter.emit('order.created', { orderId: 1 });
  }
}
```
