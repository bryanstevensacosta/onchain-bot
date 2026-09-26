import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  aiMlPost,
  AiMlHttpError,
  resolveAiMlHttpOptions,
  type AiMlHttpOptions,
} from './ai-ml-http';

export interface AiMlResolvedPrompt {
  readonly name: string;
  readonly content: string;
  readonly systemContent: string;
  readonly contentType: string;
  readonly version: number;
}

export interface AiMlPromptResolveResult {
  readonly template: AiMlResolvedPrompt;
  readonly source: string;
}

/**
 * Prompt-catalog resolve client over ai-ml (ai-ml plan todo 3).
 *
 * Speaks `POST /api/prompts/resolve` (read scope). Unknown names
 * return null (ai-ml 404); every other failure throws LOUD so the
 * caller can record `skipped` vs `diverged` honestly. The ai-ml
 * catalog v1 carries no per-template LLM knobs (D-9), so this client
 * is compare-only in dual — serving cutover waits for knobs at
 * ai-ml todo 4.
 */
@Injectable()
export class AiMlPromptClient {
  private readonly options: AiMlHttpOptions;

  public constructor(config: ConfigService) {
    this.options = resolveAiMlHttpOptions((key: string, fallback?: unknown) =>
      config?.get(key, fallback),
    );
  }

  public async resolve(name: string): Promise<AiMlPromptResolveResult | null> {
    try {
      return await aiMlPost<AiMlPromptResolveResult>(
        this.options,
        '/api/prompts/resolve',
        { name },
      );
    } catch (err) {
      if (err instanceof AiMlHttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }
}
