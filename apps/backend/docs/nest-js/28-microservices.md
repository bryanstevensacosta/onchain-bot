# Microservices

Nest supports microservice architectures with built-in transport layers (TCP, Redis, NATS, MQTT, Kafka, gRPC, RabbitMQ).

## Installation

```bash
npm i --save @nestjs/microservices
```

## Creating a Microservice

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    { transport: Transport.TCP },
  );
  await app.listen();
}
bootstrap();
```

### TCP Options

| Option | Description |
|--------|-------------|
| `host` | Connection hostname |
| `port` | Connection port |
| `retryAttempts` | Number of retries (default: 0) |
| `retryDelay` | Delay between retries (ms) |
| `tlsOptions` | TLS key/cert for encrypted transport |

## Message Patterns

### Request-Response (`@MessagePattern`)

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}
```

Async support:

```typescript
@MessagePattern({ cmd: 'sum' })
async accumulate(data: number[]): Promise<number> { ... }
```

### Event-Based (`@EventPattern`)

```typescript
import { EventPattern } from '@nestjs/microservices';

@EventPattern('user_created')
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}
```

Multiple handlers can listen to the same event.

## Client (Producer)

### Using ClientsModule

```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      { name: 'MATH_SERVICE', transport: Transport.TCP },
    ]),
  ],
})
export class AppModule {}
```

Inject and use:

```typescript
import { ClientProxy } from '@nestjs/microservices';

constructor(@Inject('MATH_SERVICE') private client: ClientProxy) {}

// Send message (request-response)
accumulate() {
  return this.client.send<number>({ cmd: 'sum' }, [1, 2, 3]);
}

// Publish event (fire-and-forget)
publish() {
  this.client.emit('user_created', { userId: 1 });
}
```

`send()` returns a **cold Observable** (must subscribe).  
`emit()` returns a **hot Observable** (immediately delivered).

### Using ClientProxyFactory

```typescript
import { ClientProxyFactory } from '@nestjs/microservices';

{
  provide: 'MATH_SERVICE',
  useFactory: (configService: ConfigService) => {
    return ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '...', port: ... },
    });
  },
  inject: [ConfigService],
}
```

### Connection Lifecycle

```typescript
async onApplicationBootstrap() {
  await this.client.connect();
}
```

## Payload & Context Decorators

```typescript
import { MessagePattern, Payload, Ctx } from '@nestjs/microservices';

@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`);
  return new Date().toLocaleTimeString();
}
```

## Transport Layers

| Transport | Package | Pattern |
|-----------|---------|---------|
| TCP | built-in | `Transport.TCP` |
| Redis | `@nestjs/microservices` | `Transport.REDIS` |
| NATS | `nats` | `Transport.NATS` |
| MQTT | `mqtt` | `Transport.MQTT` |
| Kafka | `kafkajs` | `Transport.KAFKA` |
| RabbitMQ | `amqplib` | `Transport.RMQ` |
| gRPC | `@grpc/grpc-js` | `Transport.GRPC` |

### Redis Example

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.REDIS,
    options: {
      host: 'localhost',
      port: 6379,
    },
  },
);
```

### Kafka Example

```typescript
{
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'my-consumer' + Math.random(),
    },
  },
}
```

## Request-Scoped Handlers

```typescript
import { Scope, Inject } from '@nestjs/common';
import { CONTEXT, RequestContext } from '@nestjs/microservices';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private ctx: RequestContext) {
    // ctx.pattern = the message pattern
    // ctx.data = the message payload
  }
}
```

## TLS Support

```typescript
import * as fs from 'fs';

// Server
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.TCP,
  options: {
    tlsOptions: {
      key: fs.readFileSync('server-key.pem'),
      cert: fs.readFileSync('server-cert.pem'),
    },
  },
});

// Client
ClientsModule.register([{
  name: 'SECURE_SERVICE',
  transport: Transport.TCP,
  options: {
    tlsOptions: {
      ca: [fs.readFileSync('ca-cert.pem')],
    },
  },
}]);
```

## Status & Events

```typescript
// Client status
this.client.status.subscribe((status) => console.log(status));

// Client error
this.client.on('error', (err) => console.error(err));
```

## Timeout Handling

```typescript
import { timeout } from 'rxjs/operators';

this.client.send(pattern, data).pipe(timeout(5000));
```

## Hybrid Applications

Run HTTP + Microservice together:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice({
    transport: Transport.TCP,
    options: { port: 3001 },
  });
  await app.startAllMicroservices();
  await app.listen(3000);
}
```
