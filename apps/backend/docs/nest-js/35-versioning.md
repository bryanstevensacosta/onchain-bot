# Versioning

Support 4 types of versioning: URI, Header, Media Type, and Custom.

## Enable Versioning

```typescript
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.URI,
});
await app.listen(3000);
```

## Versioning Types

### URI Versioning

```typescript
app.enableVersioning({
  type: VersioningType.URI,
  prefix: 'v', // default: 'v' → /v1/route
});
```

### Header Versioning

```typescript
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'Custom-Header',
});
```

### Media Type Versioning

```typescript
app.enableVersioning({
  type: VersioningType.MEDIA_TYPE,
  key: 'v=',
});
// Accept: application/json;v=2
```

### Custom Versioning

```typescript
const extractor = (request: FastifyRequest): string | string[] => {
  return [request.headers['x-api-version'] as string].filter(v => !!v);
};

app.enableVersioning({
  type: VersioningType.CUSTOM,
  extractor,
});
```

## Controller Version

```typescript
@Controller({ version: '1' })
export class CatsControllerV1 {
  @Get('cats')
  findAll() { return 'version 1'; }
}
```

## Route Version

```typescript
@Controller()
export class CatsController {
  @Version('1')
  @Get('cats')
  findAllV1() { return 'version 1'; }

  @Version('2')
  @Get('cats')
  findAllV2() { return 'version 2'; }
}
```

## Multiple Versions

```typescript
@Controller({ version: ['1', '2'] })
export class CatsController {}
```

## Version Neutral

```typescript
import { VERSION_NEUTRAL } from '@nestjs/common';

@Controller({ version: VERSION_NEUTRAL })
export class CatsController {}
```

Accepts requests regardless of version.

## Default Version

```typescript
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',              // or ['1', '2'] or VERSION_NEUTRAL
});
```

## Middleware Versioning

```typescript
consumer
  .apply(LoggerMiddleware)
  .forRoutes({ path: 'cats', method: RequestMethod.GET, version: '2' });
```
