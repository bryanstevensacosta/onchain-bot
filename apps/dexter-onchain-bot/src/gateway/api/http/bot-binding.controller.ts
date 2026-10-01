import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { DexterBotBindingService } from '@/gateway/application/dexter-bot-binding.service';

export class BindFromInventoryDto {
  @IsString()
  @IsNotEmpty()
  public vaultId!: string;
}

/**
 * Dexter bot binding API (exclusive-gateway task).
 *
 * `GET /api/dexter-bots/inventory` lists the gateway vault bots with
 * availability; `POST /api/dexter-bots/bind` locks one inventory bot
 * to `dexter-onchain-bot` (link-as-target) and records the local
 * mapping; `POST /api/dexter-bots/unbind` releases it. Vault ids
 * only — tokens never cross. Creation of the vault bot itself stays
 * on `POST /api/dexter-bots/migrate-to-gateway` (env token → vault).
 */
@Controller('api/dexter-bots')
export class DexterBotBindingController {
  public constructor(private readonly binding: DexterBotBindingService) {}

  @Get('inventory')
  public inventory() {
    return this.binding.inventory();
  }

  @Post('bind')
  @HttpCode(HttpStatus.OK)
  public bind(@Body() dto: BindFromInventoryDto) {
    return this.binding.bindFromInventory(dto.vaultId);
  }

  @Post('unbind')
  @HttpCode(HttpStatus.OK)
  public unbind(@Body() dto: BindFromInventoryDto) {
    return this.binding.unbindFromInventory(dto.vaultId);
  }
}
