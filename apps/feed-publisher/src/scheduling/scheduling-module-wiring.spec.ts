import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SchedulingModule } from './scheduling.module';
import { SchedulingAdsController } from './api/http/scheduling-ads.controller';
import { SchedulingRotationConfigController } from './api/http/scheduling-rotation-config.controller';
import { SchedulingMediaController } from './api/http/scheduling-media.controller';
import { ScheduledAdRepository } from './domain/ports/scheduled-ad.repository';
import { ScheduledAdMediaRepository } from './domain/ports/scheduled-ad-media.repository';
import { AdMediaLibraryRepository } from './domain/ports/ad-media-library.repository';
import { SchedulingConfigRepository } from './domain/ports/scheduling-config.repository';
import { SchedulingStateRepository } from './domain/ports/scheduling-state.repository';
import { ScheduledAdDispatcherPort } from './domain/ports/scheduled-ad-dispatcher.port';
import { SchedulingMediaStoragePort } from './domain/ports/scheduling-media-storage.port';
import { RotationDeciderService } from './application/services/rotation-decider.service';
import { PublishScheduledAdUseCase } from './application/use-cases/publish-scheduled-ad.use-case';
import { PublishScheduledAdNowUseCase } from './application/use-cases/publish-scheduled-ad-now.use-case';
import { UploadScheduledAdMediaUseCase } from './application/use-cases/upload-scheduled-ad-media.use-case';
import { ClearScheduledAdMediaUseCase } from './application/use-cases/clear-scheduled-ad-media.use-case';
import { ReuseLibraryMediaUseCase } from './application/use-cases/reuse-library-media.use-case';
import { SchedulingCronScheduler } from './application/scheduling/scheduling-cron.scheduler';
import { SchedulingHealthState } from './application/state/scheduling-health.state';
import { SchedulingHealthIndicator } from './health/scheduling-health.indicator';

describe('SchedulingModule', () => {
  it('wires rotation + library + cron + 3 controllers + health (todo 6)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SchedulingModule,
      ],
    }).compile();
    expect(module.get(SchedulingModule)).toBeDefined();
    expect(module.get(SchedulingAdsController)).toBeDefined();
    expect(module.get(SchedulingRotationConfigController)).toBeDefined();
    expect(module.get(SchedulingMediaController)).toBeDefined();
    expect(module.get(ScheduledAdRepository)).toBeDefined();
    expect(module.get(ScheduledAdMediaRepository)).toBeDefined();
    expect(module.get(AdMediaLibraryRepository)).toBeDefined();
    expect(module.get(SchedulingConfigRepository)).toBeDefined();
    expect(module.get(SchedulingStateRepository)).toBeDefined();
    expect(module.get(ScheduledAdDispatcherPort)).toBeDefined();
    expect(module.get(SchedulingMediaStoragePort)).toBeDefined();
    expect(module.get(RotationDeciderService)).toBeDefined();
    expect(module.get(PublishScheduledAdUseCase)).toBeDefined();
    expect(module.get(PublishScheduledAdNowUseCase)).toBeDefined();
    expect(module.get(UploadScheduledAdMediaUseCase)).toBeDefined();
    expect(module.get(ClearScheduledAdMediaUseCase)).toBeDefined();
    expect(module.get(ReuseLibraryMediaUseCase)).toBeDefined();
    expect(module.get(SchedulingCronScheduler)).toBeDefined();
    expect(module.get(SchedulingHealthState)).toBeDefined();
    expect(module.get(SchedulingHealthIndicator)).toBeDefined();
    await module.close();
  });
});
