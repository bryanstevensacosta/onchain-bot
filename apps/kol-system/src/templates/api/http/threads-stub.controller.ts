import { All, Controller, HttpCode } from '@nestjs/common';

/**
 * Threads stub (C1 — threads deferred to Tramo 2, content-publisher).
 *
 * EVERY `.../threads/*` route under a template answers 501 with
 * `THREADS_NOT_IMPLEMENTED`. There is deliberately NO thread domain,
 * service, or repository in kol-system — the pinning spec locks the stub
 * so nobody half-implements threads here by accident.
 */
@Controller('api/templates')
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
