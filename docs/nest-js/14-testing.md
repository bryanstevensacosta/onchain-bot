# Testing

## Installation

```bash
npm i --save-dev @nestjs/testing
```

Nest scaffolds default unit tests and e2e tests. Integrates with Jest and Supertest out-of-the-box.

## Unit Testing

### Manual instantiation (isolated)

```typescript
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(() => {
    catsService = new CatsService();
    catsController = new CatsController(catsService);
  });

  describe('findAll', () => {
    it('should return an array of cats', async () => {
      const result = ['test'];
      jest.spyOn(catsService, 'findAll').mockImplementation(() => result);
      expect(await catsController.findAll()).toBe(result);
    });
  });
});
```

### Using Test class (Nest DI)

```typescript
import { Test } from '@nestjs/testing';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
      providers: [CatsService],
    }).compile();

    catsService = moduleRef.get(CatsService);
    catsController = moduleRef.get(CatsController);
  });

  it('should return cats', async () => {
    const result = ['test'];
    jest.spyOn(catsService, 'findAll').mockImplementation(() => result);
    expect(await catsController.findAll()).toBe(result);
  });
});
```

### Auto mocking

```typescript
const moduleRef = await Test.createTestingModule({
  controllers: [CatsController],
})
  .useMocker((token) => {
    if (token === CatsService) {
      return { findAll: jest.fn().mockResolvedValue(['test1', 'test2']) };
    }
    if (typeof token === 'function') {
      // Generic mock for any other class
      const mockMetadata = moduleMocker.getMetadata(token);
      const Mock = moduleMocker.generateFromMetadata(mockMetadata);
      return new Mock();
    }
  })
  .compile();
```

## End-to-End Testing

```typescript
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { CatsModule } from '../../src/cats/cats.module';
import { INestApplication } from '@nestjs/common';

describe('Cats (e2e)', () => {
  let app: INestApplication;
  let catsService = { findAll: () => ['test'] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CatsModule],
    })
      .overrideProvider(CatsService)
      .useValue(catsService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it(`GET /cats`, () => {
    return request(app.getHttpServer())
      .get('/cats')
      .expect(200)
      .expect({ data: catsService.findAll() });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Override methods

| Method | Description |
|--------|-------------|
| `overrideProvider()` | Override a provider |
| `overrideModule()` | Override an imported module |
| `overrideGuard()` | Override a guard |
| `overrideInterceptor()` | Override an interceptor |
| `overrideFilter()` | Override an exception filter |
| `overridePipe()` | Override a pipe |

Each returns `{ useClass, useValue, useFactory }` (except `overrideModule` which returns `useModule`).

### Globally registered enhancers

For enhancers registered via `APP_GUARD`, `APP_PIPE`, etc.:

```typescript
// In module: use `useExisting` instead of `useClass`
providers: [
  { provide: APP_GUARD, useExisting: JwtAuthGuard },
  JwtAuthGuard,
],

// In test:
.overrideProvider(JwtAuthGuard)
.useClass(MockAuthGuard)
```

### Request-scoped providers

```typescript
const contextId = ContextIdFactory.create();
jest.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => contextId);

catsService = await moduleRef.resolve(CatsService, contextId);
```
