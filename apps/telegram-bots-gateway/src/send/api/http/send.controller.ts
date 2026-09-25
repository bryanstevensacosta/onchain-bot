import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequireScope } from '../../../auth/api/http/require-scope.decorator';
import type { GatewayClientBinding } from '../../../auth/api/http/service-auth.guard';
import { SendDto } from './dto/send.dto';
import { SendService } from '../../application/send.service';

/**
 * Send gateway (todo 2): `POST /api/bots/:id/send`
 * (message/photo/media-group) behind the `send` scope. Quota pacing is
 * global per bot (30/s) + per chat (~1/s); 429s back off centrally with
 * `retry_after` and bounded retries; repeats of
 * (bot, chat, client_msg_id) replay the stored result.
 */
@Controller('api/bots')
export class SendController {
  public constructor(private readonly send: SendService) {}

  @Post(':id/send')
  @RequireScope('send')
  @HttpCode(200)
  public sendMessage(
    @Param('id') id: string,
    @Body() dto: SendDto,
    @Req() req: Request & { gatewayClient?: GatewayClientBinding },
  ) {
    return this.send.send(id, dto, req.gatewayClient?.id);
  }

  @Get(':id/stats')
  @RequireScope('send')
  public sendStats(@Param('id') id: string) {
    return this.send.stats(id);
  }
}
