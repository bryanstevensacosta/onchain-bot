import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiKeyService, type CreateKeyInput } from '../../application/api-key.service';
import { RequireScope } from '../../application/require-scope.decorator';

interface CreateKeyDto {
  name?: string;
  scopes?: string[];
  rateLimitPerMin?: number;
  expiresAt?: string | null;
}

/**
 * Admin key management (ai-ml, todo 0): create/list/revoke scoped
 * API keys. Create returns the plaintext EXACTLY ONCE — it is never
 * stored and never returned again. All routes require admin scope.
 */
@Controller('api/auth/keys')
export class ApiKeysController {
  public constructor(private readonly keys: ApiKeyService) {}

  @Post()
  @RequireScope('admin')
  public async create(@Body() dto: CreateKeyDto): Promise<{
    plaintext: string;
    key: { id: string; keyPrefix: string; name: string; scopes: string[] };
  }> {
    const input: CreateKeyInput = {
      name: dto.name ?? '',
      scopes: (dto.scopes ?? []) as never,
      rateLimitPerMin: dto.rateLimitPerMin,
      expiresAt: dto.expiresAt ?? null,
    };
    const created = await this.keys.create(input);
    return {
      plaintext: created.plaintext,
      key: {
        id: created.record.id,
        keyPrefix: created.record.keyPrefix,
        name: created.record.name,
        scopes: [...created.record.scopes],
      },
    };
  }

  @Get()
  @RequireScope('admin')
  public async list(): Promise<{ keys: ReadonlyArray<unknown> }> {
    return { keys: await this.keys.list() };
  }

  @Delete(':id')
  @RequireScope('admin')
  public async revoke(@Param('id') id: string): Promise<{ revoked: boolean }> {
    return { revoked: await this.keys.revoke(id) };
  }
}
