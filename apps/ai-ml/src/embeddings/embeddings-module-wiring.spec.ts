import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingsModule } from './embeddings.module';
import { EmbeddingsService } from './application/embeddings.service';
import { EmbeddingsController } from './api/http/embeddings.controller';

describe('EmbeddingsModule (ai-ml todo 2, failing-first)', () => {
  it('wires the single embeddings interface + HTTP surface', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EmbeddingsModule,
      ],
    }).compile();
    expect(module.get(EmbeddingsModule)).toBeDefined();
    expect(module.get(EmbeddingsService)).toBeDefined();
    expect(module.get(EmbeddingsController)).toBeDefined();
    await module.close();
  });
});
