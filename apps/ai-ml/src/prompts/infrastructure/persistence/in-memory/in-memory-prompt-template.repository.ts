import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PromptContentType, PromptTemplate } from '@/prompts/domain/prompt-template';
import {
  DuplicateTemplateError,
  PromptTemplateRepository,
  TemplateVersionNotFoundError,
  type CreatePromptRecord,
} from '@/prompts/domain/ports/prompt-template.repository';

/**
 * In-memory versioned catalog (ai-ml, todo 1 — live binding).
 *
 * Versions are append-only rows keyed by (name, version); `activate`
 * moves the single active pointer (rollback = activate an older
 * version). Seeds `default-feed` v1 mirroring the feed-publisher
 * migration source so dual-read has a local baseline before any
 * operator import (seed is marked `seeded: true` via the v1 content
 * staying byte-identical to the legacy snapshot).
 */
@Injectable()
export class InMemoryPromptTemplateRepository extends PromptTemplateRepository {
  private readonly versions = new Map<string, Map<number, PromptTemplate>>();

  public constructor() {
    super();
  }

  private rows(name: string): Map<number, PromptTemplate> {
    let rows = this.versions.get(name);
    if (!rows) {
      rows = new Map();
      this.versions.set(name, rows);
    }
    return rows;
  }

  private stamp(row: PromptTemplate, patch: Partial<PromptTemplate>): PromptTemplate {
    return { ...row, ...patch, updatedAt: new Date().toISOString() };
  }

  public async create(input: CreatePromptRecord): Promise<PromptTemplate> {
    const existing = this.versions.get(input.name);
    if (existing && existing.size > 0) {
      throw new DuplicateTemplateError(input.name);
    }
    const now = new Date().toISOString();
    const row: PromptTemplate = {
      id: randomUUID(),
      name: input.name,
      version: 1,
      content: input.content,
      systemContent: input.systemContent,
      variables: [...input.variables],
      contentType: input.contentType,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows(input.name).set(1, row);
    return { ...row };
  }

  public async saveVersion(
    name: string,
    input: Omit<CreatePromptRecord, 'name'>,
  ): Promise<PromptTemplate> {
    const rows = this.rows(name);
    if (rows.size === 0) {
      // First write via the version path still starts at v1 (active).
      const now = new Date().toISOString();
      const row: PromptTemplate = {
        id: randomUUID(),
        name,
        version: 1,
        content: input.content,
        systemContent: input.systemContent,
        variables: [...input.variables],
        contentType: input.contentType,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(1, row);
      return { ...row };
    }
    const next = Math.max(...rows.keys()) + 1;
    const now = new Date().toISOString();
    const row: PromptTemplate = {
      id: randomUUID(),
      name,
      version: next,
      content: input.content,
      systemContent: input.systemContent,
      variables: [...input.variables],
      contentType: input.contentType,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    for (const [version, current] of rows) {
      rows.set(version, this.stamp(current, { isActive: false }));
    }
    rows.set(next, row);
    return { ...row };
  }

  public async findByNameVersion(
    name: string,
    version: number,
  ): Promise<PromptTemplate | null> {
    const row = this.versions.get(name)?.get(version) ?? null;
    return row ? { ...row } : null;
  }

  public async findActiveByName(name: string): Promise<PromptTemplate | null> {
    const rows = this.versions.get(name);
    if (!rows) {
      return null;
    }
    for (const row of rows.values()) {
      if (row.isActive) {
        return { ...row };
      }
    }
    return null;
  }

  public async listVersions(name: string): Promise<ReadonlyArray<PromptTemplate>> {
    const rows = this.versions.get(name);
    if (!rows) {
      return [];
    }
    return [...rows.values()]
      .sort((a, b) => a.version - b.version)
      .map((row) => ({ ...row }));
  }

  public async listActive(
    contentType?: PromptContentType,
  ): Promise<ReadonlyArray<PromptTemplate>> {
    const out: Array<PromptTemplate> = [];
    for (const rows of this.versions.values()) {
      for (const row of rows.values()) {
        if (row.isActive && (!contentType || row.contentType === contentType || row.contentType === 'global')) {
          out.push({ ...row });
        }
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async activate(name: string, version: number): Promise<PromptTemplate> {
    const rows = this.versions.get(name);
    const target = rows?.get(version) ?? null;
    if (!rows || !target) {
      throw new TemplateVersionNotFoundError(name, version);
    }
    for (const [otherVersion, current] of rows) {
      rows.set(otherVersion, this.stamp(current, { isActive: otherVersion === version }));
    }
    const activated = rows.get(version);
    if (!activated) {
      throw new TemplateVersionNotFoundError(name, version);
    }
    return { ...activated };
  }

  public async deleteVersion(name: string, version: number): Promise<boolean> {
    const rows = this.versions.get(name);
    if (!rows || !rows.has(version)) {
      return false;
    }
    const wasActive = rows.get(version)?.isActive === true;
    rows.delete(version);
    if (rows.size === 0) {
      this.versions.delete(name);
      return true;
    }
    if (wasActive) {
      // Keep the pointer valid: newest surviving version becomes active.
      const newest = Math.max(...rows.keys());
      const row = rows.get(newest);
      if (row) {
        rows.set(newest, this.stamp(row, { isActive: true }));
      }
    }
    return true;
  }

  public async deleteName(name: string): Promise<boolean> {
    return this.versions.delete(name);
  }
}
