import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseFilters,
} from '@nestjs/common';
import { DomainExceptionFilter } from '../../../shared/filters/domain-exception.filter';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import { CreateTelegramBotUseCase } from '../../application/use-cases/create-telegram-bot.use-case';
import {
  GetTelegramBotUseCase,
  ListTelegramBotsUseCase,
} from '../../application/use-cases/list-telegram-bots.use-case';
import {
  DeleteTelegramBotUseCase,
  UpdateTelegramBotUseCase,
} from '../../application/use-cases/update-telegram-bot.use-case';
import { CreateBotDto, UpdateBotDto } from './dto/template.dto';

/**
 * Bot catalog controller (P23): every read is redacted (`token: '***'`).
 * Plaintext tokens travel ONLY in POST/PATCH request bodies (TLS in prod)
 * and are encrypted before persisting — never logged, never returned.
 */
@Controller('api/telegram-bots')
@UseFilters(DomainExceptionFilter)
export class TelegramBotsController {
  public constructor(
    private readonly bots: TelegramBotRepository,
    private readonly create: CreateTelegramBotUseCase,
    private readonly list: ListTelegramBotsUseCase,
    private readonly getOne: GetTelegramBotUseCase,
    private readonly update: UpdateTelegramBotUseCase,
    private readonly removeBot: DeleteTelegramBotUseCase,
  ) {}

  @Get()
  public async listAll(): Promise<Record<string, unknown>[]> {
    const { bots } = await this.list.execute();
    return bots.map((bot) => ({ ...bot }));
  }

  @Post()
  public async createOne(
    @Body() dto: CreateBotDto,
  ): Promise<Record<string, unknown>> {
    const { bot } = await this.create.execute(dto);
    return { ...bot };
  }

  @Get(':id')
  public async getById(
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { bot } = await this.getOne.execute({ id });
    return { ...bot };
  }

  @Patch(':id')
  public async updateOne(
    @Param('id') id: string,
    @Body() dto: UpdateBotDto,
  ): Promise<Record<string, unknown>> {
    const { bot } = await this.update.execute({ id, ...dto });
    return { ...bot };
  }

  @Delete(':id')
  public async removeOne(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: boolean }> {
    return this.removeBot.execute({ id });
  }

  /** Backstop: repository reads must also redact if reached directly. */
  public static assertRedacted(body: Record<string, unknown>): void {
    if (body.token !== '***') {
      throw new DomainError(ErrorCode.INTERNAL, 'bot token leaked unredacted');
    }
  }
}
