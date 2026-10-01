import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiMlLlmClientAdapter } from '@/ai-ml/infrastructure/ai-ml-llm-client.adapter';
import { AiMlParityService } from '@/ai-ml/application/services/ai-ml-parity.service';
import {
  buildAiMlStatusView,
  type AiMlStatusView,
} from '@/ai-ml/health/ai-ml-health.indicator';

/**
 * ai-ml migration status (`/api/ai-ml/status`, ai-ml plan todo 3).
 *
 * Exposes the cutover flag, the remote reachability probe, and the
 * dual-run parity ledger (matched/diverged/skipped per leg). Guarded
 * by the global `ApiKeyGuard` like every non-health controller.
 * Divergence here blocks `FEED_AI_ML_MODE=ai-ml` promotion — see
 * `AiMlParityService.assertNoDivergence`.
 */
@ApiTags('feed-publisher-ai-ml')
@Controller('api/ai-ml')
export class AiMlStatusController {
  public constructor(
    private readonly remote: AiMlLlmClientAdapter,
    private readonly parity: AiMlParityService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'ai-ml dual-run status: mode, remote probe, parity ledger',
  })
  @ApiResponse({ status: 200, description: 'Migration status' })
  public async status(): Promise<AiMlStatusView> {
    return buildAiMlStatusView(this.remote, this.parity);
  }
}
