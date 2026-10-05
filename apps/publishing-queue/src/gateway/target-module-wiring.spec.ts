import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TargetModule } from './target-gateway.module';
import { TargetDispatcherPort } from './application/ports/target-dispatcher.port';
import { TargetDispatcherService } from './application/services/target-dispatcher.service';
import { ThreadsPublisherHttpClient } from './infrastructure/threads/threads-publisher-http-client';
import { TargetHealthIndicator } from './health/target-health.indicator';

describe('TargetModule', () => {
  it('wires the unified delivery surface (todo 10)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TargetModule,
      ],
    }).compile();
    expect(module.get(TargetModule)).toBeDefined();
    expect(module.get(TargetDispatcherPort)).toBeInstanceOf(
      TargetDispatcherService,
    );
    expect(module.get(ThreadsPublisherHttpClient)).toBeDefined();
    expect(module.get(TargetHealthIndicator)).toBeDefined();
    await module.close();
  });
});
