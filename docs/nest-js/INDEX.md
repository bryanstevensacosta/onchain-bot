# NestJS Documentation Index

| # | File | Description |
|---|------|-------------|
| 01 | `first-steps.md` | Setup, CLI (`nest new`), project structure, platforms (Express/Fastify), running, linting |
| 02 | `controllers.md` | Routing, HTTP method decorators, request/response, DTOs, params, sub-domain routing |
| 03 | `providers.md` | `@Injectable`, DI, service creation, custom providers, scopes, optional/property injection |
| 04 | `modules.md` | Feature modules, shared modules, global modules, dynamic modules (`forRoot`) |
| 05 | `middleware.md` | Class/functional middleware, DI, routing, excludes, global middleware |
| 06 | `exception-filters.md` | Built-in HTTP exceptions, custom filters, binding (method/controller/global), inheritance |
| 07 | `pipes.md` | Built-in pipes (ParseInt, ParseUUID, etc.), custom pipes, Zod validation, class-validator |
| 08 | `guards.md` | CanActivate, role-based auth, `Reflector`, metadata, binding guards |
| 09 | `interceptors.md` | AOP, response mapping, exception mapping, caching, timeout, stream overriding |
| 10 | `custom-decorators.md` | `createParamDecorator`, param decorators, pipes with decorators, `applyDecorators` |
| 11 | `dependency-injection.md` | Custom providers (`useValue`, `useClass`, `useFactory`, `useExisting`), non-class tokens |
| 12 | `lifecycle-events.md` | `OnModuleInit`, `OnApplicationBootstrap`, shutdown hooks (`enableShutdownHooks`) |
| 13 | `execution-context.md` | `ArgumentsHost`, `ExecutionContext`, `Reflector`, metadata, `getHandler`/`getClass` |
| 14 | `testing.md` | Unit tests with `Test.createTestingModule`, e2e with Supertest, auto-mocking, overrides |
| 15 | `configuration.md` | `@nestjs/config`, `.env`, custom config files, namespaces, Joi validation, expandable vars |
| 16 | `logger.md` | `ConsoleLogger` options, JSON logging, custom/extended logger, DI for logger |
| 17 | `http-module.md` | `HttpModule`/`HttpService`, Axios wrapper, RxJS Observables, async config, error handling |
| 18 | `task-scheduling.md` | `@nestjs/schedule`, cron jobs, intervals, timeouts, `SchedulerRegistry`, dynamic API |
| 19 | `caching.md` | `@nestjs/cache-manager`, `CacheInterceptor`, Redis, TTL, per-method overrides |
| 20 | `authentication.md` | JWT auth, `@nestjs/jwt`, AuthGuard, global auth, `@Public()` decorator |
| 21 | `rate-limiting.md` | `@nestjs/throttler`, multiple definitions, proxies, Redis storage, WebSocket/GraphQL |
| 22 | `cqrs.md` | CQRS pattern, Commands, Queries, Events, Aggregates (`AggregateRoot`), Sagas, request scoping |
| 23 | `websockets.md` | Gateways, Socket.io, `@SubscribeMessage`, lifecycle hooks, server/namespace |
| 24 | `openapi.md` | Swagger, `DocumentBuilder`, decorators (`@ApiProperty`, `@ApiTags`, etc.), plugins |
| 25 | `cli.md` | CLI commands (`new`, `generate`, `build`, `start`), monorepo workspaces, `nest-cli.json` |
| 26 | `database.md` | TypeORM (SQL entities, relations, transactions, multiple DBs) + Mongoose (MongoDB schemas, hooks, discriminators) |
| 27 | `graphql.md` | Code first decorators, schema first SDL, resolvers, Apollo, async config |
| 28 | `microservices.md` | TCP/Redis/Kafka/RabbitMQ, `@MessagePattern`, `@EventPattern`, ClientProxy, TLS |
| 29 | `deployment.md` | Building, Docker, production tips, health checks, scaling |
| 30 | `prisma.md` | Prisma ORM setup, schema, migrations, CRUD services, relations |
| 31 | `queues.md` | BullMQ & Bull, producers, consumers, job options, event listeners |
| 32 | `event-emitter.md` | `@nestjs/event-emitter`, dispatch, listen, wildcards |
| 33 | `file-upload.md` | Multer, single/multiple files, validation, `ParseFilePipeBuilder` |
| 34 | `serialization.md` | `ClassSerializerInterceptor`, `@Exclude`, `@Expose`, `@Transform` |
| 35 | `versioning.md` | URI/Header/Media/Custom versioning, controller/route/neutral versions |
| 36 | `authorization.md` | RBAC, Claims, CASL, `PoliciesGuard`, `@CheckPolicies` |
| 37 | `compression-helmet.md` | Gzip/Brotli compression, Helmet security headers, CORS |
