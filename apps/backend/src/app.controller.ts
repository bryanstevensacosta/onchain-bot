import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppService } from './app.service';
import { seedPipelineEvents } from '../scripts/seed-pipeline-events';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('dev/seed')
  async seedEvents(
    @Query('count') count?: string,
    @Query('delay') delay?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Res() res?: any,
  ) {
    const app = await this.appService.getNestApp();
    const eventCount = count ? parseInt(count, 10) : 12;
    const delayMs = delay ? parseInt(delay, 10) : 800;

    await seedPipelineEvents(app, { count: eventCount, delayMs });
    res?.status(200).json({ success: true, events: eventCount * 4 });
  }
}
