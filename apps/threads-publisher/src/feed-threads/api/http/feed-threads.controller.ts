import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FeedThread } from '@/feed-threads/domain/feed-thread.entity';

/**
 * Feed threads controller (v2 un-stubbed here: in-memory CRUD).
 * Feed-publisher v1 answered 501s; this app is the v2 owner.
 */
@Controller('api/threads')
export class FeedThreadsController {
  private readonly rows = new Map<string, FeedThread>();

  @Post()
  public create(
    @Body() body: { messages?: Array<{ content: string; delayMs?: number }> },
  ): FeedThread {
    const thread = FeedThread.create(
      (body.messages ?? []).map((m) => ({
        content: m.content,
        delayMs: m.delayMs ?? 0,
      })),
    );
    this.rows.set(thread.id, thread);
    return thread;
  }

  @Get()
  public list(): FeedThread[] {
    return [...this.rows.values()];
  }

  @Get(':id')
  public get(@Param('id') id: string): FeedThread {
    const row = this.rows.get(id);
    if (!row) {
      throw Object.assign(new Error('thread not found'), { status: 404 });
    }
    return row;
  }

  @Post(':id/enqueue')
  public enqueue(@Param('id') id: string): FeedThread {
    const row = this.get(id);
    row.enqueue();
    return row;
  }
}
