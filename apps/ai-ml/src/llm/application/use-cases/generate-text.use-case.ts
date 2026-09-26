import { Injectable } from '@nestjs/common';
import { LlmPort, type LlmGenerateRequest } from '../ports/llm.port';
import { UsageAuditService } from '../usage-audit.service';

export interface GenerateTextResult {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
}

/**
 * GenerateTextUseCase (ai-ml, todo 0): single generation entry point.
 * Fails fast when no provider is available; audits every attempt
 * (ok + error) with sizes only — never prompt/output content.
 */
@Injectable()
export class GenerateTextUseCase {
  public constructor(
    private readonly llm: LlmPort,
    private readonly audit: UsageAuditService,
  ) {}

  public async execute(
    request: LlmGenerateRequest,
    opts?: { keyId?: string; model?: string },
  ): Promise<GenerateTextResult> {
    const available = await this.llm.isAvailable();
    if (!available) {
      this.audit.record({
        keyId: opts?.keyId ?? 'anonymous',
        provider: this.llm.providerName,
        model: opts?.model ?? request.model ?? 'unknown',
        promptChars: request.prompt.length,
        outputChars: 0,
        latencyMs: 0,
        status: 'error',
      });
      throw new Error(
        `No LLM provider available (provider=${this.llm.providerName}; set USE_MOCK_AI=true or configure LLM_GATEWAY_BASE_URL / OPENAI_API_KEY)`,
      );
    }
    const started = Date.now();
    try {
      const text = await this.llm.generateText(request);
      const latencyMs = Date.now() - started;
      this.audit.record({
        keyId: opts?.keyId ?? 'anonymous',
        provider: this.llm.providerName,
        model: request.model ?? 'default',
        promptChars: request.prompt.length,
        outputChars: text.length,
        latencyMs,
        status: 'ok',
      });
      return { text, provider: this.llm.providerName, model: request.model ?? 'default', latencyMs };
    } catch (err) {
      this.audit.record({
        keyId: opts?.keyId ?? 'anonymous',
        provider: this.llm.providerName,
        model: request.model ?? 'default',
        promptChars: request.prompt.length,
        outputChars: 0,
        latencyMs: Date.now() - started,
        status: 'error',
      });
      throw err;
    }
  }
}
