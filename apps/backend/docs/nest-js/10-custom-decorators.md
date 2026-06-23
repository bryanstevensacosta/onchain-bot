# Custom Decorators

Create reusable decorators to reduce boilerplate and make code more readable.

## Param Decorators

Built-in param decorators reference:

| Decorator | Express Object |
|-----------|----------------|
| `@Request()` / `@Req()` | `req` |
| `@Response()` / `@Res()` | `res` |
| `@Next()` | `next` |
| `@Session()` | `req.session` |
| `@Param(param?)` | `req.params` / `req.params[param]` |
| `@Body(param?)` | `req.body` / `req.body[param]` |
| `@Query(param?)` | `req.query` / `req.query[param]` |
| `@Headers(name?)` | `req.headers` / `req.headers[name]` |
| `@Ip()` | `req.ip` |
| `@HostParam()` | `req.hosts` |

## Creating Custom Param Decorators

Use `createParamDecorator`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

Usage:

```typescript
@Get()
async findOne(@User() user: UserEntity) {
  console.log(user);
}
```

### Passing Data

```typescript
export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

```typescript
@Get()
async findOne(@User('firstName') firstName: string) {
  console.log(`Hello ${firstName}`);
}
```

For TypeScript, use generics:
```typescript
createParamDecorator<string>((data, ctx) => ...)
```

## Working with Pipes

Pipes work with custom decorators:

```typescript
@Get()
async findOne(
  @User(new ValidationPipe({ validateCustomDecorators: true }))
  user: UserEntity,
) { ... }
```

> `validateCustomDecorators: true` is required for ValidationPipe to process custom decorator arguments.

## Decorator Composition

Combine multiple decorators into one using `applyDecorators`:

```typescript
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

export function Auth(...roles: string[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
```

Usage:

```typescript
@Get('users')
@Auth('admin')
findAllUsers() {}
```

This applies all four decorators in a single declaration.

> ⚠️ `@ApiHideProperty()` from `@nestjs/swagger` is NOT composable with `applyDecorators`.
