import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { SchedulePostUseCase } from '../../application/use-cases/schedule-post.use-case';
import { CancelScheduledPostUseCase } from '../../application/use-cases/cancel-scheduled-post.use-case';
import { FireDuePostsUseCase } from '../../application/use-cases/fire-due-posts.use-case';
import { ScheduledPostRepository } from '../../domain/ports/scheduled-post.repository';
import type { ScheduleRequest } from '../../domain/schedule-request';
import { SchedulePostDto } from './schedule-post.dto';

/**
 * Contract posts HTTP surface (guarded by the global x-api-key guard;
 * health is the only keyless route). POST creates (201) or replays
 * the idempotent original (200, never a second row). DELETE cancels
 * by owning session only. publish-now bypasses the delay/cap
 * decider but still enforces auth + emits the same callback.
 */
@Controller('api/scheduled-posts')
export class ScheduledPostsController {
  public constructor(
    private readonly schedule: SchedulePostUseCase,
    private readonly cancel: CancelScheduledPostUseCase,
    private readonly fire: FireDuePostsUseCase,
    private readonly posts: ScheduledPostRepository,
  ) {}

  @Post()
  public async create(
    @Body() dto: SchedulePostDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const { post, created } = await this.schedule.execute(
      ScheduledPostsController.toRequest(dto),
    );
    res.status(created ? 201 : 200);
    return post.toSnapshot() as unknown as Record<string, unknown>;
  }

  @Get()
  public async list(
    @Query('sessionId') sessionId?: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = sessionId
      ? await this.posts.findBySession(sessionId)
      : await this.posts.findScheduled();
    return rows.map(
      (post) => post.toSnapshot() as unknown as Record<string, unknown>,
    );
  }

  @Get(':id')
  public async byId(@Param('id') id: string): Promise<Record<string, unknown>> {
    const post = await this.posts.findById(id);
    if (!post) {
      throw new DomainError(ErrorCode.NOT_FOUND, `unknown scheduled post ${id}`);
    }
    return post.toSnapshot() as unknown as Record<string, unknown>;
  }

  @Delete(':id')
  public async remove(
    @Param('id') id: string,
    @Query('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    const cancelled = await this.cancel.execute(id, sessionId);
    return cancelled.toSnapshot() as unknown as Record<string, unknown>;
  }

  @Post(':id/publish-now')
  public async publishNow(
    @Param('id') id: string,
    @Body('sessionId') sessionId: string,
  ): Promise<Record<string, unknown>> {
    const fired = await this.fire.publishNow(id, sessionId);
    return fired.toSnapshot() as unknown as Record<string, unknown>;
  }

  private static toRequest(dto: SchedulePostDto): ScheduleRequest {
    return {
      sessionId: dto.sessionId,
      binding: { ...dto.binding },
      content:
        dto.contentKind === 'pre-written'
          ? {
              kind: 'pre-written',
              text: dto.text ?? '',
              mediaIds: dto.mediaIds ?? [],
              buttons: dto.buttons
                ? dto.buttons.map((button) => ({ ...button }))
                : null,
            }
          : { kind: 'content-ref', queueEntryId: dto.queueEntryId ?? '' },
      scheduleKind:
        dto.scheduleKind === 'once'
          ? { kind: 'once', fireAt: dto.fireAt ?? '' }
          : { kind: 'cron', cronExpr: dto.cronExpr ?? '', timezone: 'UTC' },
      idempotencyKey: dto.idempotencyKey,
    };
  }
}
