import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmPort, type LlmGenerateRequest } from '../../application/ports/llm.port';

/**
 * LLM gateway adapter (DEFAULT provider): OpenAI-compatible gateway
 * (LiteLLM-style `/v1/chat/completions`) via the official `openai` SDK
 * with `baseURL` + `apiKey` overridden.
 *
 * Env: `LLM_GATEWAY_BASE_URL` (gateway origin) + `LLM_GATEWAY_API_KEY`
 * (falls back to `OPENAI_API_KEY`) + `LLM_MODEL` (default model when a
 * template does not pin one — templates always pin one, so this is only
 * the playground-draft fallback). Unconfigured (empty baseUrl/key) the
 * adapter reports unavailable and every call fails fast with a wrapped
 * error the drain path turns into FAILED + cron retry.
 */
@Injectable()
export class LlmGatewayAdapter extends LlmPort {
  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly logger = new Logger(LlmGatewayAdapter.name);

  public constructor(configService: ConfigService) {
    super();
    this.baseUrl = configService.get<string>('LLM_GATEWAY_BASE_URL', '');
    const gatewayKey = configService.get<string>('LLM_GATEWAY_API_KEY', '');
    const openaiKey = configService.get<string>('OPENAI_API_KEY', '');
    this.apiKey = gatewayKey || openaiKey;
    this.model = configService.get<string>('LLM_MODEL', 'gpt-4o-mini');
    // Lazy-safe construction: the SDK throws on empty credentials, so
    // an unconfigured adapter gets a dummy key + default baseURL.
    // `isAvailable()` stays false and every call fails fast with a
    // wrapped error (FAILED + cron retry downstream).
    this.client = new OpenAI({
      apiKey: this.apiKey || 'unconfigured',
      baseURL: this.baseUrl || undefined,
    });
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey && this.baseUrl);
  }

  public async generateText(request: LlmGenerateRequest): Promise<string> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: request.prompt },
    ];
    if (request.imageUrl) {
      userContent.push({ type: 'image_url', image_url: { url: request.imageUrl } });
    } else if (request.imageBase64) {
      const mime = request.mimeType ?? 'image/jpeg';
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${request.imageBase64}` },
      });
    }
    const messages: Array<
      | OpenAI.Chat.ChatCompletionSystemMessageParam
      | OpenAI.Chat.ChatCompletionUserMessageParam
    > = [];
    const trimmedSystem = request.systemPrompt?.trim();
    if (trimmedSystem) {
      messages.push({ role: 'system', content: trimmedSystem });
    }
    messages.push({ role: 'user', content: userContent });
    try {
      const resp = await this.client.chat.completions.create({
        model: request.model ?? this.model,
        messages,
        max_tokens: request.maxTokens ?? 2000,
        temperature: request.temperature ?? 0.7,
        ...(request.reasoningEffort
          ? {
              reasoning_effort:
                request.reasoningEffort as OpenAI.Chat.ChatCompletionReasoningEffort,
            }
          : {}),
      });
      return resp.choices[0]?.message?.content ?? '';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`LLM gateway request failed: ${message}`);
      throw new Error(`LLM gateway request failed: ${message}`);
    }
  }
}
