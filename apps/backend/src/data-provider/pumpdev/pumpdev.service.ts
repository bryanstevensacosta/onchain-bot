import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { PumpDevConfig } from './pumpdev.config';
import { PUMPDEV_CONFIG } from './pumpdev.config';
import type {
  PumpDevTradeResponse,
  PumpDevCreateTokenResponse,
  PumpDevBundleRequest,
  PumpDevBundleResponse,
  PumpDevTransferRequest,
  PumpDevTransferResponse,
  PumpDevClaimResponse,
} from './pumpdev.types';

const BASE = 'https://pumpdev.io/api';

/**
 * PumpDev PumpFun trading API provider.
 *
 * Provides programmatic access to pump.fun token trading, creation,
 * and management. Supports client-side signed trades (trade-local)
 * and server-side execution (trade-lightning).
 *
 * @see https://pumpdev.io/
 */
@Injectable()
export class PumpDevService extends DataProviderPort {
  public readonly name = 'pumpdev';
  protected readonly logger = new Logger(PumpDevService.name);

  private readonly apiKey: string;

  public constructor(@Inject(PUMPDEV_CONFIG) config: PumpDevConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'PUMPDEV_API_KEY missing — PumpDev provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('PumpDev provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Trading
  // ─────────────────────────────────────────────

  /**
   * Buy/sell with client-side signing (returns serialized tx).
   *
   * @param params - publicKey, action (buy/sell), mint, amount
   */
  public async tradeLocal(params: {
    publicKey: string;
    action: 'buy' | 'sell';
    mint: string;
    amount: number;
    denominatedInSol?: boolean;
  }): Promise<PumpDevTradeResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevTradeResponse>(
        `${BASE}/trade-local`,
        params,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `PumpDev /trade-local failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Server-side trading — one HTTP call to execute.
   *
   * @param params - action (buy/sell), mint, amount
   */
  public async tradeLightning(params: {
    action: 'buy' | 'sell';
    mint: string;
    amount: number;
  }): Promise<PumpDevTradeResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevTradeResponse>(
        `${BASE}/trade-lightning`,
        params,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `PumpDev /trade-lightning failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Token creation
  // ─────────────────────────────────────────────

  /**
   * Create a new pump.fun token with optional metadata IPFS and dev buy.
   *
   * @param params - name, symbol, description?, image?, amount?
   */
  public async createToken(params: {
    name: string;
    symbol: string;
    description?: string;
    image?: string;
    amount?: number;
  }): Promise<PumpDevCreateTokenResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevCreateTokenResponse>(
        `${BASE}/create`,
        params,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`PumpDev /create failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Jito bundle — atomic multi-buyer launch.
   *
   * @param params - mint + up to 4 buyers with publicKey and amount
   */
  public async createBundle(
    params: PumpDevBundleRequest,
  ): Promise<PumpDevBundleResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevBundleResponse>(
        `${BASE}/create-bundle`,
        params,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `PumpDev /create-bundle failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Account & transfers
  // ─────────────────────────────────────────────

  /**
   * Claim creator fees.
   */
  public async claimAccount(): Promise<PumpDevClaimResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevClaimResponse>(
        `${BASE}/claim-account`,
        {},
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `PumpDev /claim-account failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Transfer SOL between wallets.
   *
   * @param params - to (recipient), amount in SOL
   */
  public async transfer(
    params: PumpDevTransferRequest,
  ): Promise<PumpDevTransferResponse | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.post<PumpDevTransferResponse>(
        `${BASE}/transfer`,
        params,
        { headers: { 'X-API-Key': this.apiKey }, timeout: 8_000 },
      );
      return data ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`PumpDev /transfer failed: ${(err as Error).message}`);
      return null;
    }
  }
}
