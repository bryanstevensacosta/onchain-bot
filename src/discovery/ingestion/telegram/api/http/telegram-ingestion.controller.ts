import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AddChannelUseCase } from 'discovery/ingestion/telegram/application/handlers/add-channel.use-case';
import { GetChannelUseCase } from 'discovery/ingestion/telegram/application/handlers/get-channel.use-case';
import { ListChannelsUseCase } from 'discovery/ingestion/telegram/application/handlers/list-channels.use-case';
import { StartListeningUseCase } from 'discovery/ingestion/telegram/application/handlers/start-listening.use-case';
import type { AddChannelInput } from 'discovery/ingestion/telegram/api/input/add-channel.input';
import type { StartListeningInput } from 'discovery/ingestion/telegram/api/input/start-listening.input';
import type { ChannelView } from 'discovery/ingestion/telegram/application/mappers/channel.mapper';

/**
 * HTTP adapter for Telegram channel ingestion management.
 * Inbound port (REST API) — exposes use cases over HTTP.
 * Routes are intentionally admin-only (out of scope for end users).
 */
@Controller('discovery/ingestion/telegram')
export class TelegramIngestionController {
  constructor(
    private readonly addChannel: AddChannelUseCase,
    private readonly getChannel: GetChannelUseCase,
    private readonly listChannels: ListChannelsUseCase,
    private readonly startListening: StartListeningUseCase,
  ) {}

  @Get('channels')
  public list(): Promise<ReadonlyArray<ChannelView>> {
    return this.listChannels.execute();
  }

  @Post('channels')
  public add(@Body() input: AddChannelInput): Promise<ChannelView> {
    return this.addChannel.execute(input);
  }

  @Get('channels/:channelId')
  public get(@Param('channelId') channelId: string): Promise<ChannelView> {
    return this.getChannel.execute(channelId);
  }

  @Post('channels/start-listening')
  public start(
    @Body() input: StartListeningInput,
  ): Promise<ReadonlyArray<ChannelView>> {
    return this.startListening.execute(input);
  }
}
