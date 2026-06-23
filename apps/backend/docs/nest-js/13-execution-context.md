# Execution Context

Utility classes for building generic guards, filters, and interceptors across HTTP, microservices, and WebSockets.

## ArgumentsHost

Abstraction over handler arguments:

- HTTP: `[request, response, next]`
- GraphQL: `[root, args, context, info]`
- WebSockets: `[data, client]`

### Detect application type

```typescript
if (host.getType() === 'http') { /* REST */ }
if (host.getType() === 'rpc') { /* Microservice */ }
if (host.getType<GqlContextType>() === 'graphql') { /* GraphQL */ }
```

### Switch context

```typescript
const ctx = host.switchToHttp();
const request = ctx.getRequest<Request>();
const response = ctx.getResponse<Response>();
```

```typescript
host.switchToWs().getClient<T>();
host.switchToWs().getData<T>();
host.switchToRpc().getData<T>();
host.switchToRpc().getContext<T>();
```

## ExecutionContext

Extends `ArgumentsHost`. Provides:

```typescript
export interface ExecutionContext extends ArgumentsHost {
  getClass<T>(): Type<T>;   // Controller class reference
  getHandler(): Function;    // Route handler reference
}
```

```typescript
const methodKey = ctx.getHandler().name; // "create"
const className = ctx.getClass().name;   // "CatsController"
```

## Reflection & Metadata

### Using `Reflector.createDecorator` (recommended)

```typescript
import { Reflector } from '@nestjs/core';
export const Roles = Reflector.createDecorator<string[]>();
```

```typescript
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {}
```

Read metadata:

```typescript
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) return true;
    // ...
  }
}
```

### Handler vs Class metadata

```typescript
// Method-level (handler)
this.reflector.get(Roles, context.getHandler());

// Controller-level (class)
this.reflector.get(Roles, context.getClass());
```

### Merging metadata

```typescript
// Override: method overrides class
const roles = this.reflector.getAllAndOverride(Roles, [
  context.getHandler(),
  context.getClass(),
]);

// Merge: combines both
const roles = this.reflector.getAllAndMerge(Roles, [
  context.getHandler(),
  context.getClass(),
]);
```

### Using `@SetMetadata` (low-level)

```typescript
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Read with:
this.reflector.get<string[]>('roles', context.getHandler());
```
