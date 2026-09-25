import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MatchingModule } from './matching.module';
import { FilteredCryptoNewsService } from './application/services/filtered-crypto-news.service';
import { MatchingEvaluator } from './application/services/matching-evaluator.service';
import { EvaluateMessageMatchUseCase } from './application/use-cases/evaluate-message-match.use-case';
import { EnqueueMatchingCronScheduler } from './application/scheduling/enqueue-matching-cron.scheduler';
import { MatchingConfigRepository } from './domain/ports/matching-config.repository';
import { CryptoNewsFeedPort } from './domain/ports/crypto-news-feed.port';
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
    expect(module.get(FilteredCryptoNewsService)).toBeDefined();
    expect(module.get(MatchingEvaluator)).toBeDefined();
    expect(module.get(EvaluateMessageMatchUseCase)).toBeDefined();
    expect(module.get(EnqueueMatchingCronScheduler)).toBeDefined();
    expect(module.get(MatchingConfigRepository)).toBeDefined();
    expect(module.get(CryptoNewsFeedPort)).toBeDefined();
    expect(module.get(MatchedMessageEnqueuePort)).toBeDefined();
    await module.close();
  });
});
