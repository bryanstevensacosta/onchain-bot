# Rate Limiting (@nestjs/throttler)

Protect applications from brute-force attacks.

## Installation

```bash
npm i --save @nestjs/throttler
```

## Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,   // 60 seconds window
          limit: 10,     // max 10 requests per window
        },
      ],
    }),
  ],
})
export class AppModule {}
```

### Global Guard Binding

```typescript
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
],
```

## Multiple Throttler Definitions

```typescript
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1000,  limit: 3 },
      { name: 'medium', ttl: 10000, limit: 20 },
      { name: 'long',   ttl: 60000, limit: 100 },
    ]),
  ],
})
export class AppModule {}
```

## Skip Throttling

### Skip entire controller

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {}
```

### Skip specific route

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {
  @SkipThrottle({ default: false })  // re-enable for this route
  dontSkip() { return 'Rate limited'; }

  doSkip() { return 'Not rate limited'; }
}
```

## Custom Throttle Limits

```typescript
import { Throttle } from '@nestjs/throttler';

@Throttle({ default: { limit: 3, ttl: 60000 } })
@Get()
findAll() {
  return 'Custom rate limit: 3 requests per minute';
}
```

## Proxies

If behind a proxy server (e.g., Nginx, Cloudflare), configure trust:

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('trust proxy', 'loopback');
```

Custom tracker for `X-Forwarded-For`:

```typescript
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip;
  }
}
```

## Async Configuration

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL'),
          limit: config.get('THROTTLE_LIMIT'),
        },
      ],
    }),
  ],
})
export class AppModule {}
```

## Configuration Options

| Option | Description |
|--------|-------------|
| `name` | Name for this throttler set |
| `ttl` | Time window in **milliseconds** |
| `limit` | Max requests within TTL |
| `blockDuration` | Block duration in ms after limit reached |
| `ignoreUserAgents` | Regex array of user agents to skip |
| `skipIf` | Function `(context) => boolean` to skip conditionally |
| `storage` | Custom storage service (e.g., Redis) |
| `errorMessage` | Custom error message or function |
| `getTracker` | Override default IP tracker |
| `generateKey` | Override default storage key |

## Time Helpers

```typescript
import { seconds, minutes, hours } from '@nestjs/throttler';

ThrottlerModule.forRoot([
  { ttl: minutes(5), limit: 100 },  // 5 minutes in ms
]);
```

Available helpers: `seconds`, `minutes`, `hours`, `days`, `weeks`.

## WebSockets

```typescript
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, getTracker, generateKey } = requestProps;
    const client = context.switchToWs().getClient();
    const tracker = client._socket.remoteAddress;
    const key = generateKey(context, tracker, throttler.name);
    const { totalHits, timeToExpire, isBlocked } = await this.storageService.increment(key, ttl, limit, blockDuration, throttler.name);

    if (isBlocked) {
      await this.throwThrottlingException(context, { /* ... detail */ });
    }
    return true;
  }
}
```

> WebSocket guards cannot be registered with `APP_GUARD` or `app.useGlobalGuards()`.

## GraphQL

```typescript
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return { req: ctx.req, res: ctx.res };
  }
}
```

## Redis Storage (Distributed)

For multiple server instances, use a community Redis storage provider:

```bash
npm install @nest-lab/throttler-storage-redis
```

```typescript
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 10 }],
      storage: new ThrottlerStorageRedisService(),
    }),
  ],
})
export class AppModule {}
```
