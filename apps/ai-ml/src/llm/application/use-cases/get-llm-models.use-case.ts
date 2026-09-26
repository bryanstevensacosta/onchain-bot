import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmPort } from '../ports/llm.port';

/**
 * GetLlmModelsUseCase (ai-ml, todo 0): list models for the live
 * provider. Gateway hits `{baseUrl}/v1/models` (fail-open to the
 * default model on error); mock/openai return a static identity list
 * without network calls.
 */
@Injectable()
export class GetLlmModelsUseCase {
  public constructor(
    private readonly llm: LlmPort,
    private readonly config: ConfigService,
  ) {}

  public async execute(): Promise<{ provider: string; models: string[] }> {
    const provider = this.llm.providerName;
    if (provider === 'gateway') {
      const baseUrl = this.config.get<string>('LLM_GATEWAY_BASE_URL', '').replace(/\/+$/, '');
      const apiKey =
        this.config.get<string>('LLM_GATEWAY_API_KEY', '') ||
        this.config.get<string>('OPENAI_API_KEY', '');
      const fallback = this.config.get<string>('LLM_MODEL', 'gpt-4o-mini');
      try {
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          return { provider, models: [fallback] };
        }
        const body = (await res.json()) as { data?: Array<{ id?: string }> };
        const models = (body.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return { provider, models: models.length > 0 ? models : [fallback] };
      } catch {
        return { provider, models: [fallback] };
      }
    }
    if (provider === 'openai') {
      return { provider, models: [this.config.get<string>('LLM_MODEL', 'gpt-4o-mini')] };
    }
    return { provider, models: ['mock-default'] };
  }
}
