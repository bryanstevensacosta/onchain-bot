import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EvaluateMessageMatchUseCase } from '@/matching/application/use-cases/evaluate-message-match.use-case';
import {
  MessageMatchStatusUseCase,
  buildMatchReasons,
} from '@/matching/application/use-cases/message-match-status.use-case';
import { KeywordRepository } from '@/keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '@/keywords/application/ports/blacklist-phrase.repository';
import { ChannelFilterRepository } from '@/filters/application/ports/channel-filter.repository';
import { EvaluateMessageDto } from '../input/message-match.input';
import type {
  DryRunView,
  MessageStatusView,
} from './message-match.views';

/**
 * Per-message match UX (`/feed-publisher/matching`, todos 17/18).
 *
 * POST /evaluate (dry-run a real message against live rules: keyword
 * match plus blacklist plus applied filters, nothing persisted, nothing
 * enqueued) · GET /messages/:channelId/:messageId/status (joined match
 * verdict plus queue row with the feed-UX badge).
 */
@ApiTags('feed-publisher-matching')
@Controller('feed-publisher/matching')
export class MessageMatchController {
  public constructor(
    private readonly dryRun: EvaluateMessageMatchUseCase,
    private readonly status: MessageMatchStatusUseCase,
    private readonly keywords: KeywordRepository,
    private readonly blacklist: BlacklistPhraseRepository,
    private readonly channelFilters: ChannelFilterRepository,
  ) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dry-run a message against live match rules (no side effects)',
  })
  @ApiResponse({ status: 200, description: 'Match verdict with reasons' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async evaluate(@Body() dto: EvaluateMessageDto): Promise<DryRunView> {
    const result = await this.dryRun.execute({
      channelId: dto.channelId,
      messageId: dto.messageId,
      title: dto.title ?? null,
      content: dto.content,
      hasMedia: dto.hasMedia ?? false,
    });
    const [keywords, blacklist, filters] = await Promise.all([
      this.keywords.findAll(),
      this.blacklist.findAll(),
      this.channelFilters.findFiltersByChannelId(dto.channelId),
    ]);
    const matchedKeywords = result.matchedKeywordIds.map((id) => ({
      id,
      phrase: keywords.find((k) => k.id === id)?.phrase ?? '<removed>',
    }));
    const blockedBy = result.blockedByIds.map((id) => ({
      id,
      phrase: blacklist.find((p) => p.id === id)?.phrase ?? '<removed>',
    }));
    return {
      matched: result.matched,
      blocked: result.blocked,
      filteredTitle: result.filteredTitle,
      filteredContent: result.filteredContent,
      matchedKeywords,
      blockedBy,
      hasMedia: result.hasMedia,
      reasons: buildMatchReasons({
        matched: result.matched,
        blocked: result.blocked,
        matchedKeywords,
        blockedBy,
      }),
      filtersApplied: filters.length,
    };
  }

  @Get('messages/:channelId/:messageId/status')
  @ApiOperation({
    summary: 'Joined match verdict plus queue row for one message',
  })
  @ApiResponse({ status: 200, description: 'Message lifecycle status' })
  @ApiResponse({ status: 400, description: 'Invalid channel or message id' })
  public async getStatus(
    @Param('channelId') channelId: string,
    @Param('messageId') messageIdParam: string,
  ): Promise<MessageStatusView> {
    if (typeof channelId !== 'string' || channelId.length === 0) {
      throw new BadRequestException('channelId must be a non-empty string');
    }
    const messageId = Number(messageIdParam);
    if (!Number.isInteger(messageId) || messageId < 0) {
      throw new BadRequestException(
        `messageId must be an integer >= 0, got: ${messageIdParam}`,
      );
    }
    return this.status.getStatus(channelId, messageId);
  }
}
