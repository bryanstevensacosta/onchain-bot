import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';

export interface ThreadsLlmModelView {
  readonly id: string;
  readonly ownedBy?: string;
}

/**
 * Use case: list models exposed by the OpenAI-compatible gateway the
 * threads publisher is configured to talk to.
 *
 * Threads-typed mirror of the crypto-news `GetLlmModelsUseCase`
 * (`telegram/crypto-news-publisher/application/handlers/
 * get-llm-models.use-case.ts`): same Litellm-style
 * `${baseUrl}/v1/models` fetch, same 5 s timeout, same slim
 * `{ id, ownedBy? }` projection. Scoped to threads (own injectable
 * token) so the threads `LlmConfigController` never imports a
 * crypto-news use case cross-BC.
 *
 * Errors (network, timeout, non-2xx) are surfaced by throwing — the
 * controller catches and returns 502 with `{ error: 'gateway
 * unreachable' }`.
 */
@Injectable()
export class GetThreadsLlmModelsUseCase {
  private static readonly REQUEST_TIMEOUT_MS = 5_000;

  private readonly logger = new Logger(GetThreadsLlmModelsUseCase.name);

  public constructor(private readonly configService: ConfigService) {}

  public async execute(): Promise<ReadonlyArray<ThreadsLlmModelView>> {
    const baseUrl =
      this.configService.get<AppConfig>('app')?.llm?.gateway?.baseUrl ?? '';
    const apiKey =
      this.configService.get<AppConfig>('app')?.llm?.gateway?.apiKey ?? '';
    if (!baseUrl) {
      throw new Error('LLM gateway baseUrl not configured');
    }
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      GetThreadsLlmModelsUseCase.REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const reason = `${response.status} ${response.statusText}`;
      this.logger.warn(`LLM gateway /v1/models failed: ${reason}`);
      throw new Error(`LLM gateway unreachable: ${reason}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown; owned_by?: unknown }>;
    };
    if (!payload || !Array.isArray(payload.data)) {
      return [];
    }
    return payload.data
      .filter(
        (entry): entry is { id: unknown; owned_by?: unknown } =>
          entry != null && typeof entry === 'object',
      )
      .map((entry) => {
        const id = typeof entry.id === 'string' ? entry.id : String(entry.id);
        const ownedBy =
          typeof entry.owned_by === 'string' ? entry.owned_by : undefined;
        return ownedBy ? { id, ownedBy } : { id };
      });
  }
}
