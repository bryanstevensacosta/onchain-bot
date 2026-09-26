import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  validatePromptInput,
  type PromptContentType,
  type PromptTemplate,
} from '../domain/prompt-template';
import {
  DuplicateTemplateError,
  PromptTemplateRepository,
  TemplateNotFoundError,
  TemplateVersionNotFoundError,
} from '../domain/ports/prompt-template.repository';
import { LegacyFeedPromptSource } from './legacy-feed-prompt-source';

export type PromptSource = 'ai-ml' | 'legacy-fallback';

export interface ResolveResult {
  readonly template: PromptTemplate;
  readonly source: PromptSource;
}

/**
 * PromptCatalogService (ai-ml, todo 1): versioned CRUD + dual-read.
 *
 * Writes always land in the ai-ml catalog (new names start at v1,
 * new versions auto-activate, `activate` moves the pointer back for
 * rollbacks). Reads go ai-ml first; unknown names fall back to the
 * feed-publisher migration snapshot (`legacy-fallback`) so consumers
 * keep working during the migration window (feed-publisher todo 3
 * repoints it at this catalog, then the snapshot retires).
 * Throws Nest HTTP errors so the controller stays thin.
 */
@Injectable()
export class PromptCatalogService {
  public constructor(
    private readonly repo: PromptTemplateRepository,
    private readonly legacy: LegacyFeedPromptSource,
  ) {}

  public async createTemplate(input: {
    name: string;
    content: string;
    systemContent?: string;
    contentType?: string;
  }): Promise<PromptTemplate> {
    const valid = validatePromptInput(input);
    try {
      return await this.repo.create({
        name: valid.name,
        content: valid.content,
        systemContent: valid.systemContent,
        variables: [...valid.variables],
        contentType: valid.contentType,
      });
    } catch (err) {
      if (err instanceof DuplicateTemplateError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  public async createVersion(
    name: string,
    input: { content: string; systemContent?: string; contentType?: string },
  ): Promise<PromptTemplate> {
    const existing = await this.repo.listVersions(name);
    if (existing.length === 0) {
      throw new NotFoundException(new TemplateNotFoundError(name).message);
    }
    const current = existing[existing.length - 1];
    if (!current) {
      throw new NotFoundException(new TemplateNotFoundError(name).message);
    }
    const valid = validatePromptInput({
      name,
      content: input.content,
      systemContent: input.systemContent,
      contentType: input.contentType ?? current.contentType,
    });
    return this.repo.saveVersion(name, {
      content: valid.content,
      systemContent: valid.systemContent,
      variables: [...valid.variables],
      contentType: valid.contentType,
    });
  }

  public async get(name: string, version?: number): Promise<PromptTemplate> {
    if (version !== undefined) {
      const row = await this.repo.findByNameVersion(name, version);
      if (!row) {
        throw new NotFoundException(
          new TemplateVersionNotFoundError(name, version).message,
        );
      }
      return row;
    }
    const active = await this.repo.findActiveByName(name);
    if (!active) {
      throw new NotFoundException(new TemplateNotFoundError(name).message);
    }
    return active;
  }

  public async getActive(name: string): Promise<PromptTemplate> {
    return this.get(name);
  }

  public async listVersions(name: string): Promise<ReadonlyArray<PromptTemplate>> {
    const rows = await this.repo.listVersions(name);
    if (rows.length === 0) {
      throw new NotFoundException(new TemplateNotFoundError(name).message);
    }
    return rows;
  }

  public async listActive(contentType?: PromptContentType): Promise<ReadonlyArray<PromptTemplate>> {
    return this.repo.listActive(contentType);
  }

  /** Move the active pointer (rollback = activate an older version). */
  public async activateVersion(name: string, version: number): Promise<PromptTemplate> {
    try {
      return await this.repo.activate(name, version);
    } catch (err) {
      if (err instanceof TemplateVersionNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  public async delete(name: string, version?: number): Promise<void> {
    if (version !== undefined) {
      const ok = await this.repo.deleteVersion(name, version);
      if (!ok) {
        throw new NotFoundException(
          new TemplateVersionNotFoundError(name, version).message,
        );
      }
      return;
    }
    const ok = await this.repo.deleteName(name);
    if (!ok) {
      throw new NotFoundException(new TemplateNotFoundError(name).message);
    }
  }

  /**
   * Dual-read resolver for any consumer app: reference by name+version.
   * ai-ml exact/active row wins; unknown names fall back to the legacy
   * migration snapshot (source tagged, so callers can log/migrate).
   */
  public async resolve(
    name: string,
    options?: { version?: number; contentType?: PromptContentType },
  ): Promise<ResolveResult> {
    const version = options?.version;
    if (version !== undefined) {
      const row = await this.repo.findByNameVersion(name, version);
      if (row) {
        return { template: row, source: 'ai-ml' };
      }
      // Pinned versions never fall back: a pinned miss is a caller bug.
      throw new NotFoundException(
        new TemplateVersionNotFoundError(name, version).message,
      );
    }
    const active = await this.repo.findActiveByName(name);
    if (active) {
      return { template: active, source: 'ai-ml' };
    }
    const legacy = this.legacy.findByName(name);
    if (legacy) {
      return { template: legacy, source: 'legacy-fallback' };
    }
    throw new NotFoundException(new TemplateNotFoundError(name).message);
  }
}
