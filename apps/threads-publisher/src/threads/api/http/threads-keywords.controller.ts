import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

/**
 * Threads keywords CRUD (in-memory LIVE; TypeORM shape deferred GAP-1).
 */
@Controller(['threads-publisher/keywords', 'feed-threads-publisher/keywords'])
export class ThreadsKeywordsController {
  private readonly rows = new Map<string, { id: string; phrase: string }>();

  @Get()
  public list(): unknown[] {
    return [...this.rows.values()];
  }

  @Post()
  public create(@Body() body: { id?: string; phrase: string }): unknown {
    const id = body.id ?? `kw-${Date.now()}`;
    const row = { id, phrase: body.phrase };
    this.rows.set(id, row);
    return row;
  }

  @Delete(':id')
  public remove(@Param('id') id: string): { deleted: boolean } {
    this.rows.delete(id);
    return { deleted: true };
  }
}
