import { Module } from '@nestjs/common';
import { CHAIN_LOGO_FETCHER } from './application/chain-logo-fetcher.port';
import { ChainLogoService } from './application/chain-logo.service';
import { HttpChainLogoFetcher } from './infrastructure/http-chain-logo.fetcher';

/**
 * ChainLogoModule (chain-logo resolver).
 *
 * Owns the fetch-once logo store (`uploads/chain-logo/<chain>.png`).
 * Exposes the port only — HTTP lives in `gateway/` per P43.
 */
@Module({
  providers: [
    HttpChainLogoFetcher,
    { provide: CHAIN_LOGO_FETCHER, useExisting: HttpChainLogoFetcher },
    ChainLogoService,
  ],
  exports: [ChainLogoService, CHAIN_LOGO_FETCHER],
})
export class ChainLogoModule {}
