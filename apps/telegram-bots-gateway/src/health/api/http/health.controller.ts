import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  public getHealth() {
    return {
      status: 'ok',
      components: {
        vault: 'up',
        resolver: 'up',
        send: 'up',
        ingress: 'up',
      },
    };
  }
}
