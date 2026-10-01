import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { PromptsModule } from '../prompts/prompts.module';
import { PreviewPlaygroundUseCase } from './application/preview-playground.use-case';
import { PlaygroundController } from './api/http/playground.controller';

/**
 * PlaygroundModule (ai-ml, todo 2): side-effect-free prompt preview
 * over the versioned catalog + LLM gateway. Imports (never copies)
 * the catalog and gateway; writes nothing.
 */
@Module({
  imports: [ConfigModule, LlmModule, PromptsModule],
  controllers: [PlaygroundController],
  providers: [PreviewPlaygroundUseCase],
  exports: [PreviewPlaygroundUseCase],
})
export class PlaygroundModule {}
