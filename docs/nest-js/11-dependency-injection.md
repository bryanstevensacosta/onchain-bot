# Dependency Injection & Custom Providers

Nest DI is built on an IoC container. Three key steps:

1. `@Injectable()` — declares a class manageable by the IoC container
2. Constructor injection — declares dependencies
3. Module registration — associates tokens with classes

## Standard Providers

```typescript
@Module({
  providers: [CatsService],
})
```

Short-hand for:

```typescript
@Module({
  providers: [{ provide: CatsService, useClass: CatsService }],
})
```

## Custom Providers

### Value providers (`useValue`)

For injecting constants, external libraries, or mocks:

```typescript
@Module({
  providers: [
    {
      provide: CatsService,
      useValue: mockCatsService,
    },
  ],
})
export class AppModule {}
```

### Non-class tokens

Use strings or Symbols as tokens:

```typescript
@Module({
  providers: [
    { provide: 'CONNECTION', useValue: connection },
  ],
})
export class AppModule {}
```

Inject with `@Inject()`:

```typescript
@Injectable()
export class CatsRepository {
  constructor(@Inject('CONNECTION') connection: Connection) {}
}
```

### Class providers (`useClass`)

Dynamically determine which class to use:

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

Create providers dynamically:

```typescript
const connectionProvider = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: MyOptionsProvider, optionalProvider?: string) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [MyOptionsProvider, { token: 'SomeOptionalProvider', optional: true }],
};
```

### Alias providers (`useExisting`)

```typescript
const loggerAliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};
```

## Exporting Custom Providers

```typescript
@Module({
  providers: [connectionFactory],
  exports: ['CONNECTION'],       // by token
  // exports: [connectionFactory], // or by full object
})
export class AppModule {}
```
