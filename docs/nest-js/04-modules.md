# Modules

Modules organize the application into cohesive units. Every app has at least one **root module**.

## @Module() Decorator

```typescript
@Module({
  imports:   [], // imported modules
  controllers: [], // controllers in this module
  providers:  [], // providers instantiated by this module
  exports:    [], // providers shared to importing modules
})
export class AppModule {}
```

## Feature Modules

Group related code into feature modules:

```typescript
// cats/cats.module.ts
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

Import into root module:

```typescript
@Module({
  imports: [CatsModule],
})
export class AppModule {}
```

> Create with CLI: `$ nest g module cats`

## Shared Modules

Modules are singletons by default. Export providers to share them:

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}
```

Any module importing `CatsModule` gets the **same instance** of `CatsService`.

## Module Re-exporting

```typescript
@Module({
  imports: [CommonModule],
  exports: [CommonModule], // Re-export full module
})
export class CoreModule {}
```

## Dependency Injection in Modules

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {
  constructor(private catsService: CatsService) {}
}
```

> Module classes cannot be injected as providers.

## Global Modules

Make providers available everywhere without importing:

```typescript
import { Module, Global } from '@nestjs/common';

@Global()
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}
```

> Register global modules **once**, typically by root/core module.

## Dynamic Modules

Create configurable modules at runtime:

```typescript
@Module({
  providers: [Connection],
  exports: [Connection],
})
export class DatabaseModule {
  static forRoot(entities = [], options?): DynamicModule {
    const providers = createDatabaseProviders(options, entities);
    return {
      module: DatabaseModule,
      providers,
      exports: providers,
    };
  }
}
```

Usage:

```typescript
@Module({
  imports: [DatabaseModule.forRoot([User])],
})
export class AppModule {}
```

Dynamic modules can return synchronously or asynchronously (Promise).

### Global Dynamic Modules

```typescript
{
  global: true,
  module: DatabaseModule,
  providers: providers,
  exports: providers,
}
```

### Re-exporting Dynamic Modules

```typescript
@Module({
  imports: [DatabaseModule.forRoot([User])],
  exports: [DatabaseModule], // omit forRoot()
})
export class AppModule {}
```
