# Guards

Guards determine if a request should be handled based on runtime conditions (permissions, roles, ACLs). They run **after middleware**, **before interceptors/pipes**.

## Creating a Guard

Implement `CanActivate`:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    return validateRequest(request);
  }
}
```

- `true` → request proceeds
- `false` → Nest returns 403 Forbidden

## Binding Guards

### Controller-scoped
```typescript
@Controller('cats')
@UseGuards(RolesGuard)
export class CatsController {}
```

### Method-scoped
```typescript
@Post()
@UseGuards(RolesGuard)
async create(@Body() createCatDto: CreateCatDto) { ... }
```

### Global-scoped
```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalGuards(new RolesGuard());
```

### Global-scoped with DI
```typescript
@Module({
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule {}
```

## Role-based Authentication

### Custom Metadata Decorator
```typescript
import { Reflector } from '@nestjs/core';
export const Roles = Reflector.createDecorator<string[]>();
```

Or with `@SetMetadata`:
```typescript
@SetMetadata('roles', ['admin'])
```

### Using the Decorator
```typescript
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) { ... }
```

### Reading Metadata in Guard
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return matchRoles(roles, user.roles);
  }
}
```

When guard returns `false`, Nest throws `ForbiddenException`. Throw your own exception for custom responses:

```typescript
throw new UnauthorizedException();
```

## ExecutionContext

`ExecutionContext` extends `ArgumentsHost` and provides:
- `getClass()` — controller class
- `getHandler()` — route handler method reference
- `switchToHttp().getRequest()` — request object
- `switchToHttp().getResponse()` — response object
