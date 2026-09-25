import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiKeyService, type CreateKeyInput } from 'auth/application/api-key.service';
import { AccessAuditService } from 'auth/application/access-audit.service';
import { RequireScope } from 'auth/application/require-scope.decorator';
import type { ApiKeyView } from 'auth/domain/api-key-record';
import { isValidScope } from 'auth/domain/api-key-scope';

interface CreateBody {
  name?: unknown;
  scopes?: unknown;
  rateLimitPerMin?: unknown;
  expiresAt?: unknown;
}

/**
 * Key-management edge (Tramo 3, todo 10, P46).
 *
 * Admin-only (`admin` scope or the legacy env key). Rotation is
 * runtime-only — no redeploy, no reboot: the new key is live
 * immediately and the old key stays valid for the grace window
 * (dual-key). Plaintext appears EXACTLY ONCE (create/rotate
 * responses); list/audit/errors never carry key material.
 */
@RequireScope('admin')
@Controller('api/v1/auth')
export class ApiKeyController {
  public constructor(
    private readonly keys: ApiKeyService,
    private readonly audit: AccessAuditService,
  ) {}

  @Post('keys')
  public async create(@Body() body: CreateBody): Promise<{ key: string; keyPrefix: string; id: string; name: string }> {
    const input = this.parseCreate(body);
    const created = await this.keys.create(input);
    return { key: created.plaintext, keyPrefix: created.record.keyPrefix, id: created.record.id, name: created.record.name };
  }

  @Get('keys')
  public list(): { keys: ApiKeyView[] } {
    return { keys: this.keys.list() };
  }

  @Post('keys/:id/rotate')
  @HttpCode(201)
  public async rotate(@Param('id') id: string): Promise<{ key: string; keyPrefix: string; id: string; name: string }> {
    const created = await this.keys.rotate(id);
    return { key: created.plaintext, keyPrefix: created.record.keyPrefix, id: created.record.id, name: created.record.name };
  }

  @Delete('keys/:id')
  @HttpCode(204)
  public async revoke(@Param('id') id: string): Promise<void> {
    this.keys.revoke(id);
  }

  @Get('audit')
  public getAudit(): { entries: unknown[] } {
    return { entries: this.audit.list() };
  }

  private parseCreate(body: CreateBody): CreateKeyInput {
    const name = typeof body.name === 'string' ? body.name : '';
    const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];
    const scopes = rawScopes.filter(isValidScope);
    const rateLimitPerMin =
      typeof body.rateLimitPerMin === 'number' ? body.rateLimitPerMin : 60;
    const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;
    return { name, scopes, rateLimitPerMin, expiresAt };
  }
}
