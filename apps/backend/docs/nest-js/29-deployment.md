# Deployment

## Building

```bash
npm run build
```

Output goes to `dist/` directory. Entry point: `dist/main.js`.

## Running in Production

```bash
NODE_ENV=production node dist/main.js
```

Or use `nest start` (builds + runs).

## Environment Variables

- Set `NODE_ENV=production`
- Don't hardcode secrets — use `.env` or a secrets manager
- Use `@nestjs/config` with `ConfigModule.forRoot()`

## Docker

### Dockerfile

```dockerfile
FROM node:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### .dockerignore

```
node_modules
dist
*.log
.git
```

### Build & Run

```bash
docker build -t my-nest-app .
docker run -p 3000:3000 my-nest-app
```

## Scaling

### Vertical (scale up)
Increase CPU/RAM on a single server.

### Horizontal (scale out)
Add more instances behind a load balancer (Nginx, AWS ELB, Kubernetes).

## Health Checks

Use `@nestjs/terminus`:

```bash
npm install --save @nestjs/terminus
```

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}

// health.controller.ts
@Controller('health')
export class HealthController {
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
```

## Production Tips

- **Security**: Use Helmet, CSRF, rate limiting
- **Logging**: JSON logging for log aggregators
- **Monitoring**: Prometheus, New Relic, CloudWatch
- **CI/CD**: Automate with GitHub Actions, GitLab CI
- **Backups**: Regular database backups
- **Rate limiting**: `@nestjs/throttler` to prevent abuse
