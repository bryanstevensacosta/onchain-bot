# Providers

Providers are a core concept in Nest. Many basic Nest classes — services, repositories, factories, helpers — are providers. They can be **injected** as dependencies.

## Creating a Provider

```typescript
import { Injectable } from '@nestjs/common';
import { Cat } from './interfaces/cat.interface';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat) {
    this.cats.push(cat);
  }

  findAll(): Cat[] {
    return this.cats;
  }
}
```

The `@Injectable()` decorator signals to Nest's IoC container that this class can be managed by the DI system.

> Create with CLI: `$ nest g service cats`

## Registering Providers

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

## Dependency Injection

Nest resolves dependencies via constructor injection using TypeScript types:

```typescript
@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}
```

Nest will:
1. Look for the `CatsService` token
2. Return a cached singleton or create one
3. Inject it into the controller

Dependency resolution is **transitive** — if `CatsService` has its own dependencies, those are resolved first (bottom-up).

## Provider Registration (explicit syntax)

`providers: [CatsService]` is shorthand for:

```typescript
providers: [
  {
    provide: CatsService,
    useClass: CatsService,
  },
],
```

## Custom Providers

### Value providers (`useValue`)

For constants, external libraries, or test mocks:

```typescript
@Module({
  providers: [
    { provide: 'CONNECTION', useValue: connection },
  ],
})
export class AppModule {}
```

### Non-class tokens

Tokens can be strings (use `@Inject()`):

```typescript
@Injectable()
export class CatsRepository {
  constructor(@Inject('CONNECTION') connection: Connection) {}
}
```

### Class providers (`useClass`)

Dynamically choose the implementation:

```typescript
const configServiceProvider = {
  provide: ConfigService,
  useClass:
    process.env.NODE_ENV === 'development'
      ? DevelopmentConfigService
      : ProductionConfigService,
};
```

### Factory providers (`useFactory`)

Create providers dynamically with optional dependency injection:

```typescript
const connectionProvider = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: OptionsProvider) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [OptionsProvider],
};
```

### Alias providers (`useExisting`)

```typescript
const loggerAliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};
```

## Scopes

| Scope | Description |
|-------|-------------|
| `DEFAULT` (singleton) | Single instance shared across app |
| `REQUEST` | New instance per incoming request |
| `TRANSIENT` | New instance per injection |

```typescript
@Injectable({ scope: Scope.REQUEST })
export class CatsService {}
```

## Optional Providers

```typescript
@Injectable()
export class HttpService<T> {
  constructor(@Optional() @Inject('HTTP_OPTIONS') private httpClient: T) {}
}
```

## Property-based Injection

For cases where constructor injection is impractical:

```typescript
@Injectable()
export class HttpService<T> {
  @Inject('HTTP_OPTIONS')
  private readonly httpClient: T;
}
```

> Prefer constructor injection — it makes dependencies explicit.

## Exporting Providers

```typescript
@Module({
  providers: [connectionFactory],
  exports: ['CONNECTION'],       // by token
  // exports: [connectionFactory], // by full object
})
export class AppModule {}
```

## Manual Instantiation

- Use [ModuleReference](https://docs.nestjs.com/fundamentals/module-ref) to retrieve instances dynamically
- Use [Standalone applications](https://docs.nestjs.com/standalone-applications) for providers in bootstrap
