import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ThreadsLlmConfig } from 'threads/domain/threads-llm-config.entity';

/**
 * Threads LLM config (guard prod 400 on llmEnabled change mirrors backend).
 */
@Controller(['threads-publisher/llm', 'feed-threads-publisher/llm'])
export class ThreadsLlmConfigController {
  private config = ThreadsLlmConfig.default();

  @Get('config')
  public getConfig(): unknown {
    return this.config.toView();
  }

  @Patch('config')
  public patchConfig(
    @Body()
    body: Partial<{
      llmEnabled: boolean;
      publishingEnabled: boolean;
      dailyCap: number;
      model: string;
    }>,
  ): unknown {
    if (
      body.llmEnabled !== undefined &&
      process.env.NODE_ENV === 'production'
    ) {
      throw Object.assign(new Error('llmEnabled cannot be changed in production'), {
        status: 400,
      });
    }
    this.config.patch({
      llmEnabled: body.llmEnabled ?? this.config.llmEnabled,
      publishingEnabled:
        body.publishingEnabled ?? this.config.publishingEnabled,
      dailyCap: body.dailyCap ?? this.config.dailyCap,
      rejectNonLatin: false,
      llmMaxAttempts: 3,
      model:
        typeof body.model === 'string' && body.model.trim().length > 0
          ? body.model.trim()
          : this.config.model,
    });
    return this.config.toView();
  }

  @Get('models')
  public models(): { models: string[] } {
    return { models: ['mock'] };
  }

  @Get('templates')
  public templates(): unknown[] {
    return [{ id: 'threads-default' }];
  }
}
