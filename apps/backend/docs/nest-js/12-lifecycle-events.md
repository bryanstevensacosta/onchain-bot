# Lifecycle Events

Nest provides lifecycle hooks for initialization and shutdown phases.

## Lifecycle Sequence

```
Application bootstrap
  ↓
onModuleInit()        ← host module deps resolved
  ↓
onApplicationBootstrap() ← all modules initialized
  ↓
Application running
  ↓
onModuleDestroy()     ← termination signal received
  ↓
beforeApplicationShutdown()
  ↓
onApplicationShutdown()
```

## Interfaces

| Interface | Method | When |
|-----------|--------|------|
| `OnModuleInit` | `onModuleInit()` | Module deps resolved |
| `OnApplicationBootstrap` | `onApplicationBootstrap()` | All modules init, before listening |
| `OnModuleDestroy` | `onModuleDestroy()` | After termination signal |
| `BeforeApplicationShutdown` | `beforeApplicationShutdown()` | After onModuleDestroy, before close |
| `OnApplicationShutdown` | `onApplicationShutdown()` | After connections close |

## Usage

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class UsersService implements OnModuleInit {
  onModuleInit() {
    console.log('Module initialized');
  }
}
```

### Async initialization

```typescript
async onModuleInit(): Promise<void> {
  await this.fetch();
}
```

## Application Shutdown

Opt-in required:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(3000);
}
```

```typescript
@Injectable()
class UsersService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) {
    console.log(signal); // e.g. "SIGINT"
  }
}
```

> Shutdown hooks do NOT work for request-scoped classes.
