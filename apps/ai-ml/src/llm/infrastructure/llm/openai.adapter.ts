import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  LlmPort,
  type LlmGenerateRequest,
  type LlmProviderName,
} from '@/llm/application/ports/llm.port';

/**
 * OpenAI direct adapter: `chat.completions` against api.openai.com
 * (default `gpt-4o-mini`, vision). Live only when `OPENAI_API_KEY`
 * is set; otherwise reports unavailable and the factory skips it.
 */
@Injectable()
export class OpenAiAdapter extends LlmPort {
  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly logger = new Logger(OpenAiAdapter.name);

  public constructor(configService: ConfigService) {
    super();
    this.apiKey = configService.get<string>('OPENAI_API_KEY', '');
    this.model = configService.get<string>('LLM_MODEL', 'gpt-4o-mini');
    this.client = new OpenAI({ apiKey: this.apiKey || 'unconfigured' });
  }

  public get providerName(): LlmProviderName {
    return 'openai';
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  public async generateText(request: LlmGenerateRequest): Promise<string> {
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
      });
      return resp.choices[0]?.message?.content ?? '';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`OpenAI request failed: ${message}`);
      throw new Error(`OpenAI request failed: ${message}`);
    }
  }
}
