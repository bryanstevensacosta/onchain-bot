import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DEFAULT_AI_ML_MODE } from './ai-ml-mode';
import { AiMlParityService } from './application/services/ai-ml-parity.service';
import { DualLlmAdapter } from './application/services/dual-llm.adapter';
import { LlmModule } from '../llm/llm.module';
import { LlmPort } from '../llm/application/ports/llm.port';

/**
 * Cutover contract (ai-ml plan todo 4).
 *
 * - Default mode is `ai-ml` (fail-closed: remote serves or throws).
 * - Rollback is explicit: `FEED_AI_ML_MODE=dual` serves local while
 *   the parity ledger shadows; divergence blocks promotion via
 *   `assertNoDivergence` (CONFLICT) and never auto-rolls back.
 */
describe('ai-ml cutover contract', () => {
  it('defaults to ai-ml (fail-closed, local code deprecated)', () => {
    expect(DEFAULT_AI_ML_MODE).toBe('ai-ml');
  });

  it('explicit dual rollback serves local when ai-ml is down', async () => {
    process.env.USE_MOCK_AI = 'true';
    process.env.FEED_AI_ML_MODE = 'dual';
    process.env.AI_ML_URL = 'http://127.0.0.1:44999';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        LlmModule,
      ],
    }).compile();
    try {
      const port = module.get(LlmPort);
      expect(port).toBeInstanceOf(DualLlmAdapter);
      const text = await port.generateText({ prompt: 'rollback?' });
      expect(text.startsWith('[LLM MOCK]')).toBe(true);
      const parity = module.get(AiMlParityService);
      expect(parity.summary().llm.skipped).toBe(1);
      expect(() => parity.assertNoDivergence()).not.toThrow();
    } finally {
      delete process.env.USE_MOCK_AI;
      delete process.env.FEED_AI_ML_MODE;
      delete process.env.AI_ML_URL;
      await module.close();
    }
  });

  it('divergence blocks cutover via assertNoDivergence (rollback to dual)', () => {
    const parity = new AiMlParityService();
    parity.recordLlm('diverged', 'cutover rehearsal');
    expect(() => parity.assertNoDivergence()).toThrow(
      'cutover to FEED_AI_ML_MODE=ai-ml is blocked',
    );
    expect(parity.summary().diverged).toBe(1);
  });
});
