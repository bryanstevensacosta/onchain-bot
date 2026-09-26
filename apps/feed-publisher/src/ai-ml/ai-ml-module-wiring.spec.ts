import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiMlModule } from './ai-ml.module';
import { AiMlParityService } from './application/services/ai-ml-parity.service';
import { AiMlPromptClient } from './infrastructure/ai-ml-prompt-client';
import { DualLlmAdapter } from './application/services/dual-llm.adapter';
import { DualEmbeddingAdapter } from './application/services/dual-embedding.adapter';
import { LlmModule } from '../llm/llm.module';
import { LlmPort } from '../llm/application/ports/llm.port';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { EmbeddingPort } from '../deduplication/application/ports/embedding.port';

describe('AiMlModule', () => {
  it('compiles standalone with clients + parity + status', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AiMlModule,
      ],
    }).compile();
    expect(module.get(AiMlModule)).toBeDefined();
    expect(module.get(AiMlParityService)).toBeDefined();
    expect(module.get(AiMlPromptClient)).toBeDefined();
    await module.close();
  });
});

describe('LlmModule ai-ml wiring', () => {
  it('binds LlmPort to the dual adapter (local serves in dual)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LlmModule,
      ],
    }).compile();
    expect(module.get(LlmPort)).toBeInstanceOf(DualLlmAdapter);
    expect(module.get(DualLlmAdapter)).toBeDefined();
    await module.close();
  });

  it('dual adapter is fully wired: no ai-ml server means skipped, never silent-local', async () => {
    process.env.USE_MOCK_AI = 'true';
    delete process.env.FEED_AI_ML_MODE;
    process.env.AI_ML_URL = 'http://127.0.0.1:44999';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LlmModule,
      ],
    }).compile();
    try {
      const port = module.get(LlmPort);
      const text = await port.generateText({ prompt: 'wired?' });
      expect(text.startsWith('[LLM MOCK]')).toBe(true);
      const parity = module.get(AiMlParityService);
      expect(parity.summary().llm.skipped).toBe(1);
    } finally {
      delete process.env.USE_MOCK_AI;
      delete process.env.AI_ML_URL;
      await module.close();
    }
  });
});

describe('DeduplicationModule ai-ml wiring', () => {
  it('binds EmbeddingPort to the dual adapter (local serves in dual)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DeduplicationModule,
      ],
    }).compile();
    expect(module.get(EmbeddingPort)).toBeInstanceOf(DualEmbeddingAdapter);
    expect(module.get(DualEmbeddingAdapter)).toBeDefined();
    await module.close();
  });

  it('dual adapter is fully wired: no ai-ml server means skipped, never silent-local', async () => {
    process.env.USE_MOCK_AI = 'true';
    delete process.env.FEED_AI_ML_MODE;
    process.env.AI_ML_URL = 'http://127.0.0.1:44999';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DeduplicationModule,
      ],
    }).compile();
    try {
      const port = module.get(EmbeddingPort);
      const vector = await port.embed('wired?');
      expect(vector !== null && vector.length === 64).toBe(true);
      const parity = module.get(AiMlParityService);
      expect(parity.summary().embeddings.skipped).toBe(1);
    } finally {
      delete process.env.USE_MOCK_AI;
      delete process.env.AI_ML_URL;
      await module.close();
    }
  });
});
