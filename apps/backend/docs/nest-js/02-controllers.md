# Controllers

Controllers handle incoming **requests** and return **responses**. They use **decorators** and **classes**.

## Basic Controller

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}
```

- `@Controller('cats')` sets route prefix `/cats`
- `@Get()` maps GET requests
- Combine prefix + method path: `@Controller('cats')` + `@Get('breed')` = `GET /cats/breed`

> Create with CLI: `$ nest g controller [name]`

## HTTP Method Decorators

| Decorator | HTTP Method |
|-----------|-------------|
| `@Get()` | GET |
| `@Post()` | POST |
| `@Put()` | PUT |
| `@Delete()` | DELETE |
| `@Patch()` | PATCH |
| `@Options()` | OPTIONS |
| `@Head()` | HEAD |
| `@All()` | All methods |

## Request Object Decorators

| Decorator | Express Object |
|-----------|----------------|
| `@Request()` / `@Req()` | `req` |
| `@Response()` / `@Res()` | `res` |
| `@Next()` | `next` |
| `@Session()` | `req.session` |
| `@Param(key?)` | `req.params` / `req.params[key]` |
| `@Body(key?)` | `req.body` / `req.body[key]` |
| `@Query(key?)` | `req.query` / `req.query[key]` |
| `@Headers(name?)` | `req.headers` / `req.headers[name]` |
| `@Ip()` | `req.ip` |
| `@HostParam()` | `req.hosts` |

## Response Handling

### Standard (recommended)
- Object/array → auto-serialized to JSON
- Primitive (string, number, boolean) → sent as-is
- Status: 200 by default, 201 for POST

```typescript
@Post()
@HttpCode(204) // Override status code
create() { return 'created'; }
```

### Library-specific (with @Res)
```typescript
@Get()
findAll(@Res() res: Response) {
  res.status(HttpStatus.OK).json([]);
}
```

> ⚠️ Using `@Res()` disables standard handling. Use `@Res({ passthrough: true })` to keep both.

## Headers & Redirects

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() { return 'created'; }

@Get()
@Redirect('https://nestjs.com', 301)
getDocs() {}

@Get('docs')
@Redirect('https://docs.nestjs.com', 302)
getDocs(@Query('version') version: string) {
  if (version === '5') return { url: 'https://docs.nestjs.com/v5/' };
}
```

## Route Parameters

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `Cat #${id}`;
}
```

> Declare parameterized routes after static paths.

## Sub-domain Routing

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string { return 'Admin page'; }
}
```

Dynamic host params:
```typescript
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) { return account; }
}
```

## Async & RxJS

```typescript
@Get()
async findAll(): Promise<any[]> { return []; }

@Get()
findAll(): Observable<any[]> { return of([]); }
```

## DTOs (Data Transfer Objects)

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}
```

Use classes (not interfaces) for DTOs — they survive transpilation for runtime validation.

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}
```

## Query Parameters

```typescript
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `Filtered by age: ${age}, breed: ${breed}`;
}
```

For nested/array queries, configure Express with `app.set('query parser', 'extended')`.

## Full Resource Example

```typescript
import { Controller, Get, Query, Post, Body, Put, Param, Delete } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body() createCatDto: CreateCatDto) { return 'added'; }

  @Get()
  findAll(@Query() query: ListAllEntities) { return `all cats`; }

  @Get(':id')
  findOne(@Param('id') id: string) { return `cat #${id}`; }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateCatDto: UpdateCatDto) { return `updated #${id}`; }

  @Delete(':id')
  remove(@Param('id') id: string) { return `removed #${id}`; }
}
```

> Nest CLI can generate all CRUD boilerplate: `$ nest g resource [name]`

## Registering Controllers

Controllers must be registered in a module:

```typescript
@Module({
  controllers: [CatsController],
})
export class AppModule {}
```
