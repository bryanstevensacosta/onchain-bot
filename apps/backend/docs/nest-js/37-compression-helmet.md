# Compression & Helmet (Security Headers)

## Compression (Gzip/Brotli)

### Express

```bash
npm i --save compression
npm i --save-dev @types/compression
```

```typescript
import * as compression from 'compression';

const app = await NestFactory.create(AppModule);
app.use(compression());
```

### Fastify

```bash
npm i --save @fastify/compress
```

```typescript
import compression from '@fastify/compress';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(compression);

// With custom Brotli quality
await app.register(compression, {
  brotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } },
});

// Limit encodings
await app.register(compression, { encodings: ['gzip', 'deflate'] });
```

## Helmet (Security Headers)

### Express

```bash
npm i --save helmet
```

```typescript
import helmet from 'helmet';

const app = await NestFactory.create(AppModule);
app.use(helmet());
```

### Apollo Sandbox CSP Fix

```typescript
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      imgSrc: [`'self'`, 'data:', 'apollo-server-landing-page.cdn.apollographql.com'],
      scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      manifestSrc: [`'self'`, 'apollo-server-landing-page.cdn.apollographql.com'],
      frameSrc: [`'self'`, 'sandbox.embed.apollographql.com'],
    },
  },
}));
```

### Fastify

```bash
npm i --save @fastify/helmet
```

```typescript
import helmet from '@fastify/helmet';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(helmet);
```

## CORS

```typescript
const app = await NestFactory.create(AppModule);
app.enableCors({
  origin: 'https://example.com',
  methods: 'GET,POST,PUT,DELETE',
  credentials: true,
});
```
