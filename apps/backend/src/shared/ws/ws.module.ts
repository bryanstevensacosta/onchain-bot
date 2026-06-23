import { Module } from '@nestjs/common';
import { WsGateway } from './gateway/ws.gateway';

@Module({
  providers: [WsGateway],
})
export class WsModule {}
