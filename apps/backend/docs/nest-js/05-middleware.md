# Middleware

Middleware runs **before** the route handler. Has access to `request`, `response`, and `next()`.

Middleware can:
- Execute any code
- Modify request/response objects
- End the request-response cycle
- Call `next()` to pass control to the next middleware

> Nest middleware is equivalent to Express middleware by default.

## Class-based Middleware

Implement `NestMiddleware`:

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();
  }
}
```

### Dependency Injection

Middleware supports DI via constructor:

```typescript
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}
  use(req: Request, res: Response, next: NextFunction) { ... }
}
```

## Functional Middleware

For simple middleware without dependencies:

```typescript
export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`Request...`);
  next();
}
```

Use functional middleware when no dependencies are needed.

## Applying Middleware

Use `configure()` in a module implementing `NestModule`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { CatsModule } from './cats/cats.module';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('cats');
  }
}
```

### Route Paths

```typescript
consumer
  .apply(LoggerMiddleware)
  .forRoutes({ path: 'cats', method: RequestMethod.GET });
```

### Route Wildcards

```typescript
// Named wildcard (*splat)
forRoutes({ path: 'abcd/*splat', method: RequestMethod.ALL });
// Optional trailing: 'abcd/{*splat}'
```

### Controller Scoping

```typescript
consumer
  .apply(LoggerMiddleware)
  .forRoutes(CatsController);
```

### Excluding Routes

```typescript
consumer
  .apply(LoggerMiddleware)
  .exclude(
    { path: 'cats', method: RequestMethod.GET },
    { path: 'cats', method: RequestMethod.POST },
    'cats/{*splat}',
  )
  .forRoutes(CatsController);
```

### Multiple Middleware

```typescript
consumer.apply(cors(), helmet(), logger).forRoutes(CatsController);
```

## Global Middleware

```typescript
const app = await NestFactory.create(AppModule);
app.use(logger); // functional only
```

For class-based global middleware, use `.forRoutes('*')`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*');
  }
}
```

## Execution Order

```
Middleware → Guards → Interceptors → Pipes → Route Handler
```
