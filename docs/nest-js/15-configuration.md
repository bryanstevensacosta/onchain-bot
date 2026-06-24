# Configuration (@nestjs/config)

## Installation

```bash
npm i --save @nestjs/config
```

> Uses [dotenv](https://github.com/motdotla/dotenv) internally. Requires TypeScript 4.1+.

## Getting Started

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}
```

Loads `.env` from project root and merges with `process.env` (runtime env takes precedence).

```env
DATABASE_USER=test
DATABASE_PASSWORD=test
```

### Custom env file path

```typescript
ConfigModule.forRoot({
  envFilePath: '.development.env',
  // Multiple files (first takes precedence):
  envFilePath: ['.env.development.local', '.env.development'],
});
```

### Disable env file loading

```typescript
ConfigModule.forRoot({ ignoreEnvFile: true });
```

### Global module

```typescript
ConfigModule.forRoot({ isGlobal: true });
```

## Custom Configuration Files

```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  },
});
```

```typescript
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration], // array of config functions
    }),
  ],
})
export class AppModule {}
```

## Using ConfigService

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {}

  someMethod() {
    const dbUser = this.configService.get<string>('DATABASE_USER');
    const dbHost = this.configService.get<string>('database.host', 'localhost');
    const dbConfig = this.configService.get<DatabaseConfig>('database');
  }
}
```

### Type inference

```typescript
interface EnvironmentVariables {
  PORT: number;
  TIMEOUT: string;
}

constructor(private configService: ConfigService<EnvironmentVariables>) {
  const port = this.configService.get('PORT', { infer: true }); // typeof port === "number"
}
```

## Configuration Namespaces

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432,
}));
```

```typescript
import databaseConfig from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [databaseConfig] }),
  ],
})
export class AppModule {}
```

Access with dot notation:

```typescript
this.configService.get<string>('database.host');
```

Or inject directly:

```typescript
constructor(
  @Inject(databaseConfig.KEY)
  private dbConfig: ConfigType<typeof databaseConfig>,
) {}
```

## Schema Validation (Joi)

```bash
npm install --save joi
```

```typescript
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().port().default(3000),
      }),
      validationOptions: {
        allowUnknown: false,  // reject unknown env vars
        abortEarly: true,     // stop on first error
      },
    }),
  ],
})
export class AppModule {}
```

### Custom validate function

```typescript
import { plainToInstance } from 'class-transformer';
import { IsNumber, Min, Max, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsNumber() @Min(0) @Max(65535)
  PORT: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });
  if (errors.length > 0) throw new Error(errors.toString());
  return validatedConfig;
}
```

```typescript
@Module({
  imports: [ConfigModule.forRoot({ validate })],
})
export class AppModule {}
```

## Cache Environment Variables

```typescript
ConfigModule.forRoot({ cache: true });
```

## Partial Registration (per-module config)

```typescript
import databaseConfig from './config/database.config';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
})
export class DatabaseModule {}
```

## Expandable Variables

```env
APP_URL=mywebsite.com
SUPPORT_EMAIL=support@${APP_URL}
```

```typescript
ConfigModule.forRoot({ expandVariables: true });
```

## Using in main.ts

```typescript
const configService = app.get(ConfigService);
const port = configService.get('PORT');
```

## Conditional Modules

```typescript
import { ConditionalModule } from '@nestjs/config';

@Module({
  imports: [
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),
    // Or with custom function:
    ConditionalModule.registerWhen(
      FooBarModule,
      (env) => !!env['foo'] && !!env['bar'],
    ),
  ],
})
export class AppModule {}
```
