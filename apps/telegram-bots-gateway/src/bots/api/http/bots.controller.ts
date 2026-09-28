import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import { BotResolverService } from '@/bots/application/bot-resolver.service';
import { BotBindingService } from '@/vault/application/bot-binding.service';
import { RequireScope } from '@/auth/api/http/require-scope.decorator';
import { BindBotDto } from './dto/bind.dto';

@Controller('api/bots')
@RequireScope('send')
export class BotsController {
  public constructor(
    private readonly resolver: BotResolverService,
    private readonly binding: BotBindingService,
  ) {}

  @Get('inventory')
  public inventory() {
    return this.binding.inventory();
  }

  @Post(':id/bind')
  @RequireScope('admin')
  public bind(@Param('id') id: string, @Body() dto: BindBotDto) {
    return this.binding.bind(id, dto.appId);
  }

  @Post(':id/unbind')
  @RequireScope('admin')
  public unbind(@Param('id') id: string) {
    return this.binding.unbind(id);
  }

  @Get(':id/profile')
  public getProfile(@Param('id') id: string) {
    return this.resolver.resolveProfile(id);
  }

  @Get(':id/avatar')
  public getAvatar(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const file = this.resolver.avatarPathFor(id);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: 'avatar not cached yet' });
      return undefined as unknown as StreamableFile;
    }
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    });
    return new StreamableFile(fs.createReadStream(file));
  }
}
