# Exception Filters

Nest has a built-in **exceptions layer** that handles all unhandled exceptions.

## Default Behavior

Unrecognized exceptions return:

```json
{ "statusCode": 500, "message": "Internal server error" }
```

## Throwing Standard Exceptions

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}
```

Full override:

```typescript
throw new HttpException({
  status: HttpStatus.FORBIDDEN,
  error: 'This is a custom message',
}, HttpStatus.FORBIDDEN, { cause: error });
```

## Built-in HTTP Exceptions

| Exception | Status |
|-----------|--------|
| `BadRequestException` | 400 |
| `UnauthorizedException` | 401 |
| `NotFoundException` | 404 |
| `ForbiddenException` | 403 |
| `NotAcceptableException` | 406 |
| `RequestTimeoutException` | 408 |
| `ConflictException` | 409 |
| `GoneException` | 410 |
| `PayloadTooLargeException` | 413 |
| `UnsupportedMediaTypeException` | 415 |
| `UnprocessableEntityException` | 422 |
| `InternalServerErrorException` | 500 |
| `NotImplementedException` | 501 |
| `BadGatewayException` | 502 |
| `ServiceUnavailableException` | 503 |
| `GatewayTimeoutException` | 504 |
| `PreconditionFailedException` | 412 |
| `ImATeapotException` | 418 |

```typescript
throw new BadRequestException('Something bad happened', {
  cause: new Error(),
  description: 'Some error description',
});
```

## Custom Exception Filters

Implement `ExceptionFilter` interface:

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Catch Multiple Types

```typescript
@Catch(HttpException, ForbiddenException)
export class CustomFilter implements ExceptionFilter { ... }
```

### Catch Everything

```typescript
@Catch() // empty parameter list
export class CatchEverythingFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) { ... }
}
```

## Binding Filters

### Method-scoped
```typescript
@Post()
@UseFilters(new HttpExceptionFilter())
async create(@Body() createCatDto: CreateCatDto) { ... }
```

### Controller-scoped
```typescript
@Controller('cats')
@UseFilters(new HttpExceptionFilter())
export class CatsController {}
```

### Global-scoped (app-wide)
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
}
```

### Global-scoped with DI (via module)
```typescript
@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
```

## Inheritance

Extend `BaseExceptionFilter`:

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(exception, host);
  }
}
```

For global filters extending BaseExceptionFilter, inject HttpAdapter:

```typescript
const { httpAdapter } = app.get(HttpAdapterHost);
app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
```
