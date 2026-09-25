import { Module } from '@nestjs/common';
import { AuthModule } from 'auth/auth.module';
import { ExchangeConnectionManager } from './application/exchange-connection-manager.service';
import { StreamBrokerService } from './application/stream-broker.service';
import { EXCHANGE_ADAPTER_FACTORY } from './domain/exchange-ws.port';
import { DefaultExchangeAdapterFactory } from './infrastructure/exchange-adapter.factory';

/**
 * StreamModule (Tramo 3, todo 11, P49).
 *
 * On-demand ccxt streaming: ONE shared WS connection per exchange
 * (ExchangeConnectionManager) + a thin per-client broker
 * (StreamBrokerService: P46 auth, shared REST rate budget,
 * backpressure, disconnect cleanup). Transport lives in
 * `gateway/infrastructure/ws/`; this module owns NO sockets.
 */
@Module({
  imports: [AuthModule],
  providers: [
    { provide: EXCHANGE_ADAPTER_FACTORY, useClass: DefaultExchangeAdapterFactory },
    ExchangeConnectionManager,
    StreamBrokerService,
  ],
  exports: [ExchangeConnectionManager, StreamBrokerService],
})
export class StreamModule {}
