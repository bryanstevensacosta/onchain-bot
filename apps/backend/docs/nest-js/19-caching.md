# Caching (@nestjs/cache-manager)

## Installation

```bash
npm install @nestjs/cache-manager cache-manager
```

> Uses [Keyv](https://keyv.org/docs/) under the hood. In-memory by default.

## In-Memory Cache

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [CacheModule.register()],
})
export class AppModule {}
```

### Global module

```typescript
CacheModule.register({ isGlobal: true });
```

### TTL (time-to-live in ms)

```typescript
CacheModule.register({ ttl: 5000 }); // 5 seconds
```

## Interacting with Cache Store

Inject `CACHE_MANAGER`:

```typescript
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}
```

### Methods

```typescript
// Get
const value = await this.cacheManager.get('key');

// Set (with optional TTL in ms)
await this.cacheManager.set('key', 'value');
await this.cacheManager.set('key', 'value', 1000);  // expires in 1s
await this.cacheManager.set('key', 'value', 0);      // no expiration

// Delete
await this.cacheManager.del('key');

// Clear all
await this.cacheManager.clear();
```

> In-memory cache only stores values supported by the structured clone algorithm.

## Auto-Caching Responses (CacheInterceptor)

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  @Get()
  findAll(): string[] {
    return [];
  }
}
```

Only `GET` endpoints are cached. Routes using `@Res()` are not cached.

### Global Cache Interceptor

```typescript
import { Module } from '@nestjs/common';
import { CacheModule, CacheInterceptor } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [CacheModule.register({ ttl: 5000 })],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CacheInterceptor },
  ],
})
export class AppModule {}
```

## Per-Method Cache Overrides

```typescript
import { CacheKey, CacheTTL } from '@nestjs/cache-manager';

@Controller()
@CacheTTL(50)  // controller-level default
export class AppController {
  @CacheKey('custom_key')
  @CacheTTL(20)  // overrides controller TTL
  findAll(): string[] {
    return [];
  }
}
```

## WebSockets & Microservices

```typescript
@CacheKey('events')
@CacheTTL(10)
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): Observable<string[]> {
  return [];
}
```

## Custom Cache Key Tracking

Extend `CacheInterceptor` and override `trackBy()`:

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Injectable()
class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    return `${request.url}-${request.headers.authorization}`;
  }
}
```

## Using Redis (Alternative Stores)

```bash
npm install @keyv/redis
```

```typescript
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => ({
        stores: [
          new Keyv({ store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }) }),
          new KeyvRedis('redis://localhost:6379'),
        ],
      }),
    }),
  ],
})
export class AppModule {}
```

## Async Configuration

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get('CACHE_TTL'),
  }),
  inject: [ConfigService],
});
```

Or with `useClass`:

```typescript
CacheModule.registerAsync({
  useClass: CacheConfigService,
});

@Injectable()
class CacheConfigService implements CacheOptionsFactory {
  createCacheOptions(): CacheModuleOptions {
    return { ttl: 5 };
  }
}
```
