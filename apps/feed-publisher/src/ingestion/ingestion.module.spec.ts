import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { IngestionModule } from './ingestion.module';
import { FeedIngestionClient } from './application/services/feed-ingestion-client.service';
import { ProcessFeedMessageHandler } from './application/handlers/process-feed-message.handler';
import { FeedIngestionClientPort } from './domain/ports/ingestion-client.port';
import { IngestionHealthIndicator } from './health/ingestion-health.indicator';

describe('IngestionModule', () => {
  it('wires the feed ingestion graph', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        IngestionModule,
      ],
    }).compile();
    expect(module.get(IngestionModule)).toBeDefined();
    expect(module.get(FeedIngestionClient)).toBeDefined();
    expect(module.get(ProcessFeedMessageHandler)).toBeDefined();
    expect(module.get(FeedIngestionClientPort)).toBeDefined();
    expect(module.get(IngestionHealthIndicator)).toBeDefined();
    await module.close();
  });
});
