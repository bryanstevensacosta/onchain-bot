import { Module } from '@nestjs/common';

/**
 * LlmModule - stub (Tramo 2, todo 1; filled in todo 5).
 *
 * Will own LlmConfig (3-flag: matching/llm/publishing, LLM = llm AND
 * publishing, C-FLAGS-01) + PromptTemplate per content-type +
 * LlmGenerator (multi-provider gateway, default) + MockLlm
 * (USE_MOCK_AI) + Playground preview without side-effects.
 */
@Module({})
export class LlmModule {}
