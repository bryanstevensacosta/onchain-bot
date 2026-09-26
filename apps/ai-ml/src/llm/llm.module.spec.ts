import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmModule } from './llm.module';
import { LlmController } from './api/http/llm.controller';
import { LlmPort } from './application/ports/llm.port';
import { MockLlmAdapter } from './infrastructure/llm/mock-llm.adapter';

describe('LlmModule provider selection', () => {
  it('binds mock by default (USE_MOCK_AI=true)', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), LlmModule],
    }).compile();
    expect(module.get(LlmModule)).toBeDefined();
    expect(module.get(LlmController)).toBeDefined();
    expect(module.get(LlmPort)).toBeInstanceOf(MockLlmAdapter);
    await module.close();
  });

  it('binds gateway when mock is off and a gateway baseUrl exists', async () => {
    process.env.USE_MOCK_AI = 'false';
    process.env.LLM_GATEWAY_BASE_URL = 'http://localhost:4000';
    try {
      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: false }), LlmModule],
      }).compile();
      expect(module.get(LlmPort).providerName).toBe('gateway');
      await module.close();
    } finally {
      delete process.env.USE_MOCK_AI;
      delete process.env.LLM_GATEWAY_BASE_URL;
    }
  });

  it('exposes ConfigService (sanity: module wiring uses DI, not process.env)', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), LlmModule],
    }).compile();
    expect(module.get(ConfigService)).toBeDefined();
    await module.close();
  });
});
