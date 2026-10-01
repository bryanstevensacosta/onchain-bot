import { MockLlmAdapter } from '../infrastructure/llm/mock-llm.adapter';
import { LlmGatewayAdapter } from '../infrastructure/llm/llm-gateway.adapter';
import { ConfigService } from '@nestjs/config';
import { UsageAuditService } from './usage-audit.service';
import { GenerateTextUseCase } from './use-cases/generate-text.use-case';

describe('GenerateTextUseCase', () => {
  it('generates via mock and audits sizes only (never content)', async () => {
    const audit = new UsageAuditService();
    const useCase = new GenerateTextUseCase(new MockLlmAdapter(), audit);
    const result = await useCase.execute(
      { prompt: 'secret prompt' },
      { keyId: 'k1' },
    );
    expect(result.provider).toBe('mock');
    expect(result.text).toContain('[LLM MOCK]');
    const entries = audit.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      keyId: 'k1',
      provider: 'mock',
      status: 'ok',
    });
    expect(JSON.stringify(entries[0])).not.toContain('secret prompt');
  });

  it('fails fast with a clear error when no provider is available', async () => {
    const audit = new UsageAuditService();
    const gateway = new LlmGatewayAdapter(new ConfigService({}));
    const useCase = new GenerateTextUseCase(gateway, audit);
    await expect(useCase.execute({ prompt: 'hi' })).rejects.toThrow(
      'No LLM provider available',
    );
    expect(audit.list()[0]).toMatchObject({ status: 'error' });
  });
});
