import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MatchingModule } from './matching.module';
import { FilteredFeedService } from './application/services/filtered-feed.service';
import { MatchingEvaluator } from './application/services/matching-evaluator.service';
import { EvaluateMessageMatchUseCase } from './application/use-cases/evaluate-message-match.use-case';
import { EnqueueMatchingCronScheduler } from './application/scheduling/enqueue-matching-cron.scheduler';
import { MatchingConfigRepository } from './domain/ports/matching-config.repository';
import { FeedPort } from './domain/ports/feed.port';
import { MatchedMessageEnqueuePort } from './domain/ports/matched-message-enqueue.port';

describe('MatchingModule', () => {
  it('wires the matching graph (todo 3)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MatchingModule,
      ],
    }).compile();
    expect(module.get(MatchingModule)).toBeDefined();
    expect(module.get(FilteredFeedService)).toBeDefined();
    expect(module.get(MatchingEvaluator)).toBeDefined();
    expect(module.get(EvaluateMessageMatchUseCase)).toBeDefined();
    expect(module.get(EnqueueMatchingCronScheduler)).toBeDefined();
    expect(module.get(MatchingConfigRepository)).toBeDefined();
    expect(module.get(FeedPort)).toBeDefined();
    expect(module.get(MatchedMessageEnqueuePort)).toBeDefined();
    await module.close();
  });
});
