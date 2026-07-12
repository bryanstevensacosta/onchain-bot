import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmPort, LlmGenerateRequest } from '../llm.port';
import type { AppConfig } from '../../common/config/app.config';

/**
 * LLM adapter backed by an OpenAI-compatible gateway (e.g. LiteLLM proxy).
 *
 * The gateway exposes the standard `/v1/chat/completions` endpoint, so we
 * reuse the official `openai` SDK and only override `baseURL` + `apiKey`.
 * The model name is read from `app.llm.gateway.model` (NOT from the
 * request) so callers cannot accidentally target a different model.
 *
 * Configuration is loaded via `ConfigService` from `app.llm.gateway`:
 *   - `baseUrl`  — gateway base URL (e.g. http://host:port)
 *   - `apiKey`   — virtual key issued by the gateway
 *   - `model`    — model identifier (e.g. `opencode-zen/deepseek-v4-flash`)
 *
 * Sibling to `OpenAiAdapter`; the latter remains untouched so other BCs
 * can keep using OpenAI directly.
 */
@Injectable()
export class LlmGatewayAdapter extends LlmPort {
  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly logger = new Logger(LlmGatewayAdapter.name);

  constructor(configService: ConfigService) {
    super();
    const gateway = configService.get<AppConfig>('app')?.llm?.gateway;
    this.apiKey = gateway?.apiKey ?? '';
    this.baseUrl = gateway?.baseUrl ?? '';
    this.model = gateway?.model ?? '';
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.apiKey && this.baseUrl);
  }

  async generateText(request: LlmGenerateRequest): Promise<string> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: request.prompt },
    ];
    if (request.imageUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: request.imageUrl },
      });
    } else if (request.imageBase64) {
      const mime = request.mimeType ?? 'image/jpeg';
      const dataUrl = `data:${mime};base64,${request.imageBase64}`;
      userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
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
              reasoning_effort: request
                .reasoningEffort as OpenAI.Chat.ChatCompletionReasoningEffort,
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
