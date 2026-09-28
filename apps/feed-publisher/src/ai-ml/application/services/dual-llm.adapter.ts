import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmPort, type LlmGenerateRequest } from '@/llm/application/ports/llm.port';
import { resolveAiMlMode } from '@/ai-ml/ai-ml-mode';
import { AiMlLlmClientAdapter } from '@/ai-ml/infrastructure/ai-ml-llm-client.adapter';
import { AiMlParityService } from './ai-ml-parity.service';

/** DI token for the legacy in-process LLM leg (mock | gateway). */
export const LOCAL_LLM_PORT = 'LOCAL_LLM_PORT';

/**
 * Dual-run LLM port (ai-ml plan todo 3).
 *
 * `FEED_AI_ML_MODE=local` serves the legacy leg untouched;
 * `dual` runs both legs, records the parity outcome, and
 * returns the LOCAL text (a down ai-ml records `skipped` and never
 * breaks serving); `ai-ml` (DEFAULT since ai-ml todo 4) serves the remote leg only and fails
 * closed. Divergence never promotes itself — `assertNoDivergence`
 * blocks the cutover until the ledgers are clean.
 */
@Injectable()
export class DualLlmAdapter extends LlmPort {
  private readonly logger = new Logger(DualLlmAdapter.name);

  public constructor(
    @Inject(LOCAL_LLM_PORT) private readonly local: LlmPort,
    @Inject(AiMlLlmClientAdapter) private readonly remote: AiMlLlmClientAdapter,
    @Inject(AiMlParityService) private readonly parity: AiMlParityService,
  ) {
    super();
  }

  public async isAvailable(): Promise<boolean> {
    if (resolveAiMlMode(process.env['FEED_AI_ML_MODE']) === 'ai-ml') {
      return Boolean(this.remote) && (await this.remote.isAvailable());
    }
    return Boolean(this.local) && (await this.local.isAvailable());
  }

  public async generateText(request: LlmGenerateRequest): Promise<string> {
    const mode = resolveAiMlMode(process.env['FEED_AI_ML_MODE']);
    if (mode === 'ai-ml') {
      if (!this.remote) {
        throw new Error('FEED_AI_ML_MODE=ai-ml but the ai-ml client is unwired');
      }
      return this.remote.generateText(request);
    }
    if (!this.local) {
      throw new Error('dual/local LLM mode without a local leg (wiring bug)');
    }
    const localText = await this.local.generateText(request);
    if (mode === 'local' || !this.remote || !this.parity) {
      return localText;
    }
    let remoteText: string | null = null;
    let remoteError: string | null = null;
    try {
      remoteText = await this.remote.generateText(request);
    } catch (err) {
      remoteError = err instanceof Error ? err.message : String(err);
    }
    if (remoteError !== null) {
      this.parity.recordLlm('skipped', remoteError.slice(0, 200));
      return localText;
    }
    const outcome = this.parity.compareLlmTexts(localText, remoteText, {
      mockMode: process.env['USE_MOCK_AI'] === 'true',
    });
    if (outcome === 'diverged') {
      this.logger.warn(
        'ai-ml LLM divergence (local serves, cutover blocked): local=' +
          localText.length +
          ' chars, remote=' +
          (remoteText ?? '').length +
          ' chars',
      );
    }
    this.parity.recordLlm(outcome);
    return localText;
  }
}
