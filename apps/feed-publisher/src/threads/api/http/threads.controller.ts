import { All, Controller, HttpCode } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Threads control (`/api/threads`, v1 skeleton — C1).
 *
 * Exposes the SAME stub the template service fixed in Tramo 1 (same
 * 501 + same `THREADS_NOT_IMPLEMENTED` code): every threads route
 * answers 501 until the v2 un-stubbing contract
 * (`src/threads/CONTRACT.md`) activates it. There is deliberately NO
 * service call behind these handlers in v1 — the domain skeleton
 * (builder/scheduler/use-cases/cron) is unit-tested directly.
 */
@ApiTags('feed-publisher-threads')
@Controller('api/threads')
export class ThreadsController {
  private static readonly BODY = {
    error: 'THREADS_NOT_IMPLEMENTED',
    message:
      'Thread support is deferred to v2 (see src/threads/CONTRACT.md). No threads publishing in v1.',
  };

  @All()
  @HttpCode(501)
  @ApiResponse({ status: 501, description: 'Threads not implemented (v1)' })
  public root(): Record<string, string> {
    return { ...ThreadsController.BODY };
  }

  @All(':id')
  @HttpCode(501)
  @ApiResponse({ status: 501, description: 'Threads not implemented (v1)' })
  public byId(): Record<string, string> {
    return { ...ThreadsController.BODY };
  }

  @All(':id/*')
  @HttpCode(501)
  @ApiResponse({ status: 501, description: 'Threads not implemented (v1)' })
  public nested(): Record<string, string> {
    return { ...ThreadsController.BODY };
  }
}
