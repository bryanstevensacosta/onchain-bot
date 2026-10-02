import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import {
  MessageTemplateValidationError,
  validateCommand,
} from '@/templates/domain/message-template.validators';
import type { MessageTemplateCommand } from '@/templates/domain/message-template.validators';
import type { MessageTemplateRepository } from '@/templates/domain/ports/message-template.repository';
import { MESSAGE_TEMPLATE_REPOSITORY } from '@/templates/domain/ports/message-template.repository';
import { MessageTemplateDuplicateError } from '@/templates/infrastructure/persistence/message-template.errors';
import { MessageTemplateOrmEntity } from '@/templates/infrastructure/persistence/typeorm/message-template.orm-entity';
import {
  toMessageTemplateDomain,
  toMessageTemplateRow,
} from '@/templates/infrastructure/persistence/typeorm/mappers/message-template.mapper';
import {
  isKnownPlaceholder,
  placeholdersFor,
  TEMPLATE_COMMANDS,
} from '@/placeholders/domain/placeholder-registry';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
} from './dto/message-template.dto';

export interface MessageTemplateView {
  readonly id: string;
  readonly command: string;
  readonly name: string;
  readonly bodyMarkdown: string;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const toView = (template: MessageTemplate): MessageTemplateView => ({
  id: template.id,
  command: template.command,
  name: template.name,
  bodyMarkdown: template.bodyMarkdown,
  isActive: template.isActive,
  version: template.version,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

const assertPlaceholdersValid = (
  command: TemplateCommand,
  body: string,
): void => {
  if (body.includes('{%') || body.includes('{{#')) {
    throw new BadRequestException({
      error: `Unsupported template syntax in body (no conditionals, loops or filters — use N templates instead)`,
      valid: placeholdersFor(command),
    });
  }
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(body)) !== null) {
    keys.add(match[1]);
  }
  for (const key of keys) {
    if (!isKnownPlaceholder(command, key)) {
      throw new BadRequestException({
        error: `Unknown placeholder {{${key}}} (valid: [${placeholdersFor(command).join(', ')}])`,
        valid: placeholdersFor(command),
      });
    }
  }
};

/**
 * Message-template catalog (`GET /api/dexter/templates`).
 *
 * // v1 sin auth como /dexter/token — read/write gestion-solo-HTTP-API
 * sin guard (mismo regimen que el lookup `/dexter/*` existente; auth
 * llega en una fase posterior, fuera del plan v1).
 *
 * Invariants (plan todo 6):
 * - `command` is IMMUTABLE after creation (PATCH attempt → 400).
 * - `activate()` on the entity does NOT version++ by itself — this
 *   endpoint composes `activate() + bumpVersion()` explicitly.
 * - Exactly ≤1 active template per command: enforced at the API level
 *   (transactional activate: deactivate others + activate this one +
 *   version++) on top of the partial unique index
 *   (`UNIQUE(command) WHERE is_active`). When `DATABASE_ENABLED=true`
 *   the switch runs inside a `DataSource` transaction and tolerates a
 *   `23505` race with one retry; the in-memory path is single-threaded.
 * - `DELETE` → 409 when the row `isActive` OR when it is the LAST
 *   template of its command (mirrors the feed-publisher 409
 *   template-in-use rule: no orphan commands without a replacement).
 * - Domain errors map to HTTP explicitly (never a raw 500):
 *   unknown placeholder → 400 + `valid` list; duplicate
 *   `(command, name)` → 409; unknown id → 404.
 */
@Controller('api/dexter/templates')
export class MessageTemplatesController {
  public constructor(
    @Inject(MESSAGE_TEMPLATE_REPOSITORY)
    private readonly templates: MessageTemplateRepository,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  @Get()
  public async list(
    @Query('command') command?: string,
  ): Promise<readonly MessageTemplateView[]> {
    if (command !== undefined) {
      let parsed: MessageTemplateCommand;
      try {
        parsed = validateCommand(command);
      } catch (error) {
        throw MessageTemplatesController.toBadRequest(error, command);
      }
      return (await this.templates.findByCommand(parsed)).map(toView);
    }
    return (await this.templates.findAll()).map(toView);
  }

  @Get(':id')
  public async get(@Param('id') id: string): Promise<MessageTemplateView> {
    const existing = await this.templates.findById(id);
    if (!existing) {
      throw new NotFoundException(`MessageTemplate ${id} not found`);
    }
    return toView(existing);
  }

  @Post()
  public async create(
    @Body() dto: CreateMessageTemplateDto,
  ): Promise<MessageTemplateView> {
    let command: MessageTemplateCommand;
    try {
      command = validateCommand(dto.command);
    } catch (error) {
      throw MessageTemplatesController.toBadRequest(error, dto.command);
    }
    assertPlaceholdersValid(command, dto.bodyMarkdown);
    const created = MessageTemplate.create({
      command,
      name: dto.name,
      bodyMarkdown: dto.bodyMarkdown,
    });
    try {
      const preExisting = await this.templates.findByCommand(command);
      if (preExisting.some((t) => t.name === created.name)) {
        throw new MessageTemplateDuplicateError(
          `MessageTemplate (${command}, ${created.name}) already exists`,
          { command, name: created.name },
        );
      }
      const saved = await this.templates.save(created);
      return toView(saved);
    } catch (error) {
      if (error instanceof MessageTemplateValidationError) {
        throw MessageTemplatesController.toBadRequest(error, dto.command);
      }
      throw MessageTemplatesController.toConflict(error);
    }
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateMessageTemplateDto,
  ): Promise<MessageTemplateView> {
    if (dto.command !== undefined) {
      throw new BadRequestException({
        error:
          'MessageTemplate command is immutable (delete + recreate to move commands)',
      });
    }
    const existing = await this.templates.findById(id);
    if (!existing) {
      throw new NotFoundException(`MessageTemplate ${id} not found`);
    }
    try {
      if (dto.name !== undefined) {
        existing.rename(dto.name);
      }
      const nextBody = dto.bodyMarkdown ?? existing.bodyMarkdown;
      assertPlaceholdersValid(existing.command, nextBody);
      if (dto.bodyMarkdown !== undefined) {
        existing.updateBody(dto.bodyMarkdown);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw MessageTemplatesController.toBadRequest(error, existing.command);
    }
    try {
      if (dto.name !== undefined) {
        const siblings = await this.templates.findByCommand(existing.command);
        if (siblings.some((t) => t.id !== id && t.name === existing.name)) {
          throw new MessageTemplateDuplicateError(
            `MessageTemplate (${existing.command}, ${existing.name}) already exists`,
            { command: existing.command, name: existing.name },
          );
        }
      }
      const saved = await this.templates.save(existing);
      return toView(saved);
    } catch (error) {
      if (error instanceof MessageTemplateValidationError) {
        throw MessageTemplatesController.toBadRequest(error, existing.command);
      }
      throw MessageTemplatesController.toConflict(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.templates.findById(id);
    if (!existing) {
      throw new NotFoundException(`MessageTemplate ${id} not found`);
    }
    if (existing.isActive) {
      throw new ConflictException({
        error: `MessageTemplate ${id} is active (activate another template of command ${existing.command} first)`,
      });
    }
    const siblings = await this.templates.findByCommand(existing.command);
    if (siblings.length <= 1) {
      throw new ConflictException({
        error: `MessageTemplate ${id} is the last template of command ${existing.command} (create a replacement first)`,
      });
    }
    await this.templates.delete(id);
  }

  @Post(':id/activate')
  public async activate(@Param('id') id: string): Promise<MessageTemplateView> {
    const existing = await this.templates.findById(id);
    if (!existing) {
      throw new NotFoundException(`MessageTemplate ${id} not found`);
    }
    try {
      if (this.dataSource) {
        return toView(await this.activateTransactional(existing));
      }
      return toView(await this.activateWithRetry(existing));
    } catch (error) {
      throw MessageTemplatesController.toConflict(error);
    }
  }

  /**
   * In-memory / non-transactional path (single-threaded): deactivate
   * the current active sibling(s), then `activate() + bumpVersion()`
   * on the target. A `MessageTemplateDuplicateError` (concurrent
   * activate race against the partial index or the in-memory guard)
   * is tolerated with exactly ONE retry after re-reading the winner.
   */
  private async activateWithRetry(
    target: MessageTemplate,
  ): Promise<MessageTemplate> {
    try {
      return await this.doActivate(target);
    } catch (error) {
      if (!(error instanceof MessageTemplateDuplicateError)) {
        throw error;
      }
      const fresh = await this.templates.findById(target.id);
      if (!fresh) {
        throw new NotFoundException(`MessageTemplate ${target.id} not found`);
      }
      return this.doActivate(fresh);
    }
  }

  private async doActivate(target: MessageTemplate): Promise<MessageTemplate> {
    const siblings = await this.templates.findByCommand(target.command);
    for (const sibling of siblings) {
      if (sibling.id !== target.id && sibling.isActive) {
        sibling.deactivate();
        await this.templates.save(sibling);
      }
    }
    // activate() toggles the flag only (no version bump by design) —
    // the endpoint composes the version++ explicitly (MUST DO).
    target.activate();
    target.bumpVersion();
    return this.templates.save(target);
  }

  /**
   * Database path: the same switch inside a `DataSource` transaction
   * (atomic deactivate-others + activate + version++). A `23505`
   * race on the partial index (mapped to
   * `MessageTemplateDuplicateError`) is retried ONCE in a fresh
   * transaction after re-reading the winner.
   */
  private async activateTransactional(
    target: MessageTemplate,
  ): Promise<MessageTemplate> {
    const dataSource = this.dataSource as DataSource;
    try {
      return await dataSource.transaction(async (manager) => {
        const rows = manager.getRepository(MessageTemplateOrmEntity);
        const siblings = await rows.find({
          where: { command: target.command },
        });
        for (const row of siblings) {
          if (row.id !== target.id && row.isActive) {
            row.isActive = false;
            row.updatedAt = new Date();
            await rows.save(row);
          }
        }
        const row = await rows.findOne({ where: { id: target.id } });
        if (!row) {
          throw new NotFoundException(`MessageTemplate ${target.id} not found`);
        }
        const domain = toMessageTemplateDomain(row);
        domain.activate();
        domain.bumpVersion();
        const saved = await rows.save(toMessageTemplateRow(domain));
        return toMessageTemplateDomain(saved);
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (!isDuplicateError(error)) {
        throw error;
      }
      return dataSource.transaction(async (manager) => {
        const rows = manager.getRepository(MessageTemplateOrmEntity);
        const siblings = await rows.find({
          where: { command: target.command },
        });
        for (const row of siblings) {
          if (row.id !== target.id && row.isActive) {
            row.isActive = false;
            row.updatedAt = new Date();
            await rows.save(row);
          }
        }
        const row = await rows.findOne({ where: { id: target.id } });
        if (!row) {
          throw new NotFoundException(`MessageTemplate ${target.id} not found`);
        }
        const domain = toMessageTemplateDomain(row);
        domain.activate();
        domain.bumpVersion();
        const saved = await rows.save(toMessageTemplateRow(domain));
        return toMessageTemplateDomain(saved);
      });
    }
  }

  private static toBadRequest(error: unknown, _command: unknown): Error {
    if (error instanceof MessageTemplateValidationError) {
      if (/command/.test(error.message)) {
        return new BadRequestException({
          error: error.message,
          valid: [...TEMPLATE_COMMANDS],
        });
      }
      return new BadRequestException({ error: error.message });
    }
    throw error;
  }

  private static toConflict(error: unknown): Error {
    if (error instanceof MessageTemplateDuplicateError) {
      return new ConflictException({ error: error.message });
    }
    if (error instanceof MessageTemplateValidationError) {
      return MessageTemplatesController.toBadRequest(
        error,
        (error.details as { command?: unknown } | undefined)?.command,
      );
    }
    throw error;
  }
}

const isDuplicateError = (error: unknown): boolean => {
  if (error instanceof MessageTemplateDuplicateError) {
    return true;
  }
  const code =
    (error as { code?: unknown } | null)?.code ??
    (error as { driverError?: { code?: unknown } } | null)?.driverError?.code;
  return code === '23505';
};
