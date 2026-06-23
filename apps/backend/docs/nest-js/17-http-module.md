# HTTP Module (HttpModule)

Nest wraps Axios and exposes it via `HttpModule`. Returns RxJS `Observables`.

## Installation

```bash
npm i --save @nestjs/axios axios
```

## Getting Started

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CatsService } from './cats.service';

@Module({
  imports: [HttpModule],
  providers: [CatsService],
})
export class CatsModule {}
```

Inject `HttpService`:

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Observable } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class CatsService {
  constructor(private readonly httpService: HttpService) {}

  findAll(): Observable<AxiosResponse<Cat[]>> {
    return this.httpService.get('http://localhost:3000/cats');
  }
}
```

All `HttpService` methods return `AxiosResponse` wrapped in `Observable`.

## Methods

| Method | Description |
|--------|-------------|
| `get(url, config?)` | GET request |
| `post(url, data?, config?)` | POST request |
| `put(url, data?, config?)` | PUT request |
| `patch(url, data?, config?)` | PATCH request |
| `delete(url, config?)` | DELETE request |
| `head(url, config?)` | HEAD request |
| `request(config)` | Generic request |

## Configuration

```typescript
@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
      baseURL: 'https://api.example.com',
      headers: { 'X-API-Key': 'secret' },
    }),
  ],
})
export class CatsModule {}
```

### Async configuration

```typescript
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        timeout: configService.get('HTTP_TIMEOUT'),
        maxRedirects: configService.get('HTTP_MAX_REDIRECTS'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class CatsModule {}
```

Or with `useClass`:

```typescript
@Injectable()
class HttpConfigService implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions {
    return { timeout: 5000, maxRedirects: 5 };
  }
}

HttpModule.registerAsync({
  useClass: HttpConfigService,
});
```

## Using Axios Directly

```typescript
@Injectable()
export class CatsService {
  constructor(private readonly httpService: HttpService) {}

  async findAll(): Promise<Cat[]> {
    const response = await this.httpService.axiosRef.get('http://localhost:3000/cats');
    return response.data;
  }
}
```

## Full Example with Error Handling

```typescript
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class CatsService {
  private readonly logger = new Logger(CatsService.name);

  constructor(private readonly httpService: HttpService) {}

  async findAll(): Promise<Cat[]> {
    const { data } = await firstValueFrom(
      this.httpService.get<Cat[]>('http://localhost:3000/cats').pipe(
        catchError((error: AxiosError) => {
          this.logger.error(error.response.data);
          throw 'An error happened!';
        }),
      ),
    );
    return data;
  }
}
```

> Use `firstValueFrom` or `lastValueFrom` from `rxjs` to convert Observables to Promises.
