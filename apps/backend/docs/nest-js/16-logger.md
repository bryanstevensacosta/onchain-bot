# Logger

Nest comes with a built-in text-based `Logger` class from `@nestjs/common`.

## Basic Customization

### Disable logging

```typescript
const app = await NestFactory.create(AppModule, {
  logger: false,
});
```

### Enable specific levels

```typescript
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
```

Levels: `'log'`, `'fatal'`, `'error'`, `'warn'`, `'debug'`, `'verbose'`.

### Disable colors

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ colors: false }),
});
```

### Set prefix

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ prefix: 'MyApp' }),
});
```

## ConsoleLogger Options

| Option | Description | Default |
|--------|-------------|---------|
| `logLevels` | Enabled log levels | All |
| `timestamp` | Print time difference between logs | `false` |
| `prefix` | Prefix for messages | `Nest` |
| `json` | JSON format output | `false` |
| `colors` | Colorized output | `true` |
| `compact` | Single-line objects | `true` |
| `depth` | Object recursion depth | `5` |

## JSON Logging

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({ json: true }),
});
```

Output:
```json
{"level":"log","pid":19096,"timestamp":1607370779834,"message":"Starting Nest...","context":"NestFactory"}
```

## Using Logger in Services

```typescript
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
class MyService {
  private readonly logger = new Logger(MyService.name);

  doSomething() {
    this.logger.log('Doing something...');
    this.logger.warn('Warning message');
    this.logger.error('Error message');
    this.logger.debug('Debug info');
    this.logger.verbose('Verbose info');
  }
}
```

### With timestamps

```typescript
private readonly logger = new Logger(MyService.name, { timestamp: true });
```

## Custom Logger Implementation

Implement `LoggerService`:

```typescript
import { LoggerService, Injectable } from '@nestjs/common';

@Injectable()
export class MyLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]) {}
  fatal(message: any, ...optionalParams: any[]) {}
  error(message: any, ...optionalParams: any[]) {}
  warn(message: any, ...optionalParams: any[]) {}
  debug?(message: any, ...optionalParams: any[]) {}
  verbose?(message: any, ...optionalParams: any[]) {}
}
```

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new MyLogger(),
});
```

## Extend Built-in Logger

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string) {
    // add your tailored logic here
    super.error(...arguments);
  }
}
```

## Dependency Injection for Logger

Create a `LoggerModule`:

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}
```

Use in main.ts:

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(3000);
```

### Transient scope for per-module context

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}
```

```typescript
@Injectable()
export class CatsService {
  constructor(private myLogger: MyLogger) {
    this.myLogger.setContext('CatsService');
  }

  findAll(): Cat[] {
    this.myLogger.warn('About to return cats!');
    return this.cats;
  }
}
```
