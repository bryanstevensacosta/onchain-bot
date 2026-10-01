import { All, Controller, HttpCode, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@/shared/guards/api-key.guard';

/**
 * Threads stub (C1 — threads deferred to Tramo 2, content-publisher).
 *
 * @deprecated Threads delivery moved to `src/target/` (threads-publisher
 * plan Fase 2 todo 10): `threads` bindings dispatch through
 * `TargetDispatcherPort` into `apps/threads-publisher` over HTTP.
 * This stub stays wired ONLY until threads-publisher todo 11 deletes
 * it — do not extend.
 *
 * EVERY `.../threads/*` route under a template answers 501 with
 * `THREADS_NOT_IMPLEMENTED`. There is deliberately NO thread domain,
 * service, or repository in kol-system — the pinning spec locks the stub
 * so nobody half-implements threads here by accident.
 */
@Controller('api/templates')
@UseGuards(ApiKeyGuard)
export class ThreadsStubController {
  private static readonly BODY = {
    error: 'THREADS_NOT_IMPLEMENTED',
    message:
      'Thread support is deferred to Tramo 2 (content-publisher). No threads in kol-system.',
  };

  @All(':id/threads')
  @HttpCode(501)
  public threadsRoot(): Record<string, string> {
    return { ...ThreadsStubController.BODY };
  }

  @All(':id/threads/*')
  @HttpCode(501)
  public threadsNested(): Record<string, string> {
    return { ...ThreadsStubController.BODY };
  }
}
