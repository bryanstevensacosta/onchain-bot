import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { VaultService } from '../../application/vault.service';
import { RequireScope } from '../../../auth/api/http/require-scope.decorator';
import { RegisterBotDto, RotateBotDto } from './dto/vault.dto';

/** Internal vault CRUD. All reads redacted (`token: '***'`). No MTProto here. */
@Controller('api/vault/bots')
@RequireScope('admin')
export class VaultController {
  public constructor(private readonly vault: VaultService) {}

  @Post()
  public create(@Body() dto: RegisterBotDto) {
    return this.vault.register(dto);
  }

  @Get()
  public list() {
    return this.vault.list();
  }

  @Get(':id')
  public get(@Param('id') id: string) {
    return this.vault.get(id);
  }

  @Patch(':id/rotate')
  public rotate(@Param('id') id: string, @Body() dto: RotateBotDto) {
    return this.vault.rotate(id, dto.token);
  }

  @Delete(':id')
  @HttpCode(204)
  public async remove(@Param('id') id: string): Promise<void> {
    await this.vault.remove(id);
  }
}
