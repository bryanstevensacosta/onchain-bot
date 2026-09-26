import type { PromptContentType, PromptTemplate } from '../prompt-template';

/**
 * PromptTemplateRepository port (ai-ml, todo 1): versioned store.
 *
 * Implementations keep every version immutable; exactly one version
 * per name is active (the rollback pointer). The live binding is the
 * in-memory adapter; the TypeORM shape ships unwired (same GAP-1
 * pattern as the feed-publisher migration source).
 */
export interface CreatePromptRecord {
  readonly name: string;
  readonly content: string;
  readonly systemContent: string;
  readonly variables: ReadonlyArray<string>;
  readonly contentType: PromptContentType;
}

export abstract class PromptTemplateRepository {
  public abstract create(input: CreatePromptRecord): Promise<PromptTemplate>;
  public abstract saveVersion(
    name: string,
    input: Omit<CreatePromptRecord, 'name'>,
  ): Promise<PromptTemplate>;
  public abstract findByNameVersion(
    name: string,
    version: number,
  ): Promise<PromptTemplate | null>;
  public abstract findActiveByName(name: string): Promise<PromptTemplate | null>;
  public abstract listVersions(name: string): Promise<ReadonlyArray<PromptTemplate>>;
  public abstract listActive(
    contentType?: PromptContentType,
  ): Promise<ReadonlyArray<PromptTemplate>>;
  public abstract activate(name: string, version: number): Promise<PromptTemplate>;
  public abstract deleteVersion(name: string, version: number): Promise<boolean>;
  public abstract deleteName(name: string): Promise<boolean>;
}

export class TemplateNotFoundError extends Error {
  public constructor(name: string) {
    super(`PromptTemplate not found: ${name}`);
    this.name = 'TemplateNotFoundError';
  }
}

export class TemplateVersionNotFoundError extends Error {
  public constructor(name: string, version: number) {
    super(`PromptTemplate ${name} version ${version} not found`);
    this.name = 'TemplateVersionNotFoundError';
  }
}

export class DuplicateTemplateError extends Error {
  public constructor(name: string) {
    super(`PromptTemplate already exists: ${name}`);
    this.name = 'DuplicateTemplateError';
  }
}
