import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmPort,
  type LlmGenerateRequest,
} from '@/llm/application/ports/llm.port';
import {
  aiMlGet,
  aiMlPost,
  resolveAiMlHttpOptions,
  type AiMlHttpOptions,
} from './ai-ml-http';

/**
 * Remote LLM leg over the ai-ml gateway (ai-ml plan todo 3).
 *
 * Speaks `POST /api/llm/generate` (generate scope) + `GET /api/health`
 * (public availability probe). Outages throw LOUD (never null) so the
 * dual adapter can record `skipped` and the `ai-ml` serving mode fails
 * closed. Deviation from the ai-ml `GenerateDto`: no image payload
 * (vision over ai-ml lands at todo 4 — the dual compare is
 * outcome-level, so text-only legs never false-diverge).
 */
@Injectable()
export class AiMlLlmClientAdapter extends LlmPort {
  private readonly options: AiMlHttpOptions;

  public constructor(config: ConfigService) {
    super();
    this.options = resolveAiMlHttpOptions((key: string, fallback?: unknown) =>
      config?.get(key, fallback),
    );
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const health = await aiMlGet<{ status: string }>(
        this.options,
        '/api/health',
      );
      return health.status === 'ok';
    } catch {
      return false;
    }
  }

  public async generateText(request: LlmGenerateRequest): Promise<string> {
    const result = await aiMlPost<{ text: string }>(
      this.options,
      '/api/llm/generate',
      {
        prompt: request.prompt,
        ...(request.systemPrompt !== undefined
          ? { systemPrompt: request.systemPrompt }
          : {}),
        ...(request.model !== undefined ? { model: request.model } : {}),
        ...(request.maxTokens !== undefined
          ? { maxTokens: request.maxTokens }
          : {}),
        ...(request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
      },
    );
    return result.text;
  }
}
