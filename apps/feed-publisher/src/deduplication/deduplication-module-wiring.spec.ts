import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DeduplicationModule } from './deduplication.module';
import { DeduplicationService } from './application/services/deduplication.service';
import { DeduplicationStorePort } from './domain/ports/deduplication-store.port';
import { EmbeddingPort } from './application/ports/embedding.port';

describe('DeduplicationModule', () => {
  it('wires the dedup cascade graph (todo 4)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DeduplicationModule,
      ],
    }).compile();
    expect(module.get(DeduplicationModule)).toBeDefined();
    expect(module.get(DeduplicationService)).toBeDefined();
    expect(module.get(DeduplicationStorePort)).toBeDefined();
    expect(module.get(EmbeddingPort)).toBeDefined();
    await module.close();
  });
});
