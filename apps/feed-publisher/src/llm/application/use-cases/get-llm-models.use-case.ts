import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmModelView {
  readonly id: string;
  readonly ownedBy?: string;
}

/**
 * Lists models exposed by the OpenAI-compatible gateway
 * (`${baseUrl}/v1/models`). 5 s timeout so a hanging gateway cannot
 * stall the controller; errors throw and the playground controller
 * maps them to 502 `gateway unreachable`.
 */
@Injectable()
export class GetLlmModelsUseCase {
  private static readonly REQUEST_TIMEOUT_MS = 5_000;

  private readonly logger = new Logger(GetLlmModelsUseCase.name);

  public constructor(private readonly configService: ConfigService) {}

  public async execute(): Promise<ReadonlyArray<LlmModelView>> {
    const baseUrl = this.configService.get<string>('LLM_GATEWAY_BASE_URL', '');
    const gatewayKey = this.configService.get<string>('LLM_GATEWAY_API_KEY', '');
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    const apiKey = gatewayKey || openaiKey;
    if (!baseUrl) {
      throw new Error('LLM gateway baseUrl not configured');
    }
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GetLlmModelsUseCase.REQUEST_TIMEOUT_MS);
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
        const ownedBy = typeof entry.owned_by === 'string' ? entry.owned_by : undefined;
        return ownedBy ? { id, ownedBy } : { id };
      });
  }
}
