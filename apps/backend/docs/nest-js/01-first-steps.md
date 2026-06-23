# First Steps

## Overview
NestJS is a progressive Node.js framework for building efficient, reliable, and scalable server-side applications. Supports TypeScript and JavaScript (with Babel).

## Prerequisites
- Node.js >= 20

## Setup

```bash
$ npm i -g @nestjs/cli
$ nest new project-name
# TypeScript strict mode:
$ nest new project-name --strict
```

## Project Structure

```
src/
├── app.controller.spec.ts   # Unit tests for controller
├── app.controller.ts        # Basic controller with single route
├── app.module.ts            # Root module
├── app.service.ts           # Basic service
└── main.ts                  # Entry point
```

## Entry File (main.ts)

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

`NestFactory.create()` returns an `INestApplication` object.

## Platforms

| Platform | Package | Description |
|----------|---------|-------------|
| Express  | `@nestjs/platform-express` (default) | Battle-tested, community packages |
| Fastify  | `@nestjs/platform-fastify` | High performance, max efficiency |

Type the app for platform-specific methods:

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
```

## Running

```bash
$ npm run start          # Production
$ npm run start:dev      # Watch mode (hot reload)
$ npm run start -- -b swc  # SWC builder (20x faster)
```

## Linting & Formatting

```bash
$ npm run lint     # ESLint
$ npm run format   # Prettier
```
