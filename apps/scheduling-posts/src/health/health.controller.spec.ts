import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health.module';
import { HealthController } from './api/http/health.controller';

describe('HealthModule', () => {
  it('serves GET /api/health keyless with component list (todo 1)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        HealthModule,
      ],
    }).compile();
    const controller = module.get(HealthController);
    const body = await controller.health();
    expect(body).toMatchObject({ status: 'ok' });
    expect(
      (body.components as Array<{ component: string }>).map((c) => c.component),
    ).toEqual([
      'scheduling-posts',
      'database',
      'scheduling',
      'scheduled-posts',
      'telegram',
    ]);
    await module.close();
  });
});
