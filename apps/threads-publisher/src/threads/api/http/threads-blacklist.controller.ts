import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

@Controller(['threads-publisher/blacklist', 'feed-threads-publisher/blacklist'])
export class ThreadsBlacklistController {
  private readonly rows = new Map<string, { id: string; phrase: string }>();

  @Get()
  public list(): unknown[] {
    return [...this.rows.values()];
  }

  @Post()
  public create(@Body() body: { id?: string; phrase: string }): unknown {
    const id = body.id ?? `bl-${Date.now()}`;
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
